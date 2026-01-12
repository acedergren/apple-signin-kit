//! Documentation generation command

use anyhow::{Context, Result};
use std::path::Path;
use tracing::{info, warn};
use walkdir::WalkDir;

use crate::extractors::typescript;
use crate::generators::markdown;
use crate::types::{DocgenConfig, PackageConfig, PackageKind};

/// Run documentation generation
pub async fn run(root: &str, output: &str, package_filter: Option<&str>) -> Result<()> {
    let root_path = Path::new(root);
    let output_path = Path::new(output);

    info!("Generating documentation from {}", root_path.display());
    info!("Output directory: {}", output_path.display());

    // Load or create config
    let config = load_or_create_config(root_path)?;

    // Filter packages if specified
    let packages: Vec<_> = config
        .packages
        .iter()
        .filter(|p| package_filter.map_or(true, |f| p.name.contains(f)))
        .collect();

    if packages.is_empty() {
        warn!("No packages found matching filter");
        return Ok(());
    }

    info!("Processing {} packages", packages.len());

    for pkg in packages {
        info!("Processing package: {}", pkg.name);
        process_package(root_path, output_path, pkg).await?;
    }

    // Generate index/overview pages
    markdown::generate_index(output_path, &config).await?;

    info!("Documentation generation complete!");
    Ok(())
}

/// Load config from docgen.yaml or create default
fn load_or_create_config(root: &Path) -> Result<DocgenConfig> {
    let config_path = root.join("docgen.yaml");

    if config_path.exists() {
        let content =
            std::fs::read_to_string(&config_path).context("Failed to read docgen.yaml")?;
        let config: DocgenConfig =
            serde_yaml::from_str(&content).context("Failed to parse docgen.yaml")?;
        return Ok(config);
    }

    // Auto-discover packages
    info!("No docgen.yaml found, auto-discovering packages...");
    let packages = discover_packages(root)?;

    Ok(DocgenConfig {
        packages,
        output: crate::types::OutputConfig {
            dir: root.join("docs"),
            api_reference: true,
            changelog: true,
            package_readme: true,
        },
        templates: None,
    })
}

/// Auto-discover packages in the monorepo
fn discover_packages(root: &Path) -> Result<Vec<PackageConfig>> {
    let mut packages = Vec::new();

    // Check packages/ directory
    let packages_dir = root.join("packages");
    if packages_dir.exists() {
        for entry in WalkDir::new(&packages_dir)
            .max_depth(2)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.join("package.json").exists() {
                if let Some(pkg) = parse_package_json(path)? {
                    packages.push(pkg);
                }
            }
        }
    }

    Ok(packages)
}

/// Parse package.json to extract package config
fn parse_package_json(path: &Path) -> Result<Option<PackageConfig>> {
    let pkg_json_path = path.join("package.json");
    let content = std::fs::read_to_string(&pkg_json_path)?;
    let pkg: serde_json::Value = serde_json::from_str(&content)?;

    let name = pkg["name"].as_str().unwrap_or_default().to_string();
    if name.is_empty() {
        return Ok(None);
    }

    // Determine package kind from name or path
    let kind = if name.contains("adapter")
        || name.contains("oracle")
        || name.contains("drizzle")
        || name.contains("mongodb")
    {
        PackageKind::Adapter
    } else if name.contains("sveltekit") || name.contains("frontend") {
        PackageKind::Frontend
    } else if name.contains("swift") || name.contains("ios") || name.contains("kit") {
        PackageKind::Mobile
    } else {
        PackageKind::Core
    };

    // Find entry points
    let mut entry_points = vec!["src/index.ts".to_string()];
    if let Some(exports) = pkg.get("exports") {
        if let Some(obj) = exports.as_object() {
            for (key, value) in obj {
                if let Some(import_path) = value.get("import").and_then(|v| v.as_str()) {
                    if !entry_points.contains(&import_path.to_string()) {
                        entry_points.push(import_path.replace("./", ""));
                    }
                }
            }
        }
    }

    Ok(Some(PackageConfig {
        name,
        path: path.to_path_buf(),
        kind,
        entry_points,
        exclude: vec![
            "**/*.test.ts".to_string(),
            "**/*.spec.ts".to_string(),
            "**/test/**".to_string(),
            "**/tests/**".to_string(),
        ],
    }))
}

/// Process a single package
async fn process_package(root: &Path, output: &Path, config: &PackageConfig) -> Result<()> {
    let pkg_path = if config.path.is_absolute() {
        config.path.clone()
    } else {
        root.join(&config.path)
    };

    // Extract TypeScript documentation
    let extracted = typescript::extract_package(&pkg_path, config).await?;

    // Generate markdown documentation
    let output_dir = output.join("api").join(
        config.name
            .replace("@acedergren/", "")
            .replace("-", "_")
    );

    markdown::generate_package_docs(&output_dir, &extracted).await?;

    Ok(())
}

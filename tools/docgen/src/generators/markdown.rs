//! Markdown documentation generator

use anyhow::Result;
use std::path::Path;
use tracing::info;

use crate::types::{DocgenConfig, Export, ExportKind, ExtractedDocs, PackageKind};

/// Generate documentation for a package
pub async fn generate_package_docs(output_dir: &Path, docs: &ExtractedDocs) -> Result<()> {
    std::fs::create_dir_all(output_dir)?;

    // Generate index.md for package
    let index_path = output_dir.join("index.md");
    let index_content = generate_package_index(docs)?;
    std::fs::write(&index_path, index_content)?;
    info!("Generated {}", index_path.display());

    // Generate types.md
    if !docs.package.exports.is_empty() {
        let types_path = output_dir.join("types.md");
        let types_content = generate_types_doc(docs)?;
        std::fs::write(&types_path, types_content)?;
        info!("Generated {}", types_path.display());
    }

    // Generate functions.md if there are functions
    let functions: Vec<_> = docs.package.exports.iter()
        .filter(|e| e.kind == ExportKind::Function)
        .collect();

    if !functions.is_empty() {
        let functions_path = output_dir.join("functions.md");
        let functions_content = generate_functions_doc(&functions, &docs.package.name)?;
        std::fs::write(&functions_path, functions_content)?;
        info!("Generated {}", functions_path.display());
    }

    Ok(())
}

/// Generate index page for the documentation
pub async fn generate_index(output_dir: &Path, config: &DocgenConfig) -> Result<()> {
    let index_path = output_dir.join("api").join("index.md");

    if let Some(parent) = index_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let mut content = String::new();
    content.push_str("# API Reference\n\n");
    content.push_str("Complete API documentation for the Apple Auth Kit packages.\n\n");

    // Group packages by kind
    let mut core_packages = Vec::new();
    let mut adapters = Vec::new();
    let mut frontend = Vec::new();
    let mut mobile = Vec::new();

    for pkg in &config.packages {
        match pkg.kind {
            PackageKind::Core => core_packages.push(pkg),
            PackageKind::Adapter => adapters.push(pkg),
            PackageKind::Frontend => frontend.push(pkg),
            PackageKind::Mobile => mobile.push(pkg),
        }
    }

    if !core_packages.is_empty() {
        content.push_str("## Core Packages\n\n");
        for pkg in core_packages {
            let link = pkg.name.replace("@acedergren/", "").replace('-', "_");
            content.push_str(&format!("- [{}](./{}/)\n", pkg.name, link));
        }
        content.push('\n');
    }

    if !adapters.is_empty() {
        content.push_str("## Database Adapters\n\n");
        for pkg in adapters {
            let link = pkg.name.replace("@acedergren/", "").replace('-', "_");
            content.push_str(&format!("- [{}](./{}/)\n", pkg.name, link));
        }
        content.push('\n');
    }

    if !frontend.is_empty() {
        content.push_str("## Frontend SDKs\n\n");
        for pkg in frontend {
            let link = pkg.name.replace("@acedergren/", "").replace('-', "_");
            content.push_str(&format!("- [{}](./{}/)\n", pkg.name, link));
        }
        content.push('\n');
    }

    if !mobile.is_empty() {
        content.push_str("## Mobile SDKs\n\n");
        for pkg in mobile {
            let link = pkg.name.replace("@acedergren/", "").replace('-', "_");
            content.push_str(&format!("- [{}](./{}/)\n", pkg.name, link));
        }
        content.push('\n');
    }

    std::fs::write(&index_path, content)?;
    info!("Generated API index at {}", index_path.display());

    Ok(())
}

fn generate_package_index(docs: &ExtractedDocs) -> Result<String> {
    let mut content = String::new();

    content.push_str(&format!("# {}\n\n", docs.package.name));

    if !docs.package.description.is_empty() {
        content.push_str(&format!("{}\n\n", docs.package.description));
    }

    content.push_str(&format!("**Version:** {}\n\n", docs.package.version));

    // Installation
    content.push_str("## Installation\n\n");
    content.push_str("```bash\n");
    content.push_str(&format!("npm install {}\n", docs.package.name));
    content.push_str("# or\n");
    content.push_str(&format!("pnpm add {}\n", docs.package.name));
    content.push_str("```\n\n");

    // Quick summary of exports
    let interfaces: Vec<_> = docs.package.exports.iter()
        .filter(|e| e.kind == ExportKind::Interface)
        .collect();
    let types: Vec<_> = docs.package.exports.iter()
        .filter(|e| e.kind == ExportKind::Type)
        .collect();
    let functions: Vec<_> = docs.package.exports.iter()
        .filter(|e| e.kind == ExportKind::Function)
        .collect();
    let classes: Vec<_> = docs.package.exports.iter()
        .filter(|e| e.kind == ExportKind::Class)
        .collect();

    content.push_str("## Exports\n\n");
    content.push_str("| Category | Count |\n");
    content.push_str("|----------|-------|\n");
    if !interfaces.is_empty() {
        content.push_str(&format!("| Interfaces | {} |\n", interfaces.len()));
    }
    if !types.is_empty() {
        content.push_str(&format!("| Types | {} |\n", types.len()));
    }
    if !functions.is_empty() {
        content.push_str(&format!("| Functions | {} |\n", functions.len()));
    }
    if !classes.is_empty() {
        content.push_str(&format!("| Classes | {} |\n", classes.len()));
    }
    content.push('\n');

    // Links to other pages
    content.push_str("## Documentation\n\n");
    content.push_str("- [Types Reference](./types.md)\n");
    if !functions.is_empty() {
        content.push_str("- [Functions Reference](./functions.md)\n");
    }
    content.push('\n');

    // Include README content if available
    if let Some(readme) = &docs.readme {
        content.push_str("---\n\n");
        // Skip the first heading if it matches package name
        let readme_content = skip_duplicate_heading(readme, &docs.package.name);
        content.push_str(&readme_content);
    }

    Ok(content)
}

fn generate_types_doc(docs: &ExtractedDocs) -> Result<String> {
    let mut content = String::new();

    content.push_str(&format!("# {} - Types\n\n", docs.package.name));

    // Group exports by kind
    let interfaces: Vec<_> = docs.package.exports.iter()
        .filter(|e| e.kind == ExportKind::Interface)
        .collect();
    let types: Vec<_> = docs.package.exports.iter()
        .filter(|e| e.kind == ExportKind::Type)
        .collect();
    let enums: Vec<_> = docs.package.exports.iter()
        .filter(|e| e.kind == ExportKind::Enum)
        .collect();
    let classes: Vec<_> = docs.package.exports.iter()
        .filter(|e| e.kind == ExportKind::Class)
        .collect();

    if !interfaces.is_empty() {
        content.push_str("## Interfaces\n\n");
        for export in interfaces {
            write_export(&mut content, export);
        }
    }

    if !types.is_empty() {
        content.push_str("## Type Aliases\n\n");
        for export in types {
            write_export(&mut content, export);
        }
    }

    if !enums.is_empty() {
        content.push_str("## Enums\n\n");
        for export in enums {
            write_export(&mut content, export);
        }
    }

    if !classes.is_empty() {
        content.push_str("## Classes\n\n");
        for export in classes {
            write_export(&mut content, export);
        }
    }

    Ok(content)
}

fn generate_functions_doc(functions: &[&Export], package_name: &str) -> Result<String> {
    let mut content = String::new();

    content.push_str(&format!("# {} - Functions\n\n", package_name));

    for export in functions {
        write_export(&mut content, export);
    }

    Ok(content)
}

fn write_export(content: &mut String, export: &Export) {
    content.push_str(&format!("### `{}`\n\n", export.name));

    if let Some(deprecated) = &export.deprecated {
        content.push_str(&format!("> ⚠️ **Deprecated:** {}\n\n", deprecated));
    }

    if let Some(desc) = &export.description {
        content.push_str(desc);
        content.push_str("\n\n");
    }

    if let Some(sig) = &export.signature {
        content.push_str("```typescript\n");
        content.push_str(sig);
        content.push_str("\n```\n\n");
    }

    // Source location
    content.push_str(&format!(
        "*Defined in [`{}`]({}:{})*\n\n",
        export.source_file.file_name().unwrap_or_default().to_string_lossy(),
        export.source_file.display(),
        export.line
    ));

    if !export.params.is_empty() {
        content.push_str("**Parameters:**\n\n");
        content.push_str("| Name | Type | Required | Description |\n");
        content.push_str("|------|------|----------|-------------|\n");
        for param in &export.params {
            let required = if param.optional { "No" } else { "Yes" };
            let desc = param.description.as_deref().unwrap_or("-");
            content.push_str(&format!(
                "| `{}` | `{}` | {} | {} |\n",
                param.name, param.type_annotation, required, desc
            ));
        }
        content.push('\n');
    }

    if let Some(returns) = &export.returns {
        content.push_str(&format!("**Returns:** `{}`\n\n", returns));
    }

    if !export.examples.is_empty() {
        content.push_str("**Example:**\n\n");
        for example in &export.examples {
            content.push_str("```typescript\n");
            content.push_str(example);
            content.push_str("\n```\n\n");
        }
    }

    content.push_str("---\n\n");
}

fn skip_duplicate_heading(readme: &str, package_name: &str) -> String {
    let lines: Vec<&str> = readme.lines().collect();

    if let Some(first_line) = lines.first() {
        let heading = first_line.trim_start_matches('#').trim();
        // Skip if first heading matches or contains package name
        if heading.contains(package_name) || package_name.contains(heading) {
            return lines[1..].join("\n").trim_start().to_string();
        }
    }

    readme.to_string()
}

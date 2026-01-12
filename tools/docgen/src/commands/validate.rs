//! Documentation validation command

use anyhow::Result;
use std::path::Path;
use tracing::{error, info, warn};
use walkdir::WalkDir;

use crate::types::{IssueSeverity, ValidationIssue, ValidationResult};

/// Run documentation validation
pub async fn run(root: &str, strict: bool) -> Result<()> {
    let root_path = Path::new(root);
    let docs_path = root_path.join("docs");

    info!("Validating documentation in {}", docs_path.display());

    let mut result = ValidationResult {
        passed: true,
        errors: Vec::new(),
        warnings: Vec::new(),
        info: Vec::new(),
    };

    // Check that docs directory exists
    if !docs_path.exists() {
        result.errors.push(ValidationIssue {
            severity: IssueSeverity::Error,
            message: "Documentation directory does not exist".to_string(),
            file: Some(docs_path.clone()),
            line: None,
            suggestion: Some("Run `docgen generate` to create documentation".to_string()),
        });
        result.passed = false;
    } else {
        // Validate all markdown files
        for entry in WalkDir::new(&docs_path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map_or(false, |ext| ext == "md"))
        {
            validate_markdown_file(entry.path(), &mut result)?;
        }

        // Check for required files
        check_required_files(&docs_path, &mut result);

        // Check for broken internal links
        check_internal_links(&docs_path, &mut result)?;

        // Validate mkdocs.yml
        validate_mkdocs_config(root_path, &mut result)?;
    }

    // Report results
    report_results(&result, strict);

    if strict && !result.warnings.is_empty() {
        result.passed = false;
    }

    if result.passed {
        info!("✅ Documentation validation passed!");
        Ok(())
    } else {
        error!("❌ Documentation validation failed!");
        std::process::exit(1);
    }
}

/// Validate a single markdown file
fn validate_markdown_file(path: &Path, result: &mut ValidationResult) -> Result<()> {
    let content = std::fs::read_to_string(path)?;
    let lines: Vec<&str> = content.lines().collect();

    // Check for empty file
    if content.trim().is_empty() {
        result.warnings.push(ValidationIssue {
            severity: IssueSeverity::Warning,
            message: "Empty documentation file".to_string(),
            file: Some(path.to_path_buf()),
            line: None,
            suggestion: Some("Add content or remove the file".to_string()),
        });
    }

    // Check for title (H1 heading)
    let has_title = lines.iter().any(|line| line.starts_with("# "));
    if !has_title && !content.trim().is_empty() {
        result.warnings.push(ValidationIssue {
            severity: IssueSeverity::Warning,
            message: "Missing H1 title".to_string(),
            file: Some(path.to_path_buf()),
            line: None,
            suggestion: Some("Add a title starting with '# '".to_string()),
        });
    }

    // Check for TODO/FIXME comments
    for (i, line) in lines.iter().enumerate() {
        if line.contains("TODO") || line.contains("FIXME") {
            result.warnings.push(ValidationIssue {
                severity: IssueSeverity::Warning,
                message: format!("Found TODO/FIXME: {}", line.trim()),
                file: Some(path.to_path_buf()),
                line: Some(i + 1),
                suggestion: None,
            });
        }
    }

    // Check for broken code blocks
    let code_block_count = content.matches("```").count();
    if code_block_count % 2 != 0 {
        result.errors.push(ValidationIssue {
            severity: IssueSeverity::Error,
            message: "Unmatched code block delimiter".to_string(),
            file: Some(path.to_path_buf()),
            line: None,
            suggestion: Some("Check that all ``` blocks are properly closed".to_string()),
        });
    }

    Ok(())
}

/// Check for required documentation files
fn check_required_files(docs_path: &Path, result: &mut ValidationResult) {
    let required_files = [
        "index.md",
        "getting-started/installation.md",
        "getting-started/quickstart.md",
    ];

    for file in required_files {
        let file_path = docs_path.join(file);
        if !file_path.exists() {
            result.errors.push(ValidationIssue {
                severity: IssueSeverity::Error,
                message: format!("Required file missing: {}", file),
                file: Some(file_path),
                line: None,
                suggestion: Some("Create the required documentation file".to_string()),
            });
        }
    }
}

/// Check for broken internal links
fn check_internal_links(docs_path: &Path, result: &mut ValidationResult) -> Result<()> {
    let link_regex = regex::Regex::new(r"\[([^\]]+)\]\(([^)]+)\)")?;

    for entry in WalkDir::new(docs_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "md"))
    {
        let content = std::fs::read_to_string(entry.path())?;
        let file_dir = entry.path().parent().unwrap_or(docs_path);

        for cap in link_regex.captures_iter(&content) {
            let link = &cap[2];

            // Skip external links and anchors
            if link.starts_with("http") || link.starts_with('#') {
                continue;
            }

            // Resolve relative path
            let target = if link.starts_with('/') {
                docs_path.join(&link[1..])
            } else {
                file_dir.join(link)
            };

            // Remove anchor from path
            let target_path = target.to_string_lossy().split('#').next().unwrap_or("");
            let target_path = Path::new(target_path);

            // Check if file exists (with or without .md extension)
            let exists = target_path.exists()
                || target_path.with_extension("md").exists()
                || (target_path.is_dir() && target_path.join("index.md").exists());

            if !exists {
                result.warnings.push(ValidationIssue {
                    severity: IssueSeverity::Warning,
                    message: format!("Broken internal link: {}", link),
                    file: Some(entry.path().to_path_buf()),
                    line: None,
                    suggestion: Some(format!("Check that {} exists", target_path.display())),
                });
            }
        }
    }

    Ok(())
}

/// Validate mkdocs.yml configuration
fn validate_mkdocs_config(root: &Path, result: &mut ValidationResult) -> Result<()> {
    let mkdocs_path = root.join("mkdocs.yml");

    if !mkdocs_path.exists() {
        result.errors.push(ValidationIssue {
            severity: IssueSeverity::Error,
            message: "mkdocs.yml not found".to_string(),
            file: Some(mkdocs_path),
            line: None,
            suggestion: Some("Create mkdocs.yml configuration file".to_string()),
        });
        return Ok(());
    }

    let content = std::fs::read_to_string(&mkdocs_path)?;
    let _config: serde_yaml::Value = serde_yaml::from_str(&content)
        .map_err(|e| {
            result.errors.push(ValidationIssue {
                severity: IssueSeverity::Error,
                message: format!("Invalid YAML in mkdocs.yml: {}", e),
                file: Some(mkdocs_path.clone()),
                line: None,
                suggestion: Some("Fix YAML syntax errors".to_string()),
            });
        })
        .unwrap_or_default();

    result.info.push("mkdocs.yml validated successfully".to_string());

    Ok(())
}

/// Report validation results
fn report_results(result: &ValidationResult, strict: bool) {
    if !result.errors.is_empty() {
        error!("\n❌ Errors ({}):", result.errors.len());
        for issue in &result.errors {
            let location = match (&issue.file, issue.line) {
                (Some(f), Some(l)) => format!(" at {}:{}", f.display(), l),
                (Some(f), None) => format!(" in {}", f.display()),
                _ => String::new(),
            };
            error!("  • {}{}", issue.message, location);
            if let Some(suggestion) = &issue.suggestion {
                error!("    → {}", suggestion);
            }
        }
    }

    if !result.warnings.is_empty() {
        let level = if strict { "❌" } else { "⚠️" };
        warn!("\n{} Warnings ({}):", level, result.warnings.len());
        for issue in &result.warnings {
            let location = match (&issue.file, issue.line) {
                (Some(f), Some(l)) => format!(" at {}:{}", f.display(), l),
                (Some(f), None) => format!(" in {}", f.display()),
                _ => String::new(),
            };
            warn!("  • {}{}", issue.message, location);
            if let Some(suggestion) = &issue.suggestion {
                warn!("    → {}", suggestion);
            }
        }
    }

    if !result.info.is_empty() {
        for msg in &result.info {
            info!("  ℹ️  {}", msg);
        }
    }

    info!(
        "\nSummary: {} errors, {} warnings",
        result.errors.len(),
        result.warnings.len()
    );
}

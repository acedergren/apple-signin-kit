//! TypeScript source code extractor
//!
//! Extracts type definitions, function signatures, and documentation
//! from TypeScript source files using tree-sitter.

use anyhow::{Context, Result};
use std::collections::HashMap;
use std::path::Path;
use tracing::{debug, info};
use walkdir::WalkDir;

use crate::types::{
    Export, ExportKind, ExtractedDocs, Package, PackageConfig, PackageKind, Parameter,
};

/// Extract documentation from a TypeScript package
pub async fn extract_package(path: &Path, config: &PackageConfig) -> Result<ExtractedDocs> {
    info!("Extracting TypeScript documentation from {}", path.display());

    let mut files: HashMap<std::path::PathBuf, Vec<Export>> = HashMap::new();

    // Process each entry point
    for entry_point in &config.entry_points {
        let entry_path = path.join(entry_point);
        if entry_path.exists() {
            let exports = extract_file(&entry_path).await?;
            files.insert(entry_path.clone(), exports);
        }
    }

    // Also scan src directory for additional exports
    let src_dir = path.join("src");
    if src_dir.exists() {
        for entry in WalkDir::new(&src_dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| {
                let path = e.path();
                path.extension().map_or(false, |ext| ext == "ts" || ext == "tsx")
                    && !is_excluded(path, &config.exclude)
            })
        {
            let file_path = entry.path().to_path_buf();
            if !files.contains_key(&file_path) {
                let exports = extract_file(&file_path).await?;
                if !exports.is_empty() {
                    files.insert(file_path, exports);
                }
            }
        }
    }

    // Read package.json for metadata
    let pkg_json_path = path.join("package.json");
    let (name, version, description) = if pkg_json_path.exists() {
        let content = std::fs::read_to_string(&pkg_json_path)?;
        let pkg: serde_json::Value = serde_json::from_str(&content)?;
        (
            pkg["name"].as_str().unwrap_or("unknown").to_string(),
            pkg["version"].as_str().unwrap_or("0.0.0").to_string(),
            pkg["description"].as_str().unwrap_or("").to_string(),
        )
    } else {
        ("unknown".to_string(), "0.0.0".to_string(), String::new())
    };

    // Read README if exists
    let readme = read_optional_file(&path.join("README.md"));
    let changelog = read_optional_file(&path.join("CHANGELOG.md"));

    Ok(ExtractedDocs {
        package: Package {
            name,
            version,
            description,
            path: path.to_path_buf(),
            kind: config.kind.clone(),
            internal_deps: Vec::new(), // TODO: Parse from package.json
            exports: files.values().flatten().cloned().collect(),
        },
        files,
        readme,
        changelog,
    })
}

/// Extract exports from a single TypeScript file
pub async fn extract_file(path: &Path) -> Result<Vec<Export>> {
    let content = std::fs::read_to_string(path)
        .with_context(|| format!("Failed to read {}", path.display()))?;

    debug!("Extracting from {}", path.display());

    let mut exports = Vec::new();

    // Simple regex-based extraction (tree-sitter would be more robust)
    // This is a simplified implementation - production would use full AST parsing

    // Extract exported interfaces
    let interface_re = regex::Regex::new(
        r"(?m)^(?:/\*\*[\s\S]*?\*/\s*)?export\s+interface\s+(\w+)(?:<[^>]+>)?\s*\{([^}]*)\}"
    )?;

    for cap in interface_re.captures_iter(&content) {
        let name = cap[1].to_string();
        let body = cap.get(2).map_or("", |m| m.as_str());
        let jsdoc = extract_jsdoc(&content, cap.get(0).unwrap().start());

        exports.push(Export {
            name: name.clone(),
            kind: ExportKind::Interface,
            description: jsdoc.description,
            source_file: path.to_path_buf(),
            line: count_lines(&content[..cap.get(0).unwrap().start()]) + 1,
            signature: Some(format!("interface {}", name)),
            params: Vec::new(),
            returns: None,
            examples: jsdoc.examples,
            deprecated: jsdoc.deprecated,
        });
    }

    // Extract exported types
    let type_re = regex::Regex::new(
        r"(?m)^(?:/\*\*[\s\S]*?\*/\s*)?export\s+type\s+(\w+)(?:<[^>]+>)?\s*=\s*([^;]+);"
    )?;

    for cap in type_re.captures_iter(&content) {
        let name = cap[1].to_string();
        let type_value = cap.get(2).map_or("", |m| m.as_str().trim());
        let jsdoc = extract_jsdoc(&content, cap.get(0).unwrap().start());

        exports.push(Export {
            name: name.clone(),
            kind: ExportKind::Type,
            description: jsdoc.description,
            source_file: path.to_path_buf(),
            line: count_lines(&content[..cap.get(0).unwrap().start()]) + 1,
            signature: Some(format!("type {} = {}", name, type_value)),
            params: Vec::new(),
            returns: None,
            examples: jsdoc.examples,
            deprecated: jsdoc.deprecated,
        });
    }

    // Extract exported functions
    let fn_re = regex::Regex::new(
        r"(?m)^(?:/\*\*[\s\S]*?\*/\s*)?export\s+(?:async\s+)?function\s+(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{"
    )?;

    for cap in fn_re.captures_iter(&content) {
        let name = cap[1].to_string();
        let params_str = cap.get(2).map_or("", |m| m.as_str());
        let return_type = cap.get(3).map(|m| m.as_str().trim().to_string());
        let jsdoc = extract_jsdoc(&content, cap.get(0).unwrap().start());

        let params = parse_function_params(params_str, &jsdoc);

        exports.push(Export {
            name: name.clone(),
            kind: ExportKind::Function,
            description: jsdoc.description,
            source_file: path.to_path_buf(),
            line: count_lines(&content[..cap.get(0).unwrap().start()]) + 1,
            signature: Some(format!("function {}({})", name, params_str)),
            params,
            returns: return_type,
            examples: jsdoc.examples,
            deprecated: jsdoc.deprecated,
        });
    }

    // Extract exported const/variables
    let const_re = regex::Regex::new(
        r"(?m)^(?:/\*\*[\s\S]*?\*/\s*)?export\s+const\s+(\w+)(?:\s*:\s*([^=]+))?\s*="
    )?;

    for cap in const_re.captures_iter(&content) {
        let name = cap[1].to_string();
        let type_annotation = cap.get(2).map(|m| m.as_str().trim().to_string());
        let jsdoc = extract_jsdoc(&content, cap.get(0).unwrap().start());

        exports.push(Export {
            name: name.clone(),
            kind: ExportKind::Const,
            description: jsdoc.description,
            source_file: path.to_path_buf(),
            line: count_lines(&content[..cap.get(0).unwrap().start()]) + 1,
            signature: type_annotation.map(|t| format!("const {}: {}", name, t)),
            params: Vec::new(),
            returns: None,
            examples: jsdoc.examples,
            deprecated: jsdoc.deprecated,
        });
    }

    // Extract exported classes
    let class_re = regex::Regex::new(
        r"(?m)^(?:/\*\*[\s\S]*?\*/\s*)?export\s+class\s+(\w+)(?:<[^>]+>)?(?:\s+extends\s+[^{]+)?(?:\s+implements\s+[^{]+)?\s*\{"
    )?;

    for cap in class_re.captures_iter(&content) {
        let name = cap[1].to_string();
        let jsdoc = extract_jsdoc(&content, cap.get(0).unwrap().start());

        exports.push(Export {
            name: name.clone(),
            kind: ExportKind::Class,
            description: jsdoc.description,
            source_file: path.to_path_buf(),
            line: count_lines(&content[..cap.get(0).unwrap().start()]) + 1,
            signature: Some(format!("class {}", name)),
            params: Vec::new(),
            returns: None,
            examples: jsdoc.examples,
            deprecated: jsdoc.deprecated,
        });
    }

    // Extract exported enums
    let enum_re = regex::Regex::new(
        r"(?m)^(?:/\*\*[\s\S]*?\*/\s*)?export\s+(?:const\s+)?enum\s+(\w+)\s*\{"
    )?;

    for cap in enum_re.captures_iter(&content) {
        let name = cap[1].to_string();
        let jsdoc = extract_jsdoc(&content, cap.get(0).unwrap().start());

        exports.push(Export {
            name: name.clone(),
            kind: ExportKind::Enum,
            description: jsdoc.description,
            source_file: path.to_path_buf(),
            line: count_lines(&content[..cap.get(0).unwrap().start()]) + 1,
            signature: Some(format!("enum {}", name)),
            params: Vec::new(),
            returns: None,
            examples: jsdoc.examples,
            deprecated: jsdoc.deprecated,
        });
    }

    Ok(exports)
}

/// Extract TypeScript types to markdown file
pub async fn extract_to_markdown(source: &str, output: &str) -> Result<()> {
    let source_path = Path::new(source);
    let output_path = Path::new(output);

    let exports = extract_file(source_path).await?;

    let mut md = String::new();
    md.push_str(&format!("# Types from {}\n\n", source_path.display()));

    // Group by kind
    let mut interfaces = Vec::new();
    let mut types = Vec::new();
    let mut functions = Vec::new();
    let mut classes = Vec::new();
    let mut enums = Vec::new();
    let mut consts = Vec::new();

    for export in exports {
        match export.kind {
            ExportKind::Interface => interfaces.push(export),
            ExportKind::Type => types.push(export),
            ExportKind::Function => functions.push(export),
            ExportKind::Class => classes.push(export),
            ExportKind::Enum => enums.push(export),
            ExportKind::Const | ExportKind::Variable => consts.push(export),
        }
    }

    // Write sections
    if !interfaces.is_empty() {
        md.push_str("## Interfaces\n\n");
        for export in interfaces {
            write_export_markdown(&mut md, &export);
        }
    }

    if !types.is_empty() {
        md.push_str("## Types\n\n");
        for export in types {
            write_export_markdown(&mut md, &export);
        }
    }

    if !functions.is_empty() {
        md.push_str("## Functions\n\n");
        for export in functions {
            write_export_markdown(&mut md, &export);
        }
    }

    if !classes.is_empty() {
        md.push_str("## Classes\n\n");
        for export in classes {
            write_export_markdown(&mut md, &export);
        }
    }

    if !enums.is_empty() {
        md.push_str("## Enums\n\n");
        for export in enums {
            write_export_markdown(&mut md, &export);
        }
    }

    if !consts.is_empty() {
        md.push_str("## Constants\n\n");
        for export in consts {
            write_export_markdown(&mut md, &export);
        }
    }

    // Write output
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(output_path, md)?;

    info!("Extracted types to {}", output_path.display());

    Ok(())
}

// Helper types and functions

struct JsDoc {
    description: Option<String>,
    params: HashMap<String, String>,
    returns: Option<String>,
    examples: Vec<String>,
    deprecated: Option<String>,
}

fn extract_jsdoc(content: &str, export_start: usize) -> JsDoc {
    let mut jsdoc = JsDoc {
        description: None,
        params: HashMap::new(),
        returns: None,
        examples: Vec::new(),
        deprecated: None,
    };

    // Find JSDoc comment before export
    let before = &content[..export_start];
    if let Some(comment_end) = before.rfind("*/") {
        if let Some(comment_start) = before[..comment_end].rfind("/**") {
            let comment = &before[comment_start + 3..comment_end];

            // Parse description (first non-tag lines)
            let mut description_lines = Vec::new();
            let mut in_example = false;
            let mut current_example = String::new();

            for line in comment.lines() {
                let line = line.trim().trim_start_matches('*').trim();

                if line.starts_with("@param") {
                    let parts: Vec<&str> = line[6..].trim().splitn(2, ' ').collect();
                    if parts.len() >= 2 {
                        jsdoc.params.insert(
                            parts[0].trim_start_matches('{').trim_end_matches('}').to_string(),
                            parts.get(1).unwrap_or(&"").to_string(),
                        );
                    }
                } else if line.starts_with("@returns") || line.starts_with("@return") {
                    jsdoc.returns = Some(line[8..].trim().to_string());
                } else if line.starts_with("@example") {
                    in_example = true;
                } else if line.starts_with("@deprecated") {
                    jsdoc.deprecated = Some(line[11..].trim().to_string());
                } else if line.starts_with('@') {
                    if in_example && !current_example.is_empty() {
                        jsdoc.examples.push(current_example.trim().to_string());
                        current_example.clear();
                    }
                    in_example = false;
                } else if in_example {
                    current_example.push_str(line);
                    current_example.push('\n');
                } else if !line.is_empty() {
                    description_lines.push(line.to_string());
                }
            }

            if in_example && !current_example.is_empty() {
                jsdoc.examples.push(current_example.trim().to_string());
            }

            if !description_lines.is_empty() {
                jsdoc.description = Some(description_lines.join(" "));
            }
        }
    }

    jsdoc
}

fn parse_function_params(params_str: &str, jsdoc: &JsDoc) -> Vec<Parameter> {
    let mut params = Vec::new();

    if params_str.trim().is_empty() {
        return params;
    }

    // Simple param parsing (doesn't handle complex types well)
    for param in params_str.split(',') {
        let param = param.trim();
        if param.is_empty() {
            continue;
        }

        let optional = param.contains('?');
        let param = param.replace('?', "");

        let parts: Vec<&str> = param.splitn(2, ':').collect();
        let name = parts[0].trim().to_string();
        let type_annotation = parts.get(1).map_or("unknown", |t| t.trim()).to_string();

        let description = jsdoc.params.get(&name).cloned();

        params.push(Parameter {
            name: name.clone(),
            type_annotation,
            description,
            optional,
            default: None,
        });
    }

    params
}

fn count_lines(s: &str) -> usize {
    s.chars().filter(|&c| c == '\n').count()
}

fn is_excluded(path: &Path, patterns: &[String]) -> bool {
    let path_str = path.to_string_lossy();
    for pattern in patterns {
        if let Ok(glob) = glob::Pattern::new(pattern) {
            if glob.matches(&path_str) {
                return true;
            }
        }
    }
    false
}

fn read_optional_file(path: &Path) -> Option<String> {
    std::fs::read_to_string(path).ok()
}

fn write_export_markdown(md: &mut String, export: &Export) {
    md.push_str(&format!("### `{}`\n\n", export.name));

    if let Some(desc) = &export.description {
        md.push_str(desc);
        md.push_str("\n\n");
    }

    if let Some(sig) = &export.signature {
        md.push_str("```typescript\n");
        md.push_str(sig);
        md.push_str("\n```\n\n");
    }

    if !export.params.is_empty() {
        md.push_str("**Parameters:**\n\n");
        for param in &export.params {
            let optional = if param.optional { " (optional)" } else { "" };
            md.push_str(&format!(
                "- `{}`: `{}`{}\n",
                param.name, param.type_annotation, optional
            ));
            if let Some(desc) = &param.description {
                md.push_str(&format!("  - {}\n", desc));
            }
        }
        md.push('\n');
    }

    if let Some(returns) = &export.returns {
        md.push_str(&format!("**Returns:** `{}`\n\n", returns));
    }

    if !export.examples.is_empty() {
        md.push_str("**Examples:**\n\n");
        for example in &export.examples {
            md.push_str("```typescript\n");
            md.push_str(example);
            md.push_str("\n```\n\n");
        }
    }

    if let Some(deprecated) = &export.deprecated {
        md.push_str(&format!("> ⚠️ **Deprecated:** {}\n\n", deprecated));
    }

    md.push_str("---\n\n");
}

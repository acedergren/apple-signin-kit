//! Core types for documentation generation

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Represents a package in the monorepo
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Package {
    /// Package name (e.g., "@acedergren/fastify-apple-auth")
    pub name: String,

    /// Package version
    pub version: String,

    /// Short description
    pub description: String,

    /// Path relative to monorepo root
    pub path: PathBuf,

    /// Package type
    pub kind: PackageKind,

    /// Dependencies on other packages in monorepo
    pub internal_deps: Vec<String>,

    /// Exported symbols
    pub exports: Vec<Export>,
}

/// Kind of package
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PackageKind {
    /// Core backend package
    Core,
    /// Database adapter
    Adapter,
    /// Frontend integration
    Frontend,
    /// Mobile SDK
    Mobile,
}

/// An exported symbol from a package
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Export {
    /// Symbol name
    pub name: String,

    /// Symbol kind (function, class, interface, type, const)
    pub kind: ExportKind,

    /// JSDoc/TSDoc description
    pub description: Option<String>,

    /// Source file path
    pub source_file: PathBuf,

    /// Line number in source
    pub line: usize,

    /// Type signature
    pub signature: Option<String>,

    /// Parameters (for functions)
    pub params: Vec<Parameter>,

    /// Return type (for functions)
    pub returns: Option<String>,

    /// Example code
    pub examples: Vec<String>,

    /// Deprecation notice
    pub deprecated: Option<String>,
}

/// Kind of exported symbol
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ExportKind {
    Function,
    Class,
    Interface,
    Type,
    Enum,
    Const,
    Variable,
}

/// Function/method parameter
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Parameter {
    /// Parameter name
    pub name: String,

    /// TypeScript type
    pub type_annotation: String,

    /// Description from JSDoc @param
    pub description: Option<String>,

    /// Whether parameter is optional
    pub optional: bool,

    /// Default value if any
    pub default: Option<String>,
}

/// Documentation validation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    /// Whether validation passed
    pub passed: bool,

    /// Errors found
    pub errors: Vec<ValidationIssue>,

    /// Warnings found
    pub warnings: Vec<ValidationIssue>,

    /// Info messages
    pub info: Vec<String>,
}

/// A validation issue
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationIssue {
    /// Issue severity
    pub severity: IssueSeverity,

    /// Issue message
    pub message: String,

    /// File where issue was found
    pub file: Option<PathBuf>,

    /// Line number
    pub line: Option<usize>,

    /// Suggested fix
    pub suggestion: Option<String>,
}

/// Issue severity level
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum IssueSeverity {
    Error,
    Warning,
    Info,
}

/// Configuration for documentation generation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocgenConfig {
    /// Packages to document
    pub packages: Vec<PackageConfig>,

    /// Output configuration
    pub output: OutputConfig,

    /// Templates directory
    pub templates: Option<PathBuf>,
}

/// Configuration for a single package
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageConfig {
    /// Package name
    pub name: String,

    /// Package path
    pub path: PathBuf,

    /// Kind of package
    pub kind: PackageKind,

    /// Entry points to document
    pub entry_points: Vec<String>,

    /// Files to exclude
    pub exclude: Vec<String>,
}

/// Output configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputConfig {
    /// Output directory
    pub dir: PathBuf,

    /// Generate API reference
    pub api_reference: bool,

    /// Generate changelog
    pub changelog: bool,

    /// Generate package readmes
    pub package_readme: bool,
}

/// Extracted documentation from source
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedDocs {
    /// Package information
    pub package: Package,

    /// All exports grouped by file
    pub files: HashMap<PathBuf, Vec<Export>>,

    /// README content if exists
    pub readme: Option<String>,

    /// CHANGELOG content if exists
    pub changelog: Option<String>,
}

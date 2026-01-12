//! Documentation Generator for Apple Sign-In SDK
//!
//! This tool automatically generates and updates documentation from source code,
//! ensuring API references stay in sync with the actual implementation.

use anyhow::Result;
use clap::{Parser, Subcommand};
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

mod commands;
mod extractors;
mod generators;
mod types;

use commands::{generate, validate, watch};

/// Documentation generator for Apple Sign-In SDK monorepo
#[derive(Parser)]
#[command(name = "docgen")]
#[command(author = "Alex Cedergren")]
#[command(version = "0.1.0")]
#[command(about = "Generate and validate documentation for Apple Sign-In SDK")]
struct Cli {
    /// Enable verbose output
    #[arg(short, long, global = true)]
    verbose: bool,

    /// Root directory of the monorepo
    #[arg(short, long, default_value = ".")]
    root: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Generate documentation from source code
    Generate {
        /// Output directory for generated docs
        #[arg(short, long, default_value = "docs")]
        output: String,

        /// Only generate specific package docs
        #[arg(short, long)]
        package: Option<String>,

        /// Skip validation after generation
        #[arg(long)]
        no_validate: bool,
    },

    /// Validate documentation against source code
    Validate {
        /// Strict mode - fail on warnings
        #[arg(long)]
        strict: bool,
    },

    /// Watch for changes and regenerate docs
    Watch {
        /// Output directory for generated docs
        #[arg(short, long, default_value = "docs")]
        output: String,
    },

    /// Extract TypeScript types to documentation
    ExtractTypes {
        /// Source file or directory
        #[arg(short, long)]
        source: String,

        /// Output markdown file
        #[arg(short, long)]
        output: String,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Initialize logging
    let level = if cli.verbose { Level::DEBUG } else { Level::INFO };
    let subscriber = FmtSubscriber::builder()
        .with_max_level(level)
        .with_target(false)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    info!("Apple Sign-In SDK Documentation Generator v0.1.0");

    match cli.command {
        Commands::Generate {
            output,
            package,
            no_validate,
        } => {
            generate::run(&cli.root, &output, package.as_deref()).await?;
            if !no_validate {
                validate::run(&cli.root, false).await?;
            }
        }
        Commands::Validate { strict } => {
            validate::run(&cli.root, strict).await?;
        }
        Commands::Watch { output } => {
            watch::run(&cli.root, &output).await?;
        }
        Commands::ExtractTypes { source, output } => {
            extractors::typescript::extract_to_markdown(&source, &output).await?;
        }
    }

    Ok(())
}

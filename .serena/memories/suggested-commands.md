# Suggested Commands

## Development
```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run linting
pnpm lint

# Type checking
pnpm check

# Format code
pnpm format

# Clean build artifacts
pnpm clean
```

## Package-specific
```bash
# Fastify plugin
pnpm --filter @running-days/fastify-apple-auth build
pnpm --filter @running-days/fastify-apple-auth test
pnpm --filter @running-days/fastify-apple-auth test:coverage

# SvelteKit package
pnpm --filter @acedergren/sveltekit-apple-signin build

# Documentation
mkdocs serve  # Local docs site
```

## Git & Publishing
```bash
pnpm changeset        # Create changeset for new version
pnpm version          # Apply changesets
pnpm publish          # Build and publish packages
```

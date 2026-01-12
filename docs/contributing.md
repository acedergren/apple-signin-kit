# Contributing

Thank you for your interest in contributing to the Apple Sign-In SDK!

## Code of Conduct

Please read and follow our [Code of Conduct](https://github.com/acedergren/apple-signin-kit/blob/main/CODE_OF_CONDUCT.md).

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/acedergren/apple-signin-kit.git
cd apple-signin-kit

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Development Workflow

### Branch Naming

- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions/changes

Example: `feat/add-google-oauth`

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting
- `refactor` - Code restructuring
- `test` - Tests
- `chore` - Maintenance

Examples:

```bash
feat(fastify-apple-auth): add account lockout configuration
fix(sveltekit-apple-signin): handle popup blocked error
docs(api): update TypeScript types documentation
```

### Changesets

We use [Changesets](https://github.com/changesets/changesets) for versioning:

```bash
# Add a changeset
pnpm changeset

# Select packages that changed
# Choose version bump (patch/minor/major)
# Write description
```

## Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes
4. **Add** tests for new functionality
5. **Run** `pnpm test` and `pnpm lint`
6. **Add** a changeset (`pnpm changeset`)
7. **Push** and create a PR

### PR Checklist

- [ ] Tests pass (`pnpm test`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Types check (`pnpm check`)
- [ ] Changeset added
- [ ] Documentation updated
- [ ] No breaking changes (or documented if intentional)

## Project Structure

```
apple-signin-kit/
├── packages/
│   ├── fastify-apple-auth/       # Core backend
│   ├── fastify-apple-signin-oracle/
│   ├── fastify-apple-signin-drizzle/
│   ├── fastify-apple-signin-mongodb/
│   ├── sveltekit-apple-signin/   # Frontend
│   └── apple-signin-kit/         # iOS (Swift)
├── docs/                         # Documentation
├── .changeset/                   # Changesets config
└── turbo.json                    # Turborepo config
```

## Testing

### Running Tests

```bash
# All packages
pnpm test

# Specific package
pnpm --filter @acedergren/fastify-apple-auth test

# Watch mode
pnpm --filter @acedergren/fastify-apple-auth test --watch

# Coverage
pnpm test:coverage
```

### Writing Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp } from '../test-utils';

describe('Feature', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('should do something', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    });

    expect(response.statusCode).toBe(200);
  });
});
```

## Code Style

### TypeScript

- Use strict mode
- Avoid `any` types
- Export interfaces, not types (for declaration merging)
- Use `const` assertions where appropriate

```typescript
// ✅ Good
interface User {
  id: string;
  email: string;
}

// ❌ Bad
type User = {
  id: any;
  email: any;
};
```

### Svelte 5

- Use runes (`$state`, `$derived`, `$props`)
- Use snippets instead of slots
- Follow component naming: `PascalCase.svelte`

```svelte
<script lang="ts">
  let { user }: { user: User } = $props();
  let count = $state(0);
  const doubled = $derived(count * 2);
</script>
```

### Swift

- Follow Swift 6 strict concurrency
- Use `@Observable` for state
- Use async/await

```swift
@Observable
final class AuthService {
    var user: User?

    func signIn() async throws -> Session {
        // ...
    }
}
```

## Documentation

### Updating Docs

Documentation is in `docs/` using MkDocs:

```bash
# Install MkDocs
pip install mkdocs-material

# Serve locally
mkdocs serve

# Build
mkdocs build
```

### API Documentation

- Document all public APIs
- Include examples
- Update types documentation when interfaces change

## Security

### Reporting Vulnerabilities

**Do NOT** open public issues for security vulnerabilities.

Email: security@acedergren.dev

Include:

- Description
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Security Checklist

When contributing security-related code:

- [ ] Use constant-time comparison for secrets
- [ ] Validate all inputs
- [ ] No sensitive data in logs
- [ ] Proper error messages (no info leakage)
- [ ] Follow OWASP guidelines

## Release Process

Releases are automated via GitHub Actions:

1. PRs merged to `main`
2. Changesets creates release PR
3. Merge release PR
4. Packages published to npm
5. Docs deployed to GitHub Pages

## Getting Help

- [GitHub Discussions](https://github.com/acedergren/apple-signin-kit/discussions)
- [Issue Tracker](https://github.com/acedergren/apple-signin-kit/issues)

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.

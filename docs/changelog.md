# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of Apple Sign-In SDK ecosystem
- `@acedergren/fastify-apple-auth` - Core Fastify authentication plugin
- `@acedergren/fastify-apple-signin-oracle` - Oracle Database adapter
- `@acedergren/fastify-apple-signin-drizzle` - Drizzle ORM adapter
- `@acedergren/fastify-apple-signin-mongodb` - MongoDB adapter
- `@acedergren/sveltekit-apple-signin` - SvelteKit frontend integration
- `apple-signin-kit` - Swift iOS SDK

### Security
- PKCE (RFC 7636) implementation with SHA-256
- NIST 800-63B compliant account lockout
- Token rotation with theft detection
- Device binding via User-Agent
- Timing-attack resistant comparisons

---

## Version History

### Package Versions

| Package | Version | Status |
|---------|---------|--------|
| `@acedergren/fastify-apple-auth` | 1.0.0 | 🚧 Development |
| `@acedergren/fastify-apple-signin-oracle` | 1.0.0 | 🚧 Development |
| `@acedergren/fastify-apple-signin-drizzle` | 1.0.0 | 🚧 Development |
| `@acedergren/fastify-apple-signin-mongodb` | 1.0.0 | 🚧 Development |
| `@acedergren/sveltekit-apple-signin` | 1.0.0 | 🚧 Development |
| `apple-signin-kit` | 1.0.0 | 🚧 Development |

---

## Upgrade Guides

### Migrating from Other Libraries

Coming soon:

- Migrating from `apple-signin-auth`
- Migrating from Auth.js Apple provider
- Migrating from custom implementations

---

## Release Notes Template

For maintainers - use this template for releases:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes in existing functionality

### Deprecated
- Features to be removed in future

### Removed
- Removed features

### Fixed
- Bug fixes

### Security
- Security fixes
```

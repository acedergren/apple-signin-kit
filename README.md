# Apple Auth Kit

[![CI](https://github.com/acedergren/apple-auth-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/acedergren/apple-auth-kit/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-blue.svg)](https://www.typescriptlang.org/)

Production-grade Apple Sign-In SDK ecosystem with PKCE, account lockout, session management, and database adapters.

**Fully compliant** with Apple's official [Sign in with Apple JS](https://developer.apple.com/documentation/signinwithapplejs) and [AuthenticationServices](https://developer.apple.com/documentation/authenticationservices/implementing-user-authentication-with-sign-in-with-apple) documentation.

## Features

- **RFC 7636 PKCE** - S256 code challenge for OAuth security
- **NIST 800-63B Compliant** - Progressive account lockout with configurable thresholds
- **Timing-Safe Comparisons** - Prevents enumeration attacks on tokens
- **Token Rotation** - Refresh tokens invalidated on each use
- **Multi-Tenant Support** - Built-in user context isolation
- **Pluggable Database Adapters** - Oracle, PostgreSQL, MySQL, SQLite, MongoDB
- **Zero Dependencies** - Core auth logic uses only Node.js crypto + jose

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [`@acedergren/fastify-apple-auth`](./packages/fastify-apple-auth) | Fastify plugin with full OAuth flow | [![npm](https://img.shields.io/npm/v/@acedergren/fastify-apple-auth.svg)](https://www.npmjs.com/package/@acedergren/fastify-apple-auth) |
| [`@acedergren/apple-auth-core`](./packages/apple-auth-core) | Framework-agnostic auth logic | [![npm](https://img.shields.io/npm/v/@acedergren/apple-auth-core.svg)](https://www.npmjs.com/package/@acedergren/apple-auth-core) |
| [`@acedergren/sveltekit-apple-auth`](./packages/sveltekit-apple-auth) | SvelteKit client integration | Coming Soon |
| `apple-auth-kit` (SPM) | Swift iOS SDK | Coming Soon |

## Quick Start

### Fastify Backend

```bash
npm install @acedergren/fastify-apple-auth
```

```typescript
import Fastify from 'fastify';
import { appleAuthPlugin } from '@acedergren/fastify-apple-auth';

const app = Fastify();

await app.register(appleAuthPlugin, {
  apple: {
    clientId: 'com.example.app',
    teamId: 'TEAM123456',
    keyId: 'KEY1234567',
    privateKey: process.env.APPLE_PRIVATE_KEY!,
    redirectUri: 'https://example.com/auth/apple/callback'
  },
  jwt: {
    secret: process.env.JWT_SECRET!,
    accessTokenTtl: '15m',
    refreshTokenTtl: '7d'
  },
  cookies: {
    secure: true,
    sameSite: 'strict'
  }
});

await app.listen({ port: 3000 });
```

### iOS Native (Swift)

```swift
import AppleAuthKit

let service = AppleSignInService()

// Initiate Sign in with Apple
let credential = try await service.signIn(presenting: viewController)

// Send to your backend
let response = try await APIClient.authenticate(
    identityToken: credential.identityToken,
    authorizationCode: credential.authorizationCode
)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Apple Auth Kit                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Fastify   │  │  SvelteKit  │  │      iOS (Swift)        │  │
│  │   Plugin    │  │   Client    │  │         SDK             │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                      │                │
│  ┌──────▼────────────────▼──────────────────────▼─────────────┐ │
│  │                   Core Auth Layer                          │ │
│  │  • PKCE (RFC 7636)   • Token Verification                  │ │
│  │  • Nonce Generation  • Account Lockout (NIST 800-63B)      │ │
│  │  • Session Manager   • Timing-Safe Comparisons             │ │
│  └──────────────────────────┬────────────────────────────────┘  │
│                              │                                   │
│  ┌──────────────────────────▼────────────────────────────────┐  │
│  │                   Database Layer                          │  │
│  │  ┌────────┐ ┌──────────┐ ┌───────┐ ┌────────┐ ┌────────┐  │  │
│  │  │ Oracle │ │ Postgres │ │ MySQL │ │ SQLite │ │MongoDB │  │  │
│  │  └────────┘ └──────────┘ └───────┘ └────────┘ └────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Security Features

### PKCE (RFC 7636)

Apple Auth Kit implements the S256 code challenge method:

```typescript
import { generateCodeVerifier, generateCodeChallenge } from '@acedergren/apple-auth-core';

const verifier = generateCodeVerifier();  // 43-char base64url (256 bits)
const challenge = generateCodeChallenge(verifier);  // SHA-256 hash

// Matches RFC 7636 Appendix B test vector
// verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
// challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
```

### Account Lockout (NIST 800-63B)

Progressive lockout with configurable thresholds:

| Attempt | Lock Duration |
|---------|---------------|
| 5 | 15 minutes |
| 10 | 1 hour |
| 15 | 4 hours |
| 20+ | 24 hours |

```typescript
import { AccountLockoutService } from '@acedergren/fastify-apple-auth';

const lockout = new AccountLockoutService({
  maxAttempts: 5,
  baseLockoutMinutes: 15,
  maxLockoutMinutes: 1440  // 24 hours
});

// Check if user is locked
const status = await lockout.checkLockout(userId);
if (status.isLocked) {
  throw new Error(`Account locked. Retry after ${status.lockoutEndsAt}`);
}
```

### Token Security

- **SHA-256 Hashing**: Tokens are hashed before database storage
- **Timing-Safe Comparison**: Prevents enumeration attacks
- **Token Rotation**: Refresh tokens are single-use
- **User-Agent Binding**: Detects token theft across devices

## Apple Compliance

Apple Auth Kit is **fully compliant** with Apple's official requirements:

| Apple Requirement | Implementation |
|-------------------|----------------|
| PKCE (S256) | `generateCodeChallenge()` with SHA-256 |
| Nonce validation | Timing-safe comparison, 128-bit entropy |
| ID Token verification | JWKS signature validation via `jose` |
| Claim validation | iss, aud, sub, exp, iat all validated |
| Client secret JWT | ES256 signed, 10-minute TTL |
| Clock tolerance | 30 seconds for distributed systems |

**Additional security beyond Apple's requirements:**
- Token freshness check (10-minute max age on `iat`)
- Progressive account lockout (NIST 800-63B)
- Tokens hashed before storage

## Documentation

- [Getting Started Guide](https://acedergren.github.io/apple-auth-kit/getting-started/)
- [API Reference](https://acedergren.github.io/apple-auth-kit/api/)
- [Security Best Practices](https://acedergren.github.io/apple-auth-kit/security/)
- [Database Adapters](https://acedergren.github.io/apple-auth-kit/adapters/)

## Development

```bash
# Clone repository
git clone https://github.com/acedergren/apple-auth-kit.git
cd apple-auth-kit

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Type check
pnpm check

# Lint
pnpm lint
```

### Project Structure

```
apple-auth-kit/
├── packages/
│   ├── fastify-apple-auth/    # Fastify plugin
│   ├── apple-auth-core/       # Framework-agnostic core
│   ├── sveltekit-apple-auth/  # SvelteKit client (WIP)
│   └── database/              # Database adapters
├── tools/
│   └── docgen/                # Rust documentation generator
├── docs/                      # Documentation source (MkDocs)
├── examples/                  # Example applications
└── .github/workflows/         # CI/CD pipelines
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Reporting Security Issues

For security vulnerabilities, please email security@example.com instead of opening a public issue. See [SECURITY.md](SECURITY.md) for our security policy.

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.

---

**Battle-tested in production** at [Running Days](https://runningdays.app) - a fitness tracking SaaS processing thousands of Apple Sign-In authentications daily.

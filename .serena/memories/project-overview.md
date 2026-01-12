# Apple Sign-In SDK - Project Overview

## Purpose
Production-grade Apple Sign-In authentication SDK ecosystem providing:
- Fastify backend plugin with PKCE, account lockout, session management
- SvelteKit client hooks for server-side auth
- Swift iOS SDK with Keychain storage and certificate pinning
- Database adapters (Oracle, Drizzle ORM, MongoDB)

## Tech Stack
| Layer | Technology |
|-------|------------|
| Backend | Fastify 5, TypeScript, jose (JWT), zod |
| Frontend | SvelteKit 2, Svelte 5 |
| iOS | Swift, SwiftUI, CryptoKit |
| Database | Oracle, Drizzle ORM, MongoDB adapters |
| Testing | Vitest, msw (mocking) |
| Monorepo | pnpm workspaces + Turborepo |

## Packages
- `@running-days/fastify-apple-auth` - Core Fastify plugin
- `@acedergren/sveltekit-apple-signin` - SvelteKit hooks & components
- `AppleSignInKit` - Swift iOS SDK
- `fastify-apple-signin-oracle` - Oracle DB adapter
- `fastify-apple-signin-drizzle` - Drizzle ORM adapter
- `fastify-apple-signin-mongodb` - MongoDB adapter

## Architecture
```
Client (Web/iOS) → PKCE Challenge → Backend (Fastify)
                                     ↓
                              Apple ID Verification
                                     ↓
                              JWT Access/Refresh Tokens
                                     ↓
                              Database Adapter (Oracle/Drizzle/MongoDB)
```

# @running-days/fastify-apple-auth

Production-grade Apple Sign-In authentication for Fastify with PKCE, account lockout, and session management.

## Features

- 🔐 **PKCE (RFC 7636)** - Secure OAuth flow with SHA256 code challenge
- 🛡️ **Account Lockout** - NIST 800-63B compliant progressive lockout
- 🔄 **Session Management** - Concurrent session limits, token rotation
- ⏱️ **Timing-Safe** - Constant-time comparisons prevent enumeration attacks
- 🔌 **Pluggable** - Bring your own database via repository pattern
- 📊 **Observable** - Structured logging for security auditing

## Installation

```bash
npm install @running-days/fastify-apple-auth
# or
pnpm add @running-days/fastify-apple-auth
```

## Quick Start

```typescript
import fastify from 'fastify';
import { createAuthPlugin } from '@running-days/fastify-apple-auth';

const app = fastify({ logger: true });

// Implement repositories for your database
const userRepository = {
  findByAppleUserId: async (id) => { /* ... */ },
  findByEmail: async (email) => { /* ... */ },
  findById: async (id) => { /* ... */ },
  create: async (data) => { /* ... */ },
  updateLastLogin: async (userId, timestamp) => { /* ... */ },
};

const refreshTokenRepository = {
  findByHash: async (hash) => { /* ... */ },
  create: async (data) => { /* ... */ },
  revokeByHash: async (hash) => { /* ... */ },
  revokeAllForUser: async (userId) => { /* ... */ },
  findActiveByUser: async (userId) => { /* ... */ },
  countActiveForUser: async (userId) => { /* ... */ },
};

// Register the plugin
await app.register(createAuthPlugin, {
  service: {
    userRepository,
    refreshTokenRepository,
  },
  config: {
    apple: {
      clientId: process.env.APPLE_CLIENT_ID!,
      teamId: process.env.APPLE_TEAM_ID!,
      keyId: process.env.APPLE_KEY_ID!,
      privateKey: process.env.APPLE_PRIVATE_KEY!,
      redirectUri: 'https://api.example.com/auth/apple/callback',
    },
    jwt: {
      secret: process.env.JWT_SECRET!,
      accessTokenTtl: '15m',
      refreshTokenTtl: '7d',
    },
  },
});

// Protected route example
app.get('/profile', {
  preHandler: [app.authenticate],
}, async (request) => {
  return { user: request.user };
});

await app.listen({ port: 3000 });
```

## API Endpoints

The plugin registers these routes under `/auth`:

| Method | Path | Description | Rate Limit |
|--------|------|-------------|------------|
| GET | `/auth/apple` | Initiate Apple OAuth | 10/min |
| POST | `/auth/apple/callback` | OAuth callback | 5/min |
| POST | `/auth/refresh` | Refresh access token | 20/min |
| POST | `/auth/logout` | Revoke refresh token | 10/min |
| GET | `/auth/me` | Get current user | 60/min |
| GET | `/auth/sessions` | List active sessions | 20/min |
| DELETE | `/auth/sessions/:id` | Revoke specific session | 20/min |

## Configuration

### Apple Config

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `clientId` | string | ✅ | Your app's bundle ID or Service ID |
| `teamId` | string | ✅ | Apple Developer Team ID (10 chars) |
| `keyId` | string | ✅ | Sign-In with Apple key ID |
| `privateKey` | string | ✅ | Private key content (PEM, PKCS#8) |
| `redirectUri` | string | ✅ | OAuth callback URL |

### JWT Config

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `secret` | string | ✅ | - | JWT signing secret (32+ chars) |
| `accessTokenTtl` | string | ✅ | - | Access token TTL (e.g., "15m") |
| `refreshTokenTtl` | string | ✅ | - | Refresh token TTL (e.g., "7d") |
| `issuer` | string | ❌ | - | JWT issuer claim |
| `audience` | string | ❌ | - | JWT audience claim |

### Account Lockout Config

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `threshold` | number | 5 | Failed attempts before lock |
| `baseDurationMs` | number | 900000 | Base lockout (15 min) |
| `maxDurationMs` | number | 86400000 | Max lockout (24 hours) |
| `attemptWindowMs` | number | 900000 | Attempt counting window |

## Repository Interfaces

### UserRepository

```typescript
interface UserRepository {
  findByAppleUserId(appleUserId: string): Promise<AuthUser | null>;
  findByEmail(email: string): Promise<AuthUser | null>;
  findById(id: string): Promise<AuthUser | null>;
  create(data: NewAuthUser): Promise<AuthUser>;
  updateLastLogin(userId: string, timestamp: Date): Promise<void>;
  getLockoutState?(userId: string): Promise<UserLockoutState | null>;
  updateLockoutState?(userId: string, state: Partial<UserLockoutState>): Promise<void>;
}
```

### RefreshTokenRepository

```typescript
interface RefreshTokenRepository {
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  create(data: NewRefreshToken): Promise<RefreshToken>;
  revokeByHash(tokenHash: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  findActiveByUser(userId: string): Promise<RefreshToken[]>;
  countActiveForUser(userId: string): Promise<number>;
  deleteExpired?(): Promise<number>;
}
```

## Security Features

### PKCE Flow

```
Client                    Your API                    Apple
   |                          |                          |
   |--- GET /auth/apple ----->|                          |
   |<-- 302 + cookies --------|                          |
   |                          |                          |
   |--- Redirect to Apple ---------------------------->|
   |<-- Authorization code + state -------------------|
   |                          |                          |
   |--- POST /callback ------>|                          |
   |                          |--- Exchange code ------>|
   |                          |<-- ID token ------------|
   |                          |--- Verify signature --->|
   |<-- Set auth cookies -----|                          |
```

### Account Lockout Progression

| Lockout # | Duration |
|-----------|----------|
| 1st | 15 minutes |
| 2nd | 30 minutes |
| 3rd | 1 hour |
| 4th | 2 hours |
| 5th+ | 24 hours (max) |

### Token Rotation

Refresh tokens are rotated on each use. If a token is reused (potential theft), all sessions for that user are revoked.

## Testing

```bash
# Run tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

## Examples

See the [examples/basic-app](./examples/basic-app) directory for a complete working example with:
- In-memory repository implementations (great for development/testing)
- Full plugin registration and route setup
- Protected route examples
- Environment variable validation

To run the example:

```bash
cd examples/basic-app
pnpm install
APPLE_CLIENT_ID=... APPLE_TEAM_ID=... APPLE_KEY_ID=... \
APPLE_PRIVATE_KEY="..." JWT_SECRET="your-32-char-secret" \
pnpm start
```

### Database Adapter Examples

For production, implement the repository interfaces with your database:

**PostgreSQL (with Drizzle):**
```typescript
import { db } from './database';
import { users, refreshTokens } from './schema';

const userRepository: UserRepository = {
  findByAppleUserId: (id) => db.query.users.findFirst({
    where: eq(users.appleUserId, id)
  }),
  create: (data) => db.insert(users).values(data).returning(),
  // ... other methods
};
```

**MongoDB (with Mongoose):**
```typescript
import { User, RefreshToken } from './models';

const userRepository: UserRepository = {
  findByAppleUserId: (id) => User.findOne({ appleUserId: id }),
  create: (data) => User.create(data),
  // ... other methods
};
```

## License

MIT

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

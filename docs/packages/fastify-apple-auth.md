# fastify-apple-auth

Core Fastify plugin for Apple Sign-In authentication.

## Features

- **PKCE (RFC 7636)** - Proof Key for Code Exchange with SHA-256
- **Account Lockout** - NIST 800-63B compliant progressive lockout
- **Session Management** - Token rotation, device binding, concurrent limits
- **Timing-Attack Prevention** - Constant-time comparison throughout
- **Pluggable Adapters** - Bring your own database

## Installation

```bash
pnpm add @acedergren/fastify-apple-auth
```

**Peer Dependencies:**

```bash
pnpm add fastify @fastify/cookie jose
```

## Quick Start

```typescript
import fastify from 'fastify';
import cookie from '@fastify/cookie';
import { appleAuthPlugin } from '@acedergren/fastify-apple-auth';
import { drizzleAdapter } from '@acedergren/fastify-apple-signin-drizzle';

const app = fastify();

await app.register(cookie, {
  secret: process.env.COOKIE_SECRET,
});

await app.register(appleAuthPlugin, {
  apple: {
    clientId: process.env.APPLE_CLIENT_ID!,
    teamId: process.env.APPLE_TEAM_ID!,
    keyId: process.env.APPLE_KEY_ID!,
    privateKey: process.env.APPLE_PRIVATE_KEY!,
  },
  jwt: {
    secret: process.env.JWT_SECRET!,
  },
  adapter: drizzleAdapter({ db }),
});
```

## Configuration

### Apple Configuration

```typescript
interface AppleConfig {
  /** Services ID or Bundle ID */
  clientId: string;

  /** 10-character Team ID from Apple Developer */
  teamId: string;

  /** Key ID from Sign in with Apple key */
  keyId: string;

  /** Private key content (PEM format) */
  privateKey: string;

  /** Override callback URL (optional) */
  redirectUri?: string;
}
```

### JWT Configuration

```typescript
interface JwtConfig {
  /** Signing secret (min 32 characters) */
  secret: string;

  /** Access token TTL (default: '15m') */
  accessTokenTtl?: string;

  /** Refresh token TTL (default: '7d') */
  refreshTokenTtl?: string;

  /** Token issuer (default: 'apple-signin-sdk') */
  issuer?: string;
}
```

### Cookie Configuration

```typescript
interface CookieConfig {
  /** Access token cookie name (default: 'access_token') */
  accessTokenName?: string;

  /** Refresh token cookie name (default: 'refresh_token') */
  refreshTokenName?: string;

  /** Cookie domain (default: request host) */
  domain?: string;

  /** Use secure cookies (default: true in production) */
  secure?: boolean;

  /** SameSite policy (default: 'lax') */
  sameSite?: 'strict' | 'lax' | 'none';
}
```

### Account Lockout Configuration

```typescript
interface LockoutConfig {
  /** Enable account lockout (default: true) */
  enabled?: boolean;

  /** Max failed attempts before lockout (default: 5) */
  maxAttempts?: number;

  /** Base lockout duration in minutes (default: 15) */
  baseDurationMinutes?: number;

  /** Maximum lockout duration in minutes (default: 1440 = 24h) */
  maxDurationMinutes?: number;
}
```

### Session Configuration

```typescript
interface SessionConfig {
  /** Maximum concurrent sessions per user (default: 5) */
  maxConcurrentSessions?: number;

  /** Bind sessions to User-Agent (default: true) */
  userAgentBinding?: boolean;

  /** Rotate refresh token on each use (default: true) */
  rotateRefreshToken?: boolean;
}
```

## Routes

The plugin registers these routes under the configured prefix (default: `/api/auth`):

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/apple` | Initiate OAuth flow |
| `POST` | `/apple/callback` | Handle OAuth callback |
| `POST` | `/refresh` | Refresh access token |
| `POST` | `/logout` | End session |
| `GET` | `/me` | Get current user |
| `GET` | `/sessions` | List active sessions |
| `DELETE` | `/sessions/:id` | Revoke specific session |

### Route Examples

#### Initiate Sign-In

```bash
GET /api/auth/apple?redirect=/dashboard
```

Returns redirect to Apple's authorization page with PKCE challenge.

#### Handle Callback

```bash
POST /api/auth/apple/callback
Content-Type: application/x-www-form-urlencoded

code=xxx&state=xxx&id_token=xxx
```

Apple posts authorization code. Plugin:

1. Validates PKCE and state
2. Exchanges code for tokens
3. Verifies ID token
4. Creates/updates user
5. Creates session
6. Sets httpOnly cookies
7. Redirects to success URL

#### Refresh Token

```bash
POST /api/auth/refresh
Cookie: refresh_token=xxx
```

Returns new access token, rotates refresh token.

## Adapter Interface

Implement this interface for custom database adapters:

```typescript
interface AuthAdapter {
  // User operations
  findUserByAppleId(appleId: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  createUser(data: CreateUserData): Promise<User>;
  updateUser(id: string, data: UpdateUserData): Promise<User>;

  // Session operations
  createSession(data: CreateSessionData): Promise<Session>;
  findSessionByToken(token: string): Promise<Session | null>;
  updateSession(id: string, data: UpdateSessionData): Promise<Session>;
  deleteSession(id: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  countUserSessions(userId: string): Promise<number>;

  // Lockout operations (optional)
  getLockoutStatus?(userId: string): Promise<LockoutStatus | null>;
  recordFailedAttempt?(userId: string): Promise<void>;
  clearLockout?(userId: string): Promise<void>;
}
```

## Events

The plugin emits events you can hook into:

```typescript
app.addHook('onAppleAuthSuccess', async (user, session) => {
  console.log(`User ${user.id} signed in`);
  await analytics.track('sign_in', { userId: user.id });
});

app.addHook('onAppleAuthFailure', async (error, context) => {
  console.error('Auth failed:', error);
  await alerting.notify('auth_failure', { error });
});

app.addHook('onSessionCreated', async (session) => {
  console.log(`New session: ${session.id}`);
});

app.addHook('onSessionRevoked', async (session) => {
  console.log(`Session revoked: ${session.id}`);
});
```

## Error Handling

The plugin throws typed errors:

```typescript
import { AppleAuthError, ErrorCode } from '@acedergren/fastify-apple-auth';

app.setErrorHandler((error, request, reply) => {
  if (error instanceof AppleAuthError) {
    switch (error.code) {
      case ErrorCode.ACCOUNT_LOCKED:
        return reply.status(423).send({
          error: 'Account locked',
          retryAfter: error.retryAfter,
        });
      case ErrorCode.INVALID_TOKEN:
        return reply.status(401).send({ error: 'Invalid token' });
      case ErrorCode.SESSION_EXPIRED:
        return reply.status(401).send({ error: 'Session expired' });
    }
  }
  throw error;
});
```

## Testing

```typescript
import { createMockAdapter } from '@acedergren/fastify-apple-auth/testing';

const mockAdapter = createMockAdapter();

await app.register(appleAuthPlugin, {
  // ... config
  adapter: mockAdapter,
});

// Assert on adapter calls
expect(mockAdapter.createUser).toHaveBeenCalledWith({
  appleId: 'apple-user-id',
  email: 'user@example.com',
});
```

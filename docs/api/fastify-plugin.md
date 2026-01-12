# Fastify Plugin API

Complete API reference for `@acedergren/fastify-apple-auth`.

## Registration

```typescript
import fastify from 'fastify';
import { appleAuthPlugin } from '@acedergren/fastify-apple-auth';

const app = fastify();

await app.register(appleAuthPlugin, {
  // Configuration options
});
```

## Plugin Options

### Required

```typescript
{
  apple: {
    clientId: string;     // Apple Services ID
    teamId: string;       // Apple Team ID
    keyId: string;        // Apple Key ID
    privateKey: string;   // Private key (PEM)
  },
  jwt: {
    secret: string;       // JWT signing secret
  },
  adapter: AuthAdapter;   // Database adapter
}
```

### Optional

```typescript
{
  apple: {
    redirectUri?: string;  // Override callback URL
  },
  jwt: {
    accessTokenTtl?: string;   // Default: '15m'
    refreshTokenTtl?: string;  // Default: '7d'
    issuer?: string;           // Default: 'apple-signin-sdk'
    audience?: string;         // Default: clientId
  },
  cookies: {
    accessTokenName?: string;  // Default: 'access_token'
    refreshTokenName?: string; // Default: 'refresh_token'
    domain?: string;
    secure?: boolean;          // Default: true in production
    sameSite?: 'strict' | 'lax' | 'none'; // Default: 'lax'
    path?: string;             // Default: '/'
  },
  lockout: {
    enabled?: boolean;         // Default: true
    maxAttempts?: number;      // Default: 5
    baseDurationMinutes?: number; // Default: 15
    maxDurationMinutes?: number;  // Default: 1440
    multiplier?: number;       // Default: 2
  },
  session: {
    maxConcurrentSessions?: number; // Default: 5
    userAgentBinding?: boolean;     // Default: true
    rotateRefreshToken?: boolean;   // Default: true
  },
  routes: {
    prefix?: string;  // Default: '/api/auth'
    enabled?: boolean; // Default: true
  }
}
```

## Decorators

The plugin adds these Fastify decorators:

### `fastify.appleAuth`

Access the authentication service:

```typescript
app.get('/custom', async (request, reply) => {
  const service = fastify.appleAuth;

  // Generate tokens
  const tokens = await service.generateTokens(user, session);

  // Verify token
  const payload = await service.verifyAccessToken(token);
});
```

### `request.user`

Available on authenticated requests:

```typescript
app.get('/protected', {
  preHandler: app.authenticate,
}, async (request, reply) => {
  const user = request.user;
  // { id, email, emailVerified, ... }
});
```

### `request.session`

Current session information:

```typescript
app.get('/session-info', {
  preHandler: app.authenticate,
}, async (request, reply) => {
  const session = request.session;
  // { id, userId, userAgent, ipAddress, ... }
});
```

## Hooks

### `app.authenticate`

Pre-handler hook for protected routes:

```typescript
app.get('/protected', {
  preHandler: app.authenticate,
}, async (request, reply) => {
  // request.user is guaranteed to exist
});
```

### `app.optionalAuth`

Pre-handler that doesn't require authentication:

```typescript
app.get('/public', {
  preHandler: app.optionalAuth,
}, async (request, reply) => {
  if (request.user) {
    // Authenticated user
  } else {
    // Anonymous access
  }
});
```

## Events

### `onAppleAuthSuccess`

Fired after successful authentication:

```typescript
app.addHook('onAppleAuthSuccess', async (user, session, request) => {
  console.log(`User ${user.id} signed in`);

  // Track analytics
  await analytics.track('sign_in', {
    userId: user.id,
    method: 'apple',
    isNewUser: session.createdAt === user.createdAt,
  });
});
```

### `onAppleAuthFailure`

Fired on authentication failure:

```typescript
app.addHook('onAppleAuthFailure', async (error, context, request) => {
  console.error('Auth failed:', error.code);

  // Alert on suspicious activity
  if (error.code === 'TOKEN_THEFT_DETECTED') {
    await alerting.critical('Token theft detected', {
      userId: context.userId,
      ipAddress: request.ip,
    });
  }
});
```

### `onSessionCreated`

Fired when a new session is created:

```typescript
app.addHook('onSessionCreated', async (session, user, request) => {
  // Notify user of new login
  await email.send(user.email, 'new_login', {
    device: parseUserAgent(session.userAgent),
    location: geolocate(session.ipAddress),
  });
});
```

### `onSessionRevoked`

Fired when a session is revoked:

```typescript
app.addHook('onSessionRevoked', async (session, reason) => {
  console.log(`Session ${session.id} revoked: ${reason}`);
});
```

## Routes

Default routes registered by the plugin:

### `GET /api/auth/apple`

Initiates OAuth flow.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `redirect` | string | Where to redirect after auth |
| `state` | string | Custom state (optional) |

**Response:** Redirects to Apple authorization

### `POST /api/auth/apple/callback`

Handles OAuth callback from Apple.

**Body (form-urlencoded):**

| Field | Type | Description |
|-------|------|-------------|
| `code` | string | Authorization code |
| `state` | string | State parameter |
| `id_token` | string | Apple ID token |
| `user` | string | User info (JSON, first sign-in only) |

**Response:** Sets cookies and redirects

### `POST /api/auth/refresh`

Refreshes access token.

**Cookies Required:** `refresh_token`

**Response:**

```json
{
  "accessToken": "eyJ...",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

### `POST /api/auth/logout`

Ends current session.

**Cookies Required:** `access_token` or `refresh_token`

**Response:**

```json
{
  "success": true
}
```

### `GET /api/auth/me`

Gets current user.

**Cookies Required:** `access_token`

**Response:**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "emailVerified": true,
  "fullName": "John Doe",
  "createdAt": "2025-01-01T00:00:00Z"
}
```

### `GET /api/auth/sessions`

Lists active sessions.

**Response:**

```json
{
  "sessions": [
    {
      "id": "uuid",
      "device": "Chrome on macOS",
      "ipAddress": "192.168.1.1",
      "lastActive": "2025-01-15T10:30:00Z",
      "current": true
    }
  ]
}
```

### `DELETE /api/auth/sessions/:id`

Revokes a specific session.

**Response:**

```json
{
  "success": true
}
```

## Custom Routes

Disable default routes and create your own:

```typescript
await app.register(appleAuthPlugin, {
  // ...
  routes: {
    enabled: false, // Disable default routes
  },
});

// Custom routes
app.get('/login/apple', async (request, reply) => {
  const authUrl = await app.appleAuth.getAuthorizationUrl({
    redirect: request.query.redirect,
  });
  return reply.redirect(authUrl);
});

app.post('/login/apple/callback', async (request, reply) => {
  const { user, session, tokens } = await app.appleAuth.handleCallback(
    request.body
  );

  // Custom response handling
  return {
    user,
    tokens,
  };
});
```

## Error Handling

```typescript
import { AppleAuthError, ErrorCode } from '@acedergren/fastify-apple-auth';

app.setErrorHandler((error, request, reply) => {
  if (error instanceof AppleAuthError) {
    const response = {
      error: error.code,
      message: error.message,
    };

    if (error.code === ErrorCode.ACCOUNT_LOCKED) {
      response.retryAfter = error.retryAfter;
      return reply.status(423).send(response);
    }

    if (error.code === ErrorCode.INVALID_TOKEN ||
        error.code === ErrorCode.TOKEN_EXPIRED) {
      return reply.status(401).send(response);
    }

    return reply.status(400).send(response);
  }

  throw error;
});
```

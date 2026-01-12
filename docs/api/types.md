# TypeScript Types

Core types exported by `@acedergren/fastify-apple-auth`.

## User Types

```typescript
/**
 * User account created from Apple Sign-In
 */
interface User {
  /** Unique identifier (UUID) */
  id: string;

  /** Apple's unique user identifier */
  appleId: string;

  /** User's email (may be relay address) */
  email: string;

  /** Whether email is verified by Apple */
  emailVerified: boolean;

  /** User's full name (only on first sign-in) */
  fullName?: string;

  /** Account creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Data for creating a new user
 */
interface CreateUserData {
  appleId: string;
  email: string;
  emailVerified?: boolean;
  fullName?: string;
}

/**
 * Data for updating a user
 */
interface UpdateUserData {
  email?: string;
  emailVerified?: boolean;
  fullName?: string;
}
```

## Session Types

```typescript
/**
 * Active authentication session
 */
interface Session {
  /** Unique identifier (UUID) */
  id: string;

  /** Associated user ID */
  userId: string;

  /** SHA-256 hash of refresh token */
  tokenHash: string;

  /** Client User-Agent string */
  userAgent?: string;

  /** Client IP address */
  ipAddress?: string;

  /** Session creation time */
  createdAt: Date;

  /** Session expiration time */
  expiresAt: Date;

  /** Last activity time */
  lastUsedAt: Date;

  /** When token was rotated (for theft detection) */
  rotatedAt?: Date;
}

/**
 * Data for creating a new session
 */
interface CreateSessionData {
  userId: string;
  tokenHash: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
}
```

## Lockout Types

```typescript
/**
 * Account lockout status
 */
interface LockoutStatus {
  /** User ID */
  userId: string;

  /** Number of failed attempts */
  failedAttempts: number;

  /** Number of times locked */
  lockoutCount: number;

  /** Whether currently locked */
  isLocked: boolean;

  /** When lockout expires */
  lockedUntil?: Date;

  /** Last failed attempt time */
  lastFailedAt?: Date;
}
```

## Token Types

```typescript
/**
 * JWT access token payload
 */
interface AccessTokenPayload {
  /** Subject (user ID) */
  sub: string;

  /** Issuer */
  iss: string;

  /** Audience */
  aud: string;

  /** Expiration time (Unix timestamp) */
  exp: number;

  /** Issued at (Unix timestamp) */
  iat: number;

  /** User email */
  email: string;

  /** Session ID */
  sessionId: string;
}

/**
 * Token pair returned on authentication
 */
interface TokenPair {
  /** JWT access token */
  accessToken: string;

  /** Opaque refresh token */
  refreshToken: string;

  /** Access token expiration (seconds) */
  expiresIn: number;

  /** Token type (always "Bearer") */
  tokenType: 'Bearer';
}
```

## Configuration Types

```typescript
/**
 * Apple Sign-In configuration
 */
interface AppleConfig {
  /** Services ID or Bundle ID */
  clientId: string;

  /** 10-character Team ID */
  teamId: string;

  /** Key ID from Apple */
  keyId: string;

  /** Private key (PEM format) */
  privateKey: string;

  /** Override redirect URI */
  redirectUri?: string;
}

/**
 * JWT configuration
 */
interface JwtConfig {
  /** Signing secret (min 32 chars) */
  secret: string;

  /** Access token TTL (e.g., '15m') */
  accessTokenTtl?: string;

  /** Refresh token TTL (e.g., '7d') */
  refreshTokenTtl?: string;

  /** Token issuer */
  issuer?: string;

  /** Token audience */
  audience?: string;
}

/**
 * Cookie configuration
 */
interface CookieConfig {
  /** Access token cookie name */
  accessTokenName?: string;

  /** Refresh token cookie name */
  refreshTokenName?: string;

  /** Cookie domain */
  domain?: string;

  /** Use secure cookies */
  secure?: boolean;

  /** SameSite policy */
  sameSite?: 'strict' | 'lax' | 'none';

  /** Cookie path */
  path?: string;
}

/**
 * Account lockout configuration
 */
interface LockoutConfig {
  /** Enable lockout */
  enabled?: boolean;

  /** Max attempts before lockout */
  maxAttempts?: number;

  /** Base lockout duration (minutes) */
  baseDurationMinutes?: number;

  /** Max lockout duration (minutes) */
  maxDurationMinutes?: number;

  /** Duration multiplier */
  multiplier?: number;
}

/**
 * Session configuration
 */
interface SessionConfig {
  /** Max concurrent sessions */
  maxConcurrentSessions?: number;

  /** Bind to User-Agent */
  userAgentBinding?: boolean;

  /** Rotate refresh token on use */
  rotateRefreshToken?: boolean;
}

/**
 * Complete plugin configuration
 */
interface AppleAuthPluginConfig {
  apple: AppleConfig;
  jwt: JwtConfig;
  cookies?: CookieConfig;
  lockout?: LockoutConfig;
  session?: SessionConfig;
  adapter: AuthAdapter;
  routes?: {
    prefix?: string;
    enabled?: boolean;
  };
}
```

## Adapter Interface

```typescript
/**
 * Database adapter interface
 * Implement this for custom database integrations
 */
interface AuthAdapter {
  // User operations
  findUserByAppleId(appleId: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  createUser(data: CreateUserData): Promise<User>;
  updateUser(id: string, data: UpdateUserData): Promise<User>;

  // Session operations
  createSession(data: CreateSessionData): Promise<Session>;
  findSessionByToken(tokenHash: string): Promise<Session | null>;
  findSessionById(id: string): Promise<Session | null>;
  updateSession(id: string, data: Partial<Session>): Promise<Session>;
  deleteSession(id: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  getUserSessions(userId: string): Promise<Session[]>;
  countUserSessions(userId: string): Promise<number>;

  // Lockout operations (optional)
  getLockoutStatus?(userId: string): Promise<LockoutStatus | null>;
  recordFailedAttempt?(userId: string): Promise<void>;
  clearLockout?(userId: string): Promise<void>;

  // Health check
  healthCheck?(): Promise<{ ok: boolean; latencyMs: number }>;
}
```

## Error Types

```typescript
/**
 * Authentication error codes
 */
enum ErrorCode {
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  DEVICE_MISMATCH = 'DEVICE_MISMATCH',
  TOKEN_THEFT_DETECTED = 'TOKEN_THEFT_DETECTED',
  MAX_SESSIONS_REACHED = 'MAX_SESSIONS_REACHED',
  APPLE_AUTH_FAILED = 'APPLE_AUTH_FAILED',
  INVALID_STATE = 'INVALID_STATE',
  INVALID_PKCE = 'INVALID_PKCE',
}

/**
 * Authentication error
 */
class AppleAuthError extends Error {
  code: ErrorCode;
  statusCode: number;
  retryAfter?: number;
  lockedUntil?: Date;

  constructor(code: ErrorCode, options?: {
    message?: string;
    statusCode?: number;
    retryAfter?: number;
    lockedUntil?: Date;
  });
}
```

## Event Types

```typescript
/**
 * Authentication success event
 */
interface AuthSuccessEvent {
  user: User;
  session: Session;
  isNewUser: boolean;
}

/**
 * Authentication failure event
 */
interface AuthFailureEvent {
  error: AppleAuthError;
  appleId?: string;
  ipAddress: string;
}

/**
 * Session event
 */
interface SessionEvent {
  session: Session;
  user: User;
}
```

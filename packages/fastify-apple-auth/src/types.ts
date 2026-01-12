/**
 * Type definitions for @running-days/fastify-apple-auth
 *
 * These interfaces define the contract for integrating Apple Sign-In
 * with any database backend through dependency injection.
 *
 * @module types
 */

import type { FastifyRequest } from 'fastify';

// =============================================================================
// USER & SESSION TYPES
// =============================================================================

/**
 * Authenticated user information.
 * This interface defines the minimum user fields required for authentication.
 */
export interface AuthUser {
  /** Unique user identifier (UUID format recommended) */
  id: string;
  /** User's email address (may be private relay for Apple) */
  email: string;
  /** User role for authorization */
  role: 'user' | 'admin';
  /** Apple's unique user identifier (sub claim from ID token) */
  appleUserId?: string | null;
  /** Account creation timestamp */
  createdAt: Date;
  /** Last login timestamp */
  lastLoginAt?: Date | null;
}

/**
 * Data required to create a new user during first Apple Sign-In.
 */
export interface NewAuthUser {
  email: string;
  appleUserId: string;
  role?: 'user' | 'admin';
}

/**
 * Refresh token stored in database.
 */
export interface RefreshToken {
  id: string;
  userId: string;
  /** SHA-256 hash of the actual token (never store plaintext) */
  tokenHash: string;
  /** User-Agent string for device tracking */
  userAgent: string | null;
  /** Token expiration timestamp */
  expiresAt: Date;
  /** Token creation timestamp */
  createdAt: Date;
  /** When was this token last used */
  lastUsedAt?: Date | null;
  /** Has this token been revoked */
  revoked?: boolean;
}

/**
 * Data required to create a new refresh token.
 */
export interface NewRefreshToken {
  userId: string;
  tokenHash: string;
  userAgent: string | null;
  expiresAt: Date;
}

// =============================================================================
// REPOSITORY INTERFACES (Dependency Injection)
// =============================================================================

/**
 * User repository interface for database operations.
 * Implement this interface to connect to your database.
 */
export interface UserRepository {
  /**
   * Find a user by their Apple user ID (sub claim).
   * @param appleUserId - Apple's unique user identifier
   * @returns User or null if not found
   */
  findByAppleUserId(appleUserId: string): Promise<AuthUser | null>;

  /**
   * Find a user by email address.
   * @param email - Email address
   * @returns User or null if not found
   */
  findByEmail(email: string): Promise<AuthUser | null>;

  /**
   * Find a user by their internal ID.
   * @param id - Internal user ID
   * @returns User or null if not found
   */
  findById(id: string): Promise<AuthUser | null>;

  /**
   * Create a new user (first-time Apple Sign-In).
   * @param data - New user data
   * @returns Created user
   */
  create(data: NewAuthUser): Promise<AuthUser>;

  /**
   * Update user's last login timestamp.
   * @param userId - User ID
   * @param timestamp - Login timestamp
   */
  updateLastLogin(userId: string, timestamp: Date): Promise<void>;

  /**
   * Get account lockout state for a user.
   * @param userId - User ID
   * @returns Current lockout state
   */
  getLockoutState?(userId: string): Promise<UserLockoutState | null>;

  /**
   * Update account lockout state.
   * @param userId - User ID
   * @param state - New lockout state
   */
  updateLockoutState?(userId: string, state: Partial<UserLockoutState>): Promise<void>;
}

/**
 * Refresh token repository interface.
 * Implement this interface to store refresh tokens in your database.
 */
export interface RefreshTokenRepository {
  /**
   * Find a refresh token by its hash.
   * @param tokenHash - SHA-256 hash of the token
   * @returns Token record or null
   */
  findByHash(tokenHash: string): Promise<RefreshToken | null>;

  /**
   * Create a new refresh token.
   * @param data - Token data
   * @returns Created token record
   */
  create(data: NewRefreshToken): Promise<RefreshToken>;

  /**
   * Revoke (delete) a refresh token by its hash.
   * @param tokenHash - SHA-256 hash of the token to revoke
   */
  revokeByHash(tokenHash: string): Promise<void>;

  /**
   * Revoke all refresh tokens for a user (logout from all devices).
   * @param userId - User ID
   */
  revokeAllForUser(userId: string): Promise<void>;

  /**
   * Find all active (non-expired, non-revoked) tokens for a user.
   * Used for session management UI.
   * @param userId - User ID
   * @returns List of active tokens
   */
  findActiveByUser(userId: string): Promise<RefreshToken[]>;

  /**
   * Count active sessions for a user.
   * Used to enforce session limits.
   * @param userId - User ID
   * @returns Number of active sessions
   */
  countActiveForUser(userId: string): Promise<number>;

  /**
   * Delete expired tokens (cleanup job).
   * @returns Number of tokens deleted
   */
  deleteExpired?(): Promise<number>;
}

// =============================================================================
// ACCOUNT LOCKOUT TYPES (Re-exported for convenience)
// =============================================================================

/**
 * Account lockout configuration.
 * NIST 800-63B compliant by default.
 */
export interface LockoutConfig {
  /** Number of failed attempts before locking (default: 5) */
  threshold: number;
  /** Base lockout duration in milliseconds (default: 15 minutes) */
  baseDurationMs: number;
  /** Maximum lockout duration in milliseconds (default: 24 hours) */
  maxDurationMs: number;
  /** Time window for counting failed attempts in milliseconds (default: 15 minutes) */
  attemptWindowMs: number;
}

/**
 * Current lockout state for a user account.
 */
export interface UserLockoutState {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastFailedAttemptAt: Date | null;
}

// =============================================================================
// SESSION MANAGEMENT TYPES
// =============================================================================

/**
 * Session management configuration.
 */
export interface SessionConfig {
  /** Maximum concurrent sessions per user (default: 5) */
  maxConcurrentSessions: number;
  /** Whether to revoke all tokens if User-Agent changes (default: true) */
  revokeOnUserAgentChange: boolean;
}

// =============================================================================
// LOGGING INTERFACES
// =============================================================================

/**
 * Logger interface for auth events.
 * Compatible with Pino, Winston, console, etc.
 */
export interface AuthLogger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  debug?(msg: string, data?: Record<string, unknown>): void;
}

/**
 * Audit logger for security events.
 * Used for compliance and security monitoring.
 */
export interface AuditLogger {
  /**
   * Log an authentication event.
   * @param request - HTTP request for IP/User-Agent extraction
   * @param userId - User ID (null for failed attempts)
   * @param success - Whether authentication succeeded
   * @param reason - Human-readable reason (optional)
   */
  logAuthEvent(
    request: FastifyRequest['raw'],
    userId: string | null,
    success: boolean,
    reason?: string
  ): void;
}

// =============================================================================
// AUTH SERVICE INTERFACE
// =============================================================================

/**
 * The main service interface for dependency injection.
 * Pass an implementation of this interface to createAuthRoutes().
 */
export interface AuthService {
  /** User repository for database operations */
  userRepository: UserRepository;
  /** Refresh token repository for session management */
  refreshTokenRepository: RefreshTokenRepository;
  /** Optional logger (falls back to console if not provided) */
  logger?: AuthLogger;
  /** Optional audit logger for security events */
  auditLogger?: AuditLogger;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Apple Sign-In configuration.
 */
export interface AppleConfig {
  /** Your app's bundle ID or Service ID (e.g., "com.example.app") */
  clientId: string;
  /** Your Apple Developer Team ID (10-character string) */
  teamId: string;
  /** Key ID for your Sign-In with Apple private key */
  keyId: string;
  /** The private key content (PEM format, PKCS#8) */
  privateKey: string;
  /** OAuth redirect URI (must match Apple Developer Console) */
  redirectUri: string;
}

/**
 * JWT configuration for access and refresh tokens.
 */
export interface JwtConfig {
  /** Secret key for signing JWTs (min 32 characters recommended) */
  secret: string;
  /** Access token time-to-live (e.g., "15m", "1h") */
  accessTokenTtl: string;
  /** Refresh token time-to-live (e.g., "7d", "30d") */
  refreshTokenTtl: string;
  /** JWT issuer claim */
  issuer?: string;
  /** JWT audience claim */
  audience?: string;
}

/**
 * Cookie configuration for httpOnly auth cookies.
 */
export interface CookieConfig {
  /** Cookie domain (e.g., ".example.com" for subdomains) */
  domain?: string;
  /** Whether cookies require HTTPS (default: true in production) */
  secure?: boolean;
  /** SameSite attribute (default: "lax") */
  sameSite?: 'strict' | 'lax' | 'none';
  /** Cookie path (default: "/") */
  path?: string;
}

/**
 * Rate limiting configuration.
 */
export interface RateLimitConfig {
  /** Rate limit for /auth/apple (initiate OAuth) */
  apple?: { max: number; timeWindow: string };
  /** Rate limit for /auth/apple/callback (strictest - prevents brute force) */
  appleCallback?: { max: number; timeWindow: string };
  /** Rate limit for /auth/refresh */
  refresh?: { max: number; timeWindow: string };
  /** Rate limit for /auth/logout */
  logout?: { max: number; timeWindow: string };
  /** Rate limit for /auth/sessions */
  sessions?: { max: number; timeWindow: string };
  /** Rate limit for /auth/me */
  me?: { max: number; timeWindow: string };
}

/**
 * Complete authentication configuration.
 */
export interface AuthConfig {
  /** Apple Sign-In configuration */
  apple: AppleConfig;
  /** JWT configuration */
  jwt: JwtConfig;
  /** Cookie configuration */
  cookies?: CookieConfig;
  /** Rate limiting configuration */
  rateLimits?: RateLimitConfig;
  /** Account lockout configuration */
  lockout?: Partial<LockoutConfig>;
  /** Session management configuration */
  session?: Partial<SessionConfig>;
}

// =============================================================================
// FASTIFY AUGMENTATION
// =============================================================================

/**
 * Fastify request augmentation for authenticated requests.
 * After authentication, request.user will be populated.
 */
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }

  interface FastifyInstance {
    /** Authenticate preHandler - validates JWT and populates request.user */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// =============================================================================
// APPLE AUTH TYPES (Internal)
// =============================================================================

/**
 * Decoded Apple ID token claims.
 */
export interface AppleIdTokenClaims {
  /** Issuer (always "https://appleid.apple.com") */
  iss: string;
  /** Audience (your client ID) */
  aud: string;
  /** Expiration time */
  exp: number;
  /** Issued at time */
  iat: number;
  /** Subject (Apple's unique user identifier) */
  sub: string;
  /** Nonce for replay attack prevention */
  nonce?: string;
  /** User's email (may be private relay) */
  email?: string;
  /** Whether email is verified */
  email_verified?: boolean | string;
  /** Whether this is a private relay email */
  is_private_email?: boolean | string;
  /** Real user status */
  real_user_status?: number;
  /** Auth time */
  auth_time?: number;
}

/**
 * Apple token exchange response.
 */
export interface AppleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token: string;
}

/**
 * Result of verifying an Apple ID token.
 */
export interface AppleIdTokenVerificationResult {
  /** Whether verification succeeded */
  valid: boolean;
  /** Decoded claims (if valid) */
  claims?: AppleIdTokenClaims;
  /** Error message (if invalid) */
  error?: string;
}

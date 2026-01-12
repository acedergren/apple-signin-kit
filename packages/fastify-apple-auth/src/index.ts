/**
 * @running-days/fastify-apple-auth
 *
 * Production-grade Apple Sign-In authentication for Fastify.
 *
 * Features:
 * - PKCE (RFC 7636) for secure OAuth flow
 * - NIST 800-63B compliant account lockout
 * - Session management with concurrent session limits
 * - Token rotation for refresh token theft detection
 * - Timing-safe comparisons to prevent enumeration attacks
 * - Pluggable database adapters via repository pattern
 *
 * @example
 * ```typescript
 * import fastify from 'fastify';
 * import { createAuthPlugin } from '@running-days/fastify-apple-auth';
 *
 * const app = fastify();
 *
 * await app.register(createAuthPlugin, {
 *   service: {
 *     userRepository: myUserRepo,
 *     refreshTokenRepository: myTokenRepo,
 *   },
 *   config: {
 *     apple: {
 *       clientId: 'com.example.app',
 *       teamId: 'ABCDE12345',
 *       keyId: 'KEY123',
 *       privateKey: process.env.APPLE_PRIVATE_KEY!,
 *       redirectUri: 'https://api.example.com/auth/apple/callback',
 *     },
 *     jwt: {
 *       secret: process.env.JWT_SECRET!,
 *       accessTokenTtl: '15m',
 *       refreshTokenTtl: '7d',
 *     },
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  // User & Session types
  AuthUser,
  NewAuthUser,
  RefreshToken,
  NewRefreshToken,

  // Repository interfaces (implement these for your database)
  UserRepository,
  RefreshTokenRepository,

  // Account lockout types
  LockoutConfig,
  UserLockoutState,

  // Session management types
  SessionConfig,

  // Logging interfaces
  AuthLogger,
  AuditLogger,

  // Service interface (main DI entry point)
  AuthService,

  // Configuration types
  AppleConfig,
  JwtConfig,
  CookieConfig,
  RateLimitConfig,
  AuthConfig,

  // Apple auth internal types (for advanced usage)
  AppleIdTokenClaims,
  AppleTokenResponse,
  AppleIdTokenVerificationResult,
} from './types.js';

// =============================================================================
// PLUGIN EXPORTS
// =============================================================================

export {
  authPlugin,
  type JwtUtilities,
  type AccessTokenPayload,
  type AuthPluginOptions,
} from './plugin.js';

// =============================================================================
// ROUTES FACTORY
// =============================================================================

export {
  createAuthRoutes,
  type CreateAuthRoutesOptions,
} from './routes.js';

// =============================================================================
// PKCE HELPERS
// =============================================================================

export {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  generateNonce,
  safeCompare,
  hashToken,
  generateClientSecret,
  getAppleAuthUrl,
  exchangeCodeForTokens,
  verifyIdentityToken,
  authenticateWithApple,
  type AppleUserInfo,
  // Note: AppleTokenResponse is exported from types.ts to avoid duplication
} from './apple-auth.js';

// =============================================================================
// ACCOUNT LOCKOUT
// =============================================================================

export {
  calculateLockoutDuration,
  checkAccountLockout,
  recordFailedAttempt,
  getResetLockoutState,
  calculateConsecutiveLockouts,
  getRemainingAttempts,
  formatLockoutDuration,
  DEFAULT_LOCKOUT_CONFIG as LOCKOUT_DEFAULTS,
  type LockoutCheckResult,
  type RecordFailedAttemptResult,
  type ResetLockoutResult,
} from './account-lockout.js';

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

export {
  detectDeviceType,
  extractDeviceName,
  hasUserAgentChanged,
  enforceSessionLimits,
  getUserSessions,
  revokeSession,
  revokeAllSessions,
  DEFAULT_SESSION_CONFIG as SESSION_DEFAULTS,
  type DeviceType,
  type SessionInfo,
  type CreateSessionResult,
} from './session-manager.js';

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

export {
  strictObject,
  appleCallbackSchema,
  loginRequestSchema,
  refreshTokenSchema,
  sessionIdParamSchema,
  sessionListQuerySchema,
  createEmailSchema,
  uuidSchema,
  createHexStringSchema,
  paginationQuerySchema,
  type AppleCallbackInput,
  type LoginRequestInput,
  type SessionIdParam,
  type SessionListQuery,
  type PaginationQuery,
} from './schemas.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default rate limit configuration.
 * These values are battle-tested in production.
 */
export const DEFAULT_RATE_LIMITS = {
  apple: { max: 10, timeWindow: '1 minute' },
  appleCallback: { max: 5, timeWindow: '1 minute' },
  refresh: { max: 20, timeWindow: '1 minute' },
  logout: { max: 10, timeWindow: '1 minute' },
  sessions: { max: 20, timeWindow: '1 minute' },
  me: { max: 60, timeWindow: '1 minute' },
} as const;

/**
 * Default account lockout configuration (NIST 800-63B compliant).
 */
export const DEFAULT_LOCKOUT_CONFIG = {
  threshold: 5,
  baseDurationMs: 15 * 60 * 1000, // 15 minutes
  maxDurationMs: 24 * 60 * 60 * 1000, // 24 hours
  attemptWindowMs: 15 * 60 * 1000, // 15 minutes
} as const;

/**
 * Default session management configuration.
 */
export const DEFAULT_SESSION_CONFIG = {
  maxConcurrentSessions: 5,
  revokeOnUserAgentChange: true,
} as const;

/**
 * Default cookie configuration.
 */
export const DEFAULT_COOKIE_CONFIG = {
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  httpOnly: true,
} as const;

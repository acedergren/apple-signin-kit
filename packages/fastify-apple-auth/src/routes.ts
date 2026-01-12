/**
 * Authentication Routes Factory
 *
 * Creates Fastify routes for Apple Sign-In, token refresh, and session management.
 * All dependencies are injected - no hardcoded configuration.
 *
 * @module routes
 */

import { FastifyPluginAsync, FastifyInstance, FastifyRequest } from 'fastify';
import type {
  AuthService,
  AppleConfig,
  RateLimitConfig,
  CookieConfig,
  LockoutConfig
} from './types.js';
import {
  getAppleAuthUrl,
  authenticateWithApple,
  generateCodeVerifier,
  generateCodeChallenge,
  generateNonce,
  generateState,
  safeCompare,
  hashToken
} from './apple-auth.js';
import {
  checkAccountLockout,
  formatLockoutDuration,
  getResetLockoutState
} from './account-lockout.js';
import {
  getUserSessions,
  enforceSessionLimits,
  DEFAULT_SESSION_CONFIG
} from './session-manager.js';
import { appleCallbackSchema, sessionIdParamSchema } from './schemas.js';

// =============================================================================
// DEFAULT RATE LIMITS
// =============================================================================

/**
 * Default rate limits for auth endpoints.
 * Can be overridden via config.
 */
export const DEFAULT_RATE_LIMITS: Required<RateLimitConfig> = {
  apple: { max: 10, timeWindow: '1 minute' },
  appleCallback: { max: 5, timeWindow: '1 minute' },
  refresh: { max: 20, timeWindow: '1 minute' },
  logout: { max: 10, timeWindow: '1 minute' },
  sessions: { max: 20, timeWindow: '1 minute' },
  me: { max: 60, timeWindow: '1 minute' }
};

// =============================================================================
// DEFAULT COOKIE CONFIG
// =============================================================================

/**
 * Default cookie configuration.
 */
export const DEFAULT_COOKIE_CONFIG: Required<CookieConfig> = {
  domain: undefined as unknown as string,
  secure: true,
  sameSite: 'strict',
  path: '/'
};

// =============================================================================
// ROUTE OPTIONS
// =============================================================================

/**
 * Options for creating auth routes.
 */
export interface CreateAuthRoutesOptions {
  /** Apple Sign-In configuration */
  apple: AppleConfig;
  /** Cookie configuration */
  cookies?: Partial<CookieConfig>;
  /** Rate limit configuration */
  rateLimits?: Partial<RateLimitConfig>;
  /** Account lockout configuration */
  lockout?: Partial<LockoutConfig>;
  /** Cookie name prefix (default: 'auth') */
  cookiePrefix?: string;
  /** Access token cookie max age in seconds (default: 900 = 15 min) */
  accessTokenMaxAge?: number;
  /** Refresh token max age in days (default: 7) */
  refreshTokenMaxAgeDays?: number;
}

// =============================================================================
// ROUTE FACTORY
// =============================================================================

/**
 * Create authentication routes for Fastify.
 *
 * @param options - Route configuration options
 * @returns Fastify plugin with auth routes
 *
 * @example
 * ```typescript
 * import fastify from 'fastify';
 * import cookie from '@fastify/cookie';
 * import sensible from '@fastify/sensible';
 * import rateLimit from '@fastify/rate-limit';
 * import { authPlugin, createAuthRoutes } from '@running-days/fastify-apple-auth';
 *
 * const app = fastify();
 *
 * // Register dependencies
 * await app.register(cookie);
 * await app.register(sensible);
 * await app.register(rateLimit);
 *
 * // Register auth plugin
 * await app.register(authPlugin, {
 *   jwt: { secret: 'xxx', accessTokenTtl: '15m', refreshTokenTtl: '7d' },
 *   service: { userRepository, refreshTokenRepository }
 * });
 *
 * // Register auth routes under /auth prefix
 * await app.register(createAuthRoutes({
 *   apple: {
 *     clientId: process.env.APPLE_CLIENT_ID,
 *     teamId: process.env.APPLE_TEAM_ID,
 *     keyId: process.env.APPLE_KEY_ID,
 *     privateKey: process.env.APPLE_PRIVATE_KEY,
 *     redirectUri: 'https://api.example.com/auth/apple/callback'
 *   }
 * }), { prefix: '/auth' });
 * ```
 */
export function createAuthRoutes(options: CreateAuthRoutesOptions): FastifyPluginAsync {
  const {
    apple: appleConfig,
    cookies: cookieConfig = {},
    rateLimits = {},
    lockout: lockoutConfig = {},
    cookiePrefix = 'auth',
    accessTokenMaxAge = 900,
    refreshTokenMaxAgeDays = 7
  } = options;

  // Merge configs with defaults
  const cookies = { ...DEFAULT_COOKIE_CONFIG, ...cookieConfig };
  const rates = { ...DEFAULT_RATE_LIMITS, ...rateLimits };
  // Note: lockoutConfig is passed to routes via options, used implicitly via DEFAULT_LOCKOUT_CONFIG
  // in checkAccountLockout calls. Custom lockout config support could be added in future versions.
  void lockoutConfig; // Explicitly mark as intentionally unused

  // Cookie names
  const ACCESS_TOKEN_COOKIE = `${cookiePrefix}_access_token`;
  const REFRESH_TOKEN_COOKIE = `${cookiePrefix}_refresh_token`;
  const AUTH_STATE_COOKIE = `${cookiePrefix}_state`;
  const AUTH_VERIFIER_COOKIE = `${cookiePrefix}_verifier`;
  const AUTH_NONCE_COOKIE = `${cookiePrefix}_nonce`;

  const routes: FastifyPluginAsync = async (fastify) => {
    const service = fastify.authService;

    if (!service) {
      throw new Error('authPlugin must be registered before createAuthRoutes');
    }

    // =========================================================================
    // HELPER: GET COOKIE OPTIONS
    // =========================================================================

    function getCookieOptions(maxAge: number) {
      return {
        httpOnly: true,
        secure: cookies.secure,
        sameSite: cookies.sameSite,
        path: cookies.path,
        domain: cookies.domain,
        maxAge
      };
    }

    // =========================================================================
    // GET /apple - Initiate Apple Sign-In
    // =========================================================================

    fastify.get('/apple', {
      config: { rateLimit: rates.apple }
    }, async (_request, reply) => {
      // Generate security tokens
      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const nonce = generateNonce();

      // Set security cookies (10 minute expiry)
      const oauthCookieOptions = getCookieOptions(600);
      reply.setCookie(AUTH_STATE_COOKIE, state, oauthCookieOptions);
      reply.setCookie(AUTH_VERIFIER_COOKIE, codeVerifier, oauthCookieOptions);
      reply.setCookie(AUTH_NONCE_COOKIE, nonce, oauthCookieOptions);

      // Generate auth URL
      const authUrl = getAppleAuthUrl(appleConfig, state, codeChallenge, nonce);

      return { authUrl };
    });

    // =========================================================================
    // POST /apple/callback - Handle Apple OAuth Callback
    // =========================================================================

    fastify.post<{ Body: { code: string; state: string } }>('/apple/callback', {
      config: { rateLimit: rates.appleCallback }
    }, async (request, reply) => {
      // Validate request body
      const parseResult = appleCallbackSchema.safeParse(request.body);
      if (!parseResult.success) {
        logAuthFailure(fastify, request, 'Invalid callback parameters');
        return reply.badRequest(parseResult.error.message);
      }

      const { code, state } = parseResult.data;

      // Retrieve security cookies
      const savedState = (request.cookies as Record<string, string>)?.[AUTH_STATE_COOKIE];
      const codeVerifier = (request.cookies as Record<string, string>)?.[AUTH_VERIFIER_COOKIE];
      const expectedNonce = (request.cookies as Record<string, string>)?.[AUTH_NONCE_COOKIE];

      // Clear security cookies
      reply.clearCookie(AUTH_STATE_COOKIE, { path: cookies.path });
      reply.clearCookie(AUTH_VERIFIER_COOKIE, { path: cookies.path });
      reply.clearCookie(AUTH_NONCE_COOKIE, { path: cookies.path });

      // Validate state (CSRF protection)
      if (!safeCompare(state, savedState)) {
        logAuthFailure(fastify, request, 'Invalid state parameter');
        return reply.badRequest('Invalid state parameter');
      }

      // Validate PKCE verifier
      if (!codeVerifier) {
        logAuthFailure(fastify, request, 'Missing PKCE verifier');
        return reply.badRequest('Missing PKCE verifier - please restart sign-in');
      }

      // Validate nonce
      if (!expectedNonce) {
        logAuthFailure(fastify, request, 'Missing nonce');
        return reply.badRequest('Missing nonce - please restart sign-in');
      }

      try {
        // Exchange code for user info
        const appleUser = await authenticateWithApple(
          appleConfig,
          code,
          codeVerifier,
          expectedNonce
        );

        // Find or create user
        let user = await service.userRepository.findByAppleUserId(appleUser.sub);

        if (!user) {
          // Create new user
          user = await service.userRepository.create({
            appleUserId: appleUser.sub,
            email: appleUser.email || ''
          });

          service.logger?.info('New user created via Apple Sign-In', { userId: user.id });
        } else {
          // Check account lockout
          if (service.userRepository.getLockoutState) {
            const lockoutState = await service.userRepository.getLockoutState(user.id);
            if (lockoutState) {
              const lockoutCheck = checkAccountLockout(lockoutState);

              if (lockoutCheck.isLocked) {
                reply.header('Retry-After', lockoutCheck.retryAfterSeconds!.toString());
                return reply.code(423).send({
                  error: 'Account Locked',
                  message: `Your account is temporarily locked. Please try again in ${formatLockoutDuration(lockoutCheck.retryAfterSeconds! * 1000)}.`,
                  retryAfter: lockoutCheck.retryAfterSeconds,
                  lockedUntil: lockoutCheck.lockedUntil?.toISOString()
                });
              }
            }
          }
        }

        // Enforce session limits
        await enforceSessionLimits(
          service.refreshTokenRepository,
          user.id,
          DEFAULT_SESSION_CONFIG
        );

        // Generate tokens
        const accessToken = await fastify.jwt.sign({
          sub: user.id,
          email: user.email,
          role: user.role
        });

        const refreshToken = fastify.jwt.generateRefreshToken();
        const tokenHash = hashToken(refreshToken);

        // Calculate expiry
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + refreshTokenMaxAgeDays);

        // Store refresh token
        await service.refreshTokenRepository.create({
          userId: user.id,
          tokenHash,
          userAgent: request.headers['user-agent'] || null,
          expiresAt
        });

        // Update last login and reset lockout
        await service.userRepository.updateLastLogin(user.id, new Date());
        if (service.userRepository.updateLockoutState) {
          await service.userRepository.updateLockoutState(user.id, getResetLockoutState());
        }

        // Set auth cookies
        reply.setCookie(ACCESS_TOKEN_COOKIE, accessToken, getCookieOptions(accessTokenMaxAge));
        reply.setCookie(
          REFRESH_TOKEN_COOKIE,
          refreshToken,
          getCookieOptions(refreshTokenMaxAgeDays * 24 * 60 * 60)
        );

        service.logger?.info('User authenticated via Apple Sign-In', { userId: user.id });

        return {
          success: true,
          user: {
            id: user.id,
            email: user.email,
            role: user.role
          }
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        fastify.log.error({ err }, 'Apple auth error');
        logAuthFailure(fastify, request, message.includes('Nonce') ? 'nonce_mismatch' : 'token_exchange_failed');
        return reply.internalServerError('Authentication failed');
      }
    });

    // =========================================================================
    // POST /logout - Revoke Session
    // =========================================================================

    fastify.post('/logout', {
      config: { rateLimit: rates.logout }
    }, async (request, reply) => {
      const refreshToken = (request.cookies as Record<string, string>)?.[REFRESH_TOKEN_COOKIE];

      if (refreshToken) {
        const tokenHash = hashToken(refreshToken);
        await service.refreshTokenRepository.revokeByHash(tokenHash);
      }

      // Clear cookies
      reply.clearCookie(ACCESS_TOKEN_COOKIE, { path: cookies.path });
      reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: cookies.path });

      return { success: true };
    });

    // =========================================================================
    // POST /refresh - Token Refresh with Rotation
    // =========================================================================

    fastify.post('/refresh', {
      config: { rateLimit: rates.refresh }
    }, async (request, reply) => {
      const refreshToken = (request.cookies as Record<string, string>)?.[REFRESH_TOKEN_COOKIE];

      if (!refreshToken) {
        return reply.unauthorized('No refresh token provided');
      }

      const tokenHash = hashToken(refreshToken);
      const storedToken = await service.refreshTokenRepository.findByHash(tokenHash);

      if (!storedToken) {
        reply.clearCookie(ACCESS_TOKEN_COOKIE, { path: cookies.path });
        reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: cookies.path });
        return reply.unauthorized('Invalid refresh token');
      }

      // Check expiry
      if (storedToken.expiresAt < new Date()) {
        await service.refreshTokenRepository.revokeByHash(tokenHash);
        reply.clearCookie(ACCESS_TOKEN_COOKIE, { path: cookies.path });
        reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: cookies.path });
        return reply.unauthorized('Refresh token expired');
      }

      // User-agent binding check (token theft detection)
      const currentUserAgent = request.headers['user-agent'] || null;
      if (storedToken.userAgent && currentUserAgent !== storedToken.userAgent) {
        fastify.log.warn({
          userId: storedToken.userId,
          expectedUserAgent: storedToken.userAgent?.slice(0, 50),
          actualUserAgent: currentUserAgent?.slice(0, 50)
        }, 'Refresh token used with different user-agent - possible token theft');

        // Revoke ALL tokens for this user
        await service.refreshTokenRepository.revokeAllForUser(storedToken.userId);
        reply.clearCookie(ACCESS_TOKEN_COOKIE, { path: cookies.path });
        reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: cookies.path });
        return reply.unauthorized('Session invalidated - please sign in again');
      }

      // Get user
      const user = await service.userRepository.findById(storedToken.userId);
      if (!user) {
        return reply.unauthorized('User not found');
      }

      // Revoke old token (rotation)
      await service.refreshTokenRepository.revokeByHash(tokenHash);

      // Generate new tokens
      const newAccessToken = await fastify.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role
      });

      const newRefreshToken = fastify.jwt.generateRefreshToken();
      const newTokenHash = hashToken(newRefreshToken);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + refreshTokenMaxAgeDays);

      // Store new refresh token
      await service.refreshTokenRepository.create({
        userId: user.id,
        tokenHash: newTokenHash,
        userAgent: currentUserAgent,
        expiresAt
      });

      // Set new cookies
      reply.setCookie(ACCESS_TOKEN_COOKIE, newAccessToken, getCookieOptions(accessTokenMaxAge));
      reply.setCookie(
        REFRESH_TOKEN_COOKIE,
        newRefreshToken,
        getCookieOptions(refreshTokenMaxAgeDays * 24 * 60 * 60)
      );

      return { success: true };
    });

    // =========================================================================
    // GET /me - Current User Info
    // =========================================================================

    fastify.get('/me', {
      preHandler: [fastify.authenticate],
      config: { rateLimit: rates.me }
    }, async (request) => {
      return { user: request.user };
    });

    // =========================================================================
    // GET /sessions - List Active Sessions
    // =========================================================================

    fastify.get('/sessions', {
      preHandler: [fastify.authenticate],
      config: { rateLimit: rates.sessions }
    }, async (request) => {
      const currentTokenHash = hashToken(
        (request.cookies as Record<string, string>)?.[REFRESH_TOKEN_COOKIE] || ''
      );

      const sessions = await getUserSessions(
        service.refreshTokenRepository,
        request.user!.id,
        currentTokenHash
      );

      return { sessions };
    });

    // =========================================================================
    // DELETE /sessions/:id - Revoke Specific Session
    // =========================================================================

    fastify.delete<{ Params: { id: string } }>('/sessions/:id', {
      preHandler: [fastify.authenticate],
      config: { rateLimit: rates.sessions }
    }, async (request, reply) => {
      // Validate params
      const parseResult = sessionIdParamSchema.safeParse(request.params);
      if (!parseResult.success) {
        return reply.badRequest(parseResult.error.message);
      }

      const { id } = parseResult.data;

      // Find session by ID
      const tokens = await service.refreshTokenRepository.findActiveByUser(request.user!.id);
      const session = tokens.find(t => t.id === id);

      if (!session) {
        return reply.notFound('Session not found');
      }

      // Revoke
      await service.refreshTokenRepository.revokeByHash(session.tokenHash);

      return { success: true };
    });
  };

  return routes;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Log authentication failure (if audit logger available).
 */
function logAuthFailure(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reason: string
): void {
  const auditLogger = (fastify as unknown as { authService?: AuthService }).authService?.auditLogger;
  if (auditLogger) {
    auditLogger.logAuthEvent(
      request.raw,
      null,
      false,
      reason
    );
  }
}

export default createAuthRoutes;

/**
 * Authentication Plugin for Fastify
 *
 * Provides JWT signing/verification and authentication hooks.
 * Designed for dependency injection - all config passed as parameters.
 *
 * @module plugin
 */

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { JwtConfig, AuthUser, AuthService, CookieConfig } from './types.js';

// =============================================================================
// ACCESS TOKEN PAYLOAD
// =============================================================================

/**
 * Access token JWT payload.
 */
export interface AccessTokenPayload extends JWTPayload {
  /** User ID (subject) */
  sub: string;
  /** User email */
  email: string;
  /** User role */
  role: 'user' | 'admin';
}

// =============================================================================
// JWT UTILITIES
// =============================================================================

/**
 * JWT utility functions decorated on Fastify instance.
 */
export interface JwtUtilities {
  /**
   * Sign an access token.
   * @param payload - Token payload (without iat/exp)
   * @returns Signed JWT string
   */
  sign: (payload: Omit<AccessTokenPayload, 'iat' | 'exp'>) => Promise<string>;

  /**
   * Verify an access token.
   * @param token - JWT string to verify
   * @returns Decoded payload or null if invalid
   */
  verify: (token: string) => Promise<AccessTokenPayload | null>;

  /**
   * Generate a cryptographically secure refresh token.
   * @returns 64-character hex string
   */
  generateRefreshToken: () => string;
}

// =============================================================================
// PLUGIN OPTIONS
// =============================================================================

/**
 * Plugin configuration options.
 */
export interface AuthPluginOptions {
  /** JWT configuration */
  jwt: JwtConfig;
  /** Cookie configuration */
  cookies?: CookieConfig;
  /** Auth service with repositories */
  service: AuthService;
  /** Cookie name for access token (default: 'access_token') */
  accessTokenCookieName?: string;
  /** Cookie name for refresh token (default: 'refresh_token') */
  refreshTokenCookieName?: string;
}

// =============================================================================
// FASTIFY AUGMENTATION
// =============================================================================

/**
 * Augment Fastify types for this plugin.
 *
 * Note: This plugin requires @fastify/cookie and @fastify/sensible to be registered.
 * Those plugins provide the `cookies`, `setCookie`, `clearCookie`, `unauthorized`,
 * `badRequest`, and `notFound` methods used in routes.
 */
declare module 'fastify' {
  interface FastifyInstance {
    /** JWT utilities for signing and verifying tokens */
    jwt: JwtUtilities;
    /** Authentication preHandler that validates JWT and populates request.user */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Auth service with repositories */
    authService: AuthService;
  }

  interface FastifyRequest {
    /** Authenticated user (populated by authenticate hook) */
    user?: AuthUser;
    /** Cookies parsed by @fastify/cookie */
    cookies: Record<string, string | undefined>;
  }

  interface FastifyReply {
    /** Set a cookie (@fastify/cookie) */
    setCookie(name: string, value: string, options?: CookieSerializeOptions): FastifyReply;
    /** Clear a cookie (@fastify/cookie) */
    clearCookie(name: string, options?: CookieSerializeOptions): FastifyReply;
    /** Send 401 Unauthorized (@fastify/sensible) */
    unauthorized(message?: string): FastifyReply;
    /** Send 400 Bad Request (@fastify/sensible) */
    badRequest(message?: string): FastifyReply;
    /** Send 404 Not Found (@fastify/sensible) */
    notFound(message?: string): FastifyReply;
    /** Send 500 Internal Server Error (@fastify/sensible) */
    internalServerError(message?: string): FastifyReply;
  }
}

/**
 * Cookie serialization options (subset of @fastify/cookie types).
 */
export interface CookieSerializeOptions {
  domain?: string;
  path?: string;
  expires?: Date;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'strict' | 'lax' | 'none' | boolean;
}

// =============================================================================
// PLUGIN IMPLEMENTATION
// =============================================================================

const authPluginImpl: FastifyPluginAsync<AuthPluginOptions> = async (fastify, options) => {
  const {
    jwt: jwtConfig,
    service,
    accessTokenCookieName = 'access_token',
    // Note: refreshTokenCookieName is part of options but used by routes, not plugin
  } = options;

  // Encode secret for jose
  const secret = new TextEncoder().encode(jwtConfig.secret);

  // ==========================================================================
  // JWT SIGNING
  // ==========================================================================

  /**
   * Sign an access token with configured TTL and claims.
   */
  async function sign(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): Promise<string> {
    let jwt = new SignJWT(payload as unknown as JWTPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(jwtConfig.accessTokenTtl);

    if (jwtConfig.issuer) {
      jwt = jwt.setIssuer(jwtConfig.issuer);
    }

    if (jwtConfig.audience) {
      jwt = jwt.setAudience(jwtConfig.audience);
    }

    return jwt.sign(secret);
  }

  // ==========================================================================
  // JWT VERIFICATION
  // ==========================================================================

  /**
   * Verify an access token signature and claims.
   */
  async function verify(token: string): Promise<AccessTokenPayload | null> {
    try {
      const verifyOptions: Parameters<typeof jwtVerify>[2] = {};

      if (jwtConfig.issuer) {
        verifyOptions.issuer = jwtConfig.issuer;
      }

      if (jwtConfig.audience) {
        verifyOptions.audience = jwtConfig.audience;
      }

      const { payload } = await jwtVerify(token, secret, verifyOptions);

      // Validate required fields
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.email !== 'string' ||
        (payload.role !== 'user' && payload.role !== 'admin')
      ) {
        return null;
      }

      return payload as unknown as AccessTokenPayload;
    } catch {
      // Invalid signature, expired, or malformed
      return null;
    }
  }

  // ==========================================================================
  // REFRESH TOKEN GENERATION
  // ==========================================================================

  /**
   * Generate a cryptographically secure refresh token.
   * Uses Web Crypto API for compatibility with Node.js and browsers.
   */
  function generateRefreshToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // ==========================================================================
  // AUTHENTICATION HOOK
  // ==========================================================================

  /**
   * Authentication preHandler hook.
   * Extracts JWT from cookie or Authorization header, validates it,
   * and populates request.user with the authenticated user.
   */
  async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // Try cookie first, then Authorization header
    const cookieToken = (request.cookies as Record<string, string>)?.[accessTokenCookieName];
    const headerAuth = request.headers.authorization;
    const headerToken = headerAuth?.startsWith('Bearer ') ? headerAuth.slice(7) : undefined;
    const token = cookieToken || headerToken;

    if (!token) {
      return reply.unauthorized('Missing authentication token');
    }

    const payload = await verify(token);
    if (!payload) {
      return reply.unauthorized('Invalid or expired token');
    }

    // Attach user to request
    request.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      createdAt: new Date() // Will be overwritten if needed
    };
  }

  // ==========================================================================
  // DECORATORS
  // ==========================================================================

  // Decorate with JWT utilities
  fastify.decorate('jwt', {
    sign,
    verify,
    generateRefreshToken
  });

  // Decorate with authenticate hook
  fastify.decorate('authenticate', authenticate);

  // Decorate with auth service
  fastify.decorate('authService', service);
};

// =============================================================================
// EXPORT
// =============================================================================

/**
 * Authentication plugin for Fastify.
 *
 * @example
 * ```typescript
 * import fastify from 'fastify';
 * import cookie from '@fastify/cookie';
 * import sensible from '@fastify/sensible';
 * import { authPlugin } from '@running-days/fastify-apple-auth';
 *
 * const app = fastify();
 *
 * await app.register(cookie);
 * await app.register(sensible);
 * await app.register(authPlugin, {
 *   jwt: {
 *     secret: process.env.JWT_SECRET,
 *     accessTokenTtl: '15m',
 *     refreshTokenTtl: '7d',
 *   },
 *   service: {
 *     userRepository: myUserRepo,
 *     refreshTokenRepository: myTokenRepo,
 *   },
 * });
 *
 * // Protected route
 * app.get('/profile', { preHandler: [app.authenticate] }, async (request) => {
 *   return { user: request.user };
 * });
 * ```
 */
export const authPlugin = fp(authPluginImpl, {
  name: '@running-days/fastify-apple-auth',
  dependencies: ['@fastify/cookie', '@fastify/sensible'],
  fastify: '5.x'
});

export default authPlugin;

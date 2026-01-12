/**
 * Integration tests for Fastify Apple Auth plugin
 *
 * Test Coverage:
 * - Plugin registration with valid and invalid configurations
 * - Route registration and HTTP method validation
 * - Decorator presence on Fastify instance
 * - Configuration validation and defaults
 * - Mock repository integration
 * - Error handling for missing dependencies
 *
 * @module plugin.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { authPlugin, type AuthPluginOptions } from '../src/plugin.js';
import { createAuthRoutes, type CreateAuthRoutesOptions } from '../src/routes.js';
import type {
  UserRepository,
  RefreshTokenRepository,
  AuthUser,
  RefreshToken,
  NewAuthUser,
  NewRefreshToken
} from '../src/types.js';

// =============================================================================
// MOCK REPOSITORIES
// =============================================================================

/**
 * Mock user repository for testing.
 * Stores users in-memory for test isolation.
 */
class MockUserRepository implements UserRepository {
  private users: Map<string, AuthUser> = new Map();
  private usersByAppleId: Map<string, AuthUser> = new Map();
  private usersByEmail: Map<string, AuthUser> = new Map();

  async findByAppleUserId(appleUserId: string): Promise<AuthUser | null> {
    return this.usersByAppleId.get(appleUserId) || null;
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    return this.usersByEmail.get(email) || null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    return this.users.get(id) || null;
  }

  async create(data: NewAuthUser): Promise<AuthUser> {
    const user: AuthUser = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      email: data.email,
      role: data.role || 'user',
      appleUserId: data.appleUserId,
      createdAt: new Date(),
      lastLoginAt: null
    };

    this.users.set(user.id, user);
    this.usersByAppleId.set(data.appleUserId, user);
    this.usersByEmail.set(data.email, user);

    return user;
  }

  async updateLastLogin(userId: string, timestamp: Date): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.lastLoginAt = timestamp;
    }
  }

  // Helper for testing
  clear(): void {
    this.users.clear();
    this.usersByAppleId.clear();
    this.usersByEmail.clear();
  }

  // Helper for testing
  addUser(user: AuthUser): void {
    this.users.set(user.id, user);
    if (user.appleUserId) {
      this.usersByAppleId.set(user.appleUserId, user);
    }
    this.usersByEmail.set(user.email, user);
  }
}

/**
 * Mock refresh token repository for testing.
 */
class MockRefreshTokenRepository implements RefreshTokenRepository {
  private tokens: Map<string, RefreshToken> = new Map();
  private tokensByHash: Map<string, RefreshToken> = new Map();

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.tokensByHash.get(tokenHash) || null;
  }

  async create(data: NewRefreshToken): Promise<RefreshToken> {
    const token: RefreshToken = {
      id: `token-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: data.userId,
      tokenHash: data.tokenHash,
      userAgent: data.userAgent,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
      lastUsedAt: null,
      revoked: false
    };

    this.tokens.set(token.id, token);
    this.tokensByHash.set(token.tokenHash, token);

    return token;
  }

  async revokeByHash(tokenHash: string): Promise<void> {
    const token = this.tokensByHash.get(tokenHash);
    if (token) {
      this.tokens.delete(token.id);
      this.tokensByHash.delete(tokenHash);
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const userTokens = Array.from(this.tokens.values()).filter(t => t.userId === userId);
    for (const token of userTokens) {
      this.tokens.delete(token.id);
      this.tokensByHash.delete(token.tokenHash);
    }
  }

  async findActiveByUser(userId: string): Promise<RefreshToken[]> {
    const now = new Date();
    return Array.from(this.tokens.values()).filter(
      t => t.userId === userId && t.expiresAt > now && !t.revoked
    );
  }

  async countActiveForUser(userId: string): Promise<number> {
    const tokens = await this.findActiveByUser(userId);
    return tokens.length;
  }

  async deleteExpired(): Promise<number> {
    const now = new Date();
    let deleted = 0;

    for (const [id, token] of this.tokens.entries()) {
      if (token.expiresAt < now) {
        this.tokens.delete(id);
        this.tokensByHash.delete(token.tokenHash);
        deleted++;
      }
    }

    return deleted;
  }

  // Helper for testing
  clear(): void {
    this.tokens.clear();
    this.tokensByHash.clear();
  }
}

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Create a Fastify instance with all required plugins.
 */
async function createTestApp(
  pluginOptions: AuthPluginOptions,
  routeOptions?: CreateAuthRoutesOptions
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Register required plugins
  await app.register(cookie);
  await app.register(sensible);
  await app.register(rateLimit, { max: 1000, timeWindow: '1m' });

  // Register auth plugin
  await app.register(authPlugin, pluginOptions);

  // Register routes if provided
  if (routeOptions) {
    await app.register(createAuthRoutes(routeOptions), { prefix: '/auth' });
  }

  return app;
}

/**
 * Valid test configuration for plugin.
 */
function createValidPluginConfig(): AuthPluginOptions {
  return {
    jwt: {
      secret: 'test-secret-at-least-32-characters-long-for-security',
      accessTokenTtl: '15m',
      refreshTokenTtl: '7d',
      issuer: 'test-issuer',
      audience: 'test-audience'
    },
    service: {
      userRepository: new MockUserRepository(),
      refreshTokenRepository: new MockRefreshTokenRepository()
    }
  };
}

/**
 * Valid test configuration for routes.
 */
function createValidRouteConfig(): CreateAuthRoutesOptions {
  return {
    apple: {
      clientId: 'com.example.app',
      teamId: 'TEAM123456',
      keyId: 'KEY1234567',
      privateKey: '-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgZW/3XCA7S3C1sF01\nQJQ6ztjPMIWLF4HAzvRsQnAELcChRANCAARvFD+zUH5TejzvHWQ3G4U/KIfdgvJS\nUKlgQ5GjWvLu9TH0lx3IFjeK77PkdAl07F8T0wOxnIzKsVj94XvmMFcJ\n-----END PRIVATE KEY-----',
      redirectUri: 'https://example.com/auth/apple/callback'
    },
    cookies: {
      secure: false, // For testing
      sameSite: 'lax'
    }
  };
}

// =============================================================================
// TESTS: PLUGIN REGISTRATION
// =============================================================================

describe('authPlugin - Registration', () => {
  it('should register successfully with valid configuration', async () => {
    const config = createValidPluginConfig();
    const app = await createTestApp(config);

    expect(app.jwt).toBeDefined();
    expect(app.authenticate).toBeDefined();
    expect(app.authService).toBeDefined();

    await app.close();
  });

  it('should throw error when @fastify/cookie is not registered', async () => {
    const config = createValidPluginConfig();
    const app = Fastify({ logger: false });
    await app.register(sensible);

    await expect(app.register(authPlugin, config)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining('@fastify/cookie')
      })
    );

    await app.close();
  });

  it('should throw error when @fastify/sensible is not registered', async () => {
    const config = createValidPluginConfig();
    const app = Fastify({ logger: false });
    await app.register(cookie);

    await expect(app.register(authPlugin, config)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining('@fastify/sensible')
      })
    );

    await app.close();
  });
});

// =============================================================================
// TESTS: DECORATORS
// =============================================================================

describe('authPlugin - Decorators', () => {
  let app: FastifyInstance;
  let config: AuthPluginOptions;

  beforeEach(async () => {
    config = createValidPluginConfig();
    app = await createTestApp(config);
  });

  it('should decorate instance with jwt utilities', async () => {
    expect(app.jwt).toBeDefined();
    expect(typeof app.jwt.sign).toBe('function');
    expect(typeof app.jwt.verify).toBe('function');
    expect(typeof app.jwt.generateRefreshToken).toBe('function');

    await app.close();
  });

  it('should decorate instance with authenticate hook', async () => {
    expect(app.authenticate).toBeDefined();
    expect(typeof app.authenticate).toBe('function');

    await app.close();
  });

  it('should decorate instance with authService', async () => {
    expect(app.authService).toBeDefined();
    expect(app.authService.userRepository).toBe(config.service.userRepository);
    expect(app.authService.refreshTokenRepository).toBe(config.service.refreshTokenRepository);

    await app.close();
  });
});

// =============================================================================
// TESTS: JWT UTILITIES
// =============================================================================

describe('authPlugin - JWT Utilities', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const config = createValidPluginConfig();
    app = await createTestApp(config);
  });

  it('should sign and verify access tokens', async () => {
    const payload = {
      sub: 'user-123',
      email: 'test@example.com',
      role: 'user' as const
    };

    const token = await app.jwt.sign(payload);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');

    const verified = await app.jwt.verify(token);
    expect(verified).toBeTruthy();
    expect(verified?.sub).toBe(payload.sub);
    expect(verified?.email).toBe(payload.email);
    expect(verified?.role).toBe(payload.role);

    await app.close();
  });

  it('should include issuer and audience claims when configured', async () => {
    const payload = {
      sub: 'user-123',
      email: 'test@example.com',
      role: 'user' as const
    };

    const token = await app.jwt.sign(payload);
    const verified = await app.jwt.verify(token);

    expect(verified).toBeTruthy();
    expect(verified?.iss).toBe('test-issuer');
    expect(verified?.aud).toBe('test-audience');

    await app.close();
  });

  it('should return null for invalid tokens', async () => {
    const verified = await app.jwt.verify('invalid-token');
    expect(verified).toBeNull();

    await app.close();
  });

  it('should return null for expired tokens', async () => {
    // Create app with very short TTL
    const config = createValidPluginConfig();
    config.jwt.accessTokenTtl = '1s'; // 1 second (jose doesn't support milliseconds)
    const shortTtlApp = await createTestApp(config);

    const payload = {
      sub: 'user-123',
      email: 'test@example.com',
      role: 'user' as const
    };

    const token = await shortTtlApp.jwt.sign(payload);

    // Wait for token to expire
    await new Promise(resolve => setTimeout(resolve, 1100));

    const verified = await shortTtlApp.jwt.verify(token);
    expect(verified).toBeNull();

    await shortTtlApp.close();
    await app.close();
  });

  it('should generate cryptographically secure refresh tokens', async () => {
    const token1 = app.jwt.generateRefreshToken();
    const token2 = app.jwt.generateRefreshToken();

    expect(token1).toBeTruthy();
    expect(token2).toBeTruthy();
    expect(token1).not.toBe(token2);
    expect(token1.length).toBe(64); // 32 bytes * 2 hex chars
    expect(token2.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(token1)).toBe(true);
    expect(/^[0-9a-f]{64}$/.test(token2)).toBe(true);

    await app.close();
  });
});

// =============================================================================
// TESTS: ROUTE REGISTRATION
// =============================================================================

describe('createAuthRoutes - Route Registration', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const pluginConfig = createValidPluginConfig();
    const routeConfig = createValidRouteConfig();
    app = await createTestApp(pluginConfig, routeConfig);
  });

  it('should register all auth routes under /auth prefix', async () => {
    const routes = app.printRoutes({ commonPrefix: false });

    // Check all routes exist (printRoutes formats differently, just check presence)
    expect(routes).toContain('/auth/apple');
    expect(routes).toContain('/callback');
    expect(routes).toContain('/logout');
    expect(routes).toContain('/refresh');
    expect(routes).toContain('/me');
    expect(routes).toContain('/sessions');
    expect(routes).toContain('/:id');

    // Verify HTTP methods
    expect(routes).toContain('GET');
    expect(routes).toContain('POST');
    expect(routes).toContain('DELETE');

    await app.close();
  });

  it('should require authentication for protected routes', async () => {
    // /auth/me requires authentication
    const meResponse = await app.inject({
      method: 'GET',
      url: '/auth/me'
    });

    expect(meResponse.statusCode).toBe(401);
    expect(meResponse.json()).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing authentication token'
    });

    await app.close();
  });

  it('should allow unauthenticated access to public routes', async () => {
    // /auth/apple is public
    const appleResponse = await app.inject({
      method: 'GET',
      url: '/auth/apple'
    });

    expect(appleResponse.statusCode).toBe(200);

    await app.close();
  });

  it('should throw error when authPlugin is not registered before routes', async () => {
    const appWithoutPlugin = Fastify({ logger: false });
    await appWithoutPlugin.register(cookie);
    await appWithoutPlugin.register(sensible);
    await appWithoutPlugin.register(rateLimit, { max: 1000, timeWindow: '1m' });

    const routeConfig = createValidRouteConfig();

    await expect(
      appWithoutPlugin.register(createAuthRoutes(routeConfig), { prefix: '/auth' })
    ).rejects.toThrow('authPlugin must be registered before createAuthRoutes');

    await appWithoutPlugin.close();
  });
});

// =============================================================================
// TESTS: CONFIGURATION VALIDATION
// =============================================================================

describe('createAuthRoutes - Configuration', () => {
  it('should use default cookie configuration', async () => {
    const pluginConfig = createValidPluginConfig();
    const routeConfig = createValidRouteConfig();
    // Remove custom cookie config to test defaults
    delete routeConfig.cookies;

    const app = await createTestApp(pluginConfig, routeConfig);

    // Test that routes work with defaults
    const response = await app.inject({
      method: 'GET',
      url: '/auth/apple'
    });

    expect(response.statusCode).toBe(200);

    await app.close();
  });

  it('should use custom cookie prefix', async () => {
    const pluginConfig = createValidPluginConfig();
    const routeConfig: CreateAuthRoutesOptions = {
      ...createValidRouteConfig(),
      cookiePrefix: 'custom'
    };

    const app = await createTestApp(pluginConfig, routeConfig);

    const response = await app.inject({
      method: 'GET',
      url: '/auth/apple'
    });

    expect(response.statusCode).toBe(200);

    // Check that cookies use custom prefix
    const cookies = response.cookies;
    const cookieNames = cookies.map(c => c.name);
    expect(cookieNames.some(name => name.startsWith('custom_'))).toBe(true);

    await app.close();
  });

  it('should use custom token max ages', async () => {
    const pluginConfig = createValidPluginConfig();
    const routeConfig: CreateAuthRoutesOptions = {
      ...createValidRouteConfig(),
      accessTokenMaxAge: 1800, // 30 minutes
      refreshTokenMaxAgeDays: 30 // 30 days
    };

    const app = await createTestApp(pluginConfig, routeConfig);

    const response = await app.inject({
      method: 'GET',
      url: '/auth/apple'
    });

    expect(response.statusCode).toBe(200);

    await app.close();
  });
});

// =============================================================================
// TESTS: AUTHENTICATION HOOK
// =============================================================================

describe('authPlugin - authenticate hook', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const config = createValidPluginConfig();
    app = await createTestApp(config);

    // Add a protected route for testing
    app.get('/protected', { preHandler: [app.authenticate] }, async (request) => {
      return { user: request.user };
    });
  });

  it('should populate request.user with valid token in cookie', async () => {
    const token = await app.jwt.sign({
      sub: 'user-123',
      email: 'test@example.com',
      role: 'user'
    });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      cookies: { access_token: token }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user).toBeDefined();
    expect(body.user.id).toBe('user-123');
    expect(body.user.email).toBe('test@example.com');
    expect(body.user.role).toBe('user');

    await app.close();
  });

  it('should populate request.user with valid token in Authorization header', async () => {
    const token = await app.jwt.sign({
      sub: 'user-123',
      email: 'test@example.com',
      role: 'user'
    });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user).toBeDefined();
    expect(body.user.id).toBe('user-123');

    await app.close();
  });

  it('should return 401 when token is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/protected'
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing authentication token'
    });

    await app.close();
  });

  it('should return 401 when token is invalid', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      cookies: { access_token: 'invalid-token' }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });

    await app.close();
  });

  it('should prefer cookie over Authorization header', async () => {
    const validToken = await app.jwt.sign({
      sub: 'user-cookie',
      email: 'cookie@example.com',
      role: 'user'
    });

    const headerToken = await app.jwt.sign({
      sub: 'user-header',
      email: 'header@example.com',
      role: 'user'
    });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      cookies: { access_token: validToken },
      headers: {
        authorization: `Bearer ${headerToken}`
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.id).toBe('user-cookie'); // Cookie takes precedence

    await app.close();
  });
});

// =============================================================================
// TESTS: MOCK REPOSITORY INTEGRATION
// =============================================================================

describe('Mock Repositories', () => {
  it('should create and find users', async () => {
    const repo = new MockUserRepository();

    const newUser = await repo.create({
      email: 'test@example.com',
      appleUserId: 'apple-123'
    });

    expect(newUser.id).toBeTruthy();
    expect(newUser.email).toBe('test@example.com');
    expect(newUser.appleUserId).toBe('apple-123');
    expect(newUser.role).toBe('user');

    const foundById = await repo.findById(newUser.id);
    expect(foundById).toEqual(newUser);

    const foundByEmail = await repo.findByEmail('test@example.com');
    expect(foundByEmail).toEqual(newUser);

    const foundByAppleId = await repo.findByAppleUserId('apple-123');
    expect(foundByAppleId).toEqual(newUser);
  });

  it('should create and find refresh tokens', async () => {
    const repo = new MockRefreshTokenRepository();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const newToken = await repo.create({
      userId: 'user-123',
      tokenHash: 'hash-123',
      userAgent: 'Mozilla/5.0',
      expiresAt
    });

    expect(newToken.id).toBeTruthy();
    expect(newToken.userId).toBe('user-123');
    expect(newToken.tokenHash).toBe('hash-123');

    const foundByHash = await repo.findByHash('hash-123');
    expect(foundByHash).toEqual(newToken);

    const activeTokens = await repo.findActiveByUser('user-123');
    expect(activeTokens).toHaveLength(1);
    expect(activeTokens[0]).toEqual(newToken);
  });

  it('should revoke tokens by hash', async () => {
    const repo = new MockRefreshTokenRepository();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await repo.create({
      userId: 'user-123',
      tokenHash: 'hash-123',
      userAgent: null,
      expiresAt
    });

    await repo.revokeByHash('hash-123');

    const found = await repo.findByHash('hash-123');
    expect(found).toBeNull();
  });

  it('should revoke all tokens for a user', async () => {
    const repo = new MockRefreshTokenRepository();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create multiple tokens for same user
    await repo.create({ userId: 'user-123', tokenHash: 'hash-1', userAgent: null, expiresAt });
    await repo.create({ userId: 'user-123', tokenHash: 'hash-2', userAgent: null, expiresAt });
    await repo.create({ userId: 'user-456', tokenHash: 'hash-3', userAgent: null, expiresAt });

    await repo.revokeAllForUser('user-123');

    const user123Tokens = await repo.findActiveByUser('user-123');
    expect(user123Tokens).toHaveLength(0);

    const user456Tokens = await repo.findActiveByUser('user-456');
    expect(user456Tokens).toHaveLength(1);
  });

  it('should delete expired tokens', async () => {
    const repo = new MockRefreshTokenRepository();

    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 1); // Yesterday

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    await repo.create({ userId: 'user-123', tokenHash: 'expired', userAgent: null, expiresAt: expiredDate });
    await repo.create({ userId: 'user-123', tokenHash: 'active', userAgent: null, expiresAt: futureDate });

    const deleted = await repo.deleteExpired();
    expect(deleted).toBe(1);

    const found = await repo.findByHash('expired');
    expect(found).toBeNull();

    const active = await repo.findByHash('active');
    expect(active).toBeTruthy();
  });
});

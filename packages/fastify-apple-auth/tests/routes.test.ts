/**
 * Integration tests for Authentication Routes
 *
 * Test Coverage:
 * - GET /apple - OAuth initiation with PKCE and nonce
 * - POST /apple/callback - OAuth callback with validation, user creation, lockout
 * - POST /logout - Session revocation
 * - POST /refresh - Token rotation with User-Agent binding
 * - GET /me - Protected route access
 * - GET /sessions - Active session listing
 * - DELETE /sessions/:id - Session revocation
 *
 * Target: 80%+ coverage on routes.ts
 *
 * @module routes.test
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock authenticateWithApple before imports
vi.mock('../src/apple-auth.js', async () => {
  const actual = await vi.importActual('../src/apple-auth.js');
  return {
    ...actual,
    authenticateWithApple: vi.fn()
  };
});

// Import after mocking
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { authPlugin, type AuthPluginOptions } from '../src/plugin.js';
import { createAuthRoutes, type CreateAuthRoutesOptions } from '../src/routes.js';
import { authenticateWithApple, hashToken } from '../src/apple-auth.js';
import type {
  UserRepository,
  RefreshTokenRepository,
  AuthUser,
  RefreshToken,
  NewAuthUser,
  NewRefreshToken,
  UserLockoutState
} from '../src/types.js';

// =============================================================================
// MOCK REPOSITORIES WITH LOCKOUT SUPPORT
// =============================================================================

/**
 * Enhanced mock user repository with lockout state management.
 */
class MockUserRepository implements UserRepository {
  private users: Map<string, AuthUser> = new Map();
  private usersByAppleId: Map<string, AuthUser> = new Map();
  private usersByEmail: Map<string, AuthUser> = new Map();
  private lockoutStates: Map<string, UserLockoutState> = new Map();

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

  async getLockoutState(userId: string): Promise<UserLockoutState | null> {
    return this.lockoutStates.get(userId) || null;
  }

  async updateLockoutState(userId: string, state: Partial<UserLockoutState>): Promise<void> {
    const current = this.lockoutStates.get(userId) || {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastFailedAttemptAt: null
    };
    this.lockoutStates.set(userId, { ...current, ...state });
  }

  // Helper for testing
  clear(): void {
    this.users.clear();
    this.usersByAppleId.clear();
    this.usersByEmail.clear();
    this.lockoutStates.clear();
  }

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
    // Generate a valid UUID v4
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

    const token: RefreshToken = {
      id: uuid,
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

  clear(): void {
    this.tokens.clear();
    this.tokensByHash.clear();
  }
}

// =============================================================================
// TEST HELPERS
// =============================================================================

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

async function createTestApp(
  pluginConfig: AuthPluginOptions,
  routeConfig?: CreateAuthRoutesOptions
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cookie);
  await app.register(sensible);
  await app.register(rateLimit, { max: 1000, timeWindow: '1m' });

  await app.register(authPlugin, pluginConfig);

  if (routeConfig) {
    await app.register(createAuthRoutes(routeConfig), { prefix: '/auth' });
  }

  return app;
}

// =============================================================================
// TESTS: GET /apple - OAuth Initiation
// =============================================================================

describe('GET /apple - OAuth Initiation', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const pluginConfig = createValidPluginConfig();
    const routeConfig = createValidRouteConfig();
    app = await createTestApp(pluginConfig, routeConfig);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should generate state, verifier, challenge, and nonce', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/apple'
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.authUrl).toBeTruthy();
    expect(body.authUrl).toContain('appleid.apple.com/auth/authorize');
    expect(body.authUrl).toContain('response_type=code');
    expect(body.authUrl).toContain('client_id=');
    expect(body.authUrl).toContain('redirect_uri=');
    expect(body.authUrl).toContain('state=');
    expect(body.authUrl).toContain('code_challenge=');
    expect(body.authUrl).toContain('code_challenge_method=S256');
    expect(body.authUrl).toContain('nonce=');
  });

  it('should set security cookies with 10 minute expiry', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/apple'
    });

    expect(response.statusCode).toBe(200);

    const cookies = response.cookies;
    expect(cookies).toHaveLength(3);

    const cookieNames = cookies.map(c => c.name);
    expect(cookieNames).toContain('auth_state');
    expect(cookieNames).toContain('auth_verifier');
    expect(cookieNames).toContain('auth_nonce');

    // Check Max-Age is 600 seconds (10 minutes)
    cookies.forEach(c => {
      expect(c.maxAge).toBe(600);
    });
  });

  it('should use custom cookie prefix', async () => {
    const pluginConfig = createValidPluginConfig();
    const routeConfig: CreateAuthRoutesOptions = {
      ...createValidRouteConfig(),
      cookiePrefix: 'custom'
    };
    const customApp = await createTestApp(pluginConfig, routeConfig);

    const response = await customApp.inject({
      method: 'GET',
      url: '/auth/apple'
    });

    const cookieNames = response.cookies.map(c => c.name);
    expect(cookieNames).toContain('custom_state');
    expect(cookieNames).toContain('custom_verifier');
    expect(cookieNames).toContain('custom_nonce');

    await customApp.close();
  });
});

// =============================================================================
// TESTS: POST /apple/callback - OAuth Callback
// =============================================================================

describe('POST /apple/callback - OAuth Callback', () => {
  let app: FastifyInstance;
  let userRepo: MockUserRepository;
  let tokenRepo: MockRefreshTokenRepository;

  beforeEach(async () => {
    vi.clearAllMocks();

    const pluginConfig = createValidPluginConfig();
    const routeConfig = createValidRouteConfig();
    app = await createTestApp(pluginConfig, routeConfig);

    userRepo = pluginConfig.service.userRepository as MockUserRepository;
    tokenRepo = pluginConfig.service.refreshTokenRepository as MockRefreshTokenRepository;

    userRepo.clear();
    tokenRepo.clear();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should reject invalid request body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/apple/callback',
      payload: {
        code: '', // Empty code
        state: 'invalid'
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject missing code', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/apple/callback',
      payload: {
        state: 'a'.repeat(32)
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject invalid state format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/apple/callback',
      payload: {
        code: 'valid-code',
        state: 'not-32-chars'
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject CSRF - state mismatch', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/apple/callback',
      payload: {
        code: 'valid-code',
        state: 'a'.repeat(32)
      },
      cookies: {
        auth_state: 'b'.repeat(32), // Different state
        auth_verifier: 'verifier',
        auth_nonce: 'nonce'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('Invalid state parameter');
  });

  it('should reject missing PKCE verifier', async () => {
    const state = 'a'.repeat(32);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/apple/callback',
      payload: {
        code: 'valid-code',
        state
      },
      cookies: {
        auth_state: state,
        // Missing auth_verifier
        auth_nonce: 'nonce'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('Missing PKCE verifier');
  });

  it('should reject missing nonce', async () => {
    const state = 'a'.repeat(32);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/apple/callback',
      payload: {
        code: 'valid-code',
        state
      },
      cookies: {
        auth_state: state,
        auth_verifier: 'verifier'
        // Missing auth_nonce
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('Missing nonce');
  });

  it('should create new user on first Apple Sign-In', async () => {
    const state = 'a'.repeat(32);
    const mockAppleUser = {
      sub: 'apple-user-123',
      email: 'test@privaterelay.appleid.com'
    };

    vi.mocked(authenticateWithApple).mockResolvedValueOnce(mockAppleUser);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/apple/callback',
      payload: {
        code: 'valid-code',
        state
      },
      cookies: {
        auth_state: state,
        auth_verifier: 'verifier',
        auth_nonce: 'nonce'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(mockAppleUser.email);

    // Verify user was created
    const createdUser = await userRepo.findByAppleUserId(mockAppleUser.sub);
    expect(createdUser).toBeTruthy();
    expect(createdUser?.email).toBe(mockAppleUser.email);

    // Verify cookies were set
    const cookies = response.cookies.map(c => c.name);
    expect(cookies).toContain('auth_access_token');
    expect(cookies).toContain('auth_refresh_token');
  });

  it('should login existing user', async () => {
    const state = 'a'.repeat(32);
    const existingUser: AuthUser = {
      id: 'existing-user-id',
      email: 'existing@example.com',
      role: 'user',
      appleUserId: 'apple-user-456',
      createdAt: new Date(),
      lastLoginAt: null
    };
    userRepo.addUser(existingUser);

    const mockAppleUser = {
      sub: 'apple-user-456',
      email: 'existing@example.com'
    };

    vi.mocked(authenticateWithApple).mockResolvedValueOnce(mockAppleUser);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/apple/callback',
      payload: {
        code: 'valid-code',
        state
      },
      cookies: {
        auth_state: state,
        auth_verifier: 'verifier',
        auth_nonce: 'nonce'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.user.id).toBe(existingUser.id);
  });

  it('should enforce account lockout', async () => {
    const state = 'a'.repeat(32);
    const lockedUser: AuthUser = {
      id: 'locked-user-id',
      email: 'locked@example.com',
      role: 'user',
      appleUserId: 'apple-locked',
      createdAt: new Date(),
      lastLoginAt: null
    };
    userRepo.addUser(lockedUser);

    // Set lockout state - locked for 1 hour from now
    const lockedUntil = new Date(Date.now() + 3600000);
    await userRepo.updateLockoutState(lockedUser.id, {
      failedLoginAttempts: 5,
      lockedUntil,
      lastFailedAttemptAt: new Date()
    });

    const mockAppleUser = {
      sub: 'apple-locked',
      email: 'locked@example.com'
    };

    vi.mocked(authenticateWithApple).mockResolvedValueOnce(mockAppleUser);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/apple/callback',
      payload: {
        code: 'valid-code',
        state
      },
      cookies: {
        auth_state: state,
        auth_verifier: 'verifier',
        auth_nonce: 'nonce'
      }
    });

    expect(response.statusCode).toBe(423);
    const body = response.json();
    expect(body.error).toBe('Account Locked');
    expect(body.retryAfter).toBeDefined();
    expect(response.headers['retry-after']).toBeDefined();
  });

  it('should clear security cookies after callback', async () => {
    const state = 'a'.repeat(32);
    const mockAppleUser = {
      sub: 'apple-user-789',
      email: 'test@example.com'
    };

    vi.mocked(authenticateWithApple).mockResolvedValueOnce(mockAppleUser);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/apple/callback',
      payload: {
        code: 'valid-code',
        state
      },
      cookies: {
        auth_state: state,
        auth_verifier: 'verifier',
        auth_nonce: 'nonce'
      }
    });

    expect(response.statusCode).toBe(200);

    // Security cookies should be cleared (Max-Age=0 or expired)
    const clearedCookies = response.cookies.filter(c =>
      ['auth_state', 'auth_verifier', 'auth_nonce'].includes(c.name)
    );

    // Fastify clearCookie sets expires to past date
    clearedCookies.forEach(c => {
      expect(c.expires).toBeDefined();
    });
  });

  it('should handle authenticateWithApple errors', async () => {
    const state = 'a'.repeat(32);

    vi.mocked(authenticateWithApple).mockRejectedValueOnce(
      new Error('Token exchange failed')
    );

    const response = await app.inject({
      method: 'POST',
      url: '/auth/apple/callback',
      payload: {
        code: 'invalid-code',
        state
      },
      cookies: {
        auth_state: state,
        auth_verifier: 'verifier',
        auth_nonce: 'nonce'
      }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json().message).toContain('Authentication failed');
  });

  it('should log auth failures when auditLogger is provided', async () => {
    const state = 'a'.repeat(32);
    const logAuthEventMock = vi.fn();

    const pluginConfig = createValidPluginConfig();
    const routeConfig = createValidRouteConfig();

    // Add audit logger to service
    pluginConfig.service.auditLogger = {
      logAuthEvent: logAuthEventMock
    };

    const auditApp = await createTestApp(pluginConfig, routeConfig);

    const response = await auditApp.inject({
      method: 'POST',
      url: '/auth/apple/callback',
      payload: {
        code: 'valid-code',
        state: 'b'.repeat(32) // Different state - will cause CSRF failure
      },
      cookies: {
        auth_state: state,
        auth_verifier: 'verifier',
        auth_nonce: 'nonce'
      }
    });

    expect(response.statusCode).toBe(400);

    // Verify audit logger was called
    expect(logAuthEventMock).toHaveBeenCalledWith(
      expect.any(Object), // request.raw
      null, // userId
      false, // success
      'Invalid state parameter' // reason
    );

    await auditApp.close();
  });
});

// =============================================================================
// TESTS: POST /logout - Session Revocation
// =============================================================================

describe('POST /logout - Session Revocation', () => {
  let app: FastifyInstance;
  let userRepo: MockUserRepository;
  let tokenRepo: MockRefreshTokenRepository;

  beforeEach(async () => {
    const pluginConfig = createValidPluginConfig();
    const routeConfig = createValidRouteConfig();
    app = await createTestApp(pluginConfig, routeConfig);

    userRepo = pluginConfig.service.userRepository as MockUserRepository;
    tokenRepo = pluginConfig.service.refreshTokenRepository as MockRefreshTokenRepository;

    userRepo.clear();
    tokenRepo.clear();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should revoke refresh token by hash', async () => {
    const refreshToken = app.jwt.generateRefreshToken();
    const tokenHash = hashToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await tokenRepo.create({
      userId: 'user-123',
      tokenHash,
      userAgent: 'Mozilla/5.0',
      expiresAt
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: {
        auth_refresh_token: refreshToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);

    // Verify token was revoked
    const token = await tokenRepo.findByHash(tokenHash);
    expect(token).toBeNull();
  });

  it('should clear auth cookies', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout'
    });

    expect(response.statusCode).toBe(200);

    const clearedCookies = response.cookies.filter(c =>
      ['auth_access_token', 'auth_refresh_token'].includes(c.name)
    );

    expect(clearedCookies.length).toBe(2);
  });

  it('should work without existing token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });
});

// =============================================================================
// TESTS: POST /refresh - Token Rotation
// =============================================================================

describe('POST /refresh - Token Rotation', () => {
  let app: FastifyInstance;
  let userRepo: MockUserRepository;
  let tokenRepo: MockRefreshTokenRepository;

  beforeEach(async () => {
    const pluginConfig = createValidPluginConfig();
    const routeConfig = createValidRouteConfig();
    app = await createTestApp(pluginConfig, routeConfig);

    userRepo = pluginConfig.service.userRepository as MockUserRepository;
    tokenRepo = pluginConfig.service.refreshTokenRepository as MockRefreshTokenRepository;

    userRepo.clear();
    tokenRepo.clear();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return 401 when no refresh token provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh'
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toContain('No refresh token provided');
  });

  it('should return 401 for invalid token hash', async () => {
    const fakeToken = 'fake-token-123';

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: {
        auth_refresh_token: fakeToken
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toContain('Invalid refresh token');
  });

  it('should return 401 for expired token', async () => {
    const refreshToken = app.jwt.generateRefreshToken();
    const tokenHash = hashToken(refreshToken);

    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 1); // Yesterday

    await tokenRepo.create({
      userId: 'user-123',
      tokenHash,
      userAgent: 'Mozilla/5.0',
      expiresAt: expiredDate
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: {
        auth_refresh_token: refreshToken
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toContain('Refresh token expired');

    // Verify expired token was revoked
    const token = await tokenRepo.findByHash(tokenHash);
    expect(token).toBeNull();
  });

  it('should revoke all tokens on User-Agent mismatch', async () => {
    const user: AuthUser = {
      id: 'user-123',
      email: 'test@example.com',
      role: 'user',
      appleUserId: 'apple-123',
      createdAt: new Date(),
      lastLoginAt: new Date()
    };
    userRepo.addUser(user);

    const refreshToken = app.jwt.generateRefreshToken();
    const tokenHash = hashToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await tokenRepo.create({
      userId: user.id,
      tokenHash,
      userAgent: 'Mozilla/5.0 (Original Device)',
      expiresAt
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: {
        auth_refresh_token: refreshToken
      },
      headers: {
        'user-agent': 'Mozilla/5.0 (Different Device)' // Different!
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toContain('Session invalidated');

    // Verify ALL tokens for user were revoked
    const userTokens = await tokenRepo.findActiveByUser(user.id);
    expect(userTokens).toHaveLength(0);
  });

  it('should return 401 when user not found', async () => {
    const refreshToken = app.jwt.generateRefreshToken();
    const tokenHash = hashToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await tokenRepo.create({
      userId: 'non-existent-user',
      tokenHash,
      userAgent: null,
      expiresAt
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: {
        auth_refresh_token: refreshToken
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toContain('User not found');
  });

  it('should successfully rotate tokens', async () => {
    const user: AuthUser = {
      id: 'user-456',
      email: 'test@example.com',
      role: 'user',
      appleUserId: 'apple-456',
      createdAt: new Date(),
      lastLoginAt: new Date()
    };
    userRepo.addUser(user);

    const oldRefreshToken = app.jwt.generateRefreshToken();
    const oldTokenHash = hashToken(oldRefreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const userAgent = 'Mozilla/5.0 (Test Device)';

    await tokenRepo.create({
      userId: user.id,
      tokenHash: oldTokenHash,
      userAgent,
      expiresAt
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: {
        auth_refresh_token: oldRefreshToken
      },
      headers: {
        'user-agent': userAgent // Same User-Agent
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);

    // Verify old token was revoked
    const oldToken = await tokenRepo.findByHash(oldTokenHash);
    expect(oldToken).toBeNull();

    // Verify new cookies were set
    const cookies = response.cookies.map(c => c.name);
    expect(cookies).toContain('auth_access_token');
    expect(cookies).toContain('auth_refresh_token');

    // Verify new refresh token was created
    const userTokens = await tokenRepo.findActiveByUser(user.id);
    expect(userTokens).toHaveLength(1);
    expect(userTokens[0].tokenHash).not.toBe(oldTokenHash);
  });

  it('should handle null User-Agent gracefully', async () => {
    const user: AuthUser = {
      id: 'user-789',
      email: 'test@example.com',
      role: 'user',
      appleUserId: 'apple-789',
      createdAt: new Date(),
      lastLoginAt: new Date()
    };
    userRepo.addUser(user);

    const refreshToken = app.jwt.generateRefreshToken();
    const tokenHash = hashToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await tokenRepo.create({
      userId: user.id,
      tokenHash,
      userAgent: null,
      expiresAt
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: {
        auth_refresh_token: refreshToken
      }
      // No User-Agent header
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });
});

// =============================================================================
// TESTS: GET /me - Current User Info
// =============================================================================

describe('GET /me - Current User Info', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const pluginConfig = createValidPluginConfig();
    const routeConfig = createValidRouteConfig();
    app = await createTestApp(pluginConfig, routeConfig);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return user info with valid token', async () => {
    const token = await app.jwt.sign({
      sub: 'user-123',
      email: 'test@example.com',
      role: 'user'
    });

    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: {
        access_token: token // Plugin default, not route prefix
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user).toBeDefined();
    expect(body.user.id).toBe('user-123');
    expect(body.user.email).toBe('test@example.com');
    expect(body.user.role).toBe('user');
  });

  it('should return 401 without token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me'
    });

    expect(response.statusCode).toBe(401);
  });
});

// =============================================================================
// TESTS: GET /sessions - List Active Sessions
// =============================================================================

describe('GET /sessions - List Active Sessions', () => {
  let app: FastifyInstance;
  let userRepo: MockUserRepository;
  let tokenRepo: MockRefreshTokenRepository;

  beforeEach(async () => {
    const pluginConfig = createValidPluginConfig();
    const routeConfig = createValidRouteConfig();
    app = await createTestApp(pluginConfig, routeConfig);

    userRepo = pluginConfig.service.userRepository as MockUserRepository;
    tokenRepo = pluginConfig.service.refreshTokenRepository as MockRefreshTokenRepository;

    userRepo.clear();
    tokenRepo.clear();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return active sessions for authenticated user', async () => {
    const user: AuthUser = {
      id: 'user-sessions',
      email: 'sessions@example.com',
      role: 'user',
      appleUserId: 'apple-sessions',
      createdAt: new Date(),
      lastLoginAt: new Date()
    };
    userRepo.addUser(user);

    // Create access token
    const accessToken = await app.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    // Create multiple refresh tokens
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const currentRefreshToken = app.jwt.generateRefreshToken();
    const currentHash = hashToken(currentRefreshToken);

    await tokenRepo.create({
      userId: user.id,
      tokenHash: currentHash,
      userAgent: 'Mozilla/5.0 (Current Device)',
      expiresAt
    });

    await tokenRepo.create({
      userId: user.id,
      tokenHash: hashToken('other-token-1'),
      userAgent: 'Mozilla/5.0 (iPhone)',
      expiresAt
    });

    const response = await app.inject({
      method: 'GET',
      url: '/auth/sessions',
      cookies: {
        access_token: accessToken, // Plugin default
        auth_refresh_token: currentRefreshToken // Route sets this
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.sessions).toHaveLength(2);

    // Verify current session is marked
    const currentSession = body.sessions.find((s: { isCurrent: boolean }) => s.isCurrent);
    expect(currentSession).toBeDefined();
  });

  it('should require authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/sessions'
    });

    expect(response.statusCode).toBe(401);
  });
});

// =============================================================================
// TESTS: DELETE /sessions/:id - Revoke Specific Session
// =============================================================================

describe('DELETE /sessions/:id - Revoke Specific Session', () => {
  let app: FastifyInstance;
  let userRepo: MockUserRepository;
  let tokenRepo: MockRefreshTokenRepository;

  beforeEach(async () => {
    const pluginConfig = createValidPluginConfig();
    const routeConfig = createValidRouteConfig();
    app = await createTestApp(pluginConfig, routeConfig);

    userRepo = pluginConfig.service.userRepository as MockUserRepository;
    tokenRepo = pluginConfig.service.refreshTokenRepository as MockRefreshTokenRepository;

    userRepo.clear();
    tokenRepo.clear();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should reject invalid UUID format', async () => {
    const user: AuthUser = {
      id: 'user-delete-session',
      email: 'delete@example.com',
      role: 'user',
      appleUserId: 'apple-delete',
      createdAt: new Date(),
      lastLoginAt: new Date()
    };
    userRepo.addUser(user);

    const accessToken = await app.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/auth/sessions/not-a-uuid',
      cookies: {
        access_token: accessToken // Plugin default
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it('should return 404 for non-existent session', async () => {
    const user: AuthUser = {
      id: 'user-404',
      email: '404@example.com',
      role: 'user',
      appleUserId: 'apple-404',
      createdAt: new Date(),
      lastLoginAt: new Date()
    };
    userRepo.addUser(user);

    const accessToken = await app.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    // Create a valid session first so user has at least one session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await tokenRepo.create({
      userId: user.id,
      tokenHash: hashToken('valid-session'),
      userAgent: null,
      expiresAt
    });

    const fakeUuid = '550e8400-e29b-41d4-a716-446655440000';

    const response = await app.inject({
      method: 'DELETE',
      url: `/auth/sessions/${fakeUuid}`,
      cookies: {
        access_token: accessToken // Plugin default
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toContain('Session not found');
  });

  it('should successfully revoke session', async () => {
    const user: AuthUser = {
      id: 'user-revoke',
      email: 'revoke@example.com',
      role: 'user',
      appleUserId: 'apple-revoke',
      createdAt: new Date(),
      lastLoginAt: new Date()
    };
    userRepo.addUser(user);

    const accessToken = await app.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const tokenToRevoke = await tokenRepo.create({
      userId: user.id,
      tokenHash: hashToken('session-to-revoke'),
      userAgent: 'Mozilla/5.0',
      expiresAt
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/auth/sessions/${tokenToRevoke.id}`,
      cookies: {
        access_token: accessToken // Plugin default
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);

    // Verify token was revoked
    const token = await tokenRepo.findByHash(tokenToRevoke.tokenHash);
    expect(token).toBeNull();
  });

  it('should require authentication', async () => {
    const fakeUuid = '550e8400-e29b-41d4-a716-446655440000';

    const response = await app.inject({
      method: 'DELETE',
      url: `/auth/sessions/${fakeUuid}`
    });

    expect(response.statusCode).toBe(401);
  });
});

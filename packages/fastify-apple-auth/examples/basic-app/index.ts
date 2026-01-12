/**
 * @running-days/fastify-apple-auth - Basic Example
 *
 * This example demonstrates how to integrate Apple Sign-In
 * with a Fastify application using in-memory repositories.
 *
 * For production, replace the in-memory repositories with
 * your database implementation (PostgreSQL, MongoDB, etc.)
 *
 * Environment Variables:
 *   APPLE_CLIENT_ID     - Your app's bundle ID or Service ID
 *   APPLE_TEAM_ID       - Apple Developer Team ID (10 chars)
 *   APPLE_KEY_ID        - Sign-In with Apple key ID
 *   APPLE_PRIVATE_KEY   - Private key content (PEM format)
 *   JWT_SECRET          - JWT signing secret (32+ characters)
 *   PORT                - Server port (default: 3000)
 */

import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import {
  authPlugin,
  createAuthRoutes,
  type AuthUser,
  type RefreshToken,
  type NewAuthUser,
  type NewRefreshToken,
  type UserRepository,
  type RefreshTokenRepository,
  type UserLockoutState,
  hashToken
} from '@running-days/fastify-apple-auth';

// =============================================================================
// IN-MEMORY REPOSITORY IMPLEMENTATIONS
// Replace these with your database implementation for production
// =============================================================================

/**
 * In-memory user repository.
 *
 * For production, implement with your database:
 * - PostgreSQL: Use node-postgres or Prisma
 * - MongoDB: Use Mongoose or native driver
 * - MySQL: Use mysql2 or TypeORM
 */
class InMemoryUserRepository implements UserRepository {
  private users = new Map<string, AuthUser>();
  private usersByAppleId = new Map<string, AuthUser>();
  private usersByEmail = new Map<string, AuthUser>();
  private lockoutStates = new Map<string, UserLockoutState>();
  private idCounter = 0;

  async findByAppleUserId(appleUserId: string): Promise<AuthUser | null> {
    return this.usersByAppleId.get(appleUserId) || null;
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    return this.usersByEmail.get(email.toLowerCase()) || null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    return this.users.get(id) || null;
  }

  async create(data: NewAuthUser): Promise<AuthUser> {
    const id = `user-${++this.idCounter}`;
    const user: AuthUser = {
      id,
      email: data.email.toLowerCase(),
      role: data.role || 'user',
      appleUserId: data.appleUserId,
      createdAt: new Date(),
      lastLoginAt: null
    };

    this.users.set(id, user);
    this.usersByAppleId.set(data.appleUserId, user);
    this.usersByEmail.set(data.email.toLowerCase(), user);

    console.log(`[UserRepo] Created user: ${id} (${data.email})`);
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
}

/**
 * In-memory refresh token repository.
 *
 * For production, implement with your database.
 * Ensure tokenHash is indexed for fast lookups.
 */
class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  private tokens = new Map<string, RefreshToken>();
  private tokensByHash = new Map<string, RefreshToken>();
  private idCounter = 0;

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.tokensByHash.get(tokenHash) || null;
  }

  async create(data: NewRefreshToken): Promise<RefreshToken> {
    const id = `token-${++this.idCounter}`;
    const token: RefreshToken = {
      id,
      userId: data.userId,
      tokenHash: data.tokenHash,
      userAgent: data.userAgent,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
      lastUsedAt: null,
      revoked: false
    };

    this.tokens.set(id, token);
    this.tokensByHash.set(data.tokenHash, token);

    console.log(`[TokenRepo] Created token for user: ${data.userId}`);
    return token;
  }

  async revokeByHash(tokenHash: string): Promise<void> {
    const token = this.tokensByHash.get(tokenHash);
    if (token) {
      token.revoked = true;
      this.tokens.delete(token.id);
      this.tokensByHash.delete(tokenHash);
      console.log(`[TokenRepo] Revoked token: ${token.id}`);
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const userTokens = Array.from(this.tokens.values()).filter(t => t.userId === userId);
    for (const token of userTokens) {
      token.revoked = true;
      this.tokens.delete(token.id);
      this.tokensByHash.delete(token.tokenHash);
    }
    console.log(`[TokenRepo] Revoked ${userTokens.length} tokens for user: ${userId}`);
  }

  async findActiveByUser(userId: string): Promise<RefreshToken[]> {
    const now = new Date();
    return Array.from(this.tokens.values()).filter(
      t => t.userId === userId && t.expiresAt > now && !t.revoked
    );
  }

  async countActiveForUser(userId: string): Promise<number> {
    return (await this.findActiveByUser(userId)).length;
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
}

// =============================================================================
// APP SETUP
// =============================================================================

async function main() {
  // Validate required environment variables
  const requiredEnvVars = [
    'APPLE_CLIENT_ID',
    'APPLE_TEAM_ID',
    'APPLE_KEY_ID',
    'APPLE_PRIVATE_KEY',
    'JWT_SECRET'
  ];

  const missing = requiredEnvVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('\nRequired environment variables:');
    console.error('  APPLE_CLIENT_ID     - Your app\'s bundle ID or Service ID');
    console.error('  APPLE_TEAM_ID       - Apple Developer Team ID');
    console.error('  APPLE_KEY_ID        - Sign-In with Apple key ID');
    console.error('  APPLE_PRIVATE_KEY   - Private key content (PEM)');
    console.error('  JWT_SECRET          - JWT signing secret (32+ chars)');
    process.exit(1);
  }

  // Create Fastify instance with logging
  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true }
      }
    }
  });

  // Register required plugins
  await app.register(cookie);
  await app.register(sensible);
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  // Create repository instances
  const userRepository = new InMemoryUserRepository();
  const refreshTokenRepository = new InMemoryRefreshTokenRepository();

  // Register auth plugin
  await app.register(authPlugin, {
    jwt: {
      secret: process.env.JWT_SECRET!,
      accessTokenTtl: '15m',
      refreshTokenTtl: '7d',
      issuer: 'fastify-apple-auth-example',
      audience: 'example-app'
    },
    service: {
      userRepository,
      refreshTokenRepository,
      logger: {
        info: (msg, data) => app.log.info(data, msg),
        warn: (msg, data) => app.log.warn(data, msg),
        error: (msg, data) => app.log.error(data, msg)
      }
    }
  });

  // Register auth routes under /auth prefix
  await app.register(createAuthRoutes({
    apple: {
      clientId: process.env.APPLE_CLIENT_ID!,
      teamId: process.env.APPLE_TEAM_ID!,
      keyId: process.env.APPLE_KEY_ID!,
      privateKey: process.env.APPLE_PRIVATE_KEY!,
      redirectUri: `http://localhost:${process.env.PORT || 3000}/auth/apple/callback`
    },
    cookies: {
      secure: false, // Set to true in production with HTTPS
      sameSite: 'lax'
    }
  }), { prefix: '/auth' });

  // =============================================================================
  // EXAMPLE ROUTES
  // =============================================================================

  // Public route - no authentication required
  app.get('/', async () => {
    return {
      message: 'Welcome to the Apple Sign-In example!',
      endpoints: {
        login: 'GET /auth/apple',
        callback: 'POST /auth/apple/callback',
        me: 'GET /auth/me (requires auth)',
        sessions: 'GET /auth/sessions (requires auth)',
        logout: 'POST /auth/logout',
        refresh: 'POST /auth/refresh'
      }
    };
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Protected route example
  app.get('/profile', {
    preHandler: [app.authenticate]
  }, async (request) => {
    return {
      message: 'This is a protected route!',
      user: request.user
    };
  });

  // Admin-only route example
  app.get('/admin', {
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    if (request.user?.role !== 'admin') {
      return reply.forbidden('Admin access required');
    }
    return {
      message: 'Welcome, admin!',
      user: request.user
    };
  });

  // =============================================================================
  // START SERVER
  // =============================================================================

  const port = parseInt(process.env.PORT || '3000', 10);

  try {
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🍎 Apple Sign-In Example Server                          ║
╠═══════════════════════════════════════════════════════════╣
║  Server: http://localhost:${port.toString().padEnd(5)}                         ║
║                                                           ║
║  Endpoints:                                               ║
║    GET  /              - Welcome message                  ║
║    GET  /health        - Health check                     ║
║    GET  /auth/apple    - Start Apple Sign-In              ║
║    POST /auth/callback - OAuth callback                   ║
║    GET  /auth/me       - Current user (protected)         ║
║    GET  /auth/sessions - List sessions (protected)        ║
║    POST /auth/logout   - Logout                           ║
║    POST /auth/refresh  - Refresh tokens                   ║
║    GET  /profile       - Protected route example          ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

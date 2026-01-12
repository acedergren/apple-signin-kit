/**
 * Unit tests for Drizzle ORM auth adapter.
 *
 * These tests use a mock database layer to test the adapter logic
 * without requiring an actual database connection.
 *
 * @module adapter.test
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  createDrizzleAuthAdapter,
  type DrizzleAuthSchema,
  type AuthUser,
  type RefreshToken,
} from './adapter.js';

// =============================================================================
// MOCK DATABASE SETUP
// =============================================================================

/**
 * Creates a mock Drizzle database instance for testing.
 * Tracks all calls and allows customizing return values.
 */
function createMockDb() {
  const mockResults: {
    select: Record<string, unknown>[];
    insert: unknown;
    update: unknown;
    delete: unknown;
  } = {
    select: [],
    insert: undefined,
    update: undefined,
    delete: undefined,
  };

  const calls = {
    select: [] as { fields?: Record<string, unknown>; table: unknown; where: unknown; limit?: number }[],
    insert: [] as { table: unknown; values: Record<string, unknown> }[],
    update: [] as { table: unknown; set: Record<string, unknown>; where: unknown }[],
    delete: [] as { table: unknown; where: unknown }[],
  };

  const mockDb = {
    select: vi.fn((fields?: Record<string, unknown>) => ({
      from: vi.fn((table: unknown) => {
        const baseQuery = {
          where: vi.fn((condition: unknown) => {
            const query = {
              limit: vi.fn((n: number) => {
                calls.select.push({ fields, table, where: condition, limit: n });
                return Promise.resolve(mockResults.select.slice(0, n));
              }),
              then: (resolve: (value: unknown[]) => void) => {
                calls.select.push({ fields, table, where: condition });
                resolve(mockResults.select);
              },
            };
            // Make the object thenable for queries without .limit()
            return Object.assign(Promise.resolve(mockResults.select), query);
          }),
        };
        return baseQuery;
      }),
    })),

    insert: vi.fn((table: unknown) => ({
      values: vi.fn((data: Record<string, unknown>) => {
        calls.insert.push({ table, values: data });
        return Promise.resolve(mockResults.insert);
      }),
    })),

    update: vi.fn((table: unknown) => ({
      set: vi.fn((data: Record<string, unknown>) => ({
        where: vi.fn((condition: unknown) => {
          calls.update.push({ table, set: data, where: condition });
          return Promise.resolve(mockResults.update);
        }),
      })),
    })),

    delete: vi.fn((table: unknown) => ({
      where: vi.fn((condition: unknown) => {
        calls.delete.push({ table, where: condition });
        return Promise.resolve(mockResults.delete);
      }),
    })),
  };

  return {
    db: mockDb,
    calls,
    setSelectResults: (results: Record<string, unknown>[]) => {
      mockResults.select = results;
    },
    reset: () => {
      calls.select = [];
      calls.insert = [];
      calls.update = [];
      calls.delete = [];
      mockResults.select = [];
    },
  };
}

/**
 * Creates a mock schema that matches the expected structure.
 */
function createMockSchema(): DrizzleAuthSchema {
  const mockColumn = {
    _: { name: 'mock_column' },
  };

  return {
    users: {
      _: { name: 'auth_users' },
      id: mockColumn,
      email: mockColumn,
      appleUserId: mockColumn,
      role: mockColumn,
      createdAt: mockColumn,
      lastLoginAt: mockColumn,
      failedLoginAttempts: mockColumn,
      lockedUntil: mockColumn,
      lastFailedAttemptAt: mockColumn,
    } as unknown as DrizzleAuthSchema['users'],
    refreshTokens: {
      _: { name: 'auth_refresh_tokens' },
      id: mockColumn,
      userId: mockColumn,
      tokenHash: mockColumn,
      userAgent: mockColumn,
      expiresAt: mockColumn,
      createdAt: mockColumn,
      lastUsedAt: mockColumn,
      revoked: mockColumn,
    } as unknown as DrizzleAuthSchema['refreshTokens'],
  };
}

// =============================================================================
// USER REPOSITORY TESTS
// =============================================================================

describe('createDrizzleAuthAdapter', () => {
  let mockDbHelper: ReturnType<typeof createMockDb>;
  let schema: DrizzleAuthSchema;

  beforeEach(() => {
    mockDbHelper = createMockDb();
    schema = createMockSchema();
  });

  describe('userRepository', () => {
    describe('findByAppleUserId', () => {
      it('should return null when user not found', async () => {
        const { userRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        mockDbHelper.setSelectResults([]);
        const result = await userRepository.findByAppleUserId('apple-123');

        expect(result).toBeNull();
        expect(mockDbHelper.db.select).toHaveBeenCalled();
      });

      it('should return user when found', async () => {
        const { userRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        const mockUser = {
          id: 'user-1',
          email: 'test@example.com',
          role: 'user',
          appleUserId: 'apple-123',
          createdAt: new Date('2024-01-01'),
          lastLoginAt: new Date('2024-01-15'),
        };

        mockDbHelper.setSelectResults([mockUser]);
        const result = await userRepository.findByAppleUserId('apple-123');

        expect(result).toEqual({
          id: 'user-1',
          email: 'test@example.com',
          role: 'user',
          appleUserId: 'apple-123',
          createdAt: new Date('2024-01-01'),
          lastLoginAt: new Date('2024-01-15'),
        });
      });
    });

    describe('findByEmail', () => {
      it('should return null when user not found', async () => {
        const { userRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        mockDbHelper.setSelectResults([]);
        const result = await userRepository.findByEmail('notfound@example.com');

        expect(result).toBeNull();
      });

      it('should return user when found by email', async () => {
        const { userRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        const mockUser = {
          id: 'user-2',
          email: 'found@example.com',
          role: 'admin',
          appleUserId: null,
          createdAt: new Date('2024-02-01'),
          lastLoginAt: null,
        };

        mockDbHelper.setSelectResults([mockUser]);
        const result = await userRepository.findByEmail('found@example.com');

        expect(result).toEqual({
          id: 'user-2',
          email: 'found@example.com',
          role: 'admin',
          appleUserId: null,
          createdAt: new Date('2024-02-01'),
          lastLoginAt: null,
        });
      });
    });

    describe('findById', () => {
      it('should return null when user not found by id', async () => {
        const { userRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        mockDbHelper.setSelectResults([]);
        const result = await userRepository.findById('nonexistent-id');

        expect(result).toBeNull();
      });

      it('should return user when found by id', async () => {
        const { userRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        const mockUser = {
          id: 'user-3',
          email: 'user3@example.com',
          role: 'user',
          appleUserId: 'apple-456',
          createdAt: new Date('2024-03-01'),
          lastLoginAt: new Date('2024-03-15'),
        };

        mockDbHelper.setSelectResults([mockUser]);
        const result = await userRepository.findById('user-3');

        expect(result).not.toBeNull();
        expect(result?.id).toBe('user-3');
      });
    });

    describe('create', () => {
      it('should create a new user with default role', async () => {
        const customGenerateId = vi.fn(() => 'generated-uuid');
        const { userRepository } = createDrizzleAuthAdapter(
          mockDbHelper.db as any,
          schema,
          { generateId: customGenerateId }
        );

        const result = await userRepository.create({
          email: 'new@example.com',
          appleUserId: 'apple-new',
        });

        expect(customGenerateId).toHaveBeenCalledOnce();
        expect(result.id).toBe('generated-uuid');
        expect(result.email).toBe('new@example.com');
        expect(result.appleUserId).toBe('apple-new');
        expect(result.role).toBe('user');
        expect(result.createdAt).toBeInstanceOf(Date);
        expect(result.lastLoginAt).toBeInstanceOf(Date);
        expect(mockDbHelper.db.insert).toHaveBeenCalled();
      });

      it('should create user with custom role', async () => {
        const { userRepository } = createDrizzleAuthAdapter(
          mockDbHelper.db as any,
          schema,
          { generateId: () => 'admin-uuid' }
        );

        const result = await userRepository.create({
          email: 'admin@example.com',
          appleUserId: 'apple-admin',
          role: 'admin',
        });

        expect(result.role).toBe('admin');
      });

      it('should use default UUID generator when not provided', async () => {
        const { userRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        const result = await userRepository.create({
          email: 'default@example.com',
          appleUserId: 'apple-default',
        });

        // Should be a valid UUID-like string
        expect(result.id).toBeDefined();
        expect(typeof result.id).toBe('string');
        expect(result.id.length).toBeGreaterThan(0);
      });
    });

    describe('updateLastLogin', () => {
      it('should update last login timestamp', async () => {
        const { userRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        const timestamp = new Date('2024-06-15T10:30:00Z');
        await userRepository.updateLastLogin('user-1', timestamp);

        expect(mockDbHelper.db.update).toHaveBeenCalled();
        expect(mockDbHelper.calls.update.length).toBe(1);
        expect(mockDbHelper.calls.update[0]?.set).toEqual({ lastLoginAt: timestamp });
      });
    });

    describe('getLockoutState', () => {
      it('should return null when user not found', async () => {
        const { userRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        mockDbHelper.setSelectResults([]);
        const result = await userRepository.getLockoutState?.('nonexistent');

        expect(result).toBeNull();
      });

      it('should return lockout state when user found', async () => {
        const { userRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        const lockedUntil = new Date('2024-06-15T12:00:00Z');
        const lastFailedAttemptAt = new Date('2024-06-15T11:45:00Z');

        mockDbHelper.setSelectResults([{
          failedLoginAttempts: 3,
          lockedUntil,
          lastFailedAttemptAt,
        }]);

        const result = await userRepository.getLockoutState?.('user-1');

        expect(result).toEqual({
          failedLoginAttempts: 3,
          lockedUntil,
          lastFailedAttemptAt,
        });
      });

      it('should handle null lockout fields', async () => {
        const { userRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        mockDbHelper.setSelectResults([{
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastFailedAttemptAt: null,
        }]);

        const result = await userRepository.getLockoutState?.('user-1');

        expect(result).toEqual({
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastFailedAttemptAt: null,
        });
      });
    });

    describe('updateLockoutState', () => {
      it('should update failed login attempts', async () => {
        const { userRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        await userRepository.updateLockoutState?.('user-1', {
          failedLoginAttempts: 5,
        });

        expect(mockDbHelper.db.update).toHaveBeenCalled();
        expect(mockDbHelper.calls.update[0]?.set).toEqual({
          failedLoginAttempts: 5,
        });
      });

      it('should update locked until timestamp', async () => {
        const { userRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        const lockedUntil = new Date('2024-06-15T15:00:00Z');
        await userRepository.updateLockoutState?.('user-1', {
          lockedUntil,
        });

        expect(mockDbHelper.calls.update[0]?.set).toEqual({
          lockedUntil,
        });
      });

      it('should update multiple lockout fields at once', async () => {
        const { userRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        const lockedUntil = new Date('2024-06-15T15:00:00Z');
        const lastFailedAttemptAt = new Date('2024-06-15T14:50:00Z');

        await userRepository.updateLockoutState?.('user-1', {
          failedLoginAttempts: 5,
          lockedUntil,
          lastFailedAttemptAt,
        });

        expect(mockDbHelper.calls.update[0]?.set).toEqual({
          failedLoginAttempts: 5,
          lockedUntil,
          lastFailedAttemptAt,
        });
      });

      it('should not call update when no fields provided', async () => {
        const { userRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        await userRepository.updateLockoutState?.('user-1', {});

        // No update should be called when there are no fields to update
        expect(mockDbHelper.calls.update.length).toBe(0);
      });
    });
  });

  // ===========================================================================
  // REFRESH TOKEN REPOSITORY TESTS
  // ===========================================================================

  describe('refreshTokenRepository', () => {
    describe('findByHash', () => {
      it('should return null when token not found', async () => {
        const { refreshTokenRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        mockDbHelper.setSelectResults([]);
        const result = await refreshTokenRepository.findByHash('nonexistent-hash');

        expect(result).toBeNull();
      });

      it('should return token when found', async () => {
        const { refreshTokenRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        const expiresAt = new Date('2024-07-15T00:00:00Z');
        const createdAt = new Date('2024-06-15T00:00:00Z');

        mockDbHelper.setSelectResults([{
          id: 'token-1',
          userId: 'user-1',
          tokenHash: 'hash-abc',
          userAgent: 'Mozilla/5.0',
          expiresAt,
          createdAt,
          lastUsedAt: null,
          revoked: false,
        }]);

        const result = await refreshTokenRepository.findByHash('hash-abc');

        expect(result).toEqual({
          id: 'token-1',
          userId: 'user-1',
          tokenHash: 'hash-abc',
          userAgent: 'Mozilla/5.0',
          expiresAt,
          createdAt,
          lastUsedAt: null,
          revoked: false,
        });
      });
    });

    describe('create', () => {
      it('should create a new refresh token', async () => {
        const { refreshTokenRepository } = createDrizzleAuthAdapter(
          mockDbHelper.db as any,
          schema,
          { generateId: () => 'token-uuid' }
        );

        const expiresAt = new Date('2024-07-15T00:00:00Z');

        const result = await refreshTokenRepository.create({
          userId: 'user-1',
          tokenHash: 'hash-new',
          userAgent: 'Chrome/120',
          expiresAt,
        });

        expect(result.id).toBe('token-uuid');
        expect(result.userId).toBe('user-1');
        expect(result.tokenHash).toBe('hash-new');
        expect(result.userAgent).toBe('Chrome/120');
        expect(result.expiresAt).toEqual(expiresAt);
        expect(result.createdAt).toBeInstanceOf(Date);
        expect(result.lastUsedAt).toBeNull();
        expect(result.revoked).toBe(false);
      });

      it('should create token with null user agent', async () => {
        const { refreshTokenRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        const result = await refreshTokenRepository.create({
          userId: 'user-1',
          tokenHash: 'hash-no-agent',
          userAgent: null,
          expiresAt: new Date(),
        });

        expect(result.userAgent).toBeNull();
      });
    });

    describe('revokeByHash', () => {
      it('should revoke token by hash', async () => {
        const { refreshTokenRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        await refreshTokenRepository.revokeByHash('hash-to-revoke');

        expect(mockDbHelper.db.update).toHaveBeenCalled();
        expect(mockDbHelper.calls.update[0]?.set).toEqual({ revoked: true });
      });
    });

    describe('revokeAllForUser', () => {
      it('should revoke all tokens for user', async () => {
        const { refreshTokenRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        await refreshTokenRepository.revokeAllForUser('user-to-logout');

        expect(mockDbHelper.db.update).toHaveBeenCalled();
        expect(mockDbHelper.calls.update[0]?.set).toEqual({ revoked: true });
      });
    });

    describe('findActiveByUser', () => {
      it('should return empty array when no active tokens', async () => {
        const { refreshTokenRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        mockDbHelper.setSelectResults([]);
        const result = await refreshTokenRepository.findActiveByUser('user-1');

        expect(result).toEqual([]);
      });

      it('should return active tokens for user', async () => {
        const { refreshTokenRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        const token1 = {
          id: 'token-1',
          userId: 'user-1',
          tokenHash: 'hash-1',
          userAgent: 'Chrome',
          expiresAt: new Date('2024-12-31'),
          createdAt: new Date('2024-01-01'),
          lastUsedAt: null,
          revoked: false,
        };

        const token2 = {
          id: 'token-2',
          userId: 'user-1',
          tokenHash: 'hash-2',
          userAgent: 'Firefox',
          expiresAt: new Date('2024-12-31'),
          createdAt: new Date('2024-02-01'),
          lastUsedAt: new Date('2024-03-01'),
          revoked: false,
        };

        mockDbHelper.setSelectResults([token1, token2]);
        const result = await refreshTokenRepository.findActiveByUser('user-1');

        expect(result).toHaveLength(2);
        expect(result[0]?.id).toBe('token-1');
        expect(result[1]?.id).toBe('token-2');
      });
    });

    describe('countActiveForUser', () => {
      it('should return 0 when no active tokens', async () => {
        const { refreshTokenRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        mockDbHelper.setSelectResults([{ count: 0 }]);
        const result = await refreshTokenRepository.countActiveForUser('user-1');

        expect(result).toBe(0);
      });

      it('should return count of active tokens', async () => {
        const { refreshTokenRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        mockDbHelper.setSelectResults([{ count: 5 }]);
        const result = await refreshTokenRepository.countActiveForUser('user-1');

        expect(result).toBe(5);
      });

      it('should handle string count from database', async () => {
        const { refreshTokenRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        // Some databases return count as string
        mockDbHelper.setSelectResults([{ count: '3' }]);
        const result = await refreshTokenRepository.countActiveForUser('user-1');

        expect(result).toBe(3);
      });
    });

    describe('deleteExpired', () => {
      it('should return 0 when no expired tokens', async () => {
        const { refreshTokenRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        mockDbHelper.setSelectResults([{ count: 0 }]);
        const result = await refreshTokenRepository.deleteExpired?.();

        expect(result).toBe(0);
        // Should not call delete when count is 0
        expect(mockDbHelper.calls.delete.length).toBe(0);
      });

      it('should delete expired and revoked tokens', async () => {
        const { refreshTokenRepository } = createDrizzleAuthAdapter(mockDbHelper.db as any, schema);

        mockDbHelper.setSelectResults([{ count: 10 }]);
        const result = await refreshTokenRepository.deleteExpired?.();

        expect(result).toBe(10);
        expect(mockDbHelper.db.delete).toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // ADAPTER OPTIONS TESTS
  // ===========================================================================

  describe('adapter options', () => {
    it('should use custom ID generator', async () => {
      let idCounter = 0;
      const customGenerator = () => `custom-id-${++idCounter}`;

      const { userRepository, refreshTokenRepository } = createDrizzleAuthAdapter(
        mockDbHelper.db as any,
        schema,
        { generateId: customGenerator }
      );

      const user = await userRepository.create({
        email: 'test@example.com',
        appleUserId: 'apple-1',
      });

      const token = await refreshTokenRepository.create({
        userId: 'user-1',
        tokenHash: 'hash-1',
        userAgent: null,
        expiresAt: new Date(),
      });

      expect(user.id).toBe('custom-id-1');
      expect(token.id).toBe('custom-id-2');
    });
  });

  // ===========================================================================
  // CONVENIENCE FACTORY TESTS
  // ===========================================================================

  describe('convenience factories', () => {
    it('createPgAuthAdapter should be the same as createDrizzleAuthAdapter', async () => {
      const { createPgAuthAdapter } = await import('./adapter.js');
      expect(createPgAuthAdapter).toBe(createDrizzleAuthAdapter);
    });

    it('createMysqlAuthAdapter should be the same as createDrizzleAuthAdapter', async () => {
      const { createMysqlAuthAdapter } = await import('./adapter.js');
      expect(createMysqlAuthAdapter).toBe(createDrizzleAuthAdapter);
    });

    it('createSqliteAuthAdapter should be the same as createDrizzleAuthAdapter', async () => {
      const { createSqliteAuthAdapter } = await import('./adapter.js');
      expect(createSqliteAuthAdapter).toBe(createDrizzleAuthAdapter);
    });
  });
});

// =============================================================================
// SCHEMA IMPORT TESTS
// =============================================================================

describe('Schema imports', () => {
  it('should export PostgreSQL schema', async () => {
    const { pgUsers, pgRefreshTokens } = await import('./schema/pg.js');
    expect(pgUsers).toBeDefined();
    expect(pgRefreshTokens).toBeDefined();
  });

  it('should export MySQL schema', async () => {
    const { mysqlUsers, mysqlRefreshTokens } = await import('./schema/mysql.js');
    expect(mysqlUsers).toBeDefined();
    expect(mysqlRefreshTokens).toBeDefined();
  });

  it('should export SQLite schema', async () => {
    const { sqliteUsers, sqliteRefreshTokens } = await import('./schema/sqlite.js');
    expect(sqliteUsers).toBeDefined();
    expect(sqliteRefreshTokens).toBeDefined();
  });
});

// =============================================================================
// INDEX EXPORT TESTS
// =============================================================================

describe('Index exports', () => {
  it('should export all adapter functions from index', async () => {
    const exports = await import('./index.js');

    expect(exports.createDrizzleAuthAdapter).toBeDefined();
    expect(exports.createPgAuthAdapter).toBeDefined();
    expect(exports.createMysqlAuthAdapter).toBeDefined();
    expect(exports.createSqliteAuthAdapter).toBeDefined();
  });

  it('should export all schema tables from index', async () => {
    const exports = await import('./index.js');

    // PostgreSQL
    expect(exports.pgUsers).toBeDefined();
    expect(exports.pgRefreshTokens).toBeDefined();

    // MySQL
    expect(exports.mysqlUsers).toBeDefined();
    expect(exports.mysqlRefreshTokens).toBeDefined();

    // SQLite
    expect(exports.sqliteUsers).toBeDefined();
    expect(exports.sqliteRefreshTokens).toBeDefined();
  });
});

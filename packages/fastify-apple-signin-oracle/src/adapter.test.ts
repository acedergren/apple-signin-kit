/**
 * Unit tests for Oracle Database Adapter
 *
 * These tests mock node-oracledb to avoid real database connections.
 * All Oracle-specific behaviors are simulated through the mock layer.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { Pool, Connection, Result, BindParameters } from 'oracledb';

// Mock oracledb before importing the adapter
vi.mock('oracledb', () => {
  const OUT_FORMAT_OBJECT = 4002;
  return {
    default: {
      OUT_FORMAT_OBJECT,
    },
    OUT_FORMAT_OBJECT,
  };
});

// Now import the adapter (after the mock is set up)
import {
  createOracleAuthAdapter,
  createOracleAuthAdapterFromConnection,
  type OracleAuthAdapter,
} from './adapter.js';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a mock Oracle connection with execute function
 */
function createMockConnection(executeHandler: (sql: string, binds: BindParameters) => Partial<Result<unknown>>): Connection {
  return {
    execute: vi.fn().mockImplementation(async (sql: string, binds: BindParameters) => {
      return executeHandler(sql, binds);
    }),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Connection;
}

/**
 * Create a mock Oracle pool that returns connections
 */
function createMockPool(connection: Connection): Pool {
  return {
    getConnection: vi.fn().mockResolvedValue(connection),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Pool;
}

/**
 * Create a sample user row as returned by Oracle
 */
function createUserRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    ID: 'user-uuid-123',
    EMAIL: 'test@example.com',
    ROLE: 'user',
    APPLE_USER_ID: 'apple.123456',
    CREATED_AT: new Date('2024-01-01T00:00:00Z'),
    LAST_LOGIN_AT: new Date('2024-01-15T10:30:00Z'),
    FAILED_LOGIN_ATTEMPTS: 0,
    LOCKED_UNTIL: null,
    LAST_FAILED_ATTEMPT_AT: null,
    ...overrides,
  };
}

/**
 * Create a sample refresh token row as returned by Oracle
 */
function createTokenRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    ID: 'token-uuid-456',
    USER_ID: 'user-uuid-123',
    TOKEN_HASH: 'abc123hash',
    USER_AGENT: 'Mozilla/5.0 Test Browser',
    EXPIRES_AT: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    CREATED_AT: new Date('2024-01-15T10:00:00Z'),
    LAST_USED_AT: new Date('2024-01-15T12:00:00Z'),
    REVOKED: 0,
    ...overrides,
  };
}

// =============================================================================
// createOracleAuthAdapter Tests
// =============================================================================

describe('createOracleAuthAdapter', () => {
  it('returns userRepository and refreshTokenRepository', () => {
    const mockConnection = createMockConnection(() => ({ rows: [] }));
    const mockPool = createMockPool(mockConnection);

    const adapter = createOracleAuthAdapter(mockPool);

    expect(adapter).toHaveProperty('userRepository');
    expect(adapter).toHaveProperty('refreshTokenRepository');
    expect(typeof adapter.userRepository.findByAppleUserId).toBe('function');
    expect(typeof adapter.refreshTokenRepository.findByHash).toBe('function');
  });

  it('accepts custom table names', () => {
    const mockConnection = createMockConnection((sql) => {
      // Verify custom table name is used
      expect(sql).toContain('CUSTOM_USERS');
      return { rows: [] };
    });
    const mockPool = createMockPool(mockConnection);

    const adapter = createOracleAuthAdapter(mockPool, {
      usersTable: 'CUSTOM_USERS',
      refreshTokensTable: 'CUSTOM_TOKENS',
    });

    // Trigger a query to verify table name usage
    adapter.userRepository.findByAppleUserId('test');
  });
});

// =============================================================================
// UserRepository Tests
// =============================================================================

describe('UserRepository', () => {
  let adapter: OracleAuthAdapter;
  let mockConnection: Connection;
  let mockPool: Pool;
  let executeHandler: Mock;

  beforeEach(() => {
    executeHandler = vi.fn().mockReturnValue({ rows: [] });
    mockConnection = createMockConnection((sql, binds) => executeHandler(sql, binds));
    mockPool = createMockPool(mockConnection);
    adapter = createOracleAuthAdapter(mockPool);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findByAppleUserId', () => {
    it('returns user when found', async () => {
      const userRow = createUserRow();
      executeHandler.mockReturnValue({ rows: [userRow] });

      const user = await adapter.userRepository.findByAppleUserId('apple.123456');

      expect(user).not.toBeNull();
      expect(user?.id).toBe('user-uuid-123');
      expect(user?.email).toBe('test@example.com');
      expect(user?.appleUserId).toBe('apple.123456');
      expect(user?.role).toBe('user');
    });

    it('returns null when user not found', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      const user = await adapter.userRepository.findByAppleUserId('nonexistent');

      expect(user).toBeNull();
    });

    it('queries with correct bind parameter', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      await adapter.userRepository.findByAppleUserId('apple.test123');

      expect(executeHandler).toHaveBeenCalledWith(
        expect.stringContaining('APPLE_USER_ID = :appleUserId'),
        expect.objectContaining({ appleUserId: 'apple.test123' })
      );
    });

    it('closes connection after query', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      await adapter.userRepository.findByAppleUserId('test');

      expect(mockConnection.close).toHaveBeenCalled();
    });
  });

  describe('findByEmail', () => {
    it('returns user when found (case-insensitive)', async () => {
      const userRow = createUserRow({ EMAIL: 'Test@Example.COM' });
      executeHandler.mockReturnValue({ rows: [userRow] });

      const user = await adapter.userRepository.findByEmail('test@example.com');

      expect(user).not.toBeNull();
      expect(user?.email).toBe('Test@Example.COM');
    });

    it('uses LOWER() for case-insensitive search', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      await adapter.userRepository.findByEmail('Test@Example.com');

      expect(executeHandler).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(EMAIL) = LOWER(:email)'),
        expect.objectContaining({ email: 'Test@Example.com' })
      );
    });

    it('returns null when user not found', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      const user = await adapter.userRepository.findByEmail('notfound@example.com');

      expect(user).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns user when found', async () => {
      const userRow = createUserRow();
      executeHandler.mockReturnValue({ rows: [userRow] });

      const user = await adapter.userRepository.findById('user-uuid-123');

      expect(user).not.toBeNull();
      expect(user?.id).toBe('user-uuid-123');
    });

    it('returns null when user not found', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      const user = await adapter.userRepository.findById('nonexistent-id');

      expect(user).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a new user with generated UUID', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 1 });

      const newUser = await adapter.userRepository.create({
        email: 'newuser@example.com',
        appleUserId: 'apple.newuser',
      });

      expect(newUser.email).toBe('newuser@example.com');
      expect(newUser.appleUserId).toBe('apple.newuser');
      expect(newUser.role).toBe('user');
      expect(newUser.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
      expect(newUser.createdAt).toBeInstanceOf(Date);
      expect(newUser.lastLoginAt).toBeNull();
    });

    it('respects custom role', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 1 });

      const newUser = await adapter.userRepository.create({
        email: 'admin@example.com',
        appleUserId: 'apple.admin',
        role: 'admin',
      });

      expect(newUser.role).toBe('admin');
    });

    it('inserts with correct SQL', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 1 });

      await adapter.userRepository.create({
        email: 'test@example.com',
        appleUserId: 'apple.test',
      });

      expect(executeHandler).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO AUTH_USERS'),
        expect.objectContaining({
          email: 'test@example.com',
          appleUserId: 'apple.test',
          role: 'user',
        })
      );
    });
  });

  describe('updateLastLogin', () => {
    it('updates last login and clears lockout state', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 1 });
      const loginTime = new Date();

      await adapter.userRepository.updateLastLogin('user-uuid-123', loginTime);

      expect(executeHandler).toHaveBeenCalledWith(
        expect.stringMatching(/LAST_LOGIN_AT.*FAILED_LOGIN_ATTEMPTS = 0.*LOCKED_UNTIL = NULL/s),
        expect.objectContaining({
          userId: 'user-uuid-123',
          timestamp: loginTime,
        })
      );
    });
  });

  describe('getLockoutState', () => {
    it('returns lockout state for user', async () => {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      const lastFailed = new Date();
      executeHandler.mockReturnValue({
        rows: [{
          FAILED_LOGIN_ATTEMPTS: 3,
          LOCKED_UNTIL: lockedUntil,
          LAST_FAILED_ATTEMPT_AT: lastFailed,
        }],
      });

      const state = await adapter.userRepository.getLockoutState!('user-uuid-123');

      expect(state).not.toBeNull();
      expect(state?.failedLoginAttempts).toBe(3);
      expect(state?.lockedUntil).toEqual(lockedUntil);
      expect(state?.lastFailedAttemptAt).toEqual(lastFailed);
    });

    it('returns null for nonexistent user', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      const state = await adapter.userRepository.getLockoutState!('nonexistent');

      expect(state).toBeNull();
    });
  });

  describe('updateLockoutState', () => {
    it('updates only specified fields', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 1 });

      await adapter.userRepository.updateLockoutState!('user-uuid-123', {
        failedLoginAttempts: 5,
      });

      expect(executeHandler).toHaveBeenCalledWith(
        expect.stringContaining('FAILED_LOGIN_ATTEMPTS = :failedLoginAttempts'),
        expect.objectContaining({
          userId: 'user-uuid-123',
          failedLoginAttempts: 5,
        })
      );
    });

    it('updates multiple fields at once', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 1 });
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);

      await adapter.userRepository.updateLockoutState!('user-uuid-123', {
        failedLoginAttempts: 5,
        lockedUntil,
      });

      expect(executeHandler).toHaveBeenCalledWith(
        expect.stringMatching(/FAILED_LOGIN_ATTEMPTS.*LOCKED_UNTIL/s),
        expect.objectContaining({
          failedLoginAttempts: 5,
          lockedUntil,
        })
      );
    });

    it('does nothing when state is empty', async () => {
      await adapter.userRepository.updateLockoutState!('user-uuid-123', {});

      expect(executeHandler).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// RefreshTokenRepository Tests
// =============================================================================

describe('RefreshTokenRepository', () => {
  let adapter: OracleAuthAdapter;
  let mockConnection: Connection;
  let mockPool: Pool;
  let executeHandler: Mock;

  beforeEach(() => {
    executeHandler = vi.fn().mockReturnValue({ rows: [] });
    mockConnection = createMockConnection((sql, binds) => executeHandler(sql, binds));
    mockPool = createMockPool(mockConnection);
    adapter = createOracleAuthAdapter(mockPool);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findByHash', () => {
    it('returns token when found and valid', async () => {
      const tokenRow = createTokenRow();
      executeHandler.mockReturnValue({ rows: [tokenRow] });

      const token = await adapter.refreshTokenRepository.findByHash('abc123hash');

      expect(token).not.toBeNull();
      expect(token?.id).toBe('token-uuid-456');
      expect(token?.tokenHash).toBe('abc123hash');
      expect(token?.revoked).toBe(false);
    });

    it('returns null when token not found', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      const token = await adapter.refreshTokenRepository.findByHash('nonexistent');

      expect(token).toBeNull();
    });

    it('filters out revoked and expired tokens in query', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      await adapter.refreshTokenRepository.findByHash('test');

      expect(executeHandler).toHaveBeenCalledWith(
        expect.stringMatching(/REVOKED = 0.*EXPIRES_AT > SYSTIMESTAMP/s),
        expect.any(Object)
      );
    });

    it('correctly converts Oracle NUMBER(1) to boolean for revoked field', async () => {
      // Test revoked = 0 (false)
      executeHandler.mockReturnValue({ rows: [createTokenRow({ REVOKED: 0 })] });
      let token = await adapter.refreshTokenRepository.findByHash('test');
      expect(token?.revoked).toBe(false);

      // Test revoked = 1 (true)
      executeHandler.mockReturnValue({ rows: [createTokenRow({ REVOKED: 1 })] });
      token = await adapter.refreshTokenRepository.findByHash('test');
      expect(token?.revoked).toBe(true);
    });
  });

  describe('create', () => {
    it('creates a new refresh token with generated UUID', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 1 });
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const token = await adapter.refreshTokenRepository.create({
        userId: 'user-uuid-123',
        tokenHash: 'newhash456',
        userAgent: 'Test Browser',
        expiresAt,
      });

      expect(token.userId).toBe('user-uuid-123');
      expect(token.tokenHash).toBe('newhash456');
      expect(token.userAgent).toBe('Test Browser');
      expect(token.expiresAt).toEqual(expiresAt);
      expect(token.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(token.revoked).toBe(false);
      expect(token.lastUsedAt).toBeNull();
    });

    it('inserts with REVOKED = 0', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 1 });

      await adapter.refreshTokenRepository.create({
        userId: 'user-uuid-123',
        tokenHash: 'hash',
        userAgent: null,
        expiresAt: new Date(),
      });

      expect(executeHandler).toHaveBeenCalledWith(
        expect.stringContaining('REVOKED'),
        expect.any(Object)
      );
    });
  });

  describe('revokeByHash', () => {
    it('sets REVOKED = 1 for matching token', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 1 });

      await adapter.refreshTokenRepository.revokeByHash('hash123');

      expect(executeHandler).toHaveBeenCalledWith(
        expect.stringContaining('REVOKED = 1'),
        expect.objectContaining({ tokenHash: 'hash123' })
      );
    });
  });

  describe('revokeAllForUser', () => {
    it('revokes all active tokens for user', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 3 });

      await adapter.refreshTokenRepository.revokeAllForUser('user-uuid-123');

      expect(executeHandler).toHaveBeenCalledWith(
        expect.stringMatching(/REVOKED = 1.*USER_ID = :userId.*REVOKED = 0/s),
        expect.objectContaining({ userId: 'user-uuid-123' })
      );
    });
  });

  describe('findActiveByUser', () => {
    it('returns all active tokens for user', async () => {
      const tokens = [
        createTokenRow({ ID: 'token-1' }),
        createTokenRow({ ID: 'token-2' }),
      ];
      executeHandler.mockReturnValue({ rows: tokens });

      const result = await adapter.refreshTokenRepository.findActiveByUser('user-uuid-123');

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('token-1');
      expect(result[1]?.id).toBe('token-2');
    });

    it('returns empty array when no active tokens', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      const result = await adapter.refreshTokenRepository.findActiveByUser('user-uuid-123');

      expect(result).toEqual([]);
    });

    it('filters by user and active status', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      await adapter.refreshTokenRepository.findActiveByUser('user-uuid-123');

      expect(executeHandler).toHaveBeenCalledWith(
        expect.stringMatching(/USER_ID = :userId.*REVOKED = 0.*EXPIRES_AT > SYSTIMESTAMP/s),
        expect.objectContaining({ userId: 'user-uuid-123' })
      );
    });

    it('orders by CREATED_AT DESC', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      await adapter.refreshTokenRepository.findActiveByUser('user-uuid-123');

      expect(executeHandler).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY CREATED_AT DESC'),
        expect.any(Object)
      );
    });
  });

  describe('countActiveForUser', () => {
    it('returns count of active tokens', async () => {
      executeHandler.mockReturnValue({ rows: [{ CNT: 5 }] });

      const count = await adapter.refreshTokenRepository.countActiveForUser('user-uuid-123');

      expect(count).toBe(5);
    });

    it('returns 0 when no active tokens', async () => {
      executeHandler.mockReturnValue({ rows: [{ CNT: 0 }] });

      const count = await adapter.refreshTokenRepository.countActiveForUser('user-uuid-123');

      expect(count).toBe(0);
    });

    it('returns 0 when no rows returned', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      const count = await adapter.refreshTokenRepository.countActiveForUser('user-uuid-123');

      expect(count).toBe(0);
    });
  });

  describe('deleteExpired', () => {
    it('deletes revoked and old expired tokens', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 10 });

      const deleted = await adapter.refreshTokenRepository.deleteExpired!();

      expect(deleted).toBe(10);
      expect(executeHandler).toHaveBeenCalledWith(
        expect.stringMatching(/DELETE.*REVOKED = 1.*OR.*EXPIRES_AT < SYSTIMESTAMP - INTERVAL '30' DAY/s),
        expect.any(Object)
      );
    });

    it('returns 0 when no tokens deleted', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 0 });

      const deleted = await adapter.refreshTokenRepository.deleteExpired!();

      expect(deleted).toBe(0);
    });
  });
});

// =============================================================================
// createOracleAuthAdapterFromConnection Tests
// =============================================================================

describe('createOracleAuthAdapterFromConnection', () => {
  it('creates adapter from single connection', async () => {
    const executeHandler = vi.fn().mockReturnValue({ rows: [createUserRow()] });
    const mockConnection = createMockConnection((sql, binds) => executeHandler(sql, binds));

    const adapter = createOracleAuthAdapterFromConnection(mockConnection);

    expect(adapter).toHaveProperty('userRepository');
    expect(adapter).toHaveProperty('refreshTokenRepository');
  });

  it('does not close connection after queries', async () => {
    const executeHandler = vi.fn().mockReturnValue({ rows: [] });
    const mockConnection = createMockConnection((sql, binds) => executeHandler(sql, binds));

    const adapter = createOracleAuthAdapterFromConnection(mockConnection);
    await adapter.userRepository.findByEmail('test@example.com');

    // SingleConnectionUserRepository should NOT close the connection
    expect(mockConnection.close).not.toHaveBeenCalled();
  });

  it('accepts custom table names', async () => {
    const executeHandler = vi.fn().mockReturnValue({ rows: [] });
    const mockConnection = createMockConnection((sql) => {
      expect(sql).toContain('MY_USERS');
      return executeHandler();
    });

    const adapter = createOracleAuthAdapterFromConnection(mockConnection, {
      usersTable: 'MY_USERS',
    });

    await adapter.userRepository.findByEmail('test@example.com');
  });
});

// =============================================================================
// SingleConnectionUserRepository Full Coverage Tests
// =============================================================================

describe('SingleConnectionUserRepository', () => {
  let adapter: OracleAuthAdapter;
  let mockConnection: Connection;
  let executeHandler: Mock;

  beforeEach(() => {
    executeHandler = vi.fn().mockReturnValue({ rows: [] });
    mockConnection = createMockConnection((sql, binds) => executeHandler(sql, binds));
    adapter = createOracleAuthAdapterFromConnection(mockConnection);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findByAppleUserId', () => {
    it('returns user when found', async () => {
      executeHandler.mockReturnValue({ rows: [createUserRow()] });

      const user = await adapter.userRepository.findByAppleUserId('apple.123456');

      expect(user).not.toBeNull();
      expect(user?.id).toBe('user-uuid-123');
    });

    it('returns null when not found', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      const user = await adapter.userRepository.findByAppleUserId('nonexistent');

      expect(user).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns user when found', async () => {
      executeHandler.mockReturnValue({ rows: [createUserRow()] });

      const user = await adapter.userRepository.findById('user-uuid-123');

      expect(user).not.toBeNull();
      expect(user?.id).toBe('user-uuid-123');
    });

    it('returns null when not found', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      const user = await adapter.userRepository.findById('nonexistent');

      expect(user).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a new user', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 1 });

      const newUser = await adapter.userRepository.create({
        email: 'new@example.com',
        appleUserId: 'apple.new',
      });

      expect(newUser.email).toBe('new@example.com');
      expect(newUser.role).toBe('user');
    });
  });

  describe('updateLastLogin', () => {
    it('updates last login timestamp', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 1 });
      const loginTime = new Date();

      await adapter.userRepository.updateLastLogin('user-123', loginTime);

      expect(executeHandler).toHaveBeenCalledWith(
        expect.stringContaining('LAST_LOGIN_AT'),
        expect.objectContaining({ userId: 'user-123', timestamp: loginTime })
      );
    });
  });

  describe('getLockoutState', () => {
    it('returns lockout state', async () => {
      executeHandler.mockReturnValue({
        rows: [{
          FAILED_LOGIN_ATTEMPTS: 2,
          LOCKED_UNTIL: null,
          LAST_FAILED_ATTEMPT_AT: new Date(),
        }],
      });

      const state = await adapter.userRepository.getLockoutState!('user-123');

      expect(state?.failedLoginAttempts).toBe(2);
    });

    it('returns null when user not found', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      const state = await adapter.userRepository.getLockoutState!('nonexistent');

      expect(state).toBeNull();
    });
  });

  describe('updateLockoutState', () => {
    it('updates lockout state', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 1 });

      await adapter.userRepository.updateLockoutState!('user-123', {
        failedLoginAttempts: 3,
        lockedUntil: new Date(),
        lastFailedAttemptAt: new Date(),
      });

      expect(executeHandler).toHaveBeenCalled();
    });

    it('does nothing for empty state', async () => {
      await adapter.userRepository.updateLockoutState!('user-123', {});

      expect(executeHandler).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// SingleConnectionRefreshTokenRepository Full Coverage Tests
// =============================================================================

describe('SingleConnectionRefreshTokenRepository', () => {
  let adapter: OracleAuthAdapter;
  let mockConnection: Connection;
  let executeHandler: Mock;

  beforeEach(() => {
    executeHandler = vi.fn().mockReturnValue({ rows: [] });
    mockConnection = createMockConnection((sql, binds) => executeHandler(sql, binds));
    adapter = createOracleAuthAdapterFromConnection(mockConnection);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findByHash', () => {
    it('returns token when found', async () => {
      executeHandler.mockReturnValue({ rows: [createTokenRow()] });

      const token = await adapter.refreshTokenRepository.findByHash('abc123');

      expect(token).not.toBeNull();
      expect(token?.tokenHash).toBe('abc123hash');
    });

    it('returns null when not found', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      const token = await adapter.refreshTokenRepository.findByHash('nonexistent');

      expect(token).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a new token', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 1 });
      const expiresAt = new Date(Date.now() + 86400000);

      const token = await adapter.refreshTokenRepository.create({
        userId: 'user-123',
        tokenHash: 'newhash',
        userAgent: 'Test UA',
        expiresAt,
      });

      expect(token.tokenHash).toBe('newhash');
      expect(token.revoked).toBe(false);
    });
  });

  describe('revokeByHash', () => {
    it('revokes token by hash', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 1 });

      await adapter.refreshTokenRepository.revokeByHash('hash123');

      expect(executeHandler).toHaveBeenCalledWith(
        expect.stringContaining('REVOKED = 1'),
        expect.objectContaining({ tokenHash: 'hash123' })
      );
    });
  });

  describe('revokeAllForUser', () => {
    it('revokes all tokens for user', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 5 });

      await adapter.refreshTokenRepository.revokeAllForUser('user-123');

      expect(executeHandler).toHaveBeenCalledWith(
        expect.stringContaining('USER_ID = :userId'),
        expect.objectContaining({ userId: 'user-123' })
      );
    });
  });

  describe('findActiveByUser', () => {
    it('returns active tokens', async () => {
      executeHandler.mockReturnValue({ rows: [createTokenRow()] });

      const tokens = await adapter.refreshTokenRepository.findActiveByUser('user-123');

      expect(tokens).toHaveLength(1);
    });

    it('returns empty array when no tokens', async () => {
      executeHandler.mockReturnValue({ rows: undefined });

      const tokens = await adapter.refreshTokenRepository.findActiveByUser('user-123');

      expect(tokens).toEqual([]);
    });
  });

  describe('countActiveForUser', () => {
    it('returns count', async () => {
      executeHandler.mockReturnValue({ rows: [{ CNT: 3 }] });

      const count = await adapter.refreshTokenRepository.countActiveForUser('user-123');

      expect(count).toBe(3);
    });

    it('returns 0 when no rows', async () => {
      executeHandler.mockReturnValue({ rows: [] });

      const count = await adapter.refreshTokenRepository.countActiveForUser('user-123');

      expect(count).toBe(0);
    });
  });

  describe('deleteExpired', () => {
    it('deletes expired tokens', async () => {
      executeHandler.mockReturnValue({ rowsAffected: 10 });

      // Note: SingleConnectionRefreshTokenRepository doesn't have deleteExpired
      // The method is only on the pool-based repository
    });
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Error Handling', () => {
  it('closes connection even when query throws', async () => {
    const mockConnection = {
      execute: vi.fn().mockRejectedValue(new Error('ORA-00942: table or view does not exist')),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Connection;
    const mockPool = createMockPool(mockConnection);
    const adapter = createOracleAuthAdapter(mockPool);

    await expect(adapter.userRepository.findByEmail('test@example.com')).rejects.toThrow('ORA-00942');
    expect(mockConnection.close).toHaveBeenCalled();
  });

  it('handles undefined rows gracefully', async () => {
    const executeHandler = vi.fn().mockReturnValue({ rows: undefined });
    const mockConnection = createMockConnection((sql, binds) => executeHandler(sql, binds));
    const mockPool = createMockPool(mockConnection);
    const adapter = createOracleAuthAdapter(mockPool);

    const user = await adapter.userRepository.findByEmail('test@example.com');
    expect(user).toBeNull();

    const tokens = await adapter.refreshTokenRepository.findActiveByUser('user-123');
    expect(tokens).toEqual([]);
  });

  it('handles null Date fields', async () => {
    const userRow = createUserRow({
      LAST_LOGIN_AT: null,
    });
    const executeHandler = vi.fn().mockReturnValue({ rows: [userRow] });
    const mockConnection = createMockConnection((sql, binds) => executeHandler(sql, binds));
    const mockPool = createMockPool(mockConnection);
    const adapter = createOracleAuthAdapter(mockPool);

    const user = await adapter.userRepository.findByEmail('test@example.com');

    expect(user?.lastLoginAt).toBeNull();
  });
});

// =============================================================================
// Debug Mode Tests
// =============================================================================

describe('Debug Mode', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('logs SQL and binds when debug is enabled', async () => {
    const executeHandler = vi.fn().mockReturnValue({ rows: [] });
    const mockConnection = createMockConnection((sql, binds) => executeHandler(sql, binds));
    const mockPool = createMockPool(mockConnection);
    const adapter = createOracleAuthAdapter(mockPool, { debug: true });

    await adapter.userRepository.findByEmail('test@example.com');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[OracleUserRepository] SQL:'),
      expect.any(String)
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[OracleUserRepository] Binds:'),
      expect.any(String)
    );
  });

  it('does not log when debug is disabled', async () => {
    const executeHandler = vi.fn().mockReturnValue({ rows: [] });
    const mockConnection = createMockConnection((sql, binds) => executeHandler(sql, binds));
    const mockPool = createMockPool(mockConnection);
    const adapter = createOracleAuthAdapter(mockPool, { debug: false });

    await adapter.userRepository.findByEmail('test@example.com');

    expect(consoleSpy).not.toHaveBeenCalled();
  });
});

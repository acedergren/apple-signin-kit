/**
 * Unit tests for MongoDB adapter using mongodb-memory-server.
 *
 * These tests run against an in-memory MongoDB instance, ensuring
 * complete isolation and no external database dependencies.
 *
 * @module adapter.test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMongoAuthAdapter } from './adapter.js';

describe('MongoDB Auth Adapter', () => {
  let mongoServer: MongoMemoryServer;
  let connection: mongoose.Connection;

  beforeAll(async () => {
    // Start in-memory MongoDB server
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    connection = await mongoose.createConnection(uri).asPromise();
  });

  afterAll(async () => {
    // Cleanup
    await connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all collections between tests
    const collections = connection.collections;
    for (const key in collections) {
      await collections[key]?.deleteMany({});
    }
  });

  describe('createMongoAuthAdapter', () => {
    it('should create adapter with all required components', () => {
      const adapter = createMongoAuthAdapter(connection);

      expect(adapter).toHaveProperty('userRepository');
      expect(adapter).toHaveProperty('refreshTokenRepository');
      expect(adapter).toHaveProperty('UserModel');
      expect(adapter).toHaveProperty('RefreshTokenModel');
    });

    it('should return same models for same connection (idempotent)', () => {
      const adapter1 = createMongoAuthAdapter(connection);
      const adapter2 = createMongoAuthAdapter(connection);

      expect(adapter1.UserModel).toBe(adapter2.UserModel);
      expect(adapter1.RefreshTokenModel).toBe(adapter2.RefreshTokenModel);
    });
  });

  describe('UserRepository', () => {
    describe('create', () => {
      it('should create a new user with default role', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);

        const user = await userRepository.create({
          email: 'test@example.com',
          appleUserId: 'apple-user-123',
        });

        expect(user.id).toBeDefined();
        expect(user.email).toBe('test@example.com');
        expect(user.appleUserId).toBe('apple-user-123');
        expect(user.role).toBe('user');
        expect(user.createdAt).toBeInstanceOf(Date);
        expect(user.lastLoginAt).toBeInstanceOf(Date);
      });

      it('should create a user with admin role', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);

        const user = await userRepository.create({
          email: 'admin@example.com',
          appleUserId: 'apple-admin-123',
          role: 'admin',
        });

        expect(user.role).toBe('admin');
      });

      it('should normalize email to lowercase', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);

        const user = await userRepository.create({
          email: 'Test.User@EXAMPLE.COM',
          appleUserId: 'apple-user-456',
        });

        expect(user.email).toBe('test.user@example.com');
      });
    });

    describe('findByAppleUserId', () => {
      it('should find user by Apple user ID', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);
        const created = await userRepository.create({
          email: 'findme@example.com',
          appleUserId: 'apple-findme-123',
        });

        const found = await userRepository.findByAppleUserId('apple-findme-123');

        expect(found).not.toBeNull();
        expect(found?.id).toBe(created.id);
        expect(found?.email).toBe('findme@example.com');
      });

      it('should return null for non-existent Apple user ID', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);

        const found = await userRepository.findByAppleUserId('non-existent');

        expect(found).toBeNull();
      });
    });

    describe('findByEmail', () => {
      it('should find user by email', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);
        await userRepository.create({
          email: 'email-test@example.com',
          appleUserId: 'apple-email-123',
        });

        const found = await userRepository.findByEmail('email-test@example.com');

        expect(found).not.toBeNull();
        expect(found?.email).toBe('email-test@example.com');
      });

      it('should find user with case-insensitive email', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);
        await userRepository.create({
          email: 'case@example.com',
          appleUserId: 'apple-case-123',
        });

        const found = await userRepository.findByEmail('CASE@example.com');

        expect(found).not.toBeNull();
        expect(found?.email).toBe('case@example.com');
      });

      it('should return null for non-existent email', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);

        const found = await userRepository.findByEmail('nonexistent@example.com');

        expect(found).toBeNull();
      });
    });

    describe('findById', () => {
      it('should find user by ID', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);
        const created = await userRepository.create({
          email: 'findbyid@example.com',
          appleUserId: 'apple-id-123',
        });

        const found = await userRepository.findById(created.id);

        expect(found).not.toBeNull();
        expect(found?.id).toBe(created.id);
      });

      it('should return null for invalid ObjectId format', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);

        const found = await userRepository.findById('invalid-id');

        expect(found).toBeNull();
      });

      it('should return null for valid but non-existent ObjectId', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);

        const found = await userRepository.findById('507f1f77bcf86cd799439011');

        expect(found).toBeNull();
      });
    });

    describe('updateLastLogin', () => {
      it('should update last login timestamp', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);
        const created = await userRepository.create({
          email: 'update-login@example.com',
          appleUserId: 'apple-update-123',
        });

        const newTimestamp = new Date('2025-01-15T12:00:00Z');
        await userRepository.updateLastLogin(created.id, newTimestamp);

        const updated = await userRepository.findById(created.id);
        expect(updated?.lastLoginAt?.toISOString()).toBe(newTimestamp.toISOString());
      });
    });

    describe('getLockoutState', () => {
      it('should return default lockout state for new user', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);
        const created = await userRepository.create({
          email: 'lockout@example.com',
          appleUserId: 'apple-lockout-123',
        });

        const state = await userRepository.getLockoutState(created.id);

        expect(state).not.toBeNull();
        expect(state?.failedLoginAttempts).toBe(0);
        expect(state?.lockedUntil).toBeNull();
        expect(state?.lastFailedAttemptAt).toBeNull();
      });

      it('should return null for invalid ID', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);

        const state = await userRepository.getLockoutState('invalid');

        expect(state).toBeNull();
      });

      it('should return null for non-existent user', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);

        const state = await userRepository.getLockoutState('507f1f77bcf86cd799439011');

        expect(state).toBeNull();
      });
    });

    describe('updateLockoutState', () => {
      it('should increment failed login attempts', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);
        const created = await userRepository.create({
          email: 'lockout-update@example.com',
          appleUserId: 'apple-lockout-update-123',
        });

        const now = new Date();
        await userRepository.updateLockoutState(created.id, {
          failedLoginAttempts: 3,
          lastFailedAttemptAt: now,
        });

        const state = await userRepository.getLockoutState(created.id);
        expect(state?.failedLoginAttempts).toBe(3);
        expect(state?.lastFailedAttemptAt?.toISOString()).toBe(now.toISOString());
      });

      it('should set locked until date', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);
        const created = await userRepository.create({
          email: 'lockout-full@example.com',
          appleUserId: 'apple-lockout-full-123',
        });

        const lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        await userRepository.updateLockoutState(created.id, {
          failedLoginAttempts: 5,
          lockedUntil,
        });

        const state = await userRepository.getLockoutState(created.id);
        expect(state?.failedLoginAttempts).toBe(5);
        expect(state?.lockedUntil?.toISOString()).toBe(lockedUntil.toISOString());
      });

      it('should reset lockout state', async () => {
        const { userRepository } = createMongoAuthAdapter(connection);
        const created = await userRepository.create({
          email: 'lockout-reset@example.com',
          appleUserId: 'apple-lockout-reset-123',
        });

        // First lock the account
        await userRepository.updateLockoutState(created.id, {
          failedLoginAttempts: 5,
          lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
        });

        // Then reset
        await userRepository.updateLockoutState(created.id, {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastFailedAttemptAt: null,
        });

        const state = await userRepository.getLockoutState(created.id);
        expect(state?.failedLoginAttempts).toBe(0);
        expect(state?.lockedUntil).toBeNull();
      });
    });
  });

  describe('RefreshTokenRepository', () => {
    describe('create', () => {
      it('should create a refresh token', async () => {
        const { userRepository, refreshTokenRepository } = createMongoAuthAdapter(connection);
        const user = await userRepository.create({
          email: 'token-user@example.com',
          appleUserId: 'apple-token-123',
        });

        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        const token = await refreshTokenRepository.create({
          userId: user.id,
          tokenHash: 'sha256-hash-value-12345',
          userAgent: 'Mozilla/5.0 Test Browser',
          expiresAt,
        });

        expect(token.id).toBeDefined();
        expect(token.userId).toBe(user.id);
        expect(token.tokenHash).toBe('sha256-hash-value-12345');
        expect(token.userAgent).toBe('Mozilla/5.0 Test Browser');
        expect(token.revoked).toBe(false);
        expect(token.createdAt).toBeInstanceOf(Date);
      });

      it('should create token without user agent', async () => {
        const { userRepository, refreshTokenRepository } = createMongoAuthAdapter(connection);
        const user = await userRepository.create({
          email: 'token-noua@example.com',
          appleUserId: 'apple-noua-123',
        });

        const token = await refreshTokenRepository.create({
          userId: user.id,
          tokenHash: 'sha256-hash-noua-12345',
          userAgent: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        expect(token.userAgent).toBeNull();
      });
    });

    describe('findByHash', () => {
      it('should find token by hash', async () => {
        const { userRepository, refreshTokenRepository } = createMongoAuthAdapter(connection);
        const user = await userRepository.create({
          email: 'find-token@example.com',
          appleUserId: 'apple-find-token-123',
        });

        const created = await refreshTokenRepository.create({
          userId: user.id,
          tokenHash: 'unique-hash-find-me',
          userAgent: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        const found = await refreshTokenRepository.findByHash('unique-hash-find-me');

        expect(found).not.toBeNull();
        expect(found?.id).toBe(created.id);
        expect(found?.tokenHash).toBe('unique-hash-find-me');
      });

      it('should return null for non-existent hash', async () => {
        const { refreshTokenRepository } = createMongoAuthAdapter(connection);

        const found = await refreshTokenRepository.findByHash('non-existent-hash');

        expect(found).toBeNull();
      });
    });

    describe('revokeByHash', () => {
      it('should delete token by hash', async () => {
        const { userRepository, refreshTokenRepository } = createMongoAuthAdapter(connection);
        const user = await userRepository.create({
          email: 'revoke-token@example.com',
          appleUserId: 'apple-revoke-123',
        });

        await refreshTokenRepository.create({
          userId: user.id,
          tokenHash: 'hash-to-revoke',
          userAgent: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        await refreshTokenRepository.revokeByHash('hash-to-revoke');

        const found = await refreshTokenRepository.findByHash('hash-to-revoke');
        expect(found).toBeNull();
      });

      it('should not throw for non-existent hash', async () => {
        const { refreshTokenRepository } = createMongoAuthAdapter(connection);

        await expect(
          refreshTokenRepository.revokeByHash('non-existent-hash')
        ).resolves.not.toThrow();
      });
    });

    describe('revokeAllForUser', () => {
      it('should delete all tokens for a user', async () => {
        const { userRepository, refreshTokenRepository } = createMongoAuthAdapter(connection);
        const user = await userRepository.create({
          email: 'revoke-all@example.com',
          appleUserId: 'apple-revoke-all-123',
        });

        // Create multiple tokens
        await refreshTokenRepository.create({
          userId: user.id,
          tokenHash: 'hash-1',
          userAgent: 'Device 1',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
        await refreshTokenRepository.create({
          userId: user.id,
          tokenHash: 'hash-2',
          userAgent: 'Device 2',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
        await refreshTokenRepository.create({
          userId: user.id,
          tokenHash: 'hash-3',
          userAgent: 'Device 3',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        await refreshTokenRepository.revokeAllForUser(user.id);

        const active = await refreshTokenRepository.findActiveByUser(user.id);
        expect(active).toHaveLength(0);
      });
    });

    describe('findActiveByUser', () => {
      it('should return only active tokens', async () => {
        const { userRepository, refreshTokenRepository, RefreshTokenModel } =
          createMongoAuthAdapter(connection);
        const user = await userRepository.create({
          email: 'active-tokens@example.com',
          appleUserId: 'apple-active-123',
        });

        // Active token
        await refreshTokenRepository.create({
          userId: user.id,
          tokenHash: 'active-hash',
          userAgent: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        // Expired token (manually insert to bypass validation)
        await RefreshTokenModel.create({
          userId: user.id,
          tokenHash: 'expired-hash',
          expiresAt: new Date(Date.now() - 1000), // Already expired
          revoked: false,
        });

        // Revoked token
        await RefreshTokenModel.create({
          userId: user.id,
          tokenHash: 'revoked-hash',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          revoked: true,
        });

        const active = await refreshTokenRepository.findActiveByUser(user.id);

        expect(active).toHaveLength(1);
        expect(active[0]?.tokenHash).toBe('active-hash');
      });
    });

    describe('countActiveForUser', () => {
      it('should count active sessions', async () => {
        const { userRepository, refreshTokenRepository } = createMongoAuthAdapter(connection);
        const user = await userRepository.create({
          email: 'count-tokens@example.com',
          appleUserId: 'apple-count-123',
        });

        await refreshTokenRepository.create({
          userId: user.id,
          tokenHash: 'count-hash-1',
          userAgent: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
        await refreshTokenRepository.create({
          userId: user.id,
          tokenHash: 'count-hash-2',
          userAgent: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        const count = await refreshTokenRepository.countActiveForUser(user.id);

        expect(count).toBe(2);
      });

      it('should return 0 for user with no tokens', async () => {
        const { userRepository, refreshTokenRepository } = createMongoAuthAdapter(connection);
        const user = await userRepository.create({
          email: 'no-tokens@example.com',
          appleUserId: 'apple-no-tokens-123',
        });

        const count = await refreshTokenRepository.countActiveForUser(user.id);

        expect(count).toBe(0);
      });
    });

    describe('deleteExpired', () => {
      it('should delete expired tokens', async () => {
        const { userRepository, refreshTokenRepository, RefreshTokenModel } =
          createMongoAuthAdapter(connection);
        const user = await userRepository.create({
          email: 'delete-expired@example.com',
          appleUserId: 'apple-delete-expired-123',
        });

        // Active token
        await refreshTokenRepository.create({
          userId: user.id,
          tokenHash: 'keep-hash',
          userAgent: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        // Expired tokens
        await RefreshTokenModel.create({
          userId: user.id,
          tokenHash: 'delete-hash-1',
          expiresAt: new Date(Date.now() - 1000),
          revoked: false,
        });
        await RefreshTokenModel.create({
          userId: user.id,
          tokenHash: 'delete-hash-2',
          expiresAt: new Date(Date.now() - 60000),
          revoked: false,
        });

        const deleted = await refreshTokenRepository.deleteExpired();

        expect(deleted).toBe(2);

        // Verify the active token still exists
        const found = await refreshTokenRepository.findByHash('keep-hash');
        expect(found).not.toBeNull();
      });

      it('should return 0 when no expired tokens', async () => {
        const { refreshTokenRepository } = createMongoAuthAdapter(connection);

        const deleted = await refreshTokenRepository.deleteExpired();

        expect(deleted).toBe(0);
      });
    });
  });

  describe('Model Direct Access', () => {
    it('should allow custom queries via UserModel', async () => {
      const { userRepository, UserModel } = createMongoAuthAdapter(connection);

      await userRepository.create({
        email: 'custom1@example.com',
        appleUserId: 'apple-custom-1',
        role: 'admin',
      });
      await userRepository.create({
        email: 'custom2@example.com',
        appleUserId: 'apple-custom-2',
        role: 'user',
      });
      await userRepository.create({
        email: 'custom3@example.com',
        appleUserId: 'apple-custom-3',
        role: 'admin',
      });

      const adminCount = await UserModel.countDocuments({ role: 'admin' });

      expect(adminCount).toBe(2);
    });

    it('should allow custom queries via RefreshTokenModel', async () => {
      const { userRepository, refreshTokenRepository, RefreshTokenModel } =
        createMongoAuthAdapter(connection);

      const user = await userRepository.create({
        email: 'custom-token@example.com',
        appleUserId: 'apple-custom-token-123',
      });

      await refreshTokenRepository.create({
        userId: user.id,
        tokenHash: 'custom-query-hash-1',
        userAgent: 'Chrome',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      await refreshTokenRepository.create({
        userId: user.id,
        tokenHash: 'custom-query-hash-2',
        userAgent: 'Safari',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const chromeTokens = await RefreshTokenModel.find({ userAgent: 'Chrome' });

      expect(chromeTokens).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent user creation with same email', async () => {
      const { UserModel } = createMongoAuthAdapter(connection);

      // Drop and recreate unique index on email (schema only creates non-unique)
      try {
        await UserModel.collection.dropIndex('email_1');
      } catch {
        // Index might not exist yet
      }
      await UserModel.collection.createIndex({ email: 1 }, { unique: true });

      const adapter = createMongoAuthAdapter(connection);

      await adapter.userRepository.create({
        email: 'unique@example.com',
        appleUserId: 'apple-unique-1',
      });

      // Second attempt should fail
      await expect(
        adapter.userRepository.create({
          email: 'unique@example.com',
          appleUserId: 'apple-unique-2',
        })
      ).rejects.toThrow();
    });

    it('should handle unique constraint on appleUserId', async () => {
      const adapter = createMongoAuthAdapter(connection);

      await adapter.userRepository.create({
        email: 'apple1@example.com',
        appleUserId: 'same-apple-id',
      });

      // Second attempt with same appleUserId should fail
      await expect(
        adapter.userRepository.create({
          email: 'apple2@example.com',
          appleUserId: 'same-apple-id',
        })
      ).rejects.toThrow();
    });

    it('should handle unique constraint on tokenHash', async () => {
      const { userRepository, refreshTokenRepository } = createMongoAuthAdapter(connection);

      const user = await userRepository.create({
        email: 'hash-unique@example.com',
        appleUserId: 'apple-hash-unique',
      });

      await refreshTokenRepository.create({
        userId: user.id,
        tokenHash: 'duplicate-hash',
        userAgent: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      // Second attempt with same hash should fail
      await expect(
        refreshTokenRepository.create({
          userId: user.id,
          tokenHash: 'duplicate-hash',
          userAgent: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
      ).rejects.toThrow();
    });
  });
});

describe('MongoDB Auth Adapter with Default Connection', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear collections
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key]?.deleteMany({});
    }
  });

  it('should work with default mongoose.connection', async () => {
    const adapter = createMongoAuthAdapter();

    const user = await adapter.userRepository.create({
      email: 'default-conn@example.com',
      appleUserId: 'apple-default-123',
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe('default-conn@example.com');
  });
});

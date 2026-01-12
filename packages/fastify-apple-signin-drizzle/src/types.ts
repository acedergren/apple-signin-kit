/**
 * Type definitions for Drizzle ORM auth adapter.
 *
 * This module contains all interfaces and types used throughout the adapter.
 *
 * @module types
 */

import type { SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { MySqlColumn } from 'drizzle-orm/mysql-core';

// =============================================================================
// USER TYPES
// =============================================================================

/**
 * Authenticated user information.
 * Matches the AuthUser interface from @acedergren/fastify-apple-auth.
 */
export interface AuthUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  appleUserId?: string | null;
  createdAt: Date;
  lastLoginAt?: Date | null;
}

/**
 * Data required to create a new user.
 */
export interface NewAuthUser {
  email: string;
  appleUserId: string;
  role?: 'user' | 'admin';
}

/**
 * Account lockout state for a user.
 */
export interface UserLockoutState {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastFailedAttemptAt: Date | null;
}

// =============================================================================
// REFRESH TOKEN TYPES
// =============================================================================

/**
 * Refresh token stored in database.
 */
export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  userAgent: string | null;
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt?: Date | null;
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
// REPOSITORY INTERFACES
// =============================================================================

/**
 * User repository interface for database operations.
 */
export interface UserRepository {
  findByAppleUserId(appleUserId: string): Promise<AuthUser | null>;
  findByEmail(email: string): Promise<AuthUser | null>;
  findById(id: string): Promise<AuthUser | null>;
  create(data: NewAuthUser): Promise<AuthUser>;
  updateLastLogin(userId: string, timestamp: Date): Promise<void>;
  getLockoutState?(userId: string): Promise<UserLockoutState | null>;
  updateLockoutState?(
    userId: string,
    state: Partial<UserLockoutState>
  ): Promise<void>;
}

/**
 * Refresh token repository interface.
 */
export interface RefreshTokenRepository {
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  create(data: NewRefreshToken): Promise<RefreshToken>;
  revokeByHash(tokenHash: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  findActiveByUser(userId: string): Promise<RefreshToken[]>;
  countActiveForUser(userId: string): Promise<number>;
  deleteExpired?(): Promise<number>;
}

// =============================================================================
// DATABASE TYPES
// =============================================================================

/** Union type for any Drizzle column across dialects */
export type AnyColumn = SQLiteColumn | PgColumn | MySqlColumn;

/**
 * Schema columns required for the users table.
 */
export interface UserTableSchema {
  id: AnyColumn;
  email: AnyColumn;
  appleUserId: AnyColumn;
  role: AnyColumn;
  createdAt: AnyColumn;
  lastLoginAt: AnyColumn;
  failedLoginAttempts: AnyColumn;
  lockedUntil: AnyColumn;
  lastFailedAttemptAt: AnyColumn;
}

/**
 * Schema columns required for the refresh tokens table.
 */
export interface RefreshTokenTableSchema {
  id: AnyColumn;
  userId: AnyColumn;
  tokenHash: AnyColumn;
  userAgent: AnyColumn;
  expiresAt: AnyColumn;
  createdAt: AnyColumn;
  lastUsedAt: AnyColumn;
  revoked: AnyColumn;
}

/**
 * Schema configuration for the adapter.
 */
export interface DrizzleAuthSchema {
  /** The users table from your schema */
  users: { [K in keyof UserTableSchema]: AnyColumn } & { _: { name: string } };
  /** The refresh tokens table from your schema */
  refreshTokens: { [K in keyof RefreshTokenTableSchema]: AnyColumn } & {
    _: { name: string };
  };
}

/**
 * Drizzle database interface - minimal interface needed for queries.
 * Works with PostgreSQL, MySQL, and SQLite Drizzle instances.
 */
export interface DrizzleDb {
  select(fields?: Record<string, unknown>): {
    from(table: unknown): {
      where(condition: SQL): {
        limit(n: number): Promise<unknown[]>;
      } & Promise<unknown[]>;
    };
  };
  insert(table: unknown): {
    values(data: Record<string, unknown>): Promise<unknown>;
  };
  update(table: unknown): {
    set(data: Record<string, unknown>): {
      where(condition: SQL): Promise<unknown>;
    };
  };
  delete(table: unknown): {
    where(condition: SQL): Promise<unknown>;
  };
}

// =============================================================================
// ADAPTER TYPES
// =============================================================================

/**
 * Options for the adapter.
 */
export interface DrizzleAuthAdapterOptions {
  /**
   * Function to generate unique IDs for new records.
   * Defaults to crypto.randomUUID().
   */
  generateId?: () => string;
}

/**
 * Combined auth adapter result.
 */
export interface DrizzleAuthAdapter {
  userRepository: UserRepository;
  refreshTokenRepository: RefreshTokenRepository;
}

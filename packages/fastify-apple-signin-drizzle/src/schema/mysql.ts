/**
 * MySQL Drizzle schema for Apple Sign-In authentication.
 *
 * Use this schema with drizzle-orm/mysql-core for MySQL databases.
 *
 * @example
 * ```typescript
 * import { mysqlUsers, mysqlRefreshTokens } from '@acedergren/fastify-apple-signin-drizzle/schema/mysql';
 * import { drizzle } from 'drizzle-orm/mysql2';
 *
 * const db = drizzle(mysql.createPool(config), {
 *   schema: { users: mysqlUsers, refreshTokens: mysqlRefreshTokens },
 *   mode: 'default'
 * });
 * ```
 *
 * @module schema/mysql
 */

import {
  mysqlTable,
  varchar,
  timestamp,
  boolean,
  int,
  index,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';

/**
 * MySQL users table for Apple Sign-In authentication.
 *
 * Stores user accounts created via Apple Sign-In OAuth flow.
 * The appleUserId is Apple's unique identifier (sub claim from ID token).
 */
export const mysqlUsers = mysqlTable(
  'auth_users',
  {
    /** UUID primary key - use crypto.randomUUID() */
    id: varchar('id', { length: 36 }).primaryKey(),

    /** User's email address (may be Apple private relay) */
    email: varchar('email', { length: 255 }).notNull(),

    /** Apple's unique user identifier (sub claim from ID token) */
    appleUserId: varchar('apple_user_id', { length: 255 }),

    /** User role for authorization */
    role: varchar('role', { length: 10, enum: ['user', 'admin'] })
      .notNull()
      .default('user'),

    /** Account creation timestamp */
    createdAt: timestamp('created_at').notNull().defaultNow(),

    /** Last successful login timestamp */
    lastLoginAt: timestamp('last_login_at'),

    // Account lockout fields (NIST 800-63B compliant)
    /** Number of consecutive failed login attempts */
    failedLoginAttempts: int('failed_login_attempts').notNull().default(0),

    /** Account locked until this timestamp */
    lockedUntil: timestamp('locked_until'),

    /** Timestamp of last failed login attempt */
    lastFailedAttemptAt: timestamp('last_failed_attempt_at'),
  },
  (table) => [
    // Unique index on Apple user ID for fast OAuth lookups
    uniqueIndex('auth_users_apple_user_id_idx').on(table.appleUserId),
    // Index on email for email-based lookups
    index('auth_users_email_idx').on(table.email),
  ]
);

/**
 * MySQL refresh tokens table.
 *
 * Stores hashed refresh tokens for session management.
 * Tokens are never stored in plaintext - only SHA-256 hashes.
 */
export const mysqlRefreshTokens = mysqlTable(
  'auth_refresh_tokens',
  {
    /** UUID primary key */
    id: varchar('id', { length: 36 }).primaryKey(),

    /** Foreign key to users table */
    userId: varchar('user_id', { length: 36 }).notNull(),

    /** SHA-256 hash of the refresh token (never store plaintext) */
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),

    /** User-Agent string for device tracking and security */
    userAgent: varchar('user_agent', { length: 512 }),

    /** Token expiration timestamp */
    expiresAt: timestamp('expires_at').notNull(),

    /** Token creation timestamp */
    createdAt: timestamp('created_at').notNull().defaultNow(),

    /** Last time this token was used for refresh */
    lastUsedAt: timestamp('last_used_at'),

    /** Soft revocation flag (alternative to deletion) */
    revoked: boolean('revoked').notNull().default(false),
  },
  (table) => [
    // Unique index on token hash for O(1) lookups
    uniqueIndex('auth_refresh_tokens_hash_idx').on(table.tokenHash),
    // Index for finding user's active sessions
    index('auth_refresh_tokens_user_id_idx').on(table.userId),
    // Composite index for cleanup queries
    index('auth_refresh_tokens_expires_revoked_idx').on(
      table.expiresAt,
      table.revoked
    ),
  ]
);

/**
 * Type inference helpers for MySQL schema.
 */
export type MysqlUser = typeof mysqlUsers.$inferSelect;
export type MysqlNewUser = typeof mysqlUsers.$inferInsert;
export type MysqlRefreshToken = typeof mysqlRefreshTokens.$inferSelect;
export type MysqlNewRefreshToken = typeof mysqlRefreshTokens.$inferInsert;

/**
 * SQLite Drizzle schema for Apple Sign-In authentication.
 *
 * Use this schema with drizzle-orm/sqlite-core for SQLite databases.
 *
 * @example
 * ```typescript
 * import { sqliteUsers, sqliteRefreshTokens } from '@acedergren/fastify-apple-signin-drizzle/schema/sqlite';
 * import { drizzle } from 'drizzle-orm/better-sqlite3';
 * import Database from 'better-sqlite3';
 *
 * const db = drizzle(new Database('auth.db'), {
 *   schema: { users: sqliteUsers, refreshTokens: sqliteRefreshTokens }
 * });
 * ```
 *
 * @module schema/sqlite
 */

import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * SQLite users table for Apple Sign-In authentication.
 *
 * Stores user accounts created via Apple Sign-In OAuth flow.
 * The appleUserId is Apple's unique identifier (sub claim from ID token).
 *
 * Note: SQLite stores timestamps as INTEGER (Unix epoch) or TEXT (ISO 8601).
 * This schema uses INTEGER for efficient storage and querying.
 */
export const sqliteUsers = sqliteTable(
  'auth_users',
  {
    /** UUID primary key - use crypto.randomUUID() */
    id: text('id').primaryKey(),

    /** User's email address (may be Apple private relay) */
    email: text('email').notNull(),

    /** Apple's unique user identifier (sub claim from ID token) */
    appleUserId: text('apple_user_id'),

    /** User role for authorization ('user' or 'admin') */
    role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),

    /** Account creation timestamp (Unix epoch milliseconds) */
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),

    /** Last successful login timestamp (Unix epoch milliseconds) */
    lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),

    // Account lockout fields (NIST 800-63B compliant)
    /** Number of consecutive failed login attempts */
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),

    /** Account locked until this timestamp (Unix epoch milliseconds) */
    lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),

    /** Timestamp of last failed login attempt (Unix epoch milliseconds) */
    lastFailedAttemptAt: integer('last_failed_attempt_at', {
      mode: 'timestamp_ms',
    }),
  },
  (table) => [
    // Unique index on Apple user ID for fast OAuth lookups
    uniqueIndex('auth_users_apple_user_id_idx').on(table.appleUserId),
    // Index on email for email-based lookups
    index('auth_users_email_idx').on(table.email),
  ]
);

/**
 * SQLite refresh tokens table.
 *
 * Stores hashed refresh tokens for session management.
 * Tokens are never stored in plaintext - only SHA-256 hashes.
 */
export const sqliteRefreshTokens = sqliteTable(
  'auth_refresh_tokens',
  {
    /** UUID primary key */
    id: text('id').primaryKey(),

    /** Foreign key to users table */
    userId: text('user_id')
      .notNull()
      .references(() => sqliteUsers.id, { onDelete: 'cascade' }),

    /** SHA-256 hash of the refresh token (never store plaintext) */
    tokenHash: text('token_hash').notNull(),

    /** User-Agent string for device tracking and security */
    userAgent: text('user_agent'),

    /** Token expiration timestamp (Unix epoch milliseconds) */
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),

    /** Token creation timestamp (Unix epoch milliseconds) */
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),

    /** Last time this token was used for refresh (Unix epoch milliseconds) */
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),

    /**
     * Soft revocation flag (alternative to deletion)
     * SQLite uses 0/1 for boolean, Drizzle handles conversion
     */
    revoked: integer('revoked', { mode: 'boolean' }).notNull().default(false),
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
 * Type inference helpers for SQLite schema.
 */
export type SqliteUser = typeof sqliteUsers.$inferSelect;
export type SqliteNewUser = typeof sqliteUsers.$inferInsert;
export type SqliteRefreshToken = typeof sqliteRefreshTokens.$inferSelect;
export type SqliteNewRefreshToken = typeof sqliteRefreshTokens.$inferInsert;

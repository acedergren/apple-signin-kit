/**
 * PostgreSQL Drizzle schema for Apple Sign-In authentication.
 *
 * Use this schema with drizzle-orm/pg-core for PostgreSQL databases.
 *
 * @example
 * ```typescript
 * import { pgUsers, pgRefreshTokens } from '@acedergren/fastify-apple-signin-drizzle/schema/pg';
 * import { drizzle } from 'drizzle-orm/postgres-js';
 *
 * const db = drizzle(postgres(connectionString), {
 *   schema: { users: pgUsers, refreshTokens: pgRefreshTokens }
 * });
 * ```
 *
 * @module schema/pg
 */

import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * PostgreSQL users table for Apple Sign-In authentication.
 *
 * Stores user accounts created via Apple Sign-In OAuth flow.
 * The appleUserId is Apple's unique identifier (sub claim from ID token).
 */
export const pgUsers = pgTable(
  'auth_users',
  {
    /** UUID primary key - use crypto.randomUUID() or uuid_generate_v4() */
    id: text('id').primaryKey(),

    /** User's email address (may be Apple private relay) */
    email: text('email').notNull(),

    /** Apple's unique user identifier (sub claim from ID token) */
    appleUserId: text('apple_user_id'),

    /** User role for authorization */
    role: text('role', { enum: ['user', 'admin'] })
      .notNull()
      .default('user'),

    /** Account creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Last successful login timestamp */
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

    // Account lockout fields (NIST 800-63B compliant)
    /** Number of consecutive failed login attempts */
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),

    /** Account locked until this timestamp */
    lockedUntil: timestamp('locked_until', { withTimezone: true }),

    /** Timestamp of last failed login attempt */
    lastFailedAttemptAt: timestamp('last_failed_attempt_at', {
      withTimezone: true,
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
 * PostgreSQL refresh tokens table.
 *
 * Stores hashed refresh tokens for session management.
 * Tokens are never stored in plaintext - only SHA-256 hashes.
 */
export const pgRefreshTokens = pgTable(
  'auth_refresh_tokens',
  {
    /** UUID primary key */
    id: text('id').primaryKey(),

    /** Foreign key to users table */
    userId: text('user_id')
      .notNull()
      .references(() => pgUsers.id, { onDelete: 'cascade' }),

    /** SHA-256 hash of the refresh token (never store plaintext) */
    tokenHash: text('token_hash').notNull(),

    /** User-Agent string for device tracking and security */
    userAgent: text('user_agent'),

    /** Token expiration timestamp */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    /** Token creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Last time this token was used for refresh */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),

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
 * Type inference helpers for PostgreSQL schema.
 */
export type PgUser = typeof pgUsers.$inferSelect;
export type PgNewUser = typeof pgUsers.$inferInsert;
export type PgRefreshToken = typeof pgRefreshTokens.$inferSelect;
export type PgNewRefreshToken = typeof pgRefreshTokens.$inferInsert;

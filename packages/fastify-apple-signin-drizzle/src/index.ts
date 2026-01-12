/**
 * Drizzle ORM adapter for @acedergren/fastify-apple-auth.
 *
 * This package provides a database adapter that implements the UserRepository
 * and RefreshTokenRepository interfaces required by fastify-apple-auth,
 * using Drizzle ORM as the database layer.
 *
 * Supports PostgreSQL, MySQL, and SQLite with the same API.
 *
 * @packageDocumentation
 *
 * @example PostgreSQL
 * ```typescript
 * import { drizzle } from 'drizzle-orm/postgres-js';
 * import postgres from 'postgres';
 * import { createDrizzleAuthAdapter } from '@acedergren/fastify-apple-signin-drizzle';
 * import { pgUsers, pgRefreshTokens } from '@acedergren/fastify-apple-signin-drizzle/schema/pg';
 *
 * const db = drizzle(postgres(process.env.DATABASE_URL));
 * const { userRepository, refreshTokenRepository } = createDrizzleAuthAdapter(db, {
 *   users: pgUsers,
 *   refreshTokens: pgRefreshTokens
 * });
 * ```
 *
 * @example MySQL
 * ```typescript
 * import { drizzle } from 'drizzle-orm/mysql2';
 * import mysql from 'mysql2/promise';
 * import { createDrizzleAuthAdapter } from '@acedergren/fastify-apple-signin-drizzle';
 * import { mysqlUsers, mysqlRefreshTokens } from '@acedergren/fastify-apple-signin-drizzle/schema/mysql';
 *
 * const pool = mysql.createPool(process.env.DATABASE_URL);
 * const db = drizzle(pool);
 * const { userRepository, refreshTokenRepository } = createDrizzleAuthAdapter(db, {
 *   users: mysqlUsers,
 *   refreshTokens: mysqlRefreshTokens
 * });
 * ```
 *
 * @example SQLite
 * ```typescript
 * import { drizzle } from 'drizzle-orm/better-sqlite3';
 * import Database from 'better-sqlite3';
 * import { createDrizzleAuthAdapter } from '@acedergren/fastify-apple-signin-drizzle';
 * import { sqliteUsers, sqliteRefreshTokens } from '@acedergren/fastify-apple-signin-drizzle/schema/sqlite';
 *
 * const sqlite = new Database('auth.db');
 * const db = drizzle(sqlite);
 * const { userRepository, refreshTokenRepository } = createDrizzleAuthAdapter(db, {
 *   users: sqliteUsers,
 *   refreshTokens: sqliteRefreshTokens
 * });
 * ```
 */

// =============================================================================
// ADAPTER EXPORTS
// =============================================================================

export {
  createDrizzleAuthAdapter,
  createPgAuthAdapter,
  createMysqlAuthAdapter,
  createSqliteAuthAdapter,
} from './adapter.js';

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  // Core types
  AuthUser,
  NewAuthUser,
  RefreshToken,
  NewRefreshToken,
  UserLockoutState,
  // Repository interfaces
  UserRepository,
  RefreshTokenRepository,
  // Adapter types
  DrizzleAuthAdapter,
  DrizzleAuthSchema,
  DrizzleAuthAdapterOptions,
  // Database types
  DrizzleDb,
  AnyColumn,
  UserTableSchema,
  RefreshTokenTableSchema,
} from './types.js';

// =============================================================================
// REPOSITORY CLASS EXPORTS
// =============================================================================

export { DrizzleUserRepository } from './repositories/user.js';
export { DrizzleRefreshTokenRepository } from './repositories/refresh-token.js';

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

export { defaultGenerateId, toAuthUser, toRefreshToken } from './utils.js';

// =============================================================================
// SCHEMA EXPORTS (for convenience - also available via subpath exports)
// =============================================================================

// PostgreSQL schema
export {
  pgUsers,
  pgRefreshTokens,
  type PgUser,
  type PgNewUser,
  type PgRefreshToken,
  type PgNewRefreshToken,
} from './schema/pg.js';

// MySQL schema
export {
  mysqlUsers,
  mysqlRefreshTokens,
  type MysqlUser,
  type MysqlNewUser,
  type MysqlRefreshToken,
  type MysqlNewRefreshToken,
} from './schema/mysql.js';

// SQLite schema
export {
  sqliteUsers,
  sqliteRefreshTokens,
  type SqliteUser,
  type SqliteNewUser,
  type SqliteRefreshToken,
  type SqliteNewRefreshToken,
} from './schema/sqlite.js';

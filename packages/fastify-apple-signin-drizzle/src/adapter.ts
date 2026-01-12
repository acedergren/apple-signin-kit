/**
 * Drizzle ORM adapter for @acedergren/fastify-apple-auth.
 *
 * This adapter provides factory functions to create UserRepository and
 * RefreshTokenRepository implementations using Drizzle ORM. It supports
 * PostgreSQL, MySQL, and SQLite databases.
 *
 * @example
 * ```typescript
 * // PostgreSQL
 * import { drizzle } from 'drizzle-orm/postgres-js';
 * import { createDrizzleAuthAdapter } from '@acedergren/fastify-apple-signin-drizzle';
 * import { pgUsers, pgRefreshTokens } from '@acedergren/fastify-apple-signin-drizzle/schema/pg';
 *
 * const db = drizzle(postgres(connectionString));
 * const { userRepository, refreshTokenRepository } = createDrizzleAuthAdapter(db, {
 *   users: pgUsers,
 *   refreshTokens: pgRefreshTokens
 * });
 * ```
 *
 * @example
 * ```typescript
 * // MySQL
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
 * @example
 * ```typescript
 * // SQLite
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
 *
 * @module adapter
 */

import type {
  DrizzleAuthAdapter,
  DrizzleAuthSchema,
  DrizzleAuthAdapterOptions,
  DrizzleDb,
} from './types.js';
import { DrizzleUserRepository } from './repositories/user.js';
import { DrizzleRefreshTokenRepository } from './repositories/refresh-token.js';
import { defaultGenerateId } from './utils.js';

/**
 * Creates a Drizzle-based auth adapter for @acedergren/fastify-apple-auth.
 *
 * This adapter works with PostgreSQL, MySQL, and SQLite databases.
 * Pass your Drizzle database instance and schema tables.
 *
 * @param db - Drizzle database instance (postgres, mysql, or sqlite)
 * @param schema - Schema containing users and refreshTokens tables
 * @param options - Optional configuration
 * @returns UserRepository and RefreshTokenRepository implementations
 *
 * @example
 * ```typescript
 * // PostgreSQL
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
 *
 * // Use with fastify-apple-auth
 * await fastify.register(appleAuth, {
 *   auth: { userRepository, refreshTokenRepository },
 *   config: { ... }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // MySQL
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
 * @example
 * ```typescript
 * // SQLite
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
export function createDrizzleAuthAdapter(
  db: DrizzleDb,
  schema: DrizzleAuthSchema,
  options: DrizzleAuthAdapterOptions = {}
): DrizzleAuthAdapter {
  const { generateId = defaultGenerateId } = options;
  const { users, refreshTokens } = schema;

  const userRepository = new DrizzleUserRepository(db, users, generateId);
  const refreshTokenRepository = new DrizzleRefreshTokenRepository(
    db,
    refreshTokens,
    generateId
  );

  return {
    userRepository,
    refreshTokenRepository,
  };
}

// =============================================================================
// CONVENIENCE FACTORY FUNCTIONS
// =============================================================================

/**
 * Creates a PostgreSQL Drizzle auth adapter.
 * Convenience wrapper that imports the PostgreSQL schema automatically.
 *
 * @param db - Drizzle PostgreSQL database instance
 * @param schema - PostgreSQL schema with pgUsers and pgRefreshTokens
 * @param options - Optional configuration
 *
 * @example
 * ```typescript
 * import { drizzle } from 'drizzle-orm/postgres-js';
 * import postgres from 'postgres';
 * import { createPgAuthAdapter } from '@acedergren/fastify-apple-signin-drizzle';
 * import { pgUsers, pgRefreshTokens } from '@acedergren/fastify-apple-signin-drizzle/schema/pg';
 *
 * const db = drizzle(postgres(process.env.DATABASE_URL));
 * const { userRepository, refreshTokenRepository } = createPgAuthAdapter(db, {
 *   users: pgUsers,
 *   refreshTokens: pgRefreshTokens
 * });
 * ```
 */
export const createPgAuthAdapter = createDrizzleAuthAdapter;

/**
 * Creates a MySQL Drizzle auth adapter.
 * Convenience wrapper that imports the MySQL schema automatically.
 *
 * @param db - Drizzle MySQL database instance
 * @param schema - MySQL schema with mysqlUsers and mysqlRefreshTokens
 * @param options - Optional configuration
 *
 * @example
 * ```typescript
 * import { drizzle } from 'drizzle-orm/mysql2';
 * import mysql from 'mysql2/promise';
 * import { createMysqlAuthAdapter } from '@acedergren/fastify-apple-signin-drizzle';
 * import { mysqlUsers, mysqlRefreshTokens } from '@acedergren/fastify-apple-signin-drizzle/schema/mysql';
 *
 * const pool = mysql.createPool(process.env.DATABASE_URL);
 * const db = drizzle(pool);
 * const { userRepository, refreshTokenRepository } = createMysqlAuthAdapter(db, {
 *   users: mysqlUsers,
 *   refreshTokens: mysqlRefreshTokens
 * });
 * ```
 */
export const createMysqlAuthAdapter = createDrizzleAuthAdapter;

/**
 * Creates a SQLite Drizzle auth adapter.
 * Convenience wrapper that imports the SQLite schema automatically.
 *
 * @param db - Drizzle SQLite database instance
 * @param schema - SQLite schema with sqliteUsers and sqliteRefreshTokens
 * @param options - Optional configuration
 *
 * @example
 * ```typescript
 * import { drizzle } from 'drizzle-orm/better-sqlite3';
 * import Database from 'better-sqlite3';
 * import { createSqliteAuthAdapter } from '@acedergren/fastify-apple-signin-drizzle';
 * import { sqliteUsers, sqliteRefreshTokens } from '@acedergren/fastify-apple-signin-drizzle/schema/sqlite';
 *
 * const sqlite = new Database('auth.db');
 * const db = drizzle(sqlite);
 * const { userRepository, refreshTokenRepository } = createSqliteAuthAdapter(db, {
 *   users: sqliteUsers,
 *   refreshTokens: sqliteRefreshTokens
 * });
 * ```
 */
export const createSqliteAuthAdapter = createDrizzleAuthAdapter;

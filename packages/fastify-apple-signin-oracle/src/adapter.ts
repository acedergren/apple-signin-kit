/**
 * Oracle Database Adapter for fastify-apple-signin
 *
 * Provides Oracle-specific implementations of UserRepository and RefreshTokenRepository
 * interfaces from @acedergren/fastify-apple-signin.
 *
 * @module adapter
 */

import type { OraclePool, OracleConnection, OracleAuthAdapter, OracleAdapterConfig } from './types.js';
import { OracleUserRepository, SingleConnectionUserRepository } from './repositories/user.js';
import {
  OracleRefreshTokenRepository,
  SingleConnectionRefreshTokenRepository,
} from './repositories/refresh-token.js';

/**
 * Create an Oracle adapter for fastify-apple-auth.
 *
 * This factory function creates UserRepository and RefreshTokenRepository
 * implementations backed by Oracle Database.
 *
 * @example
 * ```typescript
 * import oracledb from 'oracledb';
 * import { createOracleAuthAdapter } from '@acedergren/fastify-apple-signin-oracle';
 *
 * // Create Oracle connection pool
 * const pool = await oracledb.createPool({
 *   user: 'myuser',
 *   password: 'mypassword',
 *   connectString: 'localhost:1521/ORCLPDB1',
 * });
 *
 * // Create adapter (ONE LINE!)
 * const { userRepository, refreshTokenRepository } = createOracleAuthAdapter(pool);
 *
 * // Use with fastify-apple-auth
 * await app.register(fastifyAppleAuth, {
 *   apple: { ... },
 *   jwt: { ... },
 *   userRepository,
 *   refreshTokenRepository,
 * });
 * ```
 *
 * @param pool - Oracle connection pool (from oracledb.createPool())
 * @param options - Optional configuration
 * @returns Object containing userRepository and refreshTokenRepository
 */
export function createOracleAuthAdapter(
  pool: OraclePool,
  options?: Partial<Omit<OracleAdapterConfig, 'pool'>>
): OracleAuthAdapter {
  const config = {
    usersTable: options?.usersTable ?? 'AUTH_USERS',
    refreshTokensTable: options?.refreshTokensTable ?? 'AUTH_REFRESH_TOKENS',
    debug: options?.debug ?? false,
  };

  return {
    userRepository: new OracleUserRepository(pool, {
      tableName: config.usersTable,
      debug: config.debug,
    }),
    refreshTokenRepository: new OracleRefreshTokenRepository(pool, {
      tableName: config.refreshTokensTable,
      debug: config.debug,
    }),
  };
}

/**
 * Convenience function to create adapter from an existing connection.
 *
 * Use this when you have a single connection instead of a pool.
 * Note: This creates a minimal "pool" wrapper around the connection.
 * For production use, prefer createOracleAuthAdapter with a real pool.
 *
 * @example
 * ```typescript
 * import oracledb from 'oracledb';
 * import { createOracleAuthAdapterFromConnection } from '@acedergren/fastify-apple-signin-oracle';
 *
 * const connection = await oracledb.getConnection({ ... });
 * const { userRepository, refreshTokenRepository } = createOracleAuthAdapterFromConnection(connection);
 * ```
 *
 * @param connection - Oracle connection
 * @param options - Optional configuration
 * @returns Object containing userRepository and refreshTokenRepository
 */
export function createOracleAuthAdapterFromConnection(
  connection: OracleConnection,
  options?: Partial<Omit<OracleAdapterConfig, 'pool'>>
): OracleAuthAdapter {
  const config = {
    usersTable: options?.usersTable ?? 'AUTH_USERS',
    refreshTokensTable: options?.refreshTokensTable ?? 'AUTH_REFRESH_TOKENS',
    debug: options?.debug ?? false,
  };

  return {
    userRepository: new SingleConnectionUserRepository(connection, {
      tableName: config.usersTable,
      debug: config.debug,
    }),
    refreshTokenRepository: new SingleConnectionRefreshTokenRepository(connection, {
      tableName: config.refreshTokensTable,
      debug: config.debug,
    }),
  };
}

// Re-export types for convenience
export type { OraclePool, OracleConnection, OracleAuthAdapter, OracleAdapterConfig };

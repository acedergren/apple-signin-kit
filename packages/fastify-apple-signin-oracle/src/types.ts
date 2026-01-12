/**
 * Type definitions for Oracle adapter
 *
 * @module types
 */

import type {
  UserRepository,
  RefreshTokenRepository,
} from '@running-days/fastify-apple-auth';
import type oracledb from 'oracledb';

// Type aliases for cleaner code
export type OraclePool = oracledb.Pool;
export type OracleConnection = oracledb.Connection;

/**
 * Result of createOracleAuthAdapter factory function.
 * Contains both repositories ready to use with fastify-apple-auth.
 */
export interface OracleAuthAdapter {
  /** User repository for authentication operations */
  userRepository: UserRepository;
  /** Refresh token repository for session management */
  refreshTokenRepository: RefreshTokenRepository;
}

/**
 * Configuration for the Oracle adapter.
 */
export interface OracleAdapterConfig {
  /**
   * Oracle connection pool.
   * Create with oracledb.createPool() before calling createOracleAuthAdapter.
   */
  pool: OraclePool;

  /**
   * Table name for users (default: 'AUTH_USERS').
   * Use this if you have a custom table name or schema prefix.
   */
  usersTable?: string;

  /**
   * Table name for refresh tokens (default: 'AUTH_REFRESH_TOKENS').
   * Use this if you have a custom table name or schema prefix.
   */
  refreshTokensTable?: string;

  /**
   * Enable query logging for debugging (default: false).
   * WARNING: Do not enable in production - may log sensitive data.
   */
  debug?: boolean;
}

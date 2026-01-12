/**
 * Type definitions for Oracle adapter
 *
 * @module types
 */

import type {
  UserRepository,
  RefreshTokenRepository,
} from '@running-days/fastify-apple-auth';

/**
 * Oracle output format constant.
 * Value 4002 = OUT_FORMAT_OBJECT (return rows as objects)
 */
export const OUT_FORMAT_OBJECT = 4002;

/**
 * Oracle bind parameters type.
 */
export type BindParameters = Record<string, unknown> | unknown[];

/**
 * Oracle query result type.
 */
export interface OracleResult<T> {
  rows?: T[];
  rowsAffected?: number;
  outBinds?: Record<string, unknown>;
}

/**
 * Minimal Oracle Connection interface.
 * Represents the subset of oracledb.Connection API we actually use.
 */
export interface OracleConnection {
  execute<T = unknown>(
    sql: string,
    binds?: BindParameters,
    options?: { outFormat?: number; autoCommit?: boolean }
  ): Promise<OracleResult<T>>;
  commit(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Minimal Oracle Pool interface.
 * Represents the subset of oracledb.Pool API we actually use.
 */
export interface OraclePool {
  getConnection(): Promise<OracleConnection>;
  close(drainTime?: number): Promise<void>;
  connectionsInUse: number;
  connectionsOpen: number;
  poolMax: number;
  poolMin: number;
}

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

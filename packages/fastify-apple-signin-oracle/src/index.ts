/**
 * Oracle Database adapter for @acedergren/fastify-apple-signin
 *
 * Provides UserRepository and RefreshTokenRepository implementations
 * backed by Oracle Database for production-grade Apple Sign-In authentication.
 *
 * @example
 * ```typescript
 * import oracledb from 'oracledb';
 * import { createOracleAuthAdapter } from '@acedergren/fastify-apple-signin-oracle';
 * import fastifyAppleAuth from '@acedergren/fastify-apple-signin';
 *
 * // 1. Create Oracle pool
 * const pool = await oracledb.createPool({
 *   user: process.env.ORACLE_USER,
 *   password: process.env.ORACLE_PASSWORD,
 *   connectString: process.env.ORACLE_CONNECT_STRING,
 * });
 *
 * // 2. Create adapter (ONE LINE!)
 * const { userRepository, refreshTokenRepository } = createOracleAuthAdapter(pool);
 *
 * // 3. Register with Fastify
 * await app.register(fastifyAppleAuth, {
 *   apple: {
 *     clientId: process.env.APPLE_CLIENT_ID,
 *     teamId: process.env.APPLE_TEAM_ID,
 *     keyId: process.env.APPLE_KEY_ID,
 *     privateKey: process.env.APPLE_PRIVATE_KEY,
 *     redirectUri: 'https://myapp.com/auth/apple/callback',
 *   },
 *   jwt: {
 *     secret: process.env.JWT_SECRET,
 *     accessTokenTtl: '15m',
 *     refreshTokenTtl: '7d',
 *   },
 *   userRepository,
 *   refreshTokenRepository,
 * });
 * ```
 *
 * @packageDocumentation
 */

// Main adapter factory functions
export {
  createOracleAuthAdapter,
  createOracleAuthAdapterFromConnection,
} from './adapter.js';

// Types
export type {
  OracleAuthAdapter,
  OracleAdapterConfig,
  OraclePool,
  OracleConnection,
} from './types.js';

// Repository classes (exported for advanced use cases)
export {
  OracleUserRepository,
  SingleConnectionUserRepository,
} from './repositories/user.js';
export {
  OracleRefreshTokenRepository,
  SingleConnectionRefreshTokenRepository,
} from './repositories/refresh-token.js';

// Utility functions (exported for advanced use cases)
export { generateUUID, fromOracleBoolean, fromOracleDate } from './utils.js';

// Re-export core types for convenience (consumers don't need separate import)
export type {
  AuthUser,
  NewAuthUser,
  RefreshToken,
  NewRefreshToken,
  UserRepository,
  RefreshTokenRepository,
  UserLockoutState,
} from '@running-days/fastify-apple-auth';

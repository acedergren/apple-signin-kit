/**
 * MongoDB/Mongoose adapter for @acedergren/fastify-apple-auth
 *
 * This package provides a zero-config MongoDB adapter for storing
 * authentication data with the fastify-apple-auth plugin.
 *
 * @packageDocumentation
 *
 * @example Quick Start
 * ```typescript
 * import mongoose from 'mongoose';
 * import Fastify from 'fastify';
 * import { createAuthRoutes } from '@acedergren/fastify-apple-auth';
 * import { createMongoAuthAdapter } from '@acedergren/fastify-apple-signin-mongodb';
 *
 * // 1. Connect to MongoDB
 * await mongoose.connect('mongodb://localhost:27017/myapp');
 *
 * // 2. Create adapter (zero config!)
 * const { userRepository, refreshTokenRepository } = createMongoAuthAdapter();
 *
 * // 3. Create Fastify app and register auth
 * const fastify = Fastify();
 * fastify.register(createAuthRoutes, {
 *   config: {
 *     apple: { clientId: '...', teamId: '...', keyId: '...', privateKey: '...', redirectUri: '...' },
 *     jwt: { secret: '...', accessTokenTtl: '15m', refreshTokenTtl: '7d' }
 *   },
 *   service: { userRepository, refreshTokenRepository }
 * });
 *
 * await fastify.listen({ port: 3000 });
 * ```
 */

// Main factory function
export { createMongoAuthAdapter } from './adapter.js';

// Types
export type {
  MongoAuthAdapter,
  RepositoryDependencies,
} from './types.js';

// Repository classes (for advanced use cases)
export { MongoUserRepository } from './repositories/user.js';
export { MongoRefreshTokenRepository } from './repositories/refresh-token.js';

// Model exports for advanced use cases
export { getUserModel, userSchema, type IUser, type UserDocument } from './models/user.js';
export {
  getRefreshTokenModel,
  refreshTokenSchema,
  type IRefreshToken,
  type RefreshTokenDocument,
} from './models/refresh-token.js';

// Re-export types from fastify-apple-auth for convenience
export type {
  AuthUser,
  NewAuthUser,
  RefreshToken,
  NewRefreshToken,
  UserRepository,
  RefreshTokenRepository,
  UserLockoutState,
  AuthService,
} from '@running-days/fastify-apple-auth';

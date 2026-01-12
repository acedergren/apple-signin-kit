/**
 * MongoDB adapter factory for fastify-apple-auth.
 *
 * This module provides a zero-config way to use MongoDB/Mongoose
 * with the fastify-apple-auth plugin.
 *
 * @module adapter
 */

import type { Connection } from 'mongoose';
import mongoose from 'mongoose';
import { getUserModel } from './models/user.js';
import { getRefreshTokenModel } from './models/refresh-token.js';
import { MongoUserRepository } from './repositories/user.js';
import { MongoRefreshTokenRepository } from './repositories/refresh-token.js';
import type { MongoAuthAdapter } from './types.js';

/**
 * Create MongoDB repositories for fastify-apple-auth.
 *
 * This is the main entry point for using MongoDB with fastify-apple-auth.
 * It returns implementations of UserRepository and RefreshTokenRepository
 * that store data in MongoDB using Mongoose.
 *
 * @param connection - Optional Mongoose connection. If not provided, uses the default mongoose.connection
 * @returns Object containing userRepository and refreshTokenRepository
 *
 * @example Using default connection
 * ```typescript
 * import mongoose from 'mongoose';
 * import { createMongoAuthAdapter } from '@acedergren/fastify-apple-signin-mongodb';
 * import { createAuthRoutes } from '@acedergren/fastify-apple-auth';
 *
 * // Connect to MongoDB
 * await mongoose.connect('mongodb://localhost:27017/myapp');
 *
 * // Create adapter (uses default mongoose.connection)
 * const { userRepository, refreshTokenRepository } = createMongoAuthAdapter();
 *
 * // Register auth routes
 * fastify.register(createAuthRoutes, {
 *   config: { ... },
 *   service: { userRepository, refreshTokenRepository }
 * });
 * ```
 *
 * @example Using a dedicated connection
 * ```typescript
 * import mongoose from 'mongoose';
 * import { createMongoAuthAdapter } from '@acedergren/fastify-apple-signin-mongodb';
 *
 * // Create a dedicated connection for auth
 * const authConnection = mongoose.createConnection('mongodb://localhost:27017/auth');
 *
 * // Create adapter with the dedicated connection
 * const { userRepository, refreshTokenRepository } = createMongoAuthAdapter(authConnection);
 * ```
 *
 * @example Accessing models directly
 * ```typescript
 * const { userRepository, UserModel, RefreshTokenModel } = createMongoAuthAdapter();
 *
 * // Use repositories for auth operations
 * const user = await userRepository.findByEmail('test@example.com');
 *
 * // Use models directly for custom queries
 * const adminCount = await UserModel.countDocuments({ role: 'admin' });
 * ```
 */
export function createMongoAuthAdapter(connection?: Connection): MongoAuthAdapter {
  // Use provided connection or fall back to default mongoose.connection
  const conn = connection ?? mongoose.connection;

  // Get or create models
  const UserModel = getUserModel(conn);
  const RefreshTokenModel = getRefreshTokenModel(conn);

  // Create repository instances
  const userRepository = new MongoUserRepository(UserModel);
  const refreshTokenRepository = new MongoRefreshTokenRepository(RefreshTokenModel);

  return {
    userRepository,
    refreshTokenRepository,
    UserModel,
    RefreshTokenModel,
  };
}

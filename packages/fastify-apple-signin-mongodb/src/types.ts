/**
 * Type definitions and interfaces for MongoDB adapter.
 *
 * This module defines the interfaces used across repositories and adapters,
 * including document conversion utilities.
 *
 * @module types
 */

import type { Connection, Model } from 'mongoose';
import type {
  AuthUser,
  RefreshToken,
  UserRepository,
  RefreshTokenRepository,
} from '@running-days/fastify-apple-auth';
import type { IUser } from './models/user.js';
import type { IRefreshToken } from './models/refresh-token.js';

/**
 * Result of createMongoAuthAdapter containing both repositories.
 */
export interface MongoAuthAdapter {
  /** User repository for authentication operations */
  userRepository: UserRepository;
  /** Refresh token repository for session management */
  refreshTokenRepository: RefreshTokenRepository;
  /** The Mongoose User model (for advanced use cases) */
  UserModel: Model<IUser>;
  /** The Mongoose RefreshToken model (for advanced use cases) */
  RefreshTokenModel: Model<IRefreshToken>;
}

/**
 * Dependencies required for repository instantiation.
 */
export interface RepositoryDependencies {
  /** The Mongoose User model */
  UserModel: Model<IUser>;
  /** The Mongoose RefreshToken model */
  RefreshTokenModel: Model<IRefreshToken>;
  /** The Mongoose connection */
  connection: Connection;
}

/**
 * Convert MongoDB ObjectId to string for external use.
 */
export function toStringId(id: unknown): string {
  if (typeof id === 'string') return id;
  if (id && typeof id === 'object' && 'toString' in id) {
    return (id as { toString(): string }).toString();
  }
  throw new Error('Invalid ObjectId');
}

/**
 * Convert a Mongoose User document to AuthUser interface.
 */
export function toAuthUser(doc: IUser & { _id: unknown }): AuthUser {
  return {
    id: toStringId(doc._id),
    email: doc.email,
    role: doc.role,
    appleUserId: doc.appleUserId,
    createdAt: doc.createdAt,
    lastLoginAt: doc.lastLoginAt,
  };
}

/**
 * Convert a Mongoose RefreshToken document to RefreshToken interface.
 */
export function toRefreshToken(doc: IRefreshToken & { _id: unknown }): RefreshToken {
  return {
    id: toStringId(doc._id),
    userId: toStringId(doc.userId),
    tokenHash: doc.tokenHash,
    userAgent: doc.userAgent,
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
    lastUsedAt: doc.lastUsedAt,
    revoked: doc.revoked,
  };
}

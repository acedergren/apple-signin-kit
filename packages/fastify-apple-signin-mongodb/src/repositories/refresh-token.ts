/**
 * MongoDB RefreshTokenRepository implementation.
 *
 * This repository provides all refresh token session management operations using Mongoose models.
 *
 * @module repositories/refresh-token
 */

import type { Model } from 'mongoose';
import type {
  RefreshToken,
  NewRefreshToken,
  RefreshTokenRepository,
} from '@running-days/fastify-apple-auth';
import type { IRefreshToken } from '../models/refresh-token.js';
import { toRefreshToken } from '../types.js';

/**
 * MongoDB implementation of RefreshTokenRepository.
 */
export class MongoRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly RefreshTokenModel: Model<IRefreshToken>) {}

  /**
   * Find a refresh token by its hash.
   */
  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const doc = await this.RefreshTokenModel.findOne({ tokenHash }).lean();
    return doc ? toRefreshToken(doc as IRefreshToken & { _id: unknown }) : null;
  }

  /**
   * Create a new refresh token.
   */
  async create(data: NewRefreshToken): Promise<RefreshToken> {
    const doc = await this.RefreshTokenModel.create({
      userId: data.userId,
      tokenHash: data.tokenHash,
      userAgent: data.userAgent,
      expiresAt: data.expiresAt,
      revoked: false,
    });
    return toRefreshToken(doc.toObject() as IRefreshToken & { _id: unknown });
  }

  /**
   * Revoke (delete) a refresh token by its hash.
   */
  async revokeByHash(tokenHash: string): Promise<void> {
    // Delete instead of soft-revoke for cleaner data
    // TTL index will clean up anyway, but immediate delete is more secure
    await this.RefreshTokenModel.deleteOne({ tokenHash });
  }

  /**
   * Revoke all refresh tokens for a user (logout from all devices).
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.RefreshTokenModel.deleteMany({ userId });
  }

  /**
   * Find all active (non-expired, non-revoked) tokens for a user.
   */
  async findActiveByUser(userId: string): Promise<RefreshToken[]> {
    const docs = await this.RefreshTokenModel.find({
      userId,
      revoked: false,
      expiresAt: { $gt: new Date() },
    }).lean();

    return docs.map((doc) => toRefreshToken(doc as IRefreshToken & { _id: unknown }));
  }

  /**
   * Count active sessions for a user.
   */
  async countActiveForUser(userId: string): Promise<number> {
    return this.RefreshTokenModel.countDocuments({
      userId,
      revoked: false,
      expiresAt: { $gt: new Date() },
    });
  }

  /**
   * Delete expired tokens (cleanup job).
   * Note: MongoDB TTL index handles this automatically, but this method
   * can be used for immediate cleanup if needed.
   */
  async deleteExpired(): Promise<number> {
    const result = await this.RefreshTokenModel.deleteMany({
      expiresAt: { $lte: new Date() },
    });
    return result.deletedCount ?? 0;
  }
}

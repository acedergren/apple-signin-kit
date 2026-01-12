/**
 * MongoDB UserRepository implementation.
 *
 * This repository provides all user authentication operations using Mongoose models.
 *
 * @module repositories/user
 */

import type { Model } from 'mongoose';
import mongoose from 'mongoose';
import type {
  AuthUser,
  NewAuthUser,
  UserRepository,
  UserLockoutState,
} from '@running-days/fastify-apple-auth';
import type { IUser } from '../models/user.js';
import { toAuthUser } from '../types.js';

/**
 * MongoDB implementation of UserRepository.
 */
export class MongoUserRepository implements UserRepository {
  constructor(private readonly UserModel: Model<IUser>) {}

  /**
   * Find a user by their Apple user ID (sub claim).
   */
  async findByAppleUserId(appleUserId: string): Promise<AuthUser | null> {
    const doc = await this.UserModel.findOne({ appleUserId }).lean();
    return doc ? toAuthUser(doc as IUser & { _id: unknown }) : null;
  }

  /**
   * Find a user by email address.
   */
  async findByEmail(email: string): Promise<AuthUser | null> {
    const doc = await this.UserModel.findOne({ email: email.toLowerCase() }).lean();
    return doc ? toAuthUser(doc as IUser & { _id: unknown }) : null;
  }

  /**
   * Find a user by their internal ID.
   */
  async findById(id: string): Promise<AuthUser | null> {
    // Validate ObjectId format to prevent MongoDB errors
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await this.UserModel.findById(id).lean();
    return doc ? toAuthUser(doc as IUser & { _id: unknown }) : null;
  }

  /**
   * Create a new user (first-time Apple Sign-In).
   */
  async create(data: NewAuthUser): Promise<AuthUser> {
    const doc = await this.UserModel.create({
      email: data.email.toLowerCase(),
      appleUserId: data.appleUserId,
      role: data.role ?? 'user',
      lastLoginAt: new Date(),
    });
    return toAuthUser(doc.toObject() as IUser & { _id: unknown });
  }

  /**
   * Update user's last login timestamp.
   */
  async updateLastLogin(userId: string, timestamp: Date): Promise<void> {
    await this.UserModel.updateOne(
      { _id: userId },
      { $set: { lastLoginAt: timestamp } }
    );
  }

  /**
   * Get account lockout state for a user.
   */
  async getLockoutState(userId: string): Promise<UserLockoutState | null> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return null;
    }
    const doc = await this.UserModel.findById(userId)
      .select('failedLoginAttempts lockedUntil lastFailedAttemptAt')
      .lean();

    if (!doc) return null;

    return {
      failedLoginAttempts: doc.failedLoginAttempts ?? 0,
      lockedUntil: doc.lockedUntil ?? null,
      lastFailedAttemptAt: doc.lastFailedAttemptAt ?? null,
    };
  }

  /**
   * Update account lockout state.
   */
  async updateLockoutState(
    userId: string,
    state: Partial<UserLockoutState>
  ): Promise<void> {
    const update: Record<string, unknown> = {};

    if (state.failedLoginAttempts !== undefined) {
      update.failedLoginAttempts = state.failedLoginAttempts;
    }
    if (state.lockedUntil !== undefined) {
      update.lockedUntil = state.lockedUntil;
    }
    if (state.lastFailedAttemptAt !== undefined) {
      update.lastFailedAttemptAt = state.lastFailedAttemptAt;
    }

    await this.UserModel.updateOne({ _id: userId }, { $set: update });
  }
}

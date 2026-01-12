/**
 * Mongoose User model for Apple Sign-In authentication.
 *
 * This model stores user accounts with Apple Sign-In integration.
 * It includes indexes optimized for authentication queries.
 *
 * @module models/user
 */

import { Schema, type Model, type Connection, type HydratedDocument } from 'mongoose';

/**
 * User document interface matching AuthUser from fastify-apple-auth.
 */
export interface IUser {
  /** User's email address (may be Apple private relay) */
  email: string;
  /** User role for authorization */
  role: 'user' | 'admin';
  /** Apple's unique user identifier (sub claim from ID token) */
  appleUserId: string | null;
  /** Account creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Last login timestamp */
  lastLoginAt: Date | null;
  /** Account lockout: number of failed login attempts */
  failedLoginAttempts: number;
  /** Account lockout: when the account is locked until */
  lockedUntil: Date | null;
  /** Account lockout: when the last failed attempt occurred */
  lastFailedAttemptAt: Date | null;
}

/**
 * Mongoose document type for User.
 */
export type UserDocument = HydratedDocument<IUser>;

/**
 * User schema definition with proper indexes for auth queries.
 */
export const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    appleUserId: {
      type: String,
      sparse: true,
      unique: true,
      index: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockedUntil: {
      type: Date,
      default: null,
    },
    lastFailedAttemptAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

// Compound index for email lookups (faster than single-field for auth)
userSchema.index({ email: 1, appleUserId: 1 });

/**
 * Get or create the User model from a Mongoose connection.
 *
 * This function safely handles cases where the model may already be registered
 * on the connection (e.g., in hot-reload scenarios).
 *
 * @param connection - Mongoose connection to use (defaults to mongoose.connection)
 * @returns User model
 *
 * @example
 * ```typescript
 * import mongoose from 'mongoose';
 * import { getUserModel } from '@acedergren/fastify-apple-signin-mongodb';
 *
 * const User = getUserModel(mongoose.connection);
 * const user = await User.findOne({ email: 'test@example.com' });
 * ```
 */
export function getUserModel(connection: Connection): Model<IUser> {
  // Check if model already exists to avoid OverwriteModelError
  if (connection.models['User']) {
    return connection.models['User'] as Model<IUser>;
  }
  return connection.model<IUser>('User', userSchema);
}

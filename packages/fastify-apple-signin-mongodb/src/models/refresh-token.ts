/**
 * Mongoose RefreshToken model for session management.
 *
 * This model stores hashed refresh tokens with automatic TTL-based expiry.
 * MongoDB will automatically delete expired tokens via the TTL index.
 *
 * @module models/refresh-token
 */

import { Schema, type Model, type Connection, type HydratedDocument, Types } from 'mongoose';

/**
 * RefreshToken document interface matching RefreshToken from fastify-apple-auth.
 */
export interface IRefreshToken {
  /** Reference to the user who owns this token */
  userId: Types.ObjectId;
  /** SHA-256 hash of the actual token (never store plaintext) */
  tokenHash: string;
  /** User-Agent string for device tracking */
  userAgent: string | null;
  /** Token expiration timestamp (TTL index will auto-delete) */
  expiresAt: Date;
  /** Token creation timestamp */
  createdAt: Date;
  /** When this token was last used for refresh */
  lastUsedAt: Date | null;
  /** Whether this token has been manually revoked */
  revoked: boolean;
}

/**
 * Mongoose document type for RefreshToken.
 */
export type RefreshTokenDocument = HydratedDocument<IRefreshToken>;

/**
 * RefreshToken schema with TTL index for automatic cleanup.
 */
export const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userAgent: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      // Note: TTL index is defined separately below (no inline index to avoid duplicates)
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    revoked: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'refresh_tokens',
  }
);

// TTL index: MongoDB will automatically delete documents when expiresAt is reached
// This provides zero-maintenance cleanup of expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for finding active tokens by user (used in session management)
refreshTokenSchema.index({ userId: 1, revoked: 1, expiresAt: 1 });

/**
 * Get or create the RefreshToken model from a Mongoose connection.
 *
 * This function safely handles cases where the model may already be registered
 * on the connection (e.g., in hot-reload scenarios).
 *
 * @param connection - Mongoose connection to use
 * @returns RefreshToken model
 *
 * @example
 * ```typescript
 * import mongoose from 'mongoose';
 * import { getRefreshTokenModel } from '@acedergren/fastify-apple-signin-mongodb';
 *
 * const RefreshToken = getRefreshTokenModel(mongoose.connection);
 * const token = await RefreshToken.findOne({ tokenHash: 'abc123...' });
 * ```
 */
export function getRefreshTokenModel(connection: Connection): Model<IRefreshToken> {
  // Check if model already exists to avoid OverwriteModelError
  if (connection.models['RefreshToken']) {
    return connection.models['RefreshToken'] as Model<IRefreshToken>;
  }
  return connection.model<IRefreshToken>('RefreshToken', refreshTokenSchema);
}

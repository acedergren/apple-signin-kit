/**
 * Refresh token repository implementation using Drizzle ORM.
 *
 * This module provides the DrizzleRefreshTokenRepository class that implements
 * the RefreshTokenRepository interface for token-related database operations.
 *
 * @module repositories/refresh-token
 */

import { eq, and, lt, or, sql } from 'drizzle-orm';
import type {
  RefreshTokenRepository,
  RefreshToken,
  NewRefreshToken,
  DrizzleDb,
  RefreshTokenTableSchema,
  AnyColumn,
} from '../types.js';
import { toRefreshToken } from '../utils.js';

/**
 * Drizzle-based implementation of RefreshTokenRepository.
 *
 * Handles all refresh token operations including creation, validation,
 * revocation, and cleanup of expired tokens.
 */
export class DrizzleRefreshTokenRepository implements RefreshTokenRepository {
  constructor(
    private db: DrizzleDb,
    private tokensTable: { [K in keyof RefreshTokenTableSchema]: AnyColumn } & {
      _: { name: string };
    },
    private generateId: () => string
  ) {}

  /**
   * Find a refresh token by its hash.
   */
  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const result = (await this.db
      .select()
      .from(this.tokensTable)
      .where(
        and(
          eq(this.tokensTable.tokenHash as AnyColumn, tokenHash),
          eq(this.tokensTable.revoked as AnyColumn, false)
        )!
      )
      .limit(1)) as Record<string, unknown>[];

    const row = result[0];
    return row ? toRefreshToken(row) : null;
  }

  /**
   * Create a new refresh token.
   */
  async create(data: NewRefreshToken): Promise<RefreshToken> {
    const id = this.generateId();
    const now = new Date();

    await this.db.insert(this.tokensTable).values({
      id,
      userId: data.userId,
      tokenHash: data.tokenHash,
      userAgent: data.userAgent,
      expiresAt: data.expiresAt,
      createdAt: now,
      lastUsedAt: null,
      revoked: false,
    });

    return {
      id,
      userId: data.userId,
      tokenHash: data.tokenHash,
      userAgent: data.userAgent,
      expiresAt: data.expiresAt,
      createdAt: now,
      lastUsedAt: null,
      revoked: false,
    };
  }

  /**
   * Revoke (soft delete) a refresh token by its hash.
   */
  async revokeByHash(tokenHash: string): Promise<void> {
    await this.db
      .update(this.tokensTable)
      .set({ revoked: true })
      .where(eq(this.tokensTable.tokenHash as AnyColumn, tokenHash));
  }

  /**
   * Revoke all refresh tokens for a user (logout from all devices).
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(this.tokensTable)
      .set({ revoked: true })
      .where(eq(this.tokensTable.userId as AnyColumn, userId));
  }

  /**
   * Find all active (non-expired, non-revoked) tokens for a user.
   */
  async findActiveByUser(userId: string): Promise<RefreshToken[]> {
    const now = new Date();

    const result = (await this.db
      .select()
      .from(this.tokensTable)
      .where(
        and(
          eq(this.tokensTable.userId as AnyColumn, userId),
          eq(this.tokensTable.revoked as AnyColumn, false),
          sql`${this.tokensTable.expiresAt} > ${now}`
        )!
      )) as Record<string, unknown>[];

    return result.map((row) => toRefreshToken(row));
  }

  /**
   * Count active sessions for a user.
   */
  async countActiveForUser(userId: string): Promise<number> {
    const now = new Date();

    const result = (await this.db
      .select({ count: sql<number>`count(*)` })
      .from(this.tokensTable)
      .where(
        and(
          eq(this.tokensTable.userId as AnyColumn, userId),
          eq(this.tokensTable.revoked as AnyColumn, false),
          sql`${this.tokensTable.expiresAt} > ${now}`
        )!
      )) as { count: number }[];

    const row = result[0];
    return row ? Number(row.count) : 0;
  }

  /**
   * Delete expired tokens (cleanup job).
   * Returns number of tokens deleted.
   */
  async deleteExpired(): Promise<number> {
    const now = new Date();

    // First count, then delete (for returning count)
    const countResult = (await this.db
      .select({ count: sql<number>`count(*)` })
      .from(this.tokensTable)
      .where(
        or(
          lt(this.tokensTable.expiresAt as AnyColumn, now),
          eq(this.tokensTable.revoked as AnyColumn, true)
        )!
      )) as { count: number }[];

    const count = countResult[0] ? Number(countResult[0].count) : 0;

    if (count > 0) {
      await this.db
        .delete(this.tokensTable)
        .where(
          or(
            lt(this.tokensTable.expiresAt as AnyColumn, now),
            eq(this.tokensTable.revoked as AnyColumn, true)
          )!
        );
    }

    return count;
  }
}

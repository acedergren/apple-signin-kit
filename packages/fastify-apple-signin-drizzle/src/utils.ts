/**
 * Utility functions for the Drizzle ORM auth adapter.
 *
 * This module contains helper functions used by the repositories.
 *
 * @module utils
 */

import type { AuthUser, RefreshToken } from './types.js';

/**
 * Generate a UUID using the built-in crypto module.
 * Falls back to a timestamp-based ID if crypto is unavailable.
 */
export function defaultGenerateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older Node.js versions
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Convert a database row to AuthUser interface.
 */
export function toAuthUser(row: Record<string, unknown>): AuthUser {
  return {
    id: row['id'] as string,
    email: row['email'] as string,
    role: (row['role'] as 'user' | 'admin') || 'user',
    appleUserId: (row['appleUserId'] as string) || null,
    createdAt: row['createdAt'] as Date,
    lastLoginAt: (row['lastLoginAt'] as Date) || null,
  };
}

/**
 * Convert a database row to RefreshToken interface.
 */
export function toRefreshToken(row: Record<string, unknown>): RefreshToken {
  return {
    id: row['id'] as string,
    userId: row['userId'] as string,
    tokenHash: row['tokenHash'] as string,
    userAgent: (row['userAgent'] as string) || null,
    expiresAt: row['expiresAt'] as Date,
    createdAt: row['createdAt'] as Date,
    lastUsedAt: (row['lastUsedAt'] as Date) || null,
    revoked: (row['revoked'] as boolean) || false,
  };
}

/**
 * User repository implementation using Drizzle ORM.
 *
 * This module provides the DrizzleUserRepository class that implements
 * the UserRepository interface for user-related database operations.
 *
 * @module repositories/user
 */

import { eq } from 'drizzle-orm';
import type {
  UserRepository,
  AuthUser,
  NewAuthUser,
  UserLockoutState,
  DrizzleDb,
  UserTableSchema,
  AnyColumn,
} from '../types.js';
import { toAuthUser } from '../utils.js';

/**
 * Drizzle-based implementation of UserRepository.
 *
 * Handles all user-related database operations including authentication,
 * user creation, and account lockout management.
 */
export class DrizzleUserRepository implements UserRepository {
  constructor(
    private db: DrizzleDb,
    private usersTable: { [K in keyof UserTableSchema]: AnyColumn } & {
      _: { name: string };
    },
    private generateId: () => string
  ) {}

  /**
   * Find a user by their Apple user ID (sub claim from ID token).
   */
  async findByAppleUserId(appleUserId: string): Promise<AuthUser | null> {
    const result = (await this.db
      .select()
      .from(this.usersTable)
      .where(eq(this.usersTable.appleUserId as AnyColumn, appleUserId))
      .limit(1)) as Record<string, unknown>[];

    const row = result[0];
    return row ? toAuthUser(row) : null;
  }

  /**
   * Find a user by email address.
   */
  async findByEmail(email: string): Promise<AuthUser | null> {
    const result = (await this.db
      .select()
      .from(this.usersTable)
      .where(eq(this.usersTable.email as AnyColumn, email))
      .limit(1)) as Record<string, unknown>[];

    const row = result[0];
    return row ? toAuthUser(row) : null;
  }

  /**
   * Find a user by their internal ID.
   */
  async findById(id: string): Promise<AuthUser | null> {
    const result = (await this.db
      .select()
      .from(this.usersTable)
      .where(eq(this.usersTable.id as AnyColumn, id))
      .limit(1)) as Record<string, unknown>[];

    const row = result[0];
    return row ? toAuthUser(row) : null;
  }

  /**
   * Create a new user (first-time Apple Sign-In).
   */
  async create(data: NewAuthUser): Promise<AuthUser> {
    const id = this.generateId();
    const now = new Date();

    await this.db.insert(this.usersTable).values({
      id,
      email: data.email,
      appleUserId: data.appleUserId,
      role: data.role || 'user',
      createdAt: now,
      lastLoginAt: now,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastFailedAttemptAt: null,
    });

    return {
      id,
      email: data.email,
      role: data.role || 'user',
      appleUserId: data.appleUserId,
      createdAt: now,
      lastLoginAt: now,
    };
  }

  /**
   * Update user's last login timestamp.
   */
  async updateLastLogin(userId: string, timestamp: Date): Promise<void> {
    await this.db
      .update(this.usersTable)
      .set({ lastLoginAt: timestamp })
      .where(eq(this.usersTable.id as AnyColumn, userId));
  }

  /**
   * Get account lockout state for a user.
   */
  async getLockoutState(userId: string): Promise<UserLockoutState | null> {
    const result = (await this.db
      .select({
        failedLoginAttempts: this.usersTable.failedLoginAttempts,
        lockedUntil: this.usersTable.lockedUntil,
        lastFailedAttemptAt: this.usersTable.lastFailedAttemptAt,
      })
      .from(this.usersTable)
      .where(eq(this.usersTable.id as AnyColumn, userId))
      .limit(1)) as Record<string, unknown>[];

    const row = result[0];
    if (!row) return null;

    return {
      failedLoginAttempts: (row['failedLoginAttempts'] as number) || 0,
      lockedUntil: (row['lockedUntil'] as Date) || null,
      lastFailedAttemptAt: (row['lastFailedAttemptAt'] as Date) || null,
    };
  }

  /**
   * Update account lockout state.
   */
  async updateLockoutState(
    userId: string,
    state: Partial<UserLockoutState>
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};

    if (state.failedLoginAttempts !== undefined) {
      updateData['failedLoginAttempts'] = state.failedLoginAttempts;
    }
    if (state.lockedUntil !== undefined) {
      updateData['lockedUntil'] = state.lockedUntil;
    }
    if (state.lastFailedAttemptAt !== undefined) {
      updateData['lastFailedAttemptAt'] = state.lastFailedAttemptAt;
    }

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(this.usersTable)
        .set(updateData)
        .where(eq(this.usersTable.id as AnyColumn, userId));
    }
  }
}

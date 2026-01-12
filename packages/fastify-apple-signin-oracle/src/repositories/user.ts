/**
 * Oracle implementation of UserRepository
 *
 * @module repositories/user
 */

import type {
  AuthUser,
  NewAuthUser,
  UserRepository,
  UserLockoutState,
} from '@running-days/fastify-apple-auth';
import oracledb from 'oracledb';
import type { OraclePool, OracleConnection } from '../types.js';
import { generateUUID, fromOracleDate } from '../utils.js';

/**
 * Oracle implementation of UserRepository (pool-based)
 */
export class OracleUserRepository implements UserRepository {
  private readonly tableName: string;
  private readonly debug: boolean;

  constructor(
    private readonly pool: OraclePool,
    config: { tableName?: string; debug?: boolean }
  ) {
    this.tableName = config.tableName ?? 'AUTH_USERS';
    this.debug = config.debug ?? false;
  }

  /**
   * Execute a query with connection management and error handling
   */
  private async execute<T>(
    sql: string,
    binds: oracledb.BindParameters,
    handler: (result: oracledb.Result<unknown>) => T
  ): Promise<T> {
    let conn: OracleConnection | undefined;
    try {
      conn = await this.pool.getConnection();

      if (this.debug) {
        console.log('[OracleUserRepository] SQL:', sql);
        console.log('[OracleUserRepository] Binds:', JSON.stringify(binds));
      }

      const result = await conn.execute(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit: true,
      });

      return handler(result);
    } finally {
      if (conn) {
        try {
          await conn.close();
        } catch {
          // Ignore close errors
        }
      }
    }
  }

  /**
   * Map Oracle row to AuthUser
   */
  private mapToUser(row: Record<string, unknown>): AuthUser {
    return {
      id: row['ID'] as string,
      email: row['EMAIL'] as string,
      role: row['ROLE'] as 'user' | 'admin',
      appleUserId: (row['APPLE_USER_ID'] as string) ?? null,
      createdAt: fromOracleDate(row['CREATED_AT'] as Date) ?? new Date(),
      lastLoginAt: fromOracleDate(row['LAST_LOGIN_AT'] as Date),
    };
  }

  async findByAppleUserId(appleUserId: string): Promise<AuthUser | null> {
    const sql = `
      SELECT ID, EMAIL, ROLE, APPLE_USER_ID, CREATED_AT, LAST_LOGIN_AT
      FROM ${this.tableName}
      WHERE APPLE_USER_ID = :appleUserId
    `;

    return this.execute(sql, { appleUserId }, (result) => {
      const rows = result.rows as Record<string, unknown>[] | undefined;
      if (!rows || rows.length === 0) return null;
      return this.mapToUser(rows[0]!);
    });
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    const sql = `
      SELECT ID, EMAIL, ROLE, APPLE_USER_ID, CREATED_AT, LAST_LOGIN_AT
      FROM ${this.tableName}
      WHERE LOWER(EMAIL) = LOWER(:email)
    `;

    return this.execute(sql, { email }, (result) => {
      const rows = result.rows as Record<string, unknown>[] | undefined;
      if (!rows || rows.length === 0) return null;
      return this.mapToUser(rows[0]!);
    });
  }

  async findById(id: string): Promise<AuthUser | null> {
    const sql = `
      SELECT ID, EMAIL, ROLE, APPLE_USER_ID, CREATED_AT, LAST_LOGIN_AT
      FROM ${this.tableName}
      WHERE ID = :id
    `;

    return this.execute(sql, { id }, (result) => {
      const rows = result.rows as Record<string, unknown>[] | undefined;
      if (!rows || rows.length === 0) return null;
      return this.mapToUser(rows[0]!);
    });
  }

  async create(data: NewAuthUser): Promise<AuthUser> {
    const id = generateUUID();
    const role = data.role ?? 'user';
    const now = new Date();

    const sql = `
      INSERT INTO ${this.tableName} (
        ID, EMAIL, APPLE_USER_ID, ROLE, CREATED_AT, FAILED_LOGIN_ATTEMPTS
      ) VALUES (
        :id, :email, :appleUserId, :role, :createdAt, 0
      )
    `;

    await this.execute(
      sql,
      {
        id,
        email: data.email,
        appleUserId: data.appleUserId,
        role,
        createdAt: now,
      },
      () => undefined
    );

    return {
      id,
      email: data.email,
      role,
      appleUserId: data.appleUserId,
      createdAt: now,
      lastLoginAt: null,
    };
  }

  async updateLastLogin(userId: string, timestamp: Date): Promise<void> {
    const sql = `
      UPDATE ${this.tableName}
      SET LAST_LOGIN_AT = :timestamp,
          FAILED_LOGIN_ATTEMPTS = 0,
          LOCKED_UNTIL = NULL,
          LAST_FAILED_ATTEMPT_AT = NULL
      WHERE ID = :userId
    `;

    await this.execute(sql, { userId, timestamp }, () => undefined);
  }

  async getLockoutState(userId: string): Promise<UserLockoutState | null> {
    const sql = `
      SELECT FAILED_LOGIN_ATTEMPTS, LOCKED_UNTIL, LAST_FAILED_ATTEMPT_AT
      FROM ${this.tableName}
      WHERE ID = :userId
    `;

    return this.execute(sql, { userId }, (result) => {
      const rows = result.rows as Record<string, unknown>[] | undefined;
      if (!rows || rows.length === 0) return null;

      const row = rows[0]!;
      return {
        failedLoginAttempts: (row['FAILED_LOGIN_ATTEMPTS'] as number) ?? 0,
        lockedUntil: fromOracleDate(row['LOCKED_UNTIL'] as Date),
        lastFailedAttemptAt: fromOracleDate(row['LAST_FAILED_ATTEMPT_AT'] as Date),
      };
    });
  }

  async updateLockoutState(userId: string, state: Partial<UserLockoutState>): Promise<void> {
    const updates: string[] = [];
    const binds: Record<string, string | number | Date | null> = { userId };

    if (state.failedLoginAttempts !== undefined) {
      updates.push('FAILED_LOGIN_ATTEMPTS = :failedLoginAttempts');
      binds['failedLoginAttempts'] = state.failedLoginAttempts;
    }

    if (state.lockedUntil !== undefined) {
      updates.push('LOCKED_UNTIL = :lockedUntil');
      binds['lockedUntil'] = state.lockedUntil;
    }

    if (state.lastFailedAttemptAt !== undefined) {
      updates.push('LAST_FAILED_ATTEMPT_AT = :lastFailedAttemptAt');
      binds['lastFailedAttemptAt'] = state.lastFailedAttemptAt;
    }

    if (updates.length === 0) return;

    const sql = `
      UPDATE ${this.tableName}
      SET ${updates.join(', ')}
      WHERE ID = :userId
    `;

    await this.execute(sql, binds, () => undefined);
  }
}

/**
 * User repository variant that uses a single connection (does not close it)
 */
export class SingleConnectionUserRepository implements UserRepository {
  private readonly tableName: string;
  private readonly debug: boolean;

  constructor(
    private readonly connection: OracleConnection,
    config: { tableName?: string; debug?: boolean }
  ) {
    this.tableName = config.tableName ?? 'AUTH_USERS';
    this.debug = config.debug ?? false;
  }

  private async execute<T>(
    sql: string,
    binds: oracledb.BindParameters,
    handler: (result: oracledb.Result<unknown>) => T
  ): Promise<T> {
    if (this.debug) {
      console.log('[SingleConnectionUserRepository] SQL:', sql);
      console.log('[SingleConnectionUserRepository] Binds:', JSON.stringify(binds));
    }

    const result = await this.connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      autoCommit: true,
    });

    return handler(result);
  }

  private mapToUser(row: Record<string, unknown>): AuthUser {
    return {
      id: row['ID'] as string,
      email: row['EMAIL'] as string,
      role: row['ROLE'] as 'user' | 'admin',
      appleUserId: (row['APPLE_USER_ID'] as string) ?? null,
      createdAt: fromOracleDate(row['CREATED_AT'] as Date) ?? new Date(),
      lastLoginAt: fromOracleDate(row['LAST_LOGIN_AT'] as Date),
    };
  }

  async findByAppleUserId(appleUserId: string): Promise<AuthUser | null> {
    const sql = `
      SELECT ID, EMAIL, ROLE, APPLE_USER_ID, CREATED_AT, LAST_LOGIN_AT
      FROM ${this.tableName}
      WHERE APPLE_USER_ID = :appleUserId
    `;

    return this.execute(sql, { appleUserId }, (result) => {
      const rows = result.rows as Record<string, unknown>[] | undefined;
      if (!rows || rows.length === 0) return null;
      return this.mapToUser(rows[0]!);
    });
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    const sql = `
      SELECT ID, EMAIL, ROLE, APPLE_USER_ID, CREATED_AT, LAST_LOGIN_AT
      FROM ${this.tableName}
      WHERE LOWER(EMAIL) = LOWER(:email)
    `;

    return this.execute(sql, { email }, (result) => {
      const rows = result.rows as Record<string, unknown>[] | undefined;
      if (!rows || rows.length === 0) return null;
      return this.mapToUser(rows[0]!);
    });
  }

  async findById(id: string): Promise<AuthUser | null> {
    const sql = `
      SELECT ID, EMAIL, ROLE, APPLE_USER_ID, CREATED_AT, LAST_LOGIN_AT
      FROM ${this.tableName}
      WHERE ID = :id
    `;

    return this.execute(sql, { id }, (result) => {
      const rows = result.rows as Record<string, unknown>[] | undefined;
      if (!rows || rows.length === 0) return null;
      return this.mapToUser(rows[0]!);
    });
  }

  async create(data: NewAuthUser): Promise<AuthUser> {
    const id = generateUUID();
    const role = data.role ?? 'user';
    const now = new Date();

    const sql = `
      INSERT INTO ${this.tableName} (
        ID, EMAIL, APPLE_USER_ID, ROLE, CREATED_AT, FAILED_LOGIN_ATTEMPTS
      ) VALUES (
        :id, :email, :appleUserId, :role, :createdAt, 0
      )
    `;

    await this.execute(
      sql,
      { id, email: data.email, appleUserId: data.appleUserId, role, createdAt: now },
      () => undefined
    );

    return {
      id,
      email: data.email,
      role,
      appleUserId: data.appleUserId,
      createdAt: now,
      lastLoginAt: null,
    };
  }

  async updateLastLogin(userId: string, timestamp: Date): Promise<void> {
    const sql = `
      UPDATE ${this.tableName}
      SET LAST_LOGIN_AT = :timestamp,
          FAILED_LOGIN_ATTEMPTS = 0,
          LOCKED_UNTIL = NULL,
          LAST_FAILED_ATTEMPT_AT = NULL
      WHERE ID = :userId
    `;

    await this.execute(sql, { userId, timestamp }, () => undefined);
  }

  async getLockoutState(userId: string): Promise<UserLockoutState | null> {
    const sql = `
      SELECT FAILED_LOGIN_ATTEMPTS, LOCKED_UNTIL, LAST_FAILED_ATTEMPT_AT
      FROM ${this.tableName}
      WHERE ID = :userId
    `;

    return this.execute(sql, { userId }, (result) => {
      const rows = result.rows as Record<string, unknown>[] | undefined;
      if (!rows || rows.length === 0) return null;

      const row = rows[0]!;
      return {
        failedLoginAttempts: (row['FAILED_LOGIN_ATTEMPTS'] as number) ?? 0,
        lockedUntil: fromOracleDate(row['LOCKED_UNTIL'] as Date),
        lastFailedAttemptAt: fromOracleDate(row['LAST_FAILED_ATTEMPT_AT'] as Date),
      };
    });
  }

  async updateLockoutState(userId: string, state: Partial<UserLockoutState>): Promise<void> {
    const updates: string[] = [];
    const binds: Record<string, string | number | Date | null> = { userId };

    if (state.failedLoginAttempts !== undefined) {
      updates.push('FAILED_LOGIN_ATTEMPTS = :failedLoginAttempts');
      binds['failedLoginAttempts'] = state.failedLoginAttempts;
    }

    if (state.lockedUntil !== undefined) {
      updates.push('LOCKED_UNTIL = :lockedUntil');
      binds['lockedUntil'] = state.lockedUntil;
    }

    if (state.lastFailedAttemptAt !== undefined) {
      updates.push('LAST_FAILED_ATTEMPT_AT = :lastFailedAttemptAt');
      binds['lastFailedAttemptAt'] = state.lastFailedAttemptAt;
    }

    if (updates.length === 0) return;

    const sql = `
      UPDATE ${this.tableName}
      SET ${updates.join(', ')}
      WHERE ID = :userId
    `;

    await this.execute(sql, binds, () => undefined);
  }
}

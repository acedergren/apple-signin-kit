/**
 * Oracle implementation of RefreshTokenRepository
 *
 * @module repositories/refresh-token
 */

import type {
  RefreshToken,
  NewRefreshToken,
  RefreshTokenRepository,
} from '@running-days/fastify-apple-auth';
import type { OraclePool, OracleConnection, BindParameters, OracleResult } from '../types.js';
import { OUT_FORMAT_OBJECT } from '../types.js';
import { generateUUID, fromOracleBoolean, fromOracleDate } from '../utils.js';

/**
 * Oracle implementation of RefreshTokenRepository (pool-based)
 */
export class OracleRefreshTokenRepository implements RefreshTokenRepository {
  private readonly tableName: string;
  private readonly debug: boolean;

  constructor(
    private readonly pool: OraclePool,
    config: { tableName?: string; debug?: boolean }
  ) {
    this.tableName = config.tableName ?? 'AUTH_REFRESH_TOKENS';
    this.debug = config.debug ?? false;
  }

  /**
   * Execute a query with connection management and error handling
   */
  private async execute<T>(
    sql: string,
    binds: BindParameters,
    handler: (result: OracleResult<unknown>) => T
  ): Promise<T> {
    let conn: OracleConnection | undefined;
    try {
      conn = await this.pool.getConnection();

      if (this.debug) {
        console.log('[OracleRefreshTokenRepository] SQL:', sql);
        console.log('[OracleRefreshTokenRepository] Binds:', JSON.stringify(binds));
      }

      const result = await conn.execute(sql, binds, {
        outFormat: OUT_FORMAT_OBJECT,
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
   * Map Oracle row to RefreshToken
   */
  private mapToToken(row: Record<string, unknown>): RefreshToken {
    return {
      id: row['ID'] as string,
      userId: row['USER_ID'] as string,
      tokenHash: row['TOKEN_HASH'] as string,
      userAgent: (row['USER_AGENT'] as string) ?? null,
      expiresAt: fromOracleDate(row['EXPIRES_AT'] as Date) ?? new Date(),
      createdAt: fromOracleDate(row['CREATED_AT'] as Date) ?? new Date(),
      lastUsedAt: fromOracleDate(row['LAST_USED_AT'] as Date),
      revoked: fromOracleBoolean(row['REVOKED'] as number),
    };
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const sql = `
      SELECT ID, USER_ID, TOKEN_HASH, USER_AGENT, EXPIRES_AT, CREATED_AT, LAST_USED_AT, REVOKED
      FROM ${this.tableName}
      WHERE TOKEN_HASH = :tokenHash
        AND REVOKED = 0
        AND EXPIRES_AT > SYSTIMESTAMP
    `;

    return this.execute(sql, { tokenHash }, (result) => {
      const rows = result.rows as Record<string, unknown>[] | undefined;
      if (!rows || rows.length === 0) return null;
      return this.mapToToken(rows[0]!);
    });
  }

  async create(data: NewRefreshToken): Promise<RefreshToken> {
    const id = generateUUID();
    const now = new Date();

    const sql = `
      INSERT INTO ${this.tableName} (
        ID, USER_ID, TOKEN_HASH, USER_AGENT, EXPIRES_AT, CREATED_AT, REVOKED
      ) VALUES (
        :id, :userId, :tokenHash, :userAgent, :expiresAt, :createdAt, 0
      )
    `;

    await this.execute(
      sql,
      {
        id,
        userId: data.userId,
        tokenHash: data.tokenHash,
        userAgent: data.userAgent,
        expiresAt: data.expiresAt,
        createdAt: now,
      },
      () => undefined
    );

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

  async revokeByHash(tokenHash: string): Promise<void> {
    const sql = `
      UPDATE ${this.tableName}
      SET REVOKED = 1
      WHERE TOKEN_HASH = :tokenHash
    `;

    await this.execute(sql, { tokenHash }, () => undefined);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const sql = `
      UPDATE ${this.tableName}
      SET REVOKED = 1
      WHERE USER_ID = :userId AND REVOKED = 0
    `;

    await this.execute(sql, { userId }, () => undefined);
  }

  async findActiveByUser(userId: string): Promise<RefreshToken[]> {
    const sql = `
      SELECT ID, USER_ID, TOKEN_HASH, USER_AGENT, EXPIRES_AT, CREATED_AT, LAST_USED_AT, REVOKED
      FROM ${this.tableName}
      WHERE USER_ID = :userId
        AND REVOKED = 0
        AND EXPIRES_AT > SYSTIMESTAMP
      ORDER BY CREATED_AT DESC
    `;

    return this.execute(sql, { userId }, (result) => {
      const rows = result.rows as Record<string, unknown>[] | undefined;
      if (!rows) return [];
      return rows.map((row) => this.mapToToken(row));
    });
  }

  async countActiveForUser(userId: string): Promise<number> {
    const sql = `
      SELECT COUNT(*) AS CNT
      FROM ${this.tableName}
      WHERE USER_ID = :userId
        AND REVOKED = 0
        AND EXPIRES_AT > SYSTIMESTAMP
    `;

    return this.execute(sql, { userId }, (result) => {
      const rows = result.rows as Record<string, unknown>[] | undefined;
      if (!rows || rows.length === 0) return 0;
      return (rows[0]!['CNT'] as number) ?? 0;
    });
  }

  async deleteExpired(): Promise<number> {
    const sql = `
      DELETE FROM ${this.tableName}
      WHERE REVOKED = 1
         OR EXPIRES_AT < SYSTIMESTAMP - INTERVAL '30' DAY
    `;

    return this.execute(sql, {}, (result) => {
      return result.rowsAffected ?? 0;
    });
  }

  /**
   * Update last used timestamp (called on token refresh)
   * @param tokenHash - Token hash to update
   */
  async updateLastUsed(tokenHash: string): Promise<void> {
    const sql = `
      UPDATE ${this.tableName}
      SET LAST_USED_AT = SYSTIMESTAMP
      WHERE TOKEN_HASH = :tokenHash
    `;

    await this.execute(sql, { tokenHash }, () => undefined);
  }
}

/**
 * Refresh token repository variant that uses a single connection (does not close it)
 */
export class SingleConnectionRefreshTokenRepository implements RefreshTokenRepository {
  private readonly tableName: string;
  private readonly debug: boolean;

  constructor(
    private readonly connection: OracleConnection,
    config: { tableName?: string; debug?: boolean }
  ) {
    this.tableName = config.tableName ?? 'AUTH_REFRESH_TOKENS';
    this.debug = config.debug ?? false;
  }

  private async execute<T>(
    sql: string,
    binds: BindParameters,
    handler: (result: OracleResult<unknown>) => T
  ): Promise<T> {
    if (this.debug) {
      console.log('[SingleConnectionRefreshTokenRepository] SQL:', sql);
      console.log('[SingleConnectionRefreshTokenRepository] Binds:', JSON.stringify(binds));
    }

    const result = await this.connection.execute(sql, binds, {
      outFormat: OUT_FORMAT_OBJECT,
      autoCommit: true,
    });

    return handler(result);
  }

  private mapToToken(row: Record<string, unknown>): RefreshToken {
    return {
      id: row['ID'] as string,
      userId: row['USER_ID'] as string,
      tokenHash: row['TOKEN_HASH'] as string,
      userAgent: (row['USER_AGENT'] as string) ?? null,
      expiresAt: fromOracleDate(row['EXPIRES_AT'] as Date) ?? new Date(),
      createdAt: fromOracleDate(row['CREATED_AT'] as Date) ?? new Date(),
      lastUsedAt: fromOracleDate(row['LAST_USED_AT'] as Date),
      revoked: fromOracleBoolean(row['REVOKED'] as number),
    };
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const sql = `
      SELECT ID, USER_ID, TOKEN_HASH, USER_AGENT, EXPIRES_AT, CREATED_AT, LAST_USED_AT, REVOKED
      FROM ${this.tableName}
      WHERE TOKEN_HASH = :tokenHash
        AND REVOKED = 0
        AND EXPIRES_AT > SYSTIMESTAMP
    `;

    return this.execute(sql, { tokenHash }, (result) => {
      const rows = result.rows as Record<string, unknown>[] | undefined;
      if (!rows || rows.length === 0) return null;
      return this.mapToToken(rows[0]!);
    });
  }

  async create(data: NewRefreshToken): Promise<RefreshToken> {
    const id = generateUUID();
    const now = new Date();

    const sql = `
      INSERT INTO ${this.tableName} (
        ID, USER_ID, TOKEN_HASH, USER_AGENT, EXPIRES_AT, CREATED_AT, REVOKED
      ) VALUES (
        :id, :userId, :tokenHash, :userAgent, :expiresAt, :createdAt, 0
      )
    `;

    await this.execute(
      sql,
      {
        id,
        userId: data.userId,
        tokenHash: data.tokenHash,
        userAgent: data.userAgent,
        expiresAt: data.expiresAt,
        createdAt: now,
      },
      () => undefined
    );

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

  async revokeByHash(tokenHash: string): Promise<void> {
    const sql = `
      UPDATE ${this.tableName}
      SET REVOKED = 1
      WHERE TOKEN_HASH = :tokenHash
    `;

    await this.execute(sql, { tokenHash }, () => undefined);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const sql = `
      UPDATE ${this.tableName}
      SET REVOKED = 1
      WHERE USER_ID = :userId AND REVOKED = 0
    `;

    await this.execute(sql, { userId }, () => undefined);
  }

  async findActiveByUser(userId: string): Promise<RefreshToken[]> {
    const sql = `
      SELECT ID, USER_ID, TOKEN_HASH, USER_AGENT, EXPIRES_AT, CREATED_AT, LAST_USED_AT, REVOKED
      FROM ${this.tableName}
      WHERE USER_ID = :userId
        AND REVOKED = 0
        AND EXPIRES_AT > SYSTIMESTAMP
      ORDER BY CREATED_AT DESC
    `;

    return this.execute(sql, { userId }, (result) => {
      const rows = result.rows as Record<string, unknown>[] | undefined;
      if (!rows) return [];
      return rows.map((row) => this.mapToToken(row));
    });
  }

  async countActiveForUser(userId: string): Promise<number> {
    const sql = `
      SELECT COUNT(*) AS CNT
      FROM ${this.tableName}
      WHERE USER_ID = :userId
        AND REVOKED = 0
        AND EXPIRES_AT > SYSTIMESTAMP
    `;

    return this.execute(sql, { userId }, (result) => {
      const rows = result.rows as Record<string, unknown>[] | undefined;
      if (!rows || rows.length === 0) return 0;
      return (rows[0]!['CNT'] as number) ?? 0;
    });
  }

  async deleteExpired(): Promise<number> {
    const sql = `
      DELETE FROM ${this.tableName}
      WHERE REVOKED = 1
         OR EXPIRES_AT < SYSTIMESTAMP - INTERVAL '30' DAY
    `;

    return this.execute(sql, {}, (result) => {
      return result.rowsAffected ?? 0;
    });
  }

  /**
   * Update last used timestamp (called on token refresh)
   * @param tokenHash - Token hash to update
   */
  async updateLastUsed(tokenHash: string): Promise<void> {
    const sql = `
      UPDATE ${this.tableName}
      SET LAST_USED_AT = SYSTIMESTAMP
      WHERE TOKEN_HASH = :tokenHash
    `;

    await this.execute(sql, { tokenHash }, () => undefined);
  }
}

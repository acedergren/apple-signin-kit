# @acedergren/fastify-apple-signin-oracle

Oracle Database adapter for [@running-days/fastify-apple-auth](https://github.com/acedergren/running-days/tree/main/packages/fastify-apple-auth).

Provides `UserRepository` and `RefreshTokenRepository` implementations backed by Oracle Database for production-grade Apple Sign-In authentication.

## Quick Start (5 Lines)

```typescript
import oracledb from 'oracledb';
import { createOracleAuthAdapter } from '@acedergren/fastify-apple-signin-oracle';

const pool = await oracledb.createPool({ user: 'ADMIN', password: 'xxx', connectString: 'mydb_high' });
const { userRepository, refreshTokenRepository } = createOracleAuthAdapter(pool);
// Pass to fastify-apple-auth: { userRepository, refreshTokenRepository, ... }
```

## Features

- **Zero-config setup** - Just pass your Oracle pool, get repositories
- **Connection pool support** - Built for production workloads
- **Single connection support** - For testing or simple deployments
- **Account lockout** - NIST 800-63B compliant lockout tracking
- **Session management** - Track active sessions, enforce limits
- **Automatic cleanup** - Built-in expired token cleanup
- **Custom table names** - Use your own schema prefix
- **Debug mode** - Query logging for development
- **Thin mode ready** - Works with node-oracledb 6+ thin mode (no Oracle Client needed)

## Installation

```bash
npm install @acedergren/fastify-apple-signin-oracle oracledb
# or
pnpm add @acedergren/fastify-apple-signin-oracle oracledb
```

### Peer Dependencies

| Package | Version | Required |
|---------|---------|----------|
| `@running-days/fastify-apple-auth` | ^1.0.0 | Yes |
| `oracledb` | ^6.0.0 | Yes |

## Complete Setup Guide

### Step 1: Create the Database Schema

Run the included SQL script against your Oracle database:

```bash
# Option A: Using SQLcl
sql admin/password@localhost:1521/ORCLPDB1 @node_modules/@acedergren/fastify-apple-signin-oracle/src/schema.sql

# Option B: Using SQL*Plus
sqlplus admin/password@localhost:1521/ORCLPDB1 @node_modules/@acedergren/fastify-apple-signin-oracle/src/schema.sql

# Option C: Copy and run manually in your SQL client
cat node_modules/@acedergren/fastify-apple-signin-oracle/src/schema.sql
```

### Step 2: Configure Your Fastify Application

```typescript
import oracledb from 'oracledb';
import Fastify from 'fastify';
import fastifyAppleAuth from '@running-days/fastify-apple-auth';
import { createOracleAuthAdapter } from '@acedergren/fastify-apple-signin-oracle';

async function main() {
  // Create Oracle connection pool
  const pool = await oracledb.createPool({
    user: process.env.ORACLE_USER!,
    password: process.env.ORACLE_PASSWORD!,
    connectString: process.env.ORACLE_CONNECT_STRING!,
    // Pool configuration (recommended for production)
    poolMin: 2,
    poolMax: 10,
    poolIncrement: 1,
  });

  // Create adapter - returns both repositories
  const { userRepository, refreshTokenRepository } = createOracleAuthAdapter(pool);

  // Create Fastify app
  const app = Fastify({ logger: true });

  // Register Apple authentication
  await app.register(fastifyAppleAuth, {
    apple: {
      clientId: process.env.APPLE_CLIENT_ID!,
      teamId: process.env.APPLE_TEAM_ID!,
      keyId: process.env.APPLE_KEY_ID!,
      privateKey: process.env.APPLE_PRIVATE_KEY!,
      redirectUri: 'https://myapp.com/auth/apple/callback',
    },
    jwt: {
      secret: process.env.JWT_SECRET!,
      accessTokenTtl: '15m',
      refreshTokenTtl: '7d',
    },
    userRepository,
    refreshTokenRepository,
  });

  // Graceful shutdown
  app.addHook('onClose', async () => {
    await pool.close(10); // Drain timeout in seconds
  });

  await app.listen({ port: 3000 });
}

main().catch(console.error);
```

## Configuration Options

### `createOracleAuthAdapter(pool, options?)`

Creates user and refresh token repositories from an Oracle connection pool.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `usersTable` | `string` | `'AUTH_USERS'` | Table name for users (can include schema prefix) |
| `refreshTokensTable` | `string` | `'AUTH_REFRESH_TOKENS'` | Table name for refresh tokens |
| `queryTimeout` | `number` | `30000` | Query timeout in milliseconds |
| `debug` | `boolean` | `false` | Enable SQL query logging (do not use in production) |

**Example with all options:**

```typescript
const { userRepository, refreshTokenRepository } = createOracleAuthAdapter(pool, {
  usersTable: 'MYAPP.AUTH_USERS',
  refreshTokensTable: 'MYAPP.AUTH_REFRESH_TOKENS',
  queryTimeout: 60000,
  debug: process.env.NODE_ENV === 'development',
});
```

### `createOracleAuthAdapterFromConnection(connection, options?)`

Creates repositories from a single Oracle connection. Use for testing or simple deployments.

```typescript
import { createOracleAuthAdapterFromConnection } from '@acedergren/fastify-apple-signin-oracle';

const connection = await oracledb.getConnection({ user, password, connectString });
const { userRepository, refreshTokenRepository } = createOracleAuthAdapterFromConnection(connection);

// Note: The connection is NOT closed by the adapter - you must manage its lifecycle
```

## Oracle Connection Examples

### Standard Oracle Database

```typescript
const pool = await oracledb.createPool({
  user: 'myuser',
  password: 'mypassword',
  connectString: 'localhost:1521/ORCLPDB1',
});
```

### Oracle Autonomous Database (Wallet Directory)

For mTLS connections using a downloaded wallet:

```typescript
const pool = await oracledb.createPool({
  user: 'ADMIN',
  password: process.env.ORACLE_PASSWORD,
  connectString: 'mydb_high', // TNS alias from tnsnames.ora
  configDir: '/path/to/wallet', // Directory containing wallet files
  walletPassword: process.env.ORACLE_WALLET_PASSWORD,
});
```

### Oracle Autonomous Database (Wallet Content - K8s/Containers)

For containerized environments where the wallet is stored as an environment variable:

```typescript
const pool = await oracledb.createPool({
  user: 'ADMIN',
  password: process.env.ORACLE_PASSWORD,
  connectString: '(description=(retry_count=20)(retry_delay=3)...)', // Full connect descriptor
  walletContent: process.env.ORACLE_WALLET_CONTENT, // Raw PEM string (NOT base64)
  walletPassword: process.env.ORACLE_WALLET_PASSWORD,
});
```

**Important:** `walletContent` must be the raw PEM file content, not base64-encoded.

### Connection Pool Best Practices

```typescript
const pool = await oracledb.createPool({
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECT_STRING,

  // Pool sizing
  poolMin: 2,              // Minimum connections to keep open
  poolMax: 10,             // Maximum connections
  poolIncrement: 1,        // Connections to add when pool needs to grow

  // Timeouts
  queueTimeout: 60000,     // Max time to wait for a connection (ms)

  // Health checks
  enableStatistics: true,  // Enable pool statistics for monitoring
});
```

## Database Schema

The adapter requires two tables. The schema is designed for optimal performance with Apple Sign-In workloads.

### AUTH_USERS

| Column | Type | Description |
|--------|------|-------------|
| `ID` | `VARCHAR2(36)` | UUID primary key |
| `EMAIL` | `VARCHAR2(255)` | User email (unique, case-insensitive) |
| `APPLE_USER_ID` | `VARCHAR2(255)` | Apple's unique user ID (unique) |
| `ROLE` | `VARCHAR2(20)` | `'user'` or `'admin'` |
| `CREATED_AT` | `TIMESTAMP` | Account creation time |
| `LAST_LOGIN_AT` | `TIMESTAMP` | Last successful login |
| `FAILED_LOGIN_ATTEMPTS` | `NUMBER(3)` | Current failed attempt count |
| `LOCKED_UNTIL` | `TIMESTAMP` | Account locked until (null = not locked) |
| `LAST_FAILED_ATTEMPT_AT` | `TIMESTAMP` | Last failed attempt time |

### AUTH_REFRESH_TOKENS

| Column | Type | Description |
|--------|------|-------------|
| `ID` | `VARCHAR2(36)` | UUID primary key |
| `USER_ID` | `VARCHAR2(36)` | Foreign key to `AUTH_USERS` |
| `TOKEN_HASH` | `VARCHAR2(64)` | SHA-256 hash of token (unique) |
| `USER_AGENT` | `VARCHAR2(512)` | Device identifier |
| `EXPIRES_AT` | `TIMESTAMP` | Token expiration |
| `CREATED_AT` | `TIMESTAMP` | Token creation time |
| `LAST_USED_AT` | `TIMESTAMP` | Last token refresh |
| `REVOKED` | `NUMBER(1)` | `0` = active, `1` = revoked |

### Indexes

The schema includes optimized indexes for common query patterns:

| Index | Purpose |
|-------|---------|
| `AUTH_USERS_APPLE_USER_ID_UQ` | Fast Apple ID lookup during sign-in |
| `AUTH_USERS_EMAIL_UQ` | Fast email lookup (case-insensitive) |
| `AUTH_REFRESH_TOKENS_HASH_UQ` | Fast token validation |
| `AUTH_REFRESH_TOKENS_USER_ACTIVE_IDX` | Active sessions by user |
| `AUTH_REFRESH_TOKENS_EXPIRES_IDX` | Expired token cleanup |

## Token Cleanup

Expired and revoked tokens should be cleaned up periodically. Two approaches:

### Option 1: Application-level Cleanup

```typescript
// Run periodically (e.g., daily cron job or scheduled task)
async function cleanupExpiredTokens() {
  const deletedCount = await refreshTokenRepository.deleteExpired();
  console.log(`Cleaned up ${deletedCount} expired tokens`);
}

// Example: Run every 24 hours
setInterval(cleanupExpiredTokens, 24 * 60 * 60 * 1000);
```

### Option 2: Oracle Scheduler Job

Uncomment the scheduler job in `schema.sql` to run cleanup automatically at 3 AM daily:

```sql
BEGIN
    DBMS_SCHEDULER.CREATE_JOB (
        job_name        => 'CLEANUP_EXPIRED_TOKENS',
        job_type        => 'PLSQL_BLOCK',
        job_action      => 'BEGIN
            DELETE FROM AUTH_REFRESH_TOKENS
            WHERE (REVOKED = 1 OR EXPIRES_AT < SYSTIMESTAMP)
            AND CREATED_AT < SYSTIMESTAMP - INTERVAL ''30'' DAY;
            COMMIT;
        END;',
        start_date      => SYSTIMESTAMP,
        repeat_interval => 'FREQ=DAILY; BYHOUR=3; BYMINUTE=0',
        enabled         => TRUE
    );
END;
/
```

## Migration Guide

### From PostgreSQL/MySQL/SQLite

1. **Export existing users:**
   ```sql
   -- From source database
   SELECT id, email, apple_user_id, role, created_at FROM users;
   ```

2. **Run the Oracle schema:**
   ```bash
   sql admin/password@db @schema.sql
   ```

3. **Import users:**
   ```sql
   INSERT INTO AUTH_USERS (ID, EMAIL, APPLE_USER_ID, ROLE, CREATED_AT, FAILED_LOGIN_ATTEMPTS)
   VALUES (:id, :email, :appleUserId, :role, :createdAt, 0);
   ```

4. **Users can sign in immediately** - refresh tokens will be created on first login.

### From In-Memory/Redis Sessions

If you're migrating from stateless sessions, all users will need to re-authenticate once:

1. Run the Oracle schema
2. Replace your session adapter with this Oracle adapter
3. Users will be prompted to sign in again (tokens are not migrated)
4. New refresh tokens will be stored in Oracle

### Adding to Existing Oracle Schema

If you already have Oracle and want to add Apple Sign-In:

```sql
-- Run with your existing schema prefix
ALTER SESSION SET CURRENT_SCHEMA = MYAPP;
@schema.sql
```

Then configure the adapter with your table names:

```typescript
const { userRepository, refreshTokenRepository } = createOracleAuthAdapter(pool, {
  usersTable: 'MYAPP.AUTH_USERS',
  refreshTokensTable: 'MYAPP.AUTH_REFRESH_TOKENS',
});
```

## Type Exports

All types are re-exported for TypeScript convenience:

```typescript
import type {
  // Adapter types
  OracleAuthAdapter,
  OracleAdapterConfig,
  OraclePool,
  OracleConnection,

  // Core auth types (from @running-days/fastify-apple-auth)
  AuthUser,
  NewAuthUser,
  RefreshToken,
  NewRefreshToken,
  UserRepository,
  RefreshTokenRepository,
  UserLockoutState,
} from '@acedergren/fastify-apple-signin-oracle';
```

## Troubleshooting

### "ORA-00942: table or view does not exist"

**Cause:** The required tables haven't been created.

**Solution:** Run the `schema.sql` script:
```bash
sql admin/password@db @node_modules/@acedergren/fastify-apple-signin-oracle/src/schema.sql
```

### "NJS-500: connection pool was closed"

**Cause:** The pool was closed before all requests completed.

**Solution:** Use graceful shutdown:
```typescript
app.addHook('onClose', async () => {
  await pool.close(10); // Wait up to 10 seconds for requests to complete
});
```

### "NJS-040: connection request timeout"

**Cause:** All pool connections are in use and the queue timeout was exceeded.

**Solutions:**
1. Increase `poolMax`:
   ```typescript
   const pool = await oracledb.createPool({ poolMax: 20, ... });
   ```
2. Check for connection leaks (connections not being closed)
3. Increase `queueTimeout`:
   ```typescript
   const pool = await oracledb.createPool({ queueTimeout: 120000, ... });
   ```

### "ORA-01017: invalid username/password"

**Cause:** Incorrect credentials.

**Solutions:**
1. Verify `ORACLE_USER` and `ORACLE_PASSWORD` environment variables
2. For Autonomous Database, the user is typically `ADMIN`
3. Check if the password contains special characters that need escaping

### "NJS-040: wallet file cannot be read" / "NJS-522"

**Cause:** Wallet configuration issue for Oracle Autonomous Database.

**Solutions:**

1. **Using `configDir`:**
   ```typescript
   // Ensure the directory contains ewallet.pem and tnsnames.ora
   configDir: '/path/to/wallet',
   walletPassword: process.env.ORACLE_WALLET_PASSWORD,
   ```

2. **Using `walletContent`:**
   ```typescript
   // Must be raw PEM string, NOT base64-encoded
   walletContent: fs.readFileSync('/path/to/ewallet.pem', 'utf8'),
   walletPassword: process.env.ORACLE_WALLET_PASSWORD,
   ```

3. **Check file permissions:**
   ```bash
   ls -la /path/to/wallet/
   # ewallet.pem should be readable by the Node.js process
   ```

### "ORA-12170: TNS:Connect timeout occurred"

**Cause:** Network connectivity issue or firewall blocking the connection.

**Solutions:**
1. Verify the database host is reachable
2. Check if port 1521 (or 1522 for mTLS) is open
3. For Autonomous Database, ensure you're using the correct connect string from the wallet

### "ORA-28040: No matching authentication protocol"

**Cause:** Password verifier mismatch between client and server.

**Solution:** For Oracle 23ai/26ai, ensure node-oracledb 6.0+ is being used (thin mode supports all verifier types).

### Debug Mode

Enable debug mode to see all SQL queries and bind parameters:

```typescript
const { userRepository, refreshTokenRepository } = createOracleAuthAdapter(pool, {
  debug: true,
});
```

**Warning:** Do not enable debug mode in production - it logs sensitive data.

Sample output:
```
[OracleUserRepository] SQL: SELECT ID, EMAIL, ROLE... WHERE APPLE_USER_ID = :appleUserId
[OracleUserRepository] Binds: {"appleUserId":"000123.abc..."}
```

### Connection Pool Monitoring

Monitor pool health:

```typescript
// Get pool statistics
const stats = pool.getStatistics();
console.log({
  connectionsInUse: stats.connectionsInUse,
  connectionsOpen: stats.connectionsOpen,
  poolMax: pool.poolMax,
  utilizationPercent: (stats.connectionsInUse / pool.poolMax) * 100,
});
```

## Testing

The package includes comprehensive tests using Vitest with mocked Oracle connections:

```bash
# Run tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

Tests mock `node-oracledb` to avoid requiring a real Oracle database connection.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `pnpm test`
4. Run type checks: `pnpm typecheck`
5. Submit a pull request

## License

MIT

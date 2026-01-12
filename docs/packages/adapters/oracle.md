# Oracle Adapter

Database adapter for Oracle Database and Oracle Autonomous Database (ADB).

## Installation

```bash
pnpm add @acedergren/fastify-apple-signin-oracle oracledb
```

## Quick Start

```typescript
import { appleAuthPlugin } from '@acedergren/fastify-apple-auth';
import { oracleAdapter } from '@acedergren/fastify-apple-signin-oracle';
import oracledb from 'oracledb';

// Create connection pool
const pool = await oracledb.createPool({
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECT_STRING,
});

await app.register(appleAuthPlugin, {
  // ... apple config
  adapter: oracleAdapter({ pool }),
});
```

## Oracle Autonomous Database (ADB)

For ADB with mTLS authentication:

```typescript
import oracledb from 'oracledb';

const pool = await oracledb.createPool({
  user: 'ADMIN',
  password: process.env.ORACLE_PASSWORD,
  connectString: 'mydb_high', // TNS alias from wallet

  // Option 1: Wallet directory
  configDir: '/path/to/wallet',
  walletPassword: process.env.ORACLE_WALLET_PASSWORD,

  // Option 2: Wallet content (for K8s/containers)
  // walletContent: process.env.ORACLE_WALLET_CONTENT,
  // walletPassword: process.env.ORACLE_WALLET_PASSWORD,
});
```

## Configuration

```typescript
interface OracleAdapterConfig {
  /** Oracle connection pool */
  pool: oracledb.Pool;

  /** Table name prefix (default: 'AUTH_') */
  tablePrefix?: string;

  /** Schema name (default: current user) */
  schema?: string;
}
```

## Schema

The adapter expects these tables (auto-created if `autoMigrate: true`):

```sql
-- Users table
CREATE TABLE AUTH_USERS (
  ID VARCHAR2(36) PRIMARY KEY,
  APPLE_ID VARCHAR2(255) UNIQUE NOT NULL,
  EMAIL VARCHAR2(255),
  EMAIL_VERIFIED NUMBER(1) DEFAULT 0,
  FULL_NAME VARCHAR2(255),
  CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE AUTH_SESSIONS (
  ID VARCHAR2(36) PRIMARY KEY,
  USER_ID VARCHAR2(36) NOT NULL REFERENCES AUTH_USERS(ID),
  TOKEN_HASH VARCHAR2(64) NOT NULL,
  USER_AGENT VARCHAR2(512),
  IP_ADDRESS VARCHAR2(45),
  CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  EXPIRES_AT TIMESTAMP NOT NULL,
  LAST_USED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lockout table
CREATE TABLE AUTH_LOCKOUTS (
  USER_ID VARCHAR2(36) PRIMARY KEY REFERENCES AUTH_USERS(ID),
  FAILED_ATTEMPTS NUMBER DEFAULT 0,
  LOCKED_UNTIL TIMESTAMP,
  LAST_FAILED_AT TIMESTAMP
);

-- Indexes
CREATE INDEX IDX_SESSIONS_USER ON AUTH_SESSIONS(USER_ID);
CREATE INDEX IDX_SESSIONS_TOKEN ON AUTH_SESSIONS(TOKEN_HASH);
CREATE INDEX IDX_SESSIONS_EXPIRES ON AUTH_SESSIONS(EXPIRES_AT);
```

## Performance Tuning

### Connection Pool

```typescript
const pool = await oracledb.createPool({
  // ... connection config
  poolMin: 4,
  poolMax: 20,
  poolIncrement: 2,
  poolTimeout: 60,
  queueTimeout: 30000,
});
```

### Bind Variables

The adapter uses bind variables for all queries to:

- Prevent SQL injection
- Enable statement caching
- Improve performance

```typescript
// Internal query (bind variables)
const result = await connection.execute(
  `SELECT * FROM AUTH_USERS WHERE APPLE_ID = :appleId`,
  { appleId },
  { outFormat: oracledb.OUT_FORMAT_OBJECT }
);
```

## Health Check

```typescript
const adapter = oracleAdapter({ pool });

// Check connection health
const health = await adapter.healthCheck();
// { ok: true, latencyMs: 5 }
```

## Troubleshooting

### Connection Timeout

```
ORA-12170: TNS:Connect timeout occurred
```

**Solutions:**

- Verify network connectivity to Oracle
- Check firewall rules
- Increase `connectTimeout` in pool config

### Wallet Issues

```
NJS-040: connection request was rejected by the pool
```

**Solutions:**

- Use `configDir` instead of `walletLocation` for Thin mode
- Ensure wallet password is correct
- Verify `ewallet.pem` exists in wallet directory

### Pool Exhaustion

```
NJS-076: connection pool has reached its maximum
```

**Solutions:**

- Increase `poolMax`
- Ensure connections are released (use `finally` blocks)
- Check for connection leaks

# @acedergren/fastify-apple-signin-drizzle

Drizzle ORM adapter for [@acedergren/fastify-apple-auth](../fastify-apple-auth). Supports PostgreSQL, MySQL, and SQLite with a unified API.

## Features

- **Multi-Database Support**: PostgreSQL, MySQL, and SQLite with the same API
- **Type-Safe**: Full TypeScript support with Drizzle ORM type inference
- **Ready-to-Use Schemas**: Pre-built schemas for each database dialect
- **NIST 800-63B Compliant**: Built-in account lockout fields
- **Optimized Indexes**: Proper indexes on all lookup columns
- **Zero Configuration**: Works out of the box with sensible defaults

## Installation

```bash
npm install @acedergren/fastify-apple-signin-drizzle drizzle-orm

# Choose your database driver:
npm install postgres           # PostgreSQL (postgres.js)
npm install pg                 # PostgreSQL (node-postgres)
npm install mysql2             # MySQL
npm install better-sqlite3     # SQLite

# Optional: Drizzle Kit for migrations
npm install -D drizzle-kit
```

## Quick Start

### PostgreSQL

```typescript
import Fastify from 'fastify';
import appleAuth from '@acedergren/fastify-apple-auth';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  createDrizzleAuthAdapter,
  pgUsers,
  pgRefreshTokens,
} from '@acedergren/fastify-apple-signin-drizzle';

// Create database connection
const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql);

// Create auth adapter
const { userRepository, refreshTokenRepository } = createDrizzleAuthAdapter(db, {
  users: pgUsers,
  refreshTokens: pgRefreshTokens,
});

// Register with Fastify
const fastify = Fastify();

await fastify.register(appleAuth, {
  auth: {
    userRepository,
    refreshTokenRepository,
  },
  config: {
    apple: {
      clientId: process.env.APPLE_CLIENT_ID!,
      teamId: process.env.APPLE_TEAM_ID!,
      keyId: process.env.APPLE_KEY_ID!,
      privateKey: process.env.APPLE_PRIVATE_KEY!,
      redirectUri: process.env.APPLE_REDIRECT_URI!,
    },
    jwt: {
      secret: process.env.JWT_SECRET!,
      accessTokenTtl: '15m',
      refreshTokenTtl: '7d',
    },
  },
});

await fastify.listen({ port: 3000 });
```

### MySQL

```typescript
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import {
  createDrizzleAuthAdapter,
  mysqlUsers,
  mysqlRefreshTokens,
} from '@acedergren/fastify-apple-signin-drizzle';

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
const db = drizzle(pool);

// Create auth adapter - same API as PostgreSQL!
const { userRepository, refreshTokenRepository } = createDrizzleAuthAdapter(db, {
  users: mysqlUsers,
  refreshTokens: mysqlRefreshTokens,
});
```

### SQLite

```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import {
  createDrizzleAuthAdapter,
  sqliteUsers,
  sqliteRefreshTokens,
} from '@acedergren/fastify-apple-signin-drizzle';

// Create database
const sqlite = new Database('auth.db');
const db = drizzle(sqlite);

// Create auth adapter - same API as PostgreSQL and MySQL!
const { userRepository, refreshTokenRepository } = createDrizzleAuthAdapter(db, {
  users: sqliteUsers,
  refreshTokens: sqliteRefreshTokens,
});
```

---

## Database Setup

### Option 1: Raw SQL Migrations (Recommended for Production)

Apply the appropriate migration file from the `migrations/` directory:

#### PostgreSQL
```bash
psql -d your_database -f node_modules/@acedergren/fastify-apple-signin-drizzle/migrations/0000_init_postgres.sql
```

#### MySQL
```bash
mysql -u user -p database < node_modules/@acedergren/fastify-apple-signin-drizzle/migrations/0000_init_mysql.sql
```

#### SQLite
```bash
sqlite3 auth.db < node_modules/@acedergren/fastify-apple-signin-drizzle/migrations/0000_init_sqlite.sql
```

### Option 2: Drizzle Kit (Push Schema)

Create a `drizzle.config.ts` in your project root:

#### PostgreSQL
```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './node_modules/@acedergren/fastify-apple-signin-drizzle/dist/schema/pg.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

#### MySQL
```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './node_modules/@acedergren/fastify-apple-signin-drizzle/dist/schema/mysql.js',
  out: './drizzle',
  dialect: 'mysql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

#### SQLite
```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './node_modules/@acedergren/fastify-apple-signin-drizzle/dist/schema/sqlite.js',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './auth.db',
  },
} satisfies Config;
```

Then push the schema:
```bash
npx drizzle-kit push
```

### Option 3: Drizzle Kit (Generate Migrations)

To generate migration files that you can review and version control:

```bash
# Generate migration SQL
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit migrate
```

### Option 4: Programmatic Migration

```typescript
import { sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read and execute migration file
const migrationPath = join(
  'node_modules/@acedergren/fastify-apple-signin-drizzle/migrations',
  '0000_init_postgres.sql'
);
const migration = readFileSync(migrationPath, 'utf8');

// Split by statement (PostgreSQL)
for (const statement of migration.split(';')) {
  if (statement.trim()) {
    await db.execute(sql.raw(statement));
  }
}
```

---

## Schema Details

### Users Table (`auth_users`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT/VARCHAR | UUID primary key |
| `email` | TEXT/VARCHAR | User's email (may be Apple private relay) |
| `apple_user_id` | TEXT/VARCHAR | Apple's unique identifier (sub claim) |
| `role` | TEXT/VARCHAR | 'user' or 'admin' |
| `created_at` | TIMESTAMP | Account creation time |
| `last_login_at` | TIMESTAMP | Last successful login |
| `failed_login_attempts` | INTEGER | Lockout counter (NIST 800-63B) |
| `locked_until` | TIMESTAMP | Lockout expiration |
| `last_failed_attempt_at` | TIMESTAMP | Last failed login |

**Indexes:**
- `auth_users_apple_user_id_idx` (UNIQUE) - Fast OAuth lookups
- `auth_users_email_idx` - Email-based lookups

### Refresh Tokens Table (`auth_refresh_tokens`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT/VARCHAR | UUID primary key |
| `user_id` | TEXT/VARCHAR | FK to auth_users |
| `token_hash` | TEXT/VARCHAR | SHA-256 hash (never plaintext!) |
| `user_agent` | TEXT/VARCHAR | Device tracking |
| `expires_at` | TIMESTAMP | Token expiration |
| `created_at` | TIMESTAMP | Token creation |
| `last_used_at` | TIMESTAMP | Last refresh time |
| `revoked` | BOOLEAN | Soft revocation flag |

**Indexes:**
- `auth_refresh_tokens_hash_idx` (UNIQUE) - O(1) token lookups
- `auth_refresh_tokens_user_id_idx` - User session queries
- `auth_refresh_tokens_expires_revoked_idx` - Cleanup queries

---

## API Reference

### `createDrizzleAuthAdapter(db, schema, options?)`

Creates auth repositories for the given Drizzle database.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | Drizzle DB | Your Drizzle database instance |
| `schema.users` | Table | Users table from schema |
| `schema.refreshTokens` | Table | Refresh tokens table from schema |
| `options.generateId` | `() => string` | Custom ID generator (default: `crypto.randomUUID()`) |

**Returns:**

```typescript
{
  userRepository: UserRepository;
  refreshTokenRepository: RefreshTokenRepository;
}
```

### UserRepository Methods

```typescript
interface UserRepository {
  findByAppleUserId(appleUserId: string): Promise<AuthUser | null>;
  findByEmail(email: string): Promise<AuthUser | null>;
  findById(id: string): Promise<AuthUser | null>;
  create(data: NewAuthUser): Promise<AuthUser>;
  updateLastLogin(userId: string, timestamp: Date): Promise<void>;
  getLockoutState?(userId: string): Promise<UserLockoutState | null>;
  updateLockoutState?(userId: string, state: Partial<UserLockoutState>): Promise<void>;
}
```

### RefreshTokenRepository Methods

```typescript
interface RefreshTokenRepository {
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  create(data: NewRefreshToken): Promise<RefreshToken>;
  revokeByHash(tokenHash: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  findActiveByUser(userId: string): Promise<RefreshToken[]>;
  countActiveForUser(userId: string): Promise<number>;
  deleteExpired?(): Promise<number>;
}
```

---

## TypeScript Integration

### Importing Types

```typescript
import type {
  // Core interfaces
  AuthUser,
  NewAuthUser,
  RefreshToken,
  NewRefreshToken,
  UserLockoutState,
  UserRepository,
  RefreshTokenRepository,
  DrizzleAuthAdapter,
  DrizzleAuthSchema,
  DrizzleAuthAdapterOptions,

  // PostgreSQL-specific types
  PgUser,
  PgNewUser,
  PgRefreshToken,
  PgNewRefreshToken,

  // MySQL-specific types
  MysqlUser,
  MysqlNewUser,
  MysqlRefreshToken,
  MysqlNewRefreshToken,

  // SQLite-specific types
  SqliteUser,
  SqliteNewUser,
  SqliteRefreshToken,
  SqliteNewRefreshToken,
} from '@acedergren/fastify-apple-signin-drizzle';
```

### Subpath Imports

Import schemas directly by dialect:

```typescript
// PostgreSQL
import { pgUsers, pgRefreshTokens } from '@acedergren/fastify-apple-signin-drizzle/schema/pg';

// MySQL
import { mysqlUsers, mysqlRefreshTokens } from '@acedergren/fastify-apple-signin-drizzle/schema/mysql';

// SQLite
import { sqliteUsers, sqliteRefreshTokens } from '@acedergren/fastify-apple-signin-drizzle/schema/sqlite';
```

### Custom ID Generator

```typescript
import { randomUUID } from 'crypto';
import { ulid } from 'ulid'; // If you prefer ULID

const { userRepository, refreshTokenRepository } = createDrizzleAuthAdapter(db, schema, {
  generateId: () => ulid(), // Use ULID instead of UUID
});
```

---

## Extending the Schema

You can extend the provided schemas with additional columns:

```typescript
import { pgTable, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

// Define your extended users table
export const users = pgTable('auth_users', {
  // Required columns from the auth schema
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  appleUserId: text('apple_user_id'),
  role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastFailedAttemptAt: timestamp('last_failed_attempt_at', { withTimezone: true }),

  // Your custom columns
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  organizationId: text('organization_id'),
  stripeCustomerId: text('stripe_customer_id'),
  onboardingCompleted: boolean('onboarding_completed').default(false),
});
```

---

## Token Cleanup Job

Run periodic cleanup to remove expired tokens:

```typescript
// Run daily via cron or scheduled task
async function cleanupTokens() {
  const deletedCount = await refreshTokenRepository.deleteExpired?.();
  console.log(`Cleaned up ${deletedCount} expired/revoked tokens`);
}

// Using node-cron
import cron from 'node-cron';
cron.schedule('0 3 * * *', cleanupTokens); // Run at 3 AM daily

// Or using Fastify scheduler
import fastifySchedule from '@fastify/schedule';
await fastify.register(fastifySchedule);
fastify.scheduler.addSimpleIntervalJob(
  'token-cleanup',
  86400000, // 24 hours
  cleanupTokens
);
```

---

## Complete Example

Here's a complete example showing all the pieces together:

```typescript
// src/server.ts
import Fastify from 'fastify';
import appleAuth from '@acedergren/fastify-apple-auth';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  createDrizzleAuthAdapter,
  pgUsers,
  pgRefreshTokens,
} from '@acedergren/fastify-apple-signin-drizzle';

async function main() {
  // 1. Create database connection
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 10,
    idle_timeout: 30,
  });
  const db = drizzle(sql, {
    schema: { users: pgUsers, refreshTokens: pgRefreshTokens },
  });

  // 2. Create auth adapter
  const { userRepository, refreshTokenRepository } = createDrizzleAuthAdapter(db, {
    users: pgUsers,
    refreshTokens: pgRefreshTokens,
  });

  // 3. Initialize Fastify
  const fastify = Fastify({
    logger: true,
  });

  // 4. Register Apple Auth plugin
  await fastify.register(appleAuth, {
    auth: {
      userRepository,
      refreshTokenRepository,
    },
    config: {
      apple: {
        clientId: process.env.APPLE_CLIENT_ID!,
        teamId: process.env.APPLE_TEAM_ID!,
        keyId: process.env.APPLE_KEY_ID!,
        privateKey: process.env.APPLE_PRIVATE_KEY!,
        redirectUri: process.env.APPLE_REDIRECT_URI!,
      },
      jwt: {
        secret: process.env.JWT_SECRET!,
        accessTokenTtl: '15m',
        refreshTokenTtl: '7d',
      },
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      },
    },
  });

  // 5. Add cleanup job
  setInterval(async () => {
    try {
      const deleted = await refreshTokenRepository.deleteExpired?.();
      if (deleted && deleted > 0) {
        fastify.log.info(`Cleaned up ${deleted} expired tokens`);
      }
    } catch (err) {
      fastify.log.error(err, 'Token cleanup failed');
    }
  }, 3600000); // Every hour

  // 6. Start server
  await fastify.listen({
    port: parseInt(process.env.PORT || '3000'),
    host: '0.0.0.0',
  });

  console.log('Server running on http://localhost:3000');
}

main().catch(console.error);
```

---

## Security Considerations

1. **Never store plaintext tokens**: The adapter stores SHA-256 hashes of refresh tokens.

2. **Use secure cookies**: Enable `httpOnly`, `secure`, and `sameSite` in production.

3. **Account lockout**: The schema includes NIST 800-63B compliant lockout fields.

4. **Token revocation**: Use `revokeAllForUser()` when a user changes password or logs out from all devices.

5. **Cleanup expired tokens**: Schedule regular cleanup to prevent table bloat.

---

## Contributing

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Run tests: `pnpm test`
4. Run tests in watch mode: `pnpm test:watch`
5. Build: `pnpm build`

## License

MIT

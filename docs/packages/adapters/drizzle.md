# Drizzle Adapter

Database adapter using Drizzle ORM. Supports PostgreSQL, MySQL, and SQLite.

## Installation

```bash
pnpm add @acedergren/fastify-apple-signin-drizzle drizzle-orm
```

Plus your database driver:

=== "PostgreSQL"

    ```bash
    pnpm add postgres
    # or
    pnpm add pg
    ```

=== "MySQL"

    ```bash
    pnpm add mysql2
    ```

=== "SQLite"

    ```bash
    pnpm add better-sqlite3
    # or for serverless
    pnpm add @libsql/client
    ```

## Quick Start

```typescript
import { appleAuthPlugin } from '@acedergren/fastify-apple-auth';
import { drizzleAdapter } from '@acedergren/fastify-apple-signin-drizzle';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

await app.register(appleAuthPlugin, {
  // ... apple config
  adapter: drizzleAdapter({ db }),
});
```

## Configuration

```typescript
interface DrizzleAdapterConfig {
  /** Drizzle database instance */
  db: PostgresJsDatabase | MySql2Database | BetterSQLite3Database;

  /** Table name prefix (default: 'auth_') */
  tablePrefix?: string;

  /** Auto-run migrations (default: false) */
  autoMigrate?: boolean;
}
```

## Database-Specific Setup

### PostgreSQL

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

const adapter = drizzleAdapter({ db });
```

### MySQL

```typescript
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

const adapter = drizzleAdapter({ db });
```

### SQLite

```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const sqlite = new Database('auth.db');
const db = drizzle(sqlite);

const adapter = drizzleAdapter({ db });
```

### Turso (LibSQL)

```typescript
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client);

const adapter = drizzleAdapter({ db });
```

## Schema

The adapter creates these tables:

```typescript
// PostgreSQL schema
import { pgTable, varchar, timestamp, boolean, integer } from 'drizzle-orm/pg-core';

export const authUsers = pgTable('auth_users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  appleId: varchar('apple_id', { length: 255 }).unique().notNull(),
  email: varchar('email', { length: 255 }),
  emailVerified: boolean('email_verified').default(false),
  fullName: varchar('full_name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const authSessions = pgTable('auth_sessions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).references(() => authUsers.id),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  userAgent: varchar('user_agent', { length: 512 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  lastUsedAt: timestamp('last_used_at').defaultNow(),
});

export const authLockouts = pgTable('auth_lockouts', {
  userId: varchar('user_id', { length: 36 }).primaryKey().references(() => authUsers.id),
  failedAttempts: integer('failed_attempts').default(0),
  lockedUntil: timestamp('locked_until'),
  lastFailedAt: timestamp('last_failed_at'),
});
```

## Migrations

### Auto Migration

```typescript
const adapter = drizzleAdapter({
  db,
  autoMigrate: true, // Creates tables on startup
});
```

### Manual Migration

Generate migrations:

```bash
pnpm drizzle-kit generate:pg
pnpm drizzle-kit push:pg
```

Or use the exported schema:

```typescript
import { authUsers, authSessions, authLockouts } from '@acedergren/fastify-apple-signin-drizzle/schema';
```

## Type Safety

The adapter is fully type-safe with Drizzle:

```typescript
// Types are inferred from schema
type User = typeof authUsers.$inferSelect;
type NewUser = typeof authUsers.$inferInsert;

// Queries are type-checked
const user = await adapter.findUserById('user-123');
// user: User | null
```

## Transactions

The adapter supports transactions:

```typescript
await db.transaction(async (tx) => {
  const user = await adapter.createUser(userData, tx);
  const session = await adapter.createSession(sessionData, tx);
  return { user, session };
});
```

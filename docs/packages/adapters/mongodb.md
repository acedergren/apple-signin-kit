# MongoDB Adapter

Database adapter for MongoDB and MongoDB Atlas.

## Installation

```bash
pnpm add @acedergren/fastify-apple-signin-mongodb mongodb
```

## Quick Start

```typescript
import { appleAuthPlugin } from '@acedergren/fastify-apple-auth';
import { mongodbAdapter } from '@acedergren/fastify-apple-signin-mongodb';
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();

const db = client.db('myapp');

await app.register(appleAuthPlugin, {
  // ... apple config
  adapter: mongodbAdapter({ db }),
});
```

## Configuration

```typescript
interface MongoDBAdapterConfig {
  /** MongoDB database instance */
  db: Db;

  /** Collection name prefix (default: 'auth_') */
  collectionPrefix?: string;

  /** Auto-create indexes (default: true) */
  autoIndex?: boolean;
}
```

## MongoDB Atlas

```typescript
import { MongoClient } from 'mongodb';

const uri = `mongodb+srv://${user}:${password}@cluster.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri);

await client.connect();
const db = client.db('production');

const adapter = mongodbAdapter({ db });
```

## Collections

The adapter creates these collections:

### auth_users

```javascript
{
  _id: ObjectId,
  appleId: String,        // Unique index
  email: String,
  emailVerified: Boolean,
  fullName: String,
  createdAt: Date,
  updatedAt: Date
}
```

### auth_sessions

```javascript
{
  _id: ObjectId,
  userId: ObjectId,       // Reference to auth_users
  tokenHash: String,      // Index
  userAgent: String,
  ipAddress: String,
  createdAt: Date,
  expiresAt: Date,        // TTL index
  lastUsedAt: Date
}
```

### auth_lockouts

```javascript
{
  _id: ObjectId,          // Same as userId
  userId: ObjectId,
  failedAttempts: Number,
  lockedUntil: Date,
  lastFailedAt: Date
}
```

## Indexes

Auto-created indexes for optimal query performance:

```javascript
// auth_users
db.auth_users.createIndex({ appleId: 1 }, { unique: true });
db.auth_users.createIndex({ email: 1 });

// auth_sessions
db.auth_sessions.createIndex({ userId: 1 });
db.auth_sessions.createIndex({ tokenHash: 1 });
db.auth_sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL

// auth_lockouts
db.auth_lockouts.createIndex({ userId: 1 }, { unique: true });
```

## TTL Index

Sessions are automatically cleaned up using MongoDB's TTL index:

```typescript
// Sessions expire based on expiresAt field
// MongoDB deletes expired documents automatically

const adapter = mongodbAdapter({
  db,
  // TTL index created automatically if autoIndex: true
  autoIndex: true,
});
```

## Transactions

For replica sets and sharded clusters:

```typescript
const session = client.startSession();

try {
  await session.withTransaction(async () => {
    const user = await adapter.createUser(userData, { session });
    const authSession = await adapter.createSession(sessionData, { session });
    return { user, authSession };
  });
} finally {
  await session.endSession();
}
```

## Change Streams

Monitor auth events in real-time:

```typescript
const usersCollection = db.collection('auth_users');

const changeStream = usersCollection.watch();

changeStream.on('change', (change) => {
  if (change.operationType === 'insert') {
    console.log('New user:', change.fullDocument);
  }
});
```

## Aggregation Pipelines

The adapter supports custom queries:

```typescript
// Get user session statistics
const stats = await db.collection('auth_sessions').aggregate([
  { $match: { userId: new ObjectId(userId) } },
  {
    $group: {
      _id: '$userId',
      totalSessions: { $sum: 1 },
      lastActive: { $max: '$lastUsedAt' },
    },
  },
]).toArray();
```

## Connection Pooling

MongoDB driver handles connection pooling automatically:

```typescript
const client = new MongoClient(uri, {
  maxPoolSize: 50,
  minPoolSize: 10,
  maxIdleTimeMS: 30000,
  waitQueueTimeoutMS: 5000,
});
```

## Troubleshooting

### Connection Issues

```
MongoServerSelectionError: connect ECONNREFUSED
```

**Solutions:**

- Verify MongoDB is running
- Check connection string format
- For Atlas, whitelist your IP address

### Slow Queries

**Solutions:**

- Ensure indexes are created (`autoIndex: true`)
- Use `explain()` to analyze queries
- Check Atlas Performance Advisor

### Memory Issues

**Solutions:**

- Limit result sets with pagination
- Use projections to return only needed fields
- Enable index-only queries where possible

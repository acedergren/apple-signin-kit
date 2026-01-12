# @acedergren/fastify-apple-signin-mongodb

MongoDB/Mongoose adapter for [@acedergren/fastify-apple-signin](https://github.com/acedergren/running-days/tree/main/packages/fastify-apple-auth) - Zero-config authentication storage.

## Features

- **Zero Configuration** - Just connect to MongoDB and go
- **TTL Index** - Expired refresh tokens are automatically deleted by MongoDB
- **TypeScript First** - Full type safety with Mongoose 8.x
- **Flexible** - Use default connection or bring your own
- **Production Ready** - Proper indexes for fast auth queries
- **Works with Atlas** - Compatible with MongoDB Atlas out of the box

## Installation

```bash
npm install @acedergren/fastify-apple-signin-mongodb mongoose
# or
pnpm add @acedergren/fastify-apple-signin-mongodb mongoose
# or
yarn add @acedergren/fastify-apple-signin-mongodb mongoose
```

**Requirements:**
- Node.js >= 18.0.0
- MongoDB >= 4.4 (for TTL indexes)
- Mongoose ^8.0.0 or ^7.0.0

## Quick Start

### With MongoDB Atlas (Recommended for Production)

```typescript
import mongoose from 'mongoose';
import Fastify from 'fastify';
import { createAuthRoutes } from '@acedergren/fastify-apple-signin';
import { createMongoAuthAdapter } from '@acedergren/fastify-apple-signin-mongodb';

// 1. Connect to MongoDB Atlas
// Get your connection string from: Atlas Dashboard > Connect > Drivers > Node.js
await mongoose.connect(
  'mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/myapp?retryWrites=true&w=majority'
);

// 2. Create adapter (uses default mongoose.connection automatically)
const { userRepository, refreshTokenRepository } = createMongoAuthAdapter();

// 3. Create Fastify app and register auth routes
const fastify = Fastify({ logger: true });

fastify.register(createAuthRoutes, {
  config: {
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
  },
  service: {
    userRepository,
    refreshTokenRepository,
  },
});

await fastify.listen({ port: 3000 });
console.log('Server running at http://localhost:3000');
```

### With Local MongoDB

```bash
# Start MongoDB locally with Docker
docker run -d --name mongodb -p 27017:27017 mongo:7

# Or install MongoDB locally:
# macOS: brew install mongodb-community
# Ubuntu: sudo apt install mongodb
# Windows: Download from mongodb.com
```

```typescript
import mongoose from 'mongoose';
import { createMongoAuthAdapter } from '@acedergren/fastify-apple-signin-mongodb';

// Connect to local MongoDB
await mongoose.connect('mongodb://localhost:27017/myapp');

// Create adapter
const { userRepository, refreshTokenRepository } = createMongoAuthAdapter();
```

## Connection String Examples

```bash
# Local MongoDB
MONGODB_URI=mongodb://localhost:27017/myapp

# Local with auth
MONGODB_URI=mongodb://admin:password@localhost:27017/myapp?authSource=admin

# MongoDB Atlas (free tier)
MONGODB_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/myapp?retryWrites=true&w=majority

# MongoDB Atlas (dedicated cluster)
MONGODB_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/myapp?retryWrites=true&w=majority&maxPoolSize=50

# Replica set
MONGODB_URI=mongodb://host1:27017,host2:27017,host3:27017/myapp?replicaSet=rs0
```

## Using a Custom Connection

For multi-database architectures or microservices, use a dedicated connection:

```typescript
import mongoose from 'mongoose';
import { createMongoAuthAdapter } from '@acedergren/fastify-apple-signin-mongodb';

// Create a dedicated connection for auth data
const authConnection = mongoose.createConnection(process.env.AUTH_MONGODB_URI!);

// Wait for connection to be ready
await authConnection.asPromise();

// Create adapter with explicit connection
const { userRepository, refreshTokenRepository } = createMongoAuthAdapter(authConnection);
```

## Database Schema

### Users Collection

```typescript
{
  _id: ObjectId,
  email: string,              // Indexed, lowercase
  role: 'user' | 'admin',
  appleUserId: string | null, // Unique sparse index
  createdAt: Date,
  updatedAt: Date,
  lastLoginAt: Date | null,
  // Account lockout fields
  failedLoginAttempts: number,
  lockedUntil: Date | null,
  lastFailedAttemptAt: Date | null
}
```

**Indexes:**
- `email` - For email lookups
- `appleUserId` - Unique sparse index for Apple Sign-In
- `{ email: 1, appleUserId: 1 }` - Compound index for auth queries

### Refresh Tokens Collection

```typescript
{
  _id: ObjectId,
  userId: ObjectId,           // References users
  tokenHash: string,          // Unique index (SHA-256 hash)
  userAgent: string | null,
  expiresAt: Date,            // TTL index - auto-deleted when expired
  createdAt: Date,
  lastUsedAt: Date | null,
  revoked: boolean
}
```

**Indexes:**
- `tokenHash` - Unique index for token lookups
- `userId` - For finding user's sessions
- `expiresAt` - TTL index (automatic cleanup by MongoDB)
- `{ userId: 1, revoked: 1, expiresAt: 1 }` - Compound index for session queries

## Mongoose Schema Customization

### Extending the User Model

If you need additional fields on your user model:

```typescript
import mongoose, { Schema } from 'mongoose';
import { createMongoAuthAdapter, userSchema, IUser } from '@acedergren/fastify-apple-signin-mongodb';

// Define extended interface
interface IExtendedUser extends IUser {
  displayName?: string;
  avatarUrl?: string;
  preferences: {
    theme: 'light' | 'dark';
    notifications: boolean;
  };
}

// Clone and extend the base schema
const extendedUserSchema = userSchema.clone();

extendedUserSchema.add({
  displayName: { type: String, default: null },
  avatarUrl: { type: String, default: null },
  preferences: {
    theme: { type: String, enum: ['light', 'dark'], default: 'dark' },
    notifications: { type: Boolean, default: true },
  },
});

// Register the extended model BEFORE creating the adapter
const ExtendedUserModel = mongoose.model<IExtendedUser>('User', extendedUserSchema);

// Now create the adapter - it will use your extended model
const adapter = createMongoAuthAdapter();

// The repository still works with AuthUser interface
// For extended fields, use the model directly:
const userWithPrefs = await ExtendedUserModel.findById(authUser.id);
console.log(userWithPrefs?.preferences.theme);
```

### Adding Pre/Post Hooks

```typescript
import { userSchema } from '@acedergren/fastify-apple-signin-mongodb';

// Add pre-save hook
userSchema.pre('save', function(next) {
  console.log('Creating user:', this.email);
  next();
});

// Add post-save hook
userSchema.post('save', function(doc) {
  // Send welcome email, analytics, etc.
  console.log('User created:', doc.email);
});
```

### Custom Validation

```typescript
import { userSchema } from '@acedergren/fastify-apple-signin-mongodb';

// Add custom email validation
userSchema.path('email').validate({
  validator: (email: string) => {
    // Only allow company emails
    return email.endsWith('@mycompany.com');
  },
  message: 'Only company emails are allowed',
});
```

## Index Optimization Guide

### Default Indexes (Auto-Created)

The adapter creates these indexes automatically:

| Collection | Index | Purpose |
|------------|-------|---------|
| users | `email_1` | Email lookups |
| users | `appleUserId_1` | Apple Sign-In (unique, sparse) |
| users | `email_1_appleUserId_1` | Compound auth queries |
| refresh_tokens | `tokenHash_1` | Token validation (unique) |
| refresh_tokens | `userId_1` | User session listing |
| refresh_tokens | `expiresAt_1` (TTL) | Auto-cleanup |
| refresh_tokens | `userId_1_revoked_1_expiresAt_1` | Active session queries |

### Adding Additional Indexes

```typescript
const { UserModel, RefreshTokenModel } = createMongoAuthAdapter();

// Add index for admin queries
await UserModel.collection.createIndex(
  { role: 1, createdAt: -1 },
  { background: true }
);

// Add index for analytics
await UserModel.collection.createIndex(
  { lastLoginAt: -1 },
  { background: true, sparse: true }
);

// Add index for session device tracking
await RefreshTokenModel.collection.createIndex(
  { userAgent: 1 },
  { background: true, sparse: true }
);
```

### Monitoring Index Performance

```typescript
// Get index statistics
const userIndexes = await UserModel.collection.indexes();
console.log('User indexes:', userIndexes);

// Analyze query performance
const explainResult = await UserModel.find({ email: 'test@example.com' })
  .explain('executionStats');
console.log('Query plan:', explainResult);
```

### Atlas Performance Tips

1. **Enable Performance Advisor** - Atlas automatically suggests indexes
2. **Use Read Preferences** - For read-heavy auth queries:
   ```typescript
   const authConnection = mongoose.createConnection(uri, {
     readPreference: 'secondaryPreferred',
   });
   ```
3. **Connection Pooling** - Adjust for your workload:
   ```typescript
   await mongoose.connect(uri, {
     maxPoolSize: 50,      // Default: 100
     minPoolSize: 10,      // Default: 0
     maxIdleTimeMS: 30000, // Close idle connections
   });
   ```

## Advanced Usage

### Accessing Models Directly

For custom queries beyond what the repositories provide:

```typescript
const { userRepository, UserModel, RefreshTokenModel } = createMongoAuthAdapter();

// Count admin users
const adminCount = await UserModel.countDocuments({ role: 'admin' });

// Find users created this month
const newUsers = await UserModel.find({
  createdAt: { $gte: new Date('2024-01-01') }
});

// Find all active sessions with aggregation
const sessionStats = await RefreshTokenModel.aggregate([
  { $match: { revoked: false, expiresAt: { $gt: new Date() } } },
  { $group: { _id: '$userId', sessionCount: { $sum: 1 } } },
  { $sort: { sessionCount: -1 } },
]);
```

### Session Management Dashboard

```typescript
// Get all active sessions for a user (for "manage devices" UI)
const sessions = await refreshTokenRepository.findActiveByUser(userId);

// Format for UI
const devices = sessions.map(session => ({
  id: session.id,
  device: parseUserAgent(session.userAgent),
  createdAt: session.createdAt,
  lastUsed: session.lastUsedAt || session.createdAt,
}));

// Revoke a specific session (logout from one device)
await refreshTokenRepository.revokeByHash(sessionTokenHash);

// Revoke all sessions (logout from all devices)
await refreshTokenRepository.revokeAllForUser(userId);
```

### Background Cleanup Job

While MongoDB TTL indexes handle cleanup automatically, you can run manual cleanup:

```typescript
import cron from 'node-cron';

// Run cleanup daily at 3 AM
cron.schedule('0 3 * * *', async () => {
  const { refreshTokenRepository } = createMongoAuthAdapter();
  const deleted = await refreshTokenRepository.deleteExpired();
  console.log(`Cleaned up ${deleted} expired tokens`);
});
```

## Environment Variables

```bash
# MongoDB Connection
MONGODB_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/myapp?retryWrites=true&w=majority

# Apple Sign-In (from Apple Developer Console)
APPLE_CLIENT_ID=com.example.myapp
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_KEY_ID=XXXXXXXXXX
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# JWT
JWT_SECRET=your-secure-secret-at-least-32-characters
```

## API Reference

### `createMongoAuthAdapter(connection?)`

Creates MongoDB repositories for fastify-apple-auth.

**Parameters:**
- `connection` (optional): Mongoose Connection. Defaults to `mongoose.connection`.

**Returns:**
```typescript
{
  userRepository: UserRepository,      // Auth operations
  refreshTokenRepository: RefreshTokenRepository,  // Session management
  UserModel: Model<IUser>,             // Direct model access
  RefreshTokenModel: Model<IRefreshToken>  // Direct model access
}
```

### `getUserModel(connection)`

Get the User model for a specific connection. Handles model registration idempotently.

### `getRefreshTokenModel(connection)`

Get the RefreshToken model for a specific connection. Handles model registration idempotently.

### `userSchema`

The Mongoose schema for users. Can be cloned and extended.

### `refreshTokenSchema`

The Mongoose schema for refresh tokens. Can be cloned and extended.

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type {
  // MongoDB-specific types
  IUser,
  UserDocument,
  IRefreshToken,
  RefreshTokenDocument,
  MongoAuthAdapter,
} from '@acedergren/fastify-apple-signin-mongodb';

// Re-exported from fastify-apple-auth for convenience
import type {
  AuthUser,
  RefreshToken,
  UserRepository,
  RefreshTokenRepository,
  UserLockoutState,
  AuthService,
} from '@acedergren/fastify-apple-signin-mongodb';
```

## Testing

Tests use `mongodb-memory-server` for complete isolation:

```bash
# Run tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

## Troubleshooting

### Connection Issues

```typescript
// Enable Mongoose debugging
mongoose.set('debug', true);

// Check connection state
console.log('Connection state:', mongoose.connection.readyState);
// 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
```

### Index Not Being Used

```typescript
// Check if index exists
const indexes = await UserModel.collection.indexes();
console.log(indexes);

// Force index hint (for testing)
const result = await UserModel.find({ email: 'test@example.com' })
  .hint('email_1');
```

### TTL Index Not Deleting Tokens

MongoDB's TTL monitor runs every 60 seconds. If tokens aren't being deleted:

1. Check the index exists: `db.refresh_tokens.getIndexes()`
2. Check expiresAt field is a Date type (not string)
3. Wait at least 60 seconds after expiry

## License

MIT

## Related Packages

- [@acedergren/fastify-apple-signin](https://github.com/acedergren/running-days/tree/main/packages/fastify-apple-auth) - The main auth plugin
- [@acedergren/fastify-apple-signin-drizzle](https://github.com/acedergren/running-days/tree/main/packages/fastify-apple-signin-drizzle) - Drizzle ORM adapter
- [@acedergren/fastify-apple-signin-oracle](https://github.com/acedergren/running-days/tree/main/packages/fastify-apple-signin-oracle) - Oracle Database adapter

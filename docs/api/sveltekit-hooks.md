# SvelteKit Hooks API

API reference for `@acedergren/sveltekit-apple-signin` hooks and utilities.

## createAuthHooks

Creates server hooks for session management.

```typescript
// src/hooks.server.ts
import { createAuthHooks } from '@acedergren/sveltekit-apple-signin';

export const handle = createAuthHooks(options);
```

### Options

```typescript
interface AuthHooksOptions {
  /** Backend API URL */
  apiUrl: string;

  /** Access token cookie name (default: 'access_token') */
  accessTokenCookie?: string;

  /** Refresh token cookie name (default: 'refresh_token') */
  refreshTokenCookie?: string;

  /** API endpoint for token refresh (default: '/api/auth/refresh') */
  refreshEndpoint?: string;

  /** API endpoint to get user (default: '/api/auth/me') */
  userEndpoint?: string;

  /** Routes that don't require auth */
  publicRoutes?: string[];

  /** Redirect unauthenticated users to this path */
  loginRedirect?: string;

  /** Custom error handler */
  onError?: (error: Error) => void;
}
```

### Example

```typescript
export const handle = createAuthHooks({
  apiUrl: 'https://api.yourapp.com',
  accessTokenCookie: 'auth_token',
  publicRoutes: ['/', '/login', '/about'],
  loginRedirect: '/login',
  onError: (error) => {
    console.error('Auth error:', error);
  },
});
```

## Combining Hooks

Use `sequence` from SvelteKit:

```typescript
import { sequence } from '@sveltejs/kit/hooks';
import { createAuthHooks } from '@acedergren/sveltekit-apple-signin';

const auth = createAuthHooks({ apiUrl: '...' });

const logging: Handle = async ({ event, resolve }) => {
  console.log(`${event.request.method} ${event.url.pathname}`);
  return resolve(event);
};

const security: Handle = async ({ event, resolve }) => {
  // Add security headers
  const response = await resolve(event);
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
};

export const handle = sequence(logging, auth, security);
```

## App.Locals

The hooks add user info to `locals`:

```typescript
// src/app.d.ts
import type { User } from '@acedergren/sveltekit-apple-signin';

declare global {
  namespace App {
    interface Locals {
      user: User | null;
      session: Session | null;
    }
  }
}

export {};
```

### Usage in Load Functions

```typescript
// src/routes/dashboard/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  return {
    user: locals.user,
  };
};
```

### Usage in Actions

```typescript
// src/routes/settings/+page.server.ts
import type { Actions } from './$types';

export const actions: Actions = {
  updateProfile: async ({ locals, request }) => {
    if (!locals.user) {
      return { error: 'Unauthorized' };
    }

    const data = await request.formData();
    // Update user...
  },
};
```

## createApiClient

Creates an authenticated API client.

```typescript
import { createApiClient } from '@acedergren/sveltekit-apple-signin';

const api = createApiClient({
  baseUrl: 'https://api.yourapp.com',
  credentials: 'include', // Send cookies
});
```

### Methods

```typescript
interface ApiClient {
  get<T>(path: string, options?: RequestInit): Promise<T>;
  post<T>(path: string, body?: unknown, options?: RequestInit): Promise<T>;
  put<T>(path: string, body?: unknown, options?: RequestInit): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: RequestInit): Promise<T>;
  delete<T>(path: string, options?: RequestInit): Promise<T>;
}
```

### Example

```typescript
// In a load function
export const load: PageServerLoad = async ({ fetch }) => {
  const api = createApiClient({
    baseUrl: 'https://api.yourapp.com',
    fetch, // Use SvelteKit's fetch for SSR
  });

  const workouts = await api.get('/api/workouts');
  return { workouts };
};
```

## Protected Route Helper

Utility for protecting routes:

```typescript
import { protectedRoute } from '@acedergren/sveltekit-apple-signin';

// src/routes/dashboard/+page.server.ts
export const load = protectedRoute(async ({ locals }) => {
  // locals.user is guaranteed to exist
  return {
    user: locals.user,
  };
});
```

### With Custom Redirect

```typescript
export const load = protectedRoute(
  async ({ locals }) => {
    return { user: locals.user };
  },
  { redirectTo: '/custom-login' }
);
```

## Token Utilities

### getAccessToken

Get access token from cookies:

```typescript
import { getAccessToken } from '@acedergren/sveltekit-apple-signin';

// In hooks or load functions
const token = getAccessToken(event.cookies);
```

### parseJwt

Parse JWT payload (without verification):

```typescript
import { parseJwt } from '@acedergren/sveltekit-apple-signin';

const payload = parseJwt(token);
// { sub: 'user-id', exp: 1234567890, ... }
```

### isTokenExpired

Check if token is expired:

```typescript
import { isTokenExpired } from '@acedergren/sveltekit-apple-signin';

if (isTokenExpired(token)) {
  // Refresh needed
}
```

## Error Types

```typescript
import { AuthError } from '@acedergren/sveltekit-apple-signin';

enum AuthErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  REFRESH_FAILED = 'REFRESH_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

class AuthError extends Error {
  code: AuthErrorCode;
  statusCode: number;
}
```

### Error Handling

```typescript
import { AuthError, AuthErrorCode } from '@acedergren/sveltekit-apple-signin';

try {
  const data = await api.get('/protected');
} catch (error) {
  if (error instanceof AuthError) {
    switch (error.code) {
      case AuthErrorCode.UNAUTHORIZED:
        goto('/login');
        break;
      case AuthErrorCode.TOKEN_EXPIRED:
        // Auto-refresh should handle this
        break;
      case AuthErrorCode.NETWORK_ERROR:
        showError('Network error, please try again');
        break;
    }
  }
}
```

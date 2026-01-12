# @acedergren/sveltekit-apple-signin

Zero-config Apple Sign-In SDK for SvelteKit 2 with Svelte 5 runes support.

## Features

- **Zero Config** - One import gets you authentication
- **Svelte 5 Ready** - Uses runes (`$state`, `$derived`, `$props`)
- **SSR Safe** - All browser APIs are properly guarded
- **TypeScript First** - Full type safety out of the box
- **httpOnly Cookies** - Tokens stay server-side for security
- **Token Refresh** - Automatic silent refresh on 401
- **Apple HIG Compliant** - Button follows Apple's design guidelines

## Installation

```bash
npm install @acedergren/sveltekit-apple-signin
# or
pnpm add @acedergren/sveltekit-apple-signin
# or
yarn add @acedergren/sveltekit-apple-signin
```

## Quick Start

### 1. Configure Server Hooks

Create or update `src/hooks.server.ts`:

```typescript
import { createAuthHooks } from '@acedergren/sveltekit-apple-signin';

export const { handle, handleFetch } = createAuthHooks({
  apiUrl: 'https://api.example.com' // Your API server URL
});
```

### 2. Add the Sign-In Button

```svelte
<!-- src/routes/auth/login/+page.svelte -->
<script>
  import { AppleSignInButton } from '@acedergren/sveltekit-apple-signin';
</script>

<div class="login-page">
  <h1>Welcome</h1>
  <AppleSignInButton />
</div>
```

That's it! You now have Apple Sign-In working.

## Prerequisites

This SDK requires a backend API implementing the following endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/auth/apple` | GET | Initiates Apple Sign-In, returns `{ authUrl }` |
| `/api/v1/auth/apple/callback` | POST | Exchanges code for tokens |
| `/api/v1/auth/me` | GET | Returns current user |
| `/api/v1/auth/refresh` | POST | Refreshes access token |
| `/api/v1/auth/logout` | POST | Logs out user |

We recommend using [`@acedergren/fastify-apple-signin`](https://github.com/acedergren/fastify-apple-signin) for the backend.

## Configuration Options

```typescript
import { createAuthHooks } from '@acedergren/sveltekit-apple-signin';

export const { handle, handleFetch } = createAuthHooks({
  // Required: Your API server URL
  apiUrl: 'https://api.example.com',

  // Optional: Routes that don't require authentication
  // Default: ['/auth/login', '/auth/apple', '/auth/apple/callback', '/api']
  publicRoutes: ['/auth/login', '/about', '/pricing'],

  // Optional: Where to redirect unauthenticated users
  // Default: '/auth/login'
  loginPath: '/auth/login',

  // Optional: Custom cookie names
  cookies: {
    accessToken: 'my_access_token',
    refreshToken: 'my_refresh_token'
  },

  // Optional: Error callback
  onAuthError: (error) => {
    console.error('Auth failed:', error.message);
    // Return true to suppress default redirect
  },

  // Optional: Success callback
  onAuthenticated: (user) => {
    console.log('User logged in:', user.email);
  }
});
```

## TypeScript Setup

Add auth types to your `src/app.d.ts`:

```typescript
import type { AuthUser, ApiClient } from '@acedergren/sveltekit-apple-signin';

declare global {
  namespace App {
    interface Locals {
      user: AuthUser | null;
      api: ApiClient;
    }
    interface PageData {
      user?: AuthUser | null;
    }
  }
}

export {};
```

## Accessing User Data

### In Server Load Functions

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import { requireAuth } from '@acedergren/sveltekit-apple-signin';

export const load: PageServerLoad = async (event) => {
  // Throws redirect to login if not authenticated
  const session = requireAuth(event);

  // session.user is guaranteed non-null
  // session.api is available for API calls

  return {
    user: session.user,
    message: `Welcome back, ${session.user.email}!`
  };
};
```

### In Layout Load Functions

```typescript
// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { getUser } from '@acedergren/sveltekit-apple-signin';

export const load: LayoutServerLoad = async (event) => {
  // Returns null if not authenticated (no redirect)
  const user = getUser(event);

  return { user };
};
```

### In Components (Client-Side)

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { initAuth, getAuthState } from '@acedergren/sveltekit-apple-signin/stores';

  let { data, children } = $props();

  // Initialize auth state from server data
  initAuth(data);

  // Get reactive auth state
  const auth = getAuthState();
</script>

{#if auth.isLoading}
  <LoadingSpinner />
{:else}
  <nav>
    {#if auth.isAuthenticated}
      <span>Welcome, {auth.user?.email}</span>
      <button onclick={() => signOut()}>Logout</button>
    {:else}
      <a href="/auth/login">Login</a>
    {/if}
  </nav>
  {@render children()}
{/if}
```

## Session Utilities

### `getSession(event)`

Get the current session (safe if not authenticated):

```typescript
import { getSession } from '@acedergren/sveltekit-apple-signin';

const session = getSession(event);
if (session.isAuthenticated) {
  // Do something with session.user
}
```

### `requireAuth(event, options?)`

Require authentication (redirects if not authenticated):

```typescript
import { requireAuth } from '@acedergren/sveltekit-apple-signin';

// Throws redirect(303, '/auth/login?returnTo=...')
const session = requireAuth(event);
// session.user is guaranteed non-null here
```

Options:

```typescript
requireAuth(event, {
  loginPath: '/custom/login',      // Custom login URL
  includeReturnTo: true            // Include returnTo in redirect (default: true)
});
```

### `requireAdmin(event, options?)`

Require admin role (403 if not admin):

```typescript
import { requireAdmin } from '@acedergren/sveltekit-apple-signin';

// Throws redirect or 403
const session = requireAdmin(event);
// session.user.role === 'admin' guaranteed
```

### `redirectIfAuthenticated(event, redirectTo?)`

Redirect if already logged in (for login pages):

```typescript
import { redirectIfAuthenticated } from '@acedergren/sveltekit-apple-signin';

export const load = async (event) => {
  // Redirect to /dashboard if user is already logged in
  redirectIfAuthenticated(event, '/dashboard');

  // Continue with login page
  return {};
};
```

### `getReturnTo(event, defaultPath?)`

Get safe return URL from query params:

```typescript
import { getReturnTo } from '@acedergren/sveltekit-apple-signin';

// After successful login
const returnTo = getReturnTo(event, '/dashboard');
throw redirect(303, returnTo);
```

## AppleSignInButton Component

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'black' \| 'white' \| 'outline'` | `'black'` | Button color scheme |
| `size` | `'small' \| 'medium' \| 'large'` | `'medium'` | Button size |
| `label` | `string` | `'Sign in with Apple'` | Button text |
| `showLogo` | `boolean` | `true` | Show Apple logo |
| `fullWidth` | `boolean` | `false` | Full width button |
| `disabled` | `boolean` | `false` | Disabled state |
| `returnTo` | `string` | - | Redirect after login |
| `onClick` | `() => void` | - | Custom click handler |
| `class` | `string` | - | Additional CSS class |

### Examples

```svelte
<!-- Default black button -->
<AppleSignInButton />

<!-- White button with custom text -->
<AppleSignInButton variant="white" label="Continue with Apple" />

<!-- Large outline button, full width -->
<AppleSignInButton variant="outline" size="large" fullWidth />

<!-- Custom return URL -->
<AppleSignInButton returnTo="/dashboard" />

<!-- Custom click handler -->
<AppleSignInButton onClick={() => {
  analytics.track('login_started');
  signInWithApple('/dashboard');
}} />
```

## Client-Side Auth Functions

### `signInWithApple(returnTo?)`

Initiate Apple Sign-In from client:

```typescript
import { signInWithApple } from '@acedergren/sveltekit-apple-signin/stores';

// Navigate to Apple Sign-In
signInWithApple('/dashboard');
```

### `signOut(redirectTo?)`

Sign out and redirect:

```typescript
import { signOut } from '@acedergren/sveltekit-apple-signin/stores';

// Sign out and redirect to home
await signOut('/');
```

## Auth Routes Setup

Create these routes in your SvelteKit app:

### `/auth/apple/+server.ts` - Initiate Sign-In

```typescript
import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals, cookies, url }) => {
  const returnTo = url.searchParams.get('returnTo') || '/';

  // Get auth URL from API
  const { authUrl, response } = await locals.api.initiateAppleSignIn();

  // Forward cookies from API response
  const setCookies = response.headers.getSetCookie?.() || [];
  for (const cookie of setCookies) {
    const [nameValue] = cookie.split(';');
    const [name, value] = nameValue.split('=');
    if (name && value) {
      cookies.set(name, value, { path: '/' });
    }
  }

  // Store returnTo for after callback
  cookies.set('auth_return_to', returnTo, {
    path: '/',
    maxAge: 600,
    httpOnly: true
  });

  throw redirect(303, authUrl);
};
```

### `/auth/apple/callback/+server.ts` - Handle Callback

```typescript
import type { RequestHandler } from './$types';
import { redirect, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    throw error(400, 'Missing code or state');
  }

  try {
    const { response, data } = await locals.api.completeAppleSignIn(code, state);

    // Forward auth cookies
    const setCookies = response.headers.getSetCookie?.() || [];
    for (const cookie of setCookies) {
      const [nameValue] = cookie.split(';');
      const [name, value] = nameValue.split('=');
      if (name && value) {
        cookies.set(name, value, {
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'lax'
        });
      }
    }

    // Get return URL
    const returnTo = cookies.get('auth_return_to') || '/';
    cookies.delete('auth_return_to', { path: '/' });

    throw redirect(303, returnTo);
  } catch (err) {
    console.error('Apple Sign-In callback failed:', err);
    throw redirect(303, '/auth/login?error=auth_failed');
  }
};
```

### `/auth/logout/+server.ts` - Logout

```typescript
import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ locals, cookies }) => {
  await locals.api.logout();

  // Clear auth cookies
  cookies.delete('rd_access_token', { path: '/' });
  cookies.delete('rd_refresh_token', { path: '/' });

  throw redirect(303, '/');
};
```

## Combining with Other Hooks

```typescript
// hooks.server.ts
import { createAuthHooks } from '@acedergren/sveltekit-apple-signin';
import { sequence } from '@sveltejs/kit/hooks';
import * as Sentry from '@sentry/sveltekit';

const authHooks = createAuthHooks({
  apiUrl: process.env.API_URL || 'http://localhost:3000'
});

// Combine multiple hooks
export const handle = sequence(
  Sentry.sentryHandle(),
  authHooks.handle
);

export const handleFetch = authHooks.handleFetch;
export const handleError = Sentry.handleErrorWithSentry();
```

## API Reference

### Types

```typescript
interface AuthUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  isActive?: boolean;
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Session {
  user: AuthUser | null;
  api: ApiClient;
  isAuthenticated: boolean;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  error: AuthError | null;
  isAuthenticated: boolean;
}

interface ApiClient {
  initiateAppleSignIn(): Promise<{ authUrl: string; response: Response }>;
  completeAppleSignIn(code: string, state: string): Promise<{ response: Response; data: LoginResponse }>;
  logout(): Promise<void>;
  refreshToken(): Promise<{ response: Response }>;
  getCurrentUser(): Promise<AuthUser>;
}
```

## License

MIT

## Contributing

Pull requests welcome! Please read our contributing guidelines first.

## Related Packages

- [`@acedergren/fastify-apple-signin`](https://github.com/acedergren/fastify-apple-signin) - Fastify backend plugin
- [`@acedergren/fastify-apple-signin-drizzle`](https://github.com/acedergren/fastify-apple-signin-drizzle) - Drizzle ORM adapter
- [`@acedergren/fastify-apple-signin-oracle`](https://github.com/acedergren/fastify-apple-signin-oracle) - Oracle DB adapter

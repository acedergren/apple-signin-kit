# sveltekit-apple-signin

SvelteKit integration for Apple Sign-In with Svelte 5 support.

## Features

- **Svelte 5 Runes** - Modern reactive state with `$props()`, `$state()`
- **Apple HIG Compliant** - Button styles follow Apple Human Interface Guidelines
- **Server Hooks** - Session management in `hooks.server.ts`
- **Type-Safe** - Full TypeScript support

## Installation

```bash
pnpm add @acedergren/sveltekit-apple-signin
```

**Peer Dependencies:**

```bash
pnpm add svelte @sveltejs/kit
```

## Quick Start

### 1. Add Sign-In Button

```svelte
<!-- src/routes/login/+page.svelte -->
<script lang="ts">
  import { AppleSignInButton } from '@acedergren/sveltekit-apple-signin';
  import { goto } from '$app/navigation';

  function handleSuccess(event: CustomEvent<{ user: User }>) {
    goto('/dashboard');
  }
</script>

<AppleSignInButton
  variant="black"
  size="large"
  on:success={handleSuccess}
/>
```

### 2. Configure Hooks

```typescript
// src/hooks.server.ts
import { createAuthHooks } from '@acedergren/sveltekit-apple-signin';

export const handle = createAuthHooks({
  apiUrl: process.env.API_URL || 'http://localhost:3000',
});
```

### 3. Access User in Routes

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  return {
    user: locals.user,
  };
};
```

## Components

### AppleSignInButton

Apple-styled sign-in button following Human Interface Guidelines.

```svelte
<AppleSignInButton
  variant="black"
  size="medium"
  fullWidth={false}
  label="Sign in with Apple"
  apiEndpoint="/api/auth/apple"
  redirectTo="/dashboard"
  on:success={handleSuccess}
  on:error={handleError}
  on:loading={handleLoading}
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'black' \| 'white' \| 'outline'` | `'black'` | Button color scheme |
| `size` | `'small' \| 'medium' \| 'large'` | `'medium'` | Button size |
| `fullWidth` | `boolean` | `false` | Expand to container width |
| `label` | `string` | `'Sign in with Apple'` | Button text |
| `apiEndpoint` | `string` | `'/api/auth/apple'` | Backend OAuth endpoint |
| `redirectTo` | `string` | `'/'` | Redirect after success |
| `disabled` | `boolean` | `false` | Disable button |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `success` | `{ user: User, accessToken: string }` | Sign-in succeeded |
| `error` | `{ error: Error, code: string }` | Sign-in failed |
| `loading` | `{ isLoading: boolean }` | Loading state changed |

#### Styling

Button sizes follow Apple HIG:

| Size | Height | Font Size | Border Radius |
|------|--------|-----------|---------------|
| `small` | 32px | 14px | 4px |
| `medium` | 44px | 16px | 6px |
| `large` | 56px | 18px | 8px |

Custom styling:

```svelte
<AppleSignInButton
  variant="black"
  class="my-custom-class"
  style="--button-radius: 12px;"
/>
```

### UserMenu

Dropdown menu showing current user with sign-out option.

```svelte
<script lang="ts">
  import { UserMenu } from '@acedergren/sveltekit-apple-signin';

  let { data } = $props();
</script>

{#if data.user}
  <UserMenu user={data.user} />
{:else}
  <AppleSignInButton />
{/if}
```

## Hooks

### createAuthHooks

Create server hooks for session management:

```typescript
// src/hooks.server.ts
import { createAuthHooks } from '@acedergren/sveltekit-apple-signin';

export const handle = createAuthHooks({
  // Required
  apiUrl: 'https://api.yourapp.com',

  // Optional
  cookieName: 'auth_token',
  refreshEndpoint: '/api/auth/refresh',
  userEndpoint: '/api/auth/me',
});
```

### Combining with Other Hooks

```typescript
import { sequence } from '@sveltejs/kit/hooks';
import { createAuthHooks } from '@acedergren/sveltekit-apple-signin';

const authHooks = createAuthHooks({ apiUrl: '...' });

const loggingHook: Handle = async ({ event, resolve }) => {
  console.log(`${event.request.method} ${event.url.pathname}`);
  return resolve(event);
};

export const handle = sequence(loggingHook, authHooks);
```

## Stores

### authStore

Reactive store for authentication state:

```svelte
<script lang="ts">
  import { authStore } from '@acedergren/sveltekit-apple-signin';

  // Reactive access
  const isAuthenticated = $derived(authStore.isAuthenticated);
  const user = $derived(authStore.user);
</script>

{#if isAuthenticated}
  <p>Welcome, {user?.email}</p>
{/if}
```

### Methods

```typescript
import { authStore } from '@acedergren/sveltekit-apple-signin';

// Sign out
await authStore.signOut();

// Refresh session
await authStore.refresh();

// Get current user
const user = authStore.user;
```

## API Client

Low-level API client for custom integrations:

```typescript
import { createApiClient } from '@acedergren/sveltekit-apple-signin';

const api = createApiClient({
  baseUrl: 'https://api.yourapp.com',
});

// Make authenticated requests
const response = await api.get('/api/protected-resource');
```

## TypeScript

### Types

```typescript
import type {
  User,
  Session,
  AuthState,
  AppleSignInConfig,
} from '@acedergren/sveltekit-apple-signin';

interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  fullName?: string;
  createdAt: Date;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
```

### App.Locals

Extend SvelteKit's locals:

```typescript
// src/app.d.ts
import type { User } from '@acedergren/sveltekit-apple-signin';

declare global {
  namespace App {
    interface Locals {
      user: User | null;
    }
  }
}

export {};
```

## SSR Considerations

The package is SSR-safe:

- Components check for browser environment
- Cookies handled on server via hooks
- No client-side storage required

```svelte
<script lang="ts">
  import { browser } from '$app/environment';
  import { AppleSignInButton } from '@acedergren/sveltekit-apple-signin';
</script>

<!-- Button renders safely on server -->
<AppleSignInButton />
```

## Error Handling

```svelte
<script lang="ts">
  import { AppleSignInButton } from '@acedergren/sveltekit-apple-signin';

  function handleError(event: CustomEvent) {
    const { error, code } = event.detail;

    switch (code) {
      case 'POPUP_CLOSED':
        // User closed sign-in popup
        break;
      case 'NETWORK_ERROR':
        // Network issue
        break;
      case 'AUTH_FAILED':
        // Authentication failed
        break;
    }
  }
</script>

<AppleSignInButton on:error={handleError} />
```

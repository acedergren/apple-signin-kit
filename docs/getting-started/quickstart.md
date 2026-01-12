# Quick Start

Get Apple Sign-In working in 5 minutes.

## Prerequisites

Before starting, ensure you have:

1. An [Apple Developer Account](https://developer.apple.com/)
2. Sign in with Apple configured (see [Apple Setup Guide](apple-setup.md))
3. Node.js 20+ or Swift 6+ depending on platform

## Backend Setup (Fastify)

### 1. Install Dependencies

```bash
pnpm add @acedergren/fastify-apple-auth @acedergren/fastify-apple-signin-drizzle
pnpm add fastify @fastify/cookie jose drizzle-orm
```

### 2. Create Server

```typescript
// server.ts
import fastify from 'fastify';
import cookie from '@fastify/cookie';
import { appleAuthPlugin } from '@acedergren/fastify-apple-auth';
import { drizzleAdapter } from '@acedergren/fastify-apple-signin-drizzle';
import { db } from './db'; // Your Drizzle instance

const app = fastify({ logger: true });

// Register cookie plugin first
await app.register(cookie, {
  secret: process.env.COOKIE_SECRET,
});

// Register Apple auth
await app.register(appleAuthPlugin, {
  apple: {
    clientId: process.env.APPLE_CLIENT_ID!,
    teamId: process.env.APPLE_TEAM_ID!,
    keyId: process.env.APPLE_KEY_ID!,
    privateKey: process.env.APPLE_PRIVATE_KEY!,
  },
  jwt: {
    secret: process.env.JWT_SECRET!,
    accessTokenTtl: '15m',
    refreshTokenTtl: '7d',
  },
  adapter: drizzleAdapter({ db }),
  routes: {
    prefix: '/api/auth',
  },
});

await app.listen({ port: 3000 });
console.log('Server running at http://localhost:3000');
```

### 3. Environment Variables

```bash
# .env
APPLE_CLIENT_ID=com.yourapp.service
APPLE_TEAM_ID=ABC123DEF4
APPLE_KEY_ID=XYZ987KEY1
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

JWT_SECRET=your-32-character-minimum-secret
COOKIE_SECRET=another-32-character-secret
```

## Frontend Setup (SvelteKit)

### 1. Install Package

```bash
pnpm add @acedergren/sveltekit-apple-signin
```

### 2. Create Login Page

```svelte
<!-- src/routes/login/+page.svelte -->
<script lang="ts">
  import { AppleSignInButton } from '@acedergren/sveltekit-apple-signin';
  import { goto } from '$app/navigation';

  async function handleSuccess(event: CustomEvent) {
    const { user, accessToken } = event.detail;
    console.log('Signed in as:', user.email);
    goto('/dashboard');
  }

  function handleError(event: CustomEvent) {
    console.error('Sign-in failed:', event.detail.error);
  }
</script>

<div class="login-container">
  <h1>Welcome</h1>

  <AppleSignInButton
    variant="black"
    size="large"
    fullWidth
    apiEndpoint="/api/auth/apple"
    on:success={handleSuccess}
    on:error={handleError}
  />
</div>

<style>
  .login-container {
    max-width: 400px;
    margin: 4rem auto;
    padding: 2rem;
  }
</style>
```

### 3. Configure SvelteKit Hooks

```typescript
// src/hooks.server.ts
import { createAuthHooks } from '@acedergren/sveltekit-apple-signin';

export const handle = createAuthHooks({
  apiUrl: 'http://localhost:3000',
  cookieName: 'auth_token',
});
```

## iOS Setup (Swift)

### 1. Add Package

In Xcode: File → Add Package Dependencies → Enter URL:

```
https://github.com/acedergren/apple-signin-kit
```

### 2. Enable Capability

1. Select your target in Xcode
2. Go to "Signing & Capabilities"
3. Click "+ Capability"
4. Add "Sign in with Apple"

### 3. Implement Sign-In

```swift
import SwiftUI
import AppleSignInKit

struct LoginView: View {
    @State private var isLoading = false
    @State private var error: Error?

    private let authService = AppleSignInService()

    var body: some View {
        VStack(spacing: 20) {
            Text("Welcome")
                .font(.largeTitle)

            AppleSignInButton(type: .signIn, style: .black)
                .frame(height: 50)
                .onTapGesture {
                    Task {
                        await signIn()
                    }
                }

            if isLoading {
                ProgressView()
            }

            if let error {
                Text(error.localizedDescription)
                    .foregroundColor(.red)
            }
        }
        .padding()
    }

    private func signIn() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let credential = try await authService.signIn()

            // Send to your backend
            let session = try await authService.authenticate(
                credential: credential,
                apiUrl: "https://api.yourapp.com"
            )

            print("Signed in as: \(session.user.email)")
        } catch {
            self.error = error
        }
    }
}
```

## Test the Flow

1. **Start backend:** `pnpm dev`
2. **Start frontend:** `pnpm --filter web dev`
3. **Navigate to:** `http://localhost:5173/login`
4. **Click "Sign in with Apple"**

The complete OAuth flow:

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Apple

    User->>Frontend: Click "Sign in with Apple"
    Frontend->>Backend: GET /api/auth/apple/init
    Backend->>Frontend: Redirect URL + PKCE challenge
    Frontend->>Apple: Authorization request
    Apple->>User: Apple Sign-In prompt
    User->>Apple: Authenticate
    Apple->>Backend: POST /api/auth/apple/callback
    Backend->>Apple: Exchange code for tokens
    Apple->>Backend: ID token + access token
    Backend->>Backend: Verify, create session
    Backend->>Frontend: Set cookies, redirect
    Frontend->>User: Logged in!
```

## Next Steps

- [Security Overview](../security/index.md) - Understand the security model
- [API Reference](../api/types.md) - Full API documentation
- [Database Adapters](../packages/index.md) - Configure your database

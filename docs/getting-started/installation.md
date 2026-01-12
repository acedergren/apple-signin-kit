# Installation

## Package Manager Support

All npm packages support pnpm, npm, and yarn:

=== "pnpm"

    ```bash
    pnpm add @acedergren/fastify-apple-auth
    ```

=== "npm"

    ```bash
    npm install @acedergren/fastify-apple-auth
    ```

=== "yarn"

    ```bash
    yarn add @acedergren/fastify-apple-auth
    ```

## Backend Packages

### Core Authentication

```bash
pnpm add @acedergren/fastify-apple-auth
```

**Peer Dependencies:**

- `fastify` >= 5.0.0
- `jose` >= 6.0.0
- `@fastify/cookie` >= 11.0.0

### Database Adapters

Choose one adapter based on your database:

=== "Oracle"

    ```bash
    pnpm add @acedergren/fastify-apple-signin-oracle
    ```

    **Peer Dependencies:**

    - `oracledb` >= 6.0.0

=== "Drizzle ORM"

    ```bash
    pnpm add @acedergren/fastify-apple-signin-drizzle
    ```

    **Peer Dependencies:**

    - `drizzle-orm` >= 0.36.0

=== "MongoDB"

    ```bash
    pnpm add @acedergren/fastify-apple-signin-mongodb
    ```

    **Peer Dependencies:**

    - `mongodb` >= 6.0.0

## Frontend Package

### SvelteKit

```bash
pnpm add @acedergren/sveltekit-apple-signin
```

**Peer Dependencies:**

- `svelte` >= 5.0.0
- `@sveltejs/kit` >= 2.0.0

## iOS Package

### Swift Package Manager

Add to your `Package.swift`:

```swift
dependencies: [
    .package(
        url: "https://github.com/acedergren/apple-signin-sdk",
        from: "1.0.0"
    )
]
```

Then add the target dependency:

```swift
.target(
    name: "YourApp",
    dependencies: [
        .product(name: "AppleSignInKit", package: "apple-signin-sdk")
    ]
)
```

### Xcode

1. File → Add Package Dependencies
2. Enter: `https://github.com/acedergren/apple-signin-sdk`
3. Select version: `1.0.0` or later
4. Add `AppleSignInKit` to your target

## Version Compatibility

| Package | Node.js | TypeScript | Svelte | Swift |
|---------|---------|------------|--------|-------|
| fastify-apple-auth | >= 20 | >= 5.0 | - | - |
| sveltekit-apple-signin | >= 20 | >= 5.0 | >= 5.0 | - |
| apple-signin-kit | - | - | - | >= 6.0 |

## Next Steps

- [Quick Start Guide](quickstart.md) - Get running in 5 minutes
- [Apple Developer Setup](apple-setup.md) - Configure Sign in with Apple

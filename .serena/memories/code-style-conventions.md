# Code Style & Conventions

## TypeScript
- ES modules (`"type": "module"`)
- Strict mode enabled
- Explicit return types on exported functions
- Zod for runtime validation
- JSDoc comments with `@param`, `@returns`, `@throws`

## Naming
- camelCase for functions and variables
- PascalCase for types/interfaces/classes
- SCREAMING_SNAKE_CASE for constants
- kebab-case for file names

## Security Patterns
- Always use `timingSafeEqual` for security comparisons
- Hash tokens with SHA-256 before storage
- Use `strictObject()` in Zod schemas to prevent mass assignment
- Validate all inputs with Zod schemas
- Use httpOnly cookies for tokens

## Testing
- Vitest for unit tests
- msw for HTTP mocking
- Tests co-located with source: `feature.ts` → `feature.test.ts`
- Coverage target: 80%+

## Swift (iOS SDK)
- Actors for thread safety (`actor APIClient`)
- Keychain with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`
- @MainActor for UI state management
- Combine for reactive patterns

/**
 * @acedergren/sveltekit-apple-signin
 *
 * Zero-config Apple Sign-In SDK for SvelteKit 2 with Svelte 5 runes support.
 *
 * @example Quick Start
 * ```typescript
 * // hooks.server.ts
 * import { createAuthHooks } from '@acedergren/sveltekit-apple-signin';
 *
 * export const { handle, handleFetch } = createAuthHooks({
 *   apiUrl: 'https://api.example.com'
 * });
 * ```
 *
 * ```svelte
 * <!-- +page.svelte -->
 * <script>
 *   import { AppleSignInButton } from '@acedergren/sveltekit-apple-signin';
 * </script>
 *
 * <AppleSignInButton />
 * ```
 *
 * @packageDocumentation
 */

// Re-export everything from lib
export * from './lib/index.js';

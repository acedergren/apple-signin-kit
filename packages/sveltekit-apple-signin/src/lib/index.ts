/**
 * SvelteKit Apple Sign-In SDK
 *
 * Zero-config Apple Sign-In for SvelteKit 2 with Svelte 5 runes support.
 *
 * @packageDocumentation
 */

// ============================================================================
// Hooks (Server-side)
// ============================================================================

export { createAuthHooks, forwardApiCookies, buildCookieString } from './hooks.server.js';

// ============================================================================
// API Client (Server-side)
// ============================================================================

export { createApiClient, AuthError } from './api-client.js';

// ============================================================================
// Session Utilities (Server-side)
// ============================================================================

export {
  getSession,
  getUser,
  requireAuth,
  requireAdmin,
  redirectIfAuthenticated,
  getReturnTo
} from './session.js';

// ============================================================================
// Stores (Client-side, SSR-safe)
// ============================================================================

export {
  getAuthState,
  getCurrentUser,
  getIsAuthenticated,
  getIsLoading,
  getAuthError,
  setUser,
  setLoading,
  setError,
  clearAuth,
  signInWithApple,
  signOut,
  initAuth
} from './stores.js';

// ============================================================================
// Components
// ============================================================================

export { AppleSignInButton } from './components/index.js';

// ============================================================================
// Types
// ============================================================================

export type {
  // Configuration
  AuthHooksConfig,
  ApiClientConfig,

  // User & Session
  AuthUser,
  Session,
  LoginResponse,

  // API Client
  ApiClient,

  // Errors
  AuthErrorCode,

  // Stores
  AuthState,
  AuthActions,

  // Components
  AppleSignInButtonProps,

  // SvelteKit Integration
  AuthLocals,
  AuthPageData
} from './types.js';

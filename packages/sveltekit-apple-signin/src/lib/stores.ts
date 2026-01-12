/**
 * Svelte 5 Runes-based Auth Stores
 *
 * Provides reactive auth state using Svelte 5's $state and $derived runes.
 * SSR-safe - all browser APIs are guarded.
 */

import type { AuthUser, AuthState, AuthError } from './types.js';

// ============================================================================
// Core Auth State (Svelte 5 Runes)
// ============================================================================

/**
 * Internal auth state using $state rune.
 * This is the source of truth for auth state in the client.
 */
let authState = $state<AuthState>({
  user: null,
  isLoading: true,
  error: null,
  isAuthenticated: false
});

/**
 * Derived value for quick auth check
 */
const isAuthenticated = $derived(authState.user !== null && !authState.isLoading);

/**
 * Derived value for loading state
 */
const isLoading = $derived(authState.isLoading);

/**
 * Derived value for error state
 */
const authError = $derived(authState.error);

// ============================================================================
// State Setters (for hooks to update state)
// ============================================================================

/**
 * Set the current user.
 * Called by hooks.server.ts after successful authentication.
 *
 * @param user - Authenticated user or null
 */
export function setUser(user: AuthUser | null): void {
  authState.user = user;
  authState.isAuthenticated = user !== null;
  authState.isLoading = false;
  authState.error = null;
}

/**
 * Set loading state.
 *
 * @param loading - Whether auth is loading
 */
export function setLoading(loading: boolean): void {
  authState.isLoading = loading;
}

/**
 * Set error state.
 *
 * @param error - Auth error or null to clear
 */
export function setError(error: AuthError | null): void {
  authState.error = error;
  authState.isLoading = false;
}

/**
 * Clear auth state (logout).
 */
export function clearAuth(): void {
  authState.user = null;
  authState.isAuthenticated = false;
  authState.isLoading = false;
  authState.error = null;
}

// ============================================================================
// Public Getters (for components to consume)
// ============================================================================

/**
 * Get the current auth state.
 * Use this for reactive access to all auth state.
 *
 * @returns Current auth state object
 *
 * @example
 * ```svelte
 * <script>
 *   import { getAuthState } from '@acedergren/sveltekit-apple-signin/stores';
 *
 *   const auth = getAuthState();
 * </script>
 *
 * {#if auth.isLoading}
 *   <LoadingSpinner />
 * {:else if auth.isAuthenticated}
 *   <p>Welcome, {auth.user?.email}</p>
 * {:else}
 *   <LoginButton />
 * {/if}
 * ```
 */
export function getAuthState(): AuthState {
  return authState;
}

/**
 * Get the current user.
 *
 * @returns Current user or null
 *
 * @example
 * ```svelte
 * <script>
 *   import { getCurrentUser } from '@acedergren/sveltekit-apple-signin/stores';
 *
 *   const user = getCurrentUser();
 * </script>
 *
 * {#if user}
 *   <Avatar email={user.email} />
 * {/if}
 * ```
 */
export function getCurrentUser(): AuthUser | null {
  return authState.user;
}

/**
 * Check if user is authenticated.
 *
 * @returns True if authenticated
 */
export function getIsAuthenticated(): boolean {
  return isAuthenticated;
}

/**
 * Check if auth is loading.
 *
 * @returns True if loading
 */
export function getIsLoading(): boolean {
  return isLoading;
}

/**
 * Get the current auth error.
 *
 * @returns Auth error or null
 */
export function getAuthError(): AuthError | null {
  return authError;
}

// ============================================================================
// SSR-Safe Browser Actions
// ============================================================================

/**
 * Check if running in browser.
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Navigate to Apple Sign-In.
 * Client-side only - redirects to the auth initiation endpoint.
 *
 * @param returnTo - Optional return URL after login
 *
 * @example
 * ```svelte
 * <script>
 *   import { signInWithApple } from '@acedergren/sveltekit-apple-signin/stores';
 * </script>
 *
 * <button onclick={() => signInWithApple('/dashboard')}>
 *   Sign in with Apple
 * </button>
 * ```
 */
export function signInWithApple(returnTo?: string): void {
  if (!isBrowser()) {
    console.warn('[apple-signin] signInWithApple called on server - ignoring');
    return;
  }

  setLoading(true);

  // Build auth URL with optional return destination
  const authPath = returnTo
    ? `/auth/apple?returnTo=${encodeURIComponent(returnTo)}`
    : '/auth/apple';

  window.location.href = authPath;
}

/**
 * Sign out the current user.
 * Client-side only - calls the logout endpoint and clears state.
 *
 * @param redirectTo - URL to redirect to after logout @default '/'
 *
 * @example
 * ```svelte
 * <script>
 *   import { signOut } from '@acedergren/sveltekit-apple-signin/stores';
 * </script>
 *
 * <button onclick={() => signOut('/auth/login')}>
 *   Sign out
 * </button>
 * ```
 */
export async function signOut(redirectTo: string = '/'): Promise<void> {
  if (!isBrowser()) {
    console.warn('[apple-signin] signOut called on server - ignoring');
    return;
  }

  setLoading(true);

  try {
    // Call logout endpoint
    const response = await fetch('/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      console.error('[apple-signin] Logout request failed:', response.status);
    }
  } catch (error) {
    console.error('[apple-signin] Logout error:', error);
  }

  // Clear local state
  clearAuth();

  // Redirect
  window.location.href = redirectTo;
}

// ============================================================================
// Context Initialization (for layouts)
// ============================================================================

/**
 * Initialize auth state from server data.
 * Call this in your root layout to hydrate auth state from SSR.
 *
 * @param data - Page data containing user
 *
 * @example
 * ```svelte
 * <!-- +layout.svelte -->
 * <script>
 *   import { initAuth } from '@acedergren/sveltekit-apple-signin/stores';
 *
 *   let { data, children } = $props();
 *
 *   // Initialize auth state from server
 *   initAuth(data);
 * </script>
 *
 * {@render children()}
 * ```
 */
export function initAuth(data: { user?: AuthUser | null }): void {
  const user = data?.user ?? null;
  setUser(user);
}

// ============================================================================
// Type Exports
// ============================================================================

export type { AuthState, AuthUser, AuthError };

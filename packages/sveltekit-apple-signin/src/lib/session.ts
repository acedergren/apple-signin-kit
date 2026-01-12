/**
 * Session utilities for SvelteKit
 *
 * Provides helpers for accessing and managing user sessions in
 * SvelteKit load functions and server routes.
 */

import { redirect, error } from '@sveltejs/kit';
import type { RequestEvent, ServerLoadEvent } from '@sveltejs/kit';
import type { AuthUser, AuthLocals, Session } from './types.js';

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if locals contains auth data
 */
function hasAuthLocals(locals: App.Locals): locals is App.Locals & AuthLocals {
  return 'user' in locals && 'api' in locals;
}

// ============================================================================
// Session Getters
// ============================================================================

/**
 * Get the current session from a request event.
 * Safe to call even if user is not authenticated.
 *
 * @param event - SvelteKit request event
 * @returns Session object with user and API client
 *
 * @example
 * ```typescript
 * // In +page.server.ts
 * export const load: PageServerLoad = async (event) => {
 *   const session = getSession(event);
 *   if (session.isAuthenticated) {
 *     // User is logged in
 *   }
 * };
 * ```
 */
export function getSession(event: RequestEvent | ServerLoadEvent): Session {
  const locals = event.locals;

  if (!hasAuthLocals(locals)) {
    throw error(500, 'Auth hooks not configured. Did you forget to add createAuthHooks to hooks.server.ts?');
  }

  return {
    user: locals.user,
    api: locals.api,
    isAuthenticated: locals.user !== null
  };
}

/**
 * Get the current user from a request event.
 * Returns null if not authenticated.
 *
 * @param event - SvelteKit request event
 * @returns Current user or null
 *
 * @example
 * ```typescript
 * // In +page.server.ts
 * export const load: PageServerLoad = async (event) => {
 *   const user = getUser(event);
 *   return { user };
 * };
 * ```
 */
export function getUser(event: RequestEvent | ServerLoadEvent): AuthUser | null {
  const session = getSession(event);
  return session.user;
}

// ============================================================================
// Auth Guards
// ============================================================================

/**
 * Require authentication for a route.
 * Throws a redirect to the login page if not authenticated.
 *
 * @param event - SvelteKit request event
 * @param options - Configuration options
 * @returns Session with guaranteed non-null user
 * @throws Redirect to login page if not authenticated
 *
 * @example
 * ```typescript
 * // In +page.server.ts
 * export const load: PageServerLoad = async (event) => {
 *   const session = requireAuth(event);
 *   // session.user is guaranteed to be non-null here
 *   const data = await session.api.getDashboardData();
 *   return { user: session.user, data };
 * };
 * ```
 */
export function requireAuth(
  event: RequestEvent | ServerLoadEvent,
  options: {
    /** URL to redirect to @default '/auth/login' */
    loginPath?: string;
    /** Include return URL in redirect @default true */
    includeReturnTo?: boolean;
  } = {}
): Session & { user: AuthUser; isAuthenticated: true } {
  const { loginPath = '/auth/login', includeReturnTo = true } = options;
  const session = getSession(event);

  if (!session.isAuthenticated || !session.user) {
    const returnTo = includeReturnTo
      ? `?returnTo=${encodeURIComponent(event.url.pathname + event.url.search)}`
      : '';
    throw redirect(303, `${loginPath}${returnTo}`);
  }

  return session as Session & { user: AuthUser; isAuthenticated: true };
}

/**
 * Require admin role for a route.
 * Throws a redirect to login if not authenticated, or 403 if not admin.
 *
 * @param event - SvelteKit request event
 * @param options - Configuration options
 * @returns Session with guaranteed admin user
 * @throws Redirect or 403 error
 *
 * @example
 * ```typescript
 * // In +page.server.ts (admin routes)
 * export const load: PageServerLoad = async (event) => {
 *   const session = requireAdmin(event);
 *   // User is guaranteed to be admin here
 *   return { user: session.user };
 * };
 * ```
 */
export function requireAdmin(
  event: RequestEvent | ServerLoadEvent,
  options: {
    loginPath?: string;
    includeReturnTo?: boolean;
  } = {}
): Session & { user: AuthUser; isAuthenticated: true } {
  const session = requireAuth(event, options);

  if (session.user.role !== 'admin') {
    throw error(403, 'Admin access required');
  }

  return session;
}

// ============================================================================
// Redirect Helpers
// ============================================================================

/**
 * Redirect if already authenticated.
 * Useful for login pages that should redirect logged-in users.
 *
 * @param event - SvelteKit request event
 * @param redirectTo - URL to redirect to @default '/'
 * @throws Redirect if authenticated
 *
 * @example
 * ```typescript
 * // In +page.server.ts for /auth/login
 * export const load: PageServerLoad = async (event) => {
 *   // Redirect to home if already logged in
 *   redirectIfAuthenticated(event, '/dashboard');
 *   // Continue with login page logic
 * };
 * ```
 */
export function redirectIfAuthenticated(
  event: RequestEvent | ServerLoadEvent,
  redirectTo: string = '/'
): void {
  const session = getSession(event);

  if (session.isAuthenticated) {
    // Check for returnTo in URL
    const returnTo = event.url.searchParams.get('returnTo');
    const destination = returnTo && returnTo.startsWith('/') ? returnTo : redirectTo;
    throw redirect(303, destination);
  }
}

/**
 * Parse the returnTo URL from query params, with validation.
 *
 * @param event - SvelteKit request event
 * @param defaultPath - Default path if returnTo is invalid @default '/'
 * @returns Safe redirect URL
 *
 * @example
 * ```typescript
 * // After successful login
 * const returnTo = getReturnTo(event, '/dashboard');
 * throw redirect(303, returnTo);
 * ```
 */
export function getReturnTo(
  event: RequestEvent | ServerLoadEvent,
  defaultPath: string = '/'
): string {
  const returnTo = event.url.searchParams.get('returnTo');

  // Validate: must start with / to prevent open redirect
  if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    return returnTo;
  }

  return defaultPath;
}

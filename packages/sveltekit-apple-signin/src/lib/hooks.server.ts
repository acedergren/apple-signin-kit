/**
 * SvelteKit Server Hooks for Apple Sign-In Authentication
 *
 * Provides handle and handleFetch hooks for managing authentication state,
 * token refresh, and cookie forwarding.
 */

import { redirect, type Handle, type HandleFetch, type Cookies } from '@sveltejs/kit';
import { createApiClient } from './api-client.js';
import { AuthError, type AuthHooksConfig, type AuthUser, type ApiClient } from './types.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default public routes that don't require authentication
 */
const DEFAULT_PUBLIC_ROUTES = ['/auth/login', '/auth/apple', '/auth/apple/callback', '/api'];

/**
 * Cookies we accept from API responses.
 * Prevents the API from setting arbitrary cookies on the user's browser.
 */
const ALLOWED_SET_COOKIES = ['rd_access_token', 'rd_refresh_token'];

// ============================================================================
// Cookie Utilities
// ============================================================================

/**
 * Parse and validate Set-Cookie headers from API response.
 * Only sets cookies that are in the allowlist.
 *
 * @param response - API response with Set-Cookie headers
 * @param cookies - SvelteKit cookies interface
 */
function forwardApiCookies(response: Response, cookies: Cookies): void {
  // getSetCookie() returns all Set-Cookie headers as an array
  const setCookieHeaders = response.headers.getSetCookie?.() || [];

  for (const setCookieHeader of setCookieHeaders) {
    // Parse cookie name and value (format: "name=value; attributes...")
    const [nameValue] = setCookieHeader.split(';');
    if (!nameValue) continue;

    const equalsIndex = nameValue.indexOf('=');
    if (equalsIndex === -1) continue;

    const name = nameValue.slice(0, equalsIndex).trim();
    const value = nameValue.slice(equalsIndex + 1);

    // Only set allowed cookies (security: prevent arbitrary cookie injection)
    if (!ALLOWED_SET_COOKIES.includes(name)) {
      console.warn(`[apple-signin] Ignoring unexpected cookie from API: ${name}`);
      continue;
    }

    // Set the cookie with secure defaults
    cookies.set(name, value, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax'
    });
  }
}

/**
 * Build cookie string from SvelteKit cookies
 */
function buildCookieString(cookies: Cookies): string {
  return cookies
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

// ============================================================================
// Route Matching
// ============================================================================

/**
 * Check if a path matches any public route patterns
 */
function isPublicRoute(pathname: string, publicRoutes: string[]): boolean {
  return publicRoutes.some((route) => pathname.startsWith(route));
}

// ============================================================================
// Main Hook Factory
// ============================================================================

/**
 * Creates SvelteKit hooks for Apple Sign-In authentication.
 *
 * @param config - Hook configuration
 * @returns Object with handle and handleFetch hooks
 *
 * @example
 * ```typescript
 * // hooks.server.ts
 * import { createAuthHooks } from '@acedergren/sveltekit-apple-signin';
 *
 * export const { handle, handleFetch } = createAuthHooks({
 *   apiUrl: 'https://api.example.com'
 * });
 * ```
 *
 * @example
 * ```typescript
 * // hooks.server.ts with custom options
 * import { createAuthHooks } from '@acedergren/sveltekit-apple-signin';
 * import { sequence } from '@sveltejs/kit/hooks';
 *
 * const authHooks = createAuthHooks({
 *   apiUrl: process.env.API_URL || 'http://localhost:3000',
 *   publicRoutes: ['/auth/login', '/auth/apple', '/about', '/pricing'],
 *   loginPath: '/auth/login',
 *   onAuthError: (error) => {
 *     console.error('Auth failed:', error);
 *   }
 * });
 *
 * // Combine with other hooks
 * export const handle = sequence(sentryHandle(), authHooks.handle);
 * export const handleFetch = authHooks.handleFetch;
 * ```
 */
export function createAuthHooks(config: AuthHooksConfig): {
  handle: Handle;
  handleFetch: HandleFetch;
} {
  const {
    apiUrl,
    publicRoutes = DEFAULT_PUBLIC_ROUTES,
    loginPath = '/auth/login',
    cookies: cookieConfig,
    onAuthError,
    onAuthenticated
  } = config;

  // Merge cookie names with defaults
  const cookieNames = {
    accessToken: cookieConfig?.accessToken || 'rd_access_token',
    refreshToken: cookieConfig?.refreshToken || 'rd_refresh_token'
  };

  /**
   * Main authentication handle
   */
  const handle: Handle = async ({ event, resolve }) => {
    const { cookies, url } = event;

    // Build cookie string for API requests
    const cookieString = buildCookieString(cookies);

    // Create API client with cookies
    const api = createApiClient({
      apiUrl,
      cookies: cookieString
    });

    // Initialize locals
    event.locals.api = api as unknown as ApiClient;
    event.locals.user = null as unknown as AuthUser | null;

    // Try to get current user from API
    let user: AuthUser | null = null;
    try {
      user = await api.getCurrentUser();
      event.locals.user = user as unknown as AuthUser | null;

      // Call authenticated callback if provided
      if (onAuthenticated && user) {
        await onAuthenticated(user);
      }
    } catch (error) {
      // If unauthorized, try to refresh the token
      if (error instanceof AuthError && error.isUnauthorized) {
        try {
          const { response } = await api.refreshToken();

          // Forward validated cookies from the refresh response
          forwardApiCookies(response, cookies);

          // Retry getting the user with new cookies
          const newCookieString = buildCookieString(cookies);
          const newApi = createApiClient({
            apiUrl,
            cookies: newCookieString
          });

          event.locals.api = newApi as unknown as ApiClient;
          user = await newApi.getCurrentUser();
          event.locals.user = user as unknown as AuthUser | null;

          if (onAuthenticated && user) {
            await onAuthenticated(user);
          }
        } catch (refreshError) {
          // Refresh failed - user stays logged out
          console.debug('[apple-signin] Token refresh failed:', {
            error: refreshError instanceof Error ? refreshError.message : String(refreshError),
            path: url.pathname
          });

          // Call custom error handler
          if (onAuthError && refreshError instanceof AuthError) {
            const suppress = await onAuthError(refreshError);
            if (suppress) {
              return resolve(event);
            }
          }

          event.locals.user = null as unknown as AuthUser | null;
        }
      } else {
        // Non-auth error (network, server error, etc.)
        console.error('[apple-signin] Error getting current user:', {
          error: error instanceof Error ? error.message : String(error),
          path: url.pathname
        });

        if (onAuthError && error instanceof AuthError) {
          await onAuthError(error);
        }
      }
    }

    // Protect non-public routes
    if (!isPublicRoute(url.pathname, publicRoutes) && !event.locals.user) {
      const returnTo = url.pathname + url.search;
      throw redirect(303, `${loginPath}?returnTo=${encodeURIComponent(returnTo)}`);
    }

    return resolve(event);
  };

  /**
   * Handle fetch for forwarding cookies to API
   */
  const handleFetch: HandleFetch = async ({ request, fetch, event }) => {
    // Only forward cookies to our API
    if (request.url.startsWith(apiUrl)) {
      const cookieString = buildCookieString(event.cookies);
      if (cookieString) {
        request.headers.set('cookie', cookieString);
      }
    }

    return fetch(request);
  };

  return { handle, handleFetch };
}

// ============================================================================
// Utility Exports
// ============================================================================

export { forwardApiCookies, buildCookieString, isPublicRoute };

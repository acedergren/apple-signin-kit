/**
 * Typed API Client for Apple Sign-In
 *
 * Server-side client for making authenticated requests to the backend.
 * Handles cookie forwarding, token refresh, and typed responses.
 */

import {
  AuthError,
  type ApiClient,
  type ApiClientConfig,
  type AuthUser,
  type LoginResponse
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default cookies to forward to the API.
 * Only forward auth-related cookies, not third-party tracking cookies.
 */
const DEFAULT_ALLOWED_COOKIES = [
  'rd_access_token',
  'rd_refresh_token',
  'apple_auth_state',
  'apple_auth_verifier',
  'apple_auth_nonce'
];

// ============================================================================
// Utilities
// ============================================================================

/**
 * Parse a cookie string and extract only allowed cookies.
 * Prevents accidentally forwarding third-party cookies to the API.
 *
 * @param cookieString - Raw cookie string from request
 * @param allowedCookies - List of cookie names to forward
 * @returns Filtered cookie string
 */
function filterCookies(cookieString: string, allowedCookies: string[] = DEFAULT_ALLOWED_COOKIES): string {
  if (!cookieString) return '';

  const cookies = cookieString
    .split(';')
    .map((c) => c.trim())
    .filter((c) => {
      const [name] = c.split('=');
      return name && allowedCookies.includes(name.trim());
    });

  return cookies.join('; ');
}

// ============================================================================
// API Client Implementation
// ============================================================================

/**
 * Creates a typed API client for authentication endpoints.
 *
 * @param config - Client configuration
 * @returns API client instance
 *
 * @example
 * ```typescript
 * // Server-side usage in hooks.server.ts
 * const api = createApiClient({
 *   apiUrl: 'https://api.example.com',
 *   cookies: event.request.headers.get('cookie') || ''
 * });
 *
 * const user = await api.getCurrentUser();
 * ```
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  const { apiUrl, cookies: rawCookies = '', fetch: customFetch = globalThis.fetch } = config;

  // Filter cookies to only include auth-related ones
  const cookies = filterCookies(rawCookies);

  /**
   * Internal fetch wrapper with error handling
   */
  async function apiFetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>)
    };

    // Forward cookies for authentication
    if (cookies) {
      headers['Cookie'] = cookies;
    }

    const response = await customFetch(`${apiUrl}${path}`, {
      ...options,
      headers,
      credentials: 'include'
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        // Ignore JSON parse errors
      }
      throw new AuthError(response.status, response.statusText, errorBody);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Internal fetch that returns the raw response for cookie extraction
   */
  async function apiFetchWithResponse(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>)
    };

    if (cookies) {
      headers['Cookie'] = cookies;
    }

    const response = await customFetch(`${apiUrl}${path}`, {
      ...options,
      headers,
      credentials: 'include'
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        // Clone response to read body without consuming it
        errorBody = await response.clone().json();
      } catch {
        // Ignore
      }
      throw new AuthError(response.status, response.statusText, errorBody);
    }

    return response;
  }

  // Return the API client implementation
  return {
    async initiateAppleSignIn(): Promise<{ authUrl: string; response: Response }> {
      const response = await apiFetchWithResponse('/api/v1/auth/apple', {
        method: 'GET'
      });

      const data = (await response.clone().json()) as { authUrl: string };
      return { authUrl: data.authUrl, response };
    },

    async completeAppleSignIn(
      code: string,
      state: string
    ): Promise<{ response: Response; data: LoginResponse }> {
      const response = await apiFetchWithResponse('/api/v1/auth/apple/callback', {
        method: 'POST',
        body: JSON.stringify({ code, state })
      });

      const data = (await response.clone().json()) as LoginResponse;
      return { response, data };
    },

    async logout(): Promise<void> {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    },

    async refreshToken(): Promise<{ response: Response }> {
      const response = await apiFetchWithResponse('/api/v1/auth/refresh', {
        method: 'POST'
      });
      return { response };
    },

    async getCurrentUser(): Promise<AuthUser> {
      return apiFetch<AuthUser>('/api/v1/auth/me');
    }
  };
}

export { AuthError };

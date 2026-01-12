/**
 * TypeScript types for Apple Sign-In SDK
 */

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration options for creating auth hooks
 */
export interface AuthHooksConfig {
  /**
   * Base URL of the API server implementing Apple Sign-In endpoints
   * @example 'https://api.example.com' or 'http://localhost:3000'
   */
  apiUrl: string;

  /**
   * Routes that don't require authentication
   * @default ['/auth/login', '/auth/apple', '/auth/apple/callback']
   */
  publicRoutes?: string[];

  /**
   * URL to redirect to when authentication fails
   * @default '/auth/login'
   */
  loginPath?: string;

  /**
   * Cookie names used for authentication
   */
  cookies?: {
    /** Access token cookie name @default 'rd_access_token' */
    accessToken?: string;
    /** Refresh token cookie name @default 'rd_refresh_token' */
    refreshToken?: string;
  };

  /**
   * Custom error handler for auth failures
   * Return true to suppress the default redirect behavior
   */
  onAuthError?: (error: AuthError) => boolean | void | Promise<boolean | void>;

  /**
   * Custom handler called when user is authenticated
   */
  onAuthenticated?: (user: AuthUser) => void | Promise<void>;
}

/**
 * Configuration for the API client
 */
export interface ApiClientConfig {
  /**
   * Base URL of the API server
   */
  apiUrl: string;

  /**
   * Cookie string to forward with requests (server-side)
   */
  cookies?: string;

  /**
   * Custom fetch implementation (for testing or custom transport)
   */
  fetch?: typeof globalThis.fetch;
}

// ============================================================================
// User & Session Types
// ============================================================================

/**
 * Authenticated user information
 */
export interface AuthUser {
  /** Unique user identifier */
  id: string;
  /** User's email address (may be a private relay email) */
  email: string;
  /** User's role */
  role: 'user' | 'admin';
  /** Whether the user account is active */
  isActive?: boolean;
  /** Last login timestamp */
  lastLoginAt?: string;
  /** Account creation timestamp */
  createdAt?: string;
  /** Last update timestamp */
  updatedAt?: string;
}

/**
 * Session information stored in app.locals
 */
export interface Session {
  /** Current authenticated user or null */
  user: AuthUser | null;
  /** API client instance for making authenticated requests */
  api: ApiClient;
  /** Whether the session is authenticated */
  isAuthenticated: boolean;
}

/**
 * Login response from the API
 */
export interface LoginResponse {
  /** Authenticated user */
  user: AuthUser;
  /** Success message */
  message: string;
}

// ============================================================================
// API Client Interface
// ============================================================================

/**
 * Typed API client for authentication endpoints
 */
export interface ApiClient {
  /**
   * Initiate Apple Sign-In flow
   * @returns Authorization URL and raw response for cookie extraction
   */
  initiateAppleSignIn(): Promise<{ authUrl: string; response: Response }>;

  /**
   * Complete Apple Sign-In by exchanging authorization code
   * @param code - Authorization code from Apple
   * @param state - State parameter for CSRF protection
   */
  completeAppleSignIn(
    code: string,
    state: string
  ): Promise<{ response: Response; data: LoginResponse }>;

  /**
   * Log out the current user
   */
  logout(): Promise<void>;

  /**
   * Refresh the access token using the refresh token
   */
  refreshToken(): Promise<{ response: Response }>;

  /**
   * Get the currently authenticated user
   */
  getCurrentUser(): Promise<AuthUser>;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Custom error for API/auth failures
 */
export class AuthError extends Error {
  constructor(
    /** HTTP status code */
    public readonly status: number,
    /** HTTP status text */
    public readonly statusText: string,
    /** Response body if available */
    public readonly body?: unknown,
    /** Error code for programmatic handling */
    public readonly code?: AuthErrorCode
  ) {
    super(`Auth Error: ${status} ${statusText}`);
    this.name = 'AuthError';
  }

  /** Whether this is an unauthorized (401) error */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Whether this is a forbidden (403) error */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** Whether this is a not found (404) error */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** Whether this is a server (5xx) error */
  get isServerError(): boolean {
    return this.status >= 500;
  }
}

/**
 * Specific error codes for auth failures
 */
export type AuthErrorCode =
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'REFRESH_FAILED'
  | 'INVALID_STATE'
  | 'APPLE_AUTH_FAILED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

// ============================================================================
// Store Types (for Svelte 5 runes)
// ============================================================================

/**
 * Auth store state shape
 */
export interface AuthState {
  /** Current authenticated user */
  user: AuthUser | null;
  /** Whether auth state is still loading */
  isLoading: boolean;
  /** Last auth error */
  error: AuthError | null;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
}

/**
 * Auth store actions
 */
export interface AuthActions {
  /** Start the Apple Sign-In flow */
  signIn(): Promise<void>;
  /** Sign out the current user */
  signOut(): Promise<void>;
  /** Refresh the session */
  refresh(): Promise<void>;
  /** Clear any error state */
  clearError(): void;
}

// ============================================================================
// Component Props
// ============================================================================

/**
 * Props for the AppleSignInButton component
 */
export interface AppleSignInButtonProps {
  /**
   * Button variant
   * @default 'black'
   */
  variant?: 'black' | 'white' | 'outline';

  /**
   * Button size
   * @default 'medium'
   */
  size?: 'small' | 'medium' | 'large';

  /**
   * Button text
   * @default 'Sign in with Apple'
   */
  label?: string;

  /**
   * Show Apple logo
   * @default true
   */
  showLogo?: boolean;

  /**
   * Full width button
   * @default false
   */
  fullWidth?: boolean;

  /**
   * Disabled state
   * @default false
   */
  disabled?: boolean;

  /**
   * URL to redirect to after successful login
   */
  returnTo?: string;

  /**
   * Custom click handler (overrides default behavior)
   */
  onClick?: () => void | Promise<void>;

  /**
   * Additional CSS class
   */
  class?: string;
}

// ============================================================================
// SvelteKit Integration Types
// ============================================================================

/**
 * Extended Locals interface for SvelteKit
 * Merge this with your app.d.ts
 */
export interface AuthLocals {
  /** Current authenticated user */
  user: AuthUser | null;
  /** API client instance */
  api: ApiClient;
}

/**
 * Page data with auth info
 */
export interface AuthPageData {
  /** Current user (null if not authenticated) */
  user: AuthUser | null;
}

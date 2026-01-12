/**
 * Apple Sign-In Authentication
 *
 * Implements OAuth 2.0 + OIDC flow with:
 * - PKCE (RFC 7636) for authorization code protection
 * - Nonce validation for ID token replay prevention
 * - Short-lived client secrets (10 minutes)
 *
 * This module is decoupled from any specific configuration system.
 * All config is passed as parameters for maximum reusability.
 *
 * @module apple-auth
 */

import { SignJWT, importPKCS8, jwtVerify, createRemoteJWKSet } from 'jose';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { AppleConfig, AppleIdTokenClaims } from './types.js';

// Apple's OAuth endpoints
const APPLE_AUTH_URL = 'https://appleid.apple.com/auth/authorize';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

// Security constants
const CLIENT_SECRET_TTL_SECONDS = 600; // 10 minutes
const ID_TOKEN_MAX_AGE_SECONDS = 600; // Reject tokens older than 10 minutes
const CLOCK_TOLERANCE_SECONDS = 30; // Allow 30s clock skew between servers
const FETCH_TIMEOUT_MS = 15000;

/**
 * User information extracted from Apple's ID token.
 */
export interface AppleUserInfo {
  /** Apple's unique, stable user identifier (sub claim) */
  sub: string;
  /** User's email (may be private relay address) */
  email?: string;
  /** Whether Apple has verified the email */
  emailVerified?: boolean;
  /** Whether this is a private relay email */
  isPrivateEmail?: boolean;
}

/**
 * Response from Apple's token endpoint.
 */
export interface AppleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  id_token: string;
}

// =============================================================================
// PKCE HELPERS (RFC 7636)
// =============================================================================

/**
 * Generate a cryptographically secure PKCE code verifier.
 * Uses 32 random bytes (256 bits) encoded as base64url.
 *
 * @returns A 43-character URL-safe string
 *
 * @example
 * ```typescript
 * const verifier = generateCodeVerifier();
 * // Store in session/cookie for later verification
 * ```
 */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Generate PKCE code challenge from verifier using S256 method.
 * SHA-256 hash of the verifier, encoded as base64url.
 *
 * @param verifier - The code verifier string
 * @returns SHA-256 hash as base64url string
 *
 * @example
 * ```typescript
 * const verifier = generateCodeVerifier();
 * const challenge = generateCodeChallenge(verifier);
 * // Send challenge to Apple, keep verifier secret
 * ```
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Generate a cryptographically secure nonce for ID token binding.
 * Uses 16 random bytes (128 bits) encoded as hex.
 *
 * @returns A 32-character hex string
 */
export function generateNonce(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Generate a CSRF state token.
 * Uses 16 random bytes (128 bits) encoded as hex.
 *
 * @returns A 32-character hex string
 */
export function generateState(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 * Used for comparing security tokens like state parameters and nonces.
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns true if strings are equal, false otherwise
 *
 * @example
 * ```typescript
 * // Compare CSRF state tokens
 * if (!safeCompare(receivedState, savedState)) {
 *   throw new Error('CSRF validation failed');
 * }
 * ```
 */
export function safeCompare(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// =============================================================================
// TOKEN HASHING
// =============================================================================

/**
 * Hash a token using SHA-256 for secure storage.
 * Never store plaintext tokens in the database.
 *
 * @param token - The plaintext token
 * @returns SHA-256 hash as hex string
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// =============================================================================
// APPLE AUTH FUNCTIONS
// =============================================================================

/**
 * Generate client_secret JWT for Apple authentication.
 * Client secret is a short-lived JWT signed with your Apple private key.
 *
 * @param config - Apple configuration
 * @returns Signed JWT client secret
 */
export async function generateClientSecret(config: AppleConfig): Promise<string> {
  if (!config.privateKey || !config.keyId || !config.teamId || !config.clientId) {
    throw new Error('Apple Sign-In configuration is incomplete');
  }

  const privateKey = await importPKCS8(
    config.privateKey.replace(/\\n/g, '\n'),
    'ES256'
  );

  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
    .setIssuedAt(now)
    .setExpirationTime(now + CLIENT_SECRET_TTL_SECONDS)
    .setAudience('https://appleid.apple.com')
    .setIssuer(config.teamId)
    .setSubject(config.clientId)
    .sign(privateKey);
}

/**
 * Generate Apple Sign-In authorization URL with PKCE parameters.
 *
 * @param config - Apple configuration
 * @param state - CSRF state token
 * @param codeChallenge - PKCE code challenge
 * @param nonce - Nonce for ID token binding
 * @returns Full authorization URL
 *
 * @example
 * ```typescript
 * const state = generateState();
 * const verifier = generateCodeVerifier();
 * const challenge = generateCodeChallenge(verifier);
 * const nonce = generateNonce();
 *
 * const url = getAppleAuthUrl(config, state, challenge, nonce);
 * // Redirect user to this URL
 * ```
 */
export function getAppleAuthUrl(
  config: AppleConfig,
  state: string,
  codeChallenge: string,
  nonce: string
): string {
  if (!config.clientId) {
    throw new Error('Apple Sign-In is not configured');
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code id_token',
    response_mode: 'form_post',
    scope: 'email',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    nonce
  });

  return `${APPLE_AUTH_URL}?${params}`;
}

/**
 * Exchange authorization code for tokens with Apple.
 *
 * @param config - Apple configuration
 * @param authorizationCode - The code from Apple callback
 * @param codeVerifier - The original PKCE code verifier
 * @returns Token response from Apple
 */
export async function exchangeCodeForTokens(
  config: AppleConfig,
  authorizationCode: string,
  codeVerifier: string
): Promise<AppleTokenResponse> {
  const clientSecret = await generateClientSecret(config);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(APPLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: clientSecret,
        code: authorizationCode,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUri,
        code_verifier: codeVerifier
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new Error(`Apple token exchange failed: ${response.status} - ${errorBody}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Verify and decode Apple's identity token.
 * Validates signature, issuer, audience, nonce, and freshness.
 *
 * @param idToken - The ID token from Apple
 * @param clientId - Your app's client ID (for audience validation)
 * @param expectedNonce - Expected nonce value (optional for iOS native flow)
 * @returns Verified user information
 *
 * @throws Error if token is invalid, expired, or nonce mismatches
 */
export async function verifyIdentityToken(
  idToken: string,
  clientId: string,
  expectedNonce?: string
): Promise<AppleUserInfo> {
  const JWKS = createRemoteJWKSet(new URL(APPLE_JWKS_URL));

  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: 'https://appleid.apple.com',
    audience: clientId,
    clockTolerance: CLOCK_TOLERANCE_SECONDS
  });

  const claims = payload as AppleIdTokenClaims;

  // Validate required claims
  if (typeof claims.sub !== 'string' || !claims.sub) {
    throw new Error('Missing or invalid sub claim in ID token');
  }

  // Validate nonce using timing-safe comparison to prevent timing attacks
  // Only validate for web OAuth flow - iOS native flow doesn't use nonce
  if (expectedNonce) {
    if (typeof claims.nonce !== 'string' || !safeCompare(claims.nonce, expectedNonce)) {
      throw new Error('Nonce mismatch - possible replay attack');
    }
  }

  // Validate token freshness
  const iat = claims.iat;
  if (typeof iat !== 'number') {
    throw new Error('Missing iat claim in ID token');
  }
  const now = Math.floor(Date.now() / 1000);
  if (now - iat > ID_TOKEN_MAX_AGE_SECONDS) {
    throw new Error('ID token too old - possible replay attack');
  }

  return {
    sub: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    isPrivateEmail: claims.is_private_email === true || claims.is_private_email === 'true'
  };
}

/**
 * Full authentication flow: exchange code and verify token.
 * Combines code exchange and token verification in one step.
 *
 * @param config - Apple configuration
 * @param authorizationCode - The code from Apple callback
 * @param codeVerifier - The original PKCE code verifier
 * @param expectedNonce - Expected nonce value
 * @returns Verified user information
 *
 * @example
 * ```typescript
 * try {
 *   const user = await authenticateWithApple(
 *     config,
 *     code,
 *     savedCodeVerifier,
 *     savedNonce
 *   );
 *   // Create or update user in database
 *   // Issue access/refresh tokens
 * } catch (error) {
 *   // Handle authentication failure
 * }
 * ```
 */
export async function authenticateWithApple(
  config: AppleConfig,
  authorizationCode: string,
  codeVerifier: string,
  expectedNonce: string
): Promise<AppleUserInfo> {
  const tokens = await exchangeCodeForTokens(config, authorizationCode, codeVerifier);
  return verifyIdentityToken(tokens.id_token, config.clientId, expectedNonce);
}

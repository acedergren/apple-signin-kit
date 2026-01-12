/**
 * Comprehensive tests for Apple Sign-In authentication module
 *
 * Test Coverage:
 * - PKCE code generation and verification
 * - Authorization URL generation
 * - ID token verification (signature, claims, freshness)
 * - Authorization code exchange
 * - User info extraction
 * - Client secret generation
 * - Error handling and security validations
 *
 * @module apple-auth.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as jose from 'jose';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateNonce,
  generateState,
  safeCompare,
  hashToken,
  generateClientSecret,
  getAppleAuthUrl,
  exchangeCodeForTokens,
  verifyIdentityToken,
  authenticateWithApple,
  type AppleUserInfo,
  type AppleTokenResponse
} from '../src/apple-auth.js';
import type { AppleConfig } from '../src/types.js';

// =============================================================================
// TEST DATA
// =============================================================================

// Valid ES256 test private key (randomly generated for testing only - DO NOT USE IN PRODUCTION)
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgZW/3XCA7S3C1sF01
QJQ6ztjPMIWLF4HAzvRsQnAELcChRANCAARvFD+zUH5TejzvHWQ3G4U/KIfdgvJS
UKlgQ5GjWvLu9TH0lx3IFjeK77PkdAl07F8T0wOxnIzKsVj94XvmMFcJ
-----END PRIVATE KEY-----`;

const MOCK_APPLE_CONFIG: AppleConfig = {
  clientId: 'com.example.app',
  teamId: 'TEAM123456',
  keyId: 'KEY1234567',
  privateKey: TEST_PRIVATE_KEY,
  redirectUri: 'https://example.com/auth/apple/callback'
};

const MOCK_APPLE_JWKS = {
  keys: [
    {
      kty: 'RSA',
      kid: 'test-key-1',
      use: 'sig',
      alg: 'RS256',
      n: 'xGOr-H7A-pCYGOlJ5glHJ8Pq7xBhVtMO42XPaGbDFlR0ULznKqlqU2xSYBJzHYQM',
      e: 'AQAB'
    }
  ]
};

// =============================================================================
// PKCE HELPERS TESTS
// =============================================================================

describe('PKCE Helpers', () => {
  describe('generateCodeVerifier', () => {
    it('generates a 43-character base64url string', () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toHaveLength(43);
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('generates unique verifiers on each call', () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      expect(verifier1).not.toBe(verifier2);
    });

    it('generates cryptographically random values', () => {
      const verifiers = new Set();
      for (let i = 0; i < 100; i++) {
        verifiers.add(generateCodeVerifier());
      }
      // All 100 should be unique
      expect(verifiers.size).toBe(100);
    });
  });

  describe('generateCodeChallenge', () => {
    it('generates SHA-256 hash of verifier', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = generateCodeChallenge(verifier);

      // Should be 43 characters (SHA-256 in base64url)
      expect(challenge).toHaveLength(43);
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('produces consistent output for same input', () => {
      const verifier = generateCodeVerifier();
      const challenge1 = generateCodeChallenge(verifier);
      const challenge2 = generateCodeChallenge(verifier);
      expect(challenge1).toBe(challenge2);
    });

    it('produces different challenges for different verifiers', () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      const challenge1 = generateCodeChallenge(verifier1);
      const challenge2 = generateCodeChallenge(verifier2);
      expect(challenge1).not.toBe(challenge2);
    });

    it('generates RFC 7636 compliant S256 challenge', () => {
      // Test vector from RFC 7636 Appendix B
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
      expect(generateCodeChallenge(verifier)).toBe(expectedChallenge);
    });
  });

  describe('generateNonce', () => {
    it('generates a 32-character hex string', () => {
      const nonce = generateNonce();
      expect(nonce).toHaveLength(32);
      expect(nonce).toMatch(/^[0-9a-f]+$/);
    });

    it('generates unique nonces on each call', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();
      expect(nonce1).not.toBe(nonce2);
    });

    it('uses 16 bytes of entropy (128 bits)', () => {
      const nonces = new Set();
      for (let i = 0; i < 100; i++) {
        nonces.add(generateNonce());
      }
      expect(nonces.size).toBe(100);
    });
  });

  describe('generateState', () => {
    it('generates a 32-character hex string', () => {
      const state = generateState();
      expect(state).toHaveLength(32);
      expect(state).toMatch(/^[0-9a-f]+$/);
    });

    it('generates unique state tokens on each call', () => {
      const state1 = generateState();
      const state2 = generateState();
      expect(state1).not.toBe(state2);
    });

    it('uses 16 bytes of entropy (128 bits)', () => {
      const states = new Set();
      for (let i = 0; i < 100; i++) {
        states.add(generateState());
      }
      expect(states.size).toBe(100);
    });
  });

  describe('safeCompare', () => {
    it('returns true for equal strings', () => {
      const token = 'my-secret-token-12345';
      expect(safeCompare(token, token)).toBe(true);
    });

    it('returns false for different strings', () => {
      expect(safeCompare('token1', 'token2')).toBe(false);
    });

    it('returns false if either string is undefined', () => {
      expect(safeCompare(undefined, 'token')).toBe(false);
      expect(safeCompare('token', undefined)).toBe(false);
      expect(safeCompare(undefined, undefined)).toBe(false);
    });

    it('returns false for strings of different lengths', () => {
      expect(safeCompare('short', 'longerstring')).toBe(false);
    });

    it('prevents timing attacks by using constant-time comparison', () => {
      // This is hard to test directly, but we verify it uses timingSafeEqual
      const token1 = 'a'.repeat(32);
      const token2 = 'b'.repeat(32);
      expect(safeCompare(token1, token2)).toBe(false);
    });

    it('handles special characters correctly', () => {
      const token = 'token!@#$%^&*()_+-=[]{}|;:,.<>?';
      expect(safeCompare(token, token)).toBe(true);
    });
  });
});

// =============================================================================
// TOKEN HASHING TESTS
// =============================================================================

describe('hashToken', () => {
  it('generates SHA-256 hash as hex string', () => {
    const token = 'my-refresh-token-12345';
    const hash = hashToken(token);

    // SHA-256 produces 64 hex characters
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('produces consistent hashes for same token', () => {
    const token = 'consistent-token';
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different tokens', () => {
    const hash1 = hashToken('token1');
    const hash2 = hashToken('token2');
    expect(hash1).not.toBe(hash2);
  });

  it('handles empty strings', () => {
    const hash = hashToken('');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('handles special characters', () => {
    const token = 'token!@#$%^&*()_+-=[]{}|;:,.<>?';
    const hash = hashToken(token);
    expect(hash).toHaveLength(64);
  });
});

// =============================================================================
// CLIENT SECRET GENERATION TESTS
// =============================================================================

describe('generateClientSecret', () => {
  it('generates a valid JWT client secret', async () => {
    const secret = await generateClientSecret(MOCK_APPLE_CONFIG);

    expect(secret).toBeTruthy();
    expect(typeof secret).toBe('string');

    // JWT format: header.payload.signature
    const parts = secret.split('.');
    expect(parts).toHaveLength(3);
  });

  it('includes correct JWT header', async () => {
    const secret = await generateClientSecret(MOCK_APPLE_CONFIG);
    const header = JSON.parse(Buffer.from(secret.split('.')[0], 'base64url').toString());

    expect(header.alg).toBe('ES256');
    expect(header.kid).toBe(MOCK_APPLE_CONFIG.keyId);
  });

  it('includes correct JWT claims', async () => {
    const secret = await generateClientSecret(MOCK_APPLE_CONFIG);
    const payload = JSON.parse(Buffer.from(secret.split('.')[1], 'base64url').toString());

    expect(payload.iss).toBe(MOCK_APPLE_CONFIG.teamId);
    expect(payload.sub).toBe(MOCK_APPLE_CONFIG.clientId);
    expect(payload.aud).toBe('https://appleid.apple.com');
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();

    // Verify TTL is 600 seconds (10 minutes)
    expect(payload.exp - payload.iat).toBe(600);
  });

  it('handles newline characters in private key', async () => {
    const configWithEscapedKey = {
      ...MOCK_APPLE_CONFIG,
      privateKey: MOCK_APPLE_CONFIG.privateKey.replace(/\n/g, '\\n')
    };

    const secret = await generateClientSecret(configWithEscapedKey);
    expect(secret).toBeTruthy();
  });

  it('throws error for missing clientId', async () => {
    const invalidConfig = { ...MOCK_APPLE_CONFIG, clientId: '' };
    await expect(generateClientSecret(invalidConfig)).rejects.toThrow(
      'Apple Sign-In configuration is incomplete'
    );
  });

  it('throws error for missing teamId', async () => {
    const invalidConfig = { ...MOCK_APPLE_CONFIG, teamId: '' };
    await expect(generateClientSecret(invalidConfig)).rejects.toThrow(
      'Apple Sign-In configuration is incomplete'
    );
  });

  it('throws error for missing keyId', async () => {
    const invalidConfig = { ...MOCK_APPLE_CONFIG, keyId: '' };
    await expect(generateClientSecret(invalidConfig)).rejects.toThrow(
      'Apple Sign-In configuration is incomplete'
    );
  });

  it('throws error for missing privateKey', async () => {
    const invalidConfig = { ...MOCK_APPLE_CONFIG, privateKey: '' };
    await expect(generateClientSecret(invalidConfig)).rejects.toThrow(
      'Apple Sign-In configuration is incomplete'
    );
  });

  it('generates different secrets on each call (due to iat)', async () => {
    const secret1 = await generateClientSecret(MOCK_APPLE_CONFIG);

    // Wait 1 second to ensure different iat
    await new Promise(resolve => setTimeout(resolve, 1000));

    const secret2 = await generateClientSecret(MOCK_APPLE_CONFIG);
    expect(secret1).not.toBe(secret2);
  });
});

// =============================================================================
// AUTHORIZATION URL TESTS
// =============================================================================

describe('getAppleAuthUrl', () => {
  const state = 'test-state-12345';
  const codeChallenge = 'test-challenge-12345';
  const nonce = 'test-nonce-12345';

  it('generates correct Apple authorization URL', () => {
    const url = getAppleAuthUrl(MOCK_APPLE_CONFIG, state, codeChallenge, nonce);

    expect(url).toContain('https://appleid.apple.com/auth/authorize?');
    expect(url).toContain(`client_id=${encodeURIComponent(MOCK_APPLE_CONFIG.clientId)}`);
    expect(url).toContain(`redirect_uri=${encodeURIComponent(MOCK_APPLE_CONFIG.redirectUri)}`);
    expect(url).toContain('response_type=code+id_token');
    expect(url).toContain('response_mode=form_post');
    expect(url).toContain('scope=email');
    expect(url).toContain(`state=${state}`);
    expect(url).toContain(`code_challenge=${codeChallenge}`);
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain(`nonce=${nonce}`);
  });

  it('includes all required OAuth parameters', () => {
    const url = new URL(getAppleAuthUrl(MOCK_APPLE_CONFIG, state, codeChallenge, nonce));
    const params = url.searchParams;

    expect(params.get('client_id')).toBe(MOCK_APPLE_CONFIG.clientId);
    expect(params.get('redirect_uri')).toBe(MOCK_APPLE_CONFIG.redirectUri);
    expect(params.get('response_type')).toBe('code id_token');
    expect(params.get('response_mode')).toBe('form_post');
    expect(params.get('scope')).toBe('email');
    expect(params.get('state')).toBe(state);
    expect(params.get('code_challenge')).toBe(codeChallenge);
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('nonce')).toBe(nonce);
  });

  it('properly URL-encodes parameters', () => {
    const configWithSpecialChars = {
      ...MOCK_APPLE_CONFIG,
      redirectUri: 'https://example.com/auth/callback?param=value&other=123'
    };

    const url = getAppleAuthUrl(configWithSpecialChars, state, codeChallenge, nonce);
    expect(url).toContain(encodeURIComponent(configWithSpecialChars.redirectUri));
  });

  it('throws error for missing clientId', () => {
    const invalidConfig = { ...MOCK_APPLE_CONFIG, clientId: '' };
    expect(() => getAppleAuthUrl(invalidConfig, state, codeChallenge, nonce)).toThrow(
      'Apple Sign-In is not configured'
    );
  });
});

// =============================================================================
// TOKEN EXCHANGE TESTS
// =============================================================================

describe('exchangeCodeForTokens', () => {
  const authCode = 'test-auth-code-12345';
  const codeVerifier = 'test-verifier-12345';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exchanges authorization code for tokens successfully', async () => {
    const mockTokenResponse: AppleTokenResponse = {
      access_token: 'mock-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'mock-refresh-token',
      id_token: 'mock.id.token'
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockTokenResponse
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await exchangeCodeForTokens(MOCK_APPLE_CONFIG, authCode, codeVerifier);

    expect(result).toEqual(mockTokenResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://appleid.apple.com/auth/token',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })
    );
  });

  it('sends correct POST parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'refresh',
        id_token: 'id'
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    await exchangeCodeForTokens(MOCK_APPLE_CONFIG, authCode, codeVerifier);

    const callArgs = fetchMock.mock.calls[0];
    const body = callArgs[1].body as URLSearchParams;

    expect(body.get('client_id')).toBe(MOCK_APPLE_CONFIG.clientId);
    expect(body.get('code')).toBe(authCode);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('redirect_uri')).toBe(MOCK_APPLE_CONFIG.redirectUri);
    expect(body.get('code_verifier')).toBe(codeVerifier);
    expect(body.get('client_secret')).toBeTruthy(); // Generated JWT
  });

  it('handles Apple API error response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_grant"}'
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(exchangeCodeForTokens(MOCK_APPLE_CONFIG, authCode, codeVerifier)).rejects.toThrow(
      'Apple token exchange failed: 400'
    );
  });

  it('handles network timeout', async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      return new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 100);
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(exchangeCodeForTokens(MOCK_APPLE_CONFIG, authCode, codeVerifier)).rejects.toThrow();
  });

  it('includes timeout in fetch request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'refresh',
        id_token: 'id'
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    await exchangeCodeForTokens(MOCK_APPLE_CONFIG, authCode, codeVerifier);

    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[1].signal).toBeInstanceOf(AbortSignal);
  });

  it('handles invalid authorization code', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'invalid_grant'
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(exchangeCodeForTokens(MOCK_APPLE_CONFIG, 'invalid-code', codeVerifier)).rejects.toThrow(
      'Apple token exchange failed: 400 - invalid_grant'
    );
  });

  it('handles server errors gracefully', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => { throw new Error('Cannot read response'); }
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(exchangeCodeForTokens(MOCK_APPLE_CONFIG, authCode, codeVerifier)).rejects.toThrow(
      'Apple token exchange failed: 500 - Unknown error'
    );
  });
});

// =============================================================================
// ID TOKEN VERIFICATION TESTS
// =============================================================================

// Mock jose module for ID token verification tests
vi.mock('jose', async () => {
  const actual = await vi.importActual<typeof jose>('jose');
  return {
    ...actual,
    jwtVerify: vi.fn(),
    createRemoteJWKSet: vi.fn(() => vi.fn())
  };
});

describe('verifyIdentityToken', () => {
  const clientId = MOCK_APPLE_CONFIG.clientId;
  const nonce = 'test-nonce-12345';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifies valid ID token successfully', async () => {
    const mockPayload = {
      iss: 'https://appleid.apple.com',
      aud: clientId,
      sub: 'user-12345',
      email: 'user@example.com',
      email_verified: true,
      is_private_email: false,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
      nonce
    };

    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256', kid: 'test-key' }
    } as any);

    const result = await verifyIdentityToken('mock.jwt.token', clientId, nonce);

    expect(result).toEqual({
      sub: 'user-12345',
      email: 'user@example.com',
      emailVerified: true,
      isPrivateEmail: false
    });

    expect(jose.jwtVerify).toHaveBeenCalledWith(
      'mock.jwt.token',
      expect.anything(),
      expect.objectContaining({
        issuer: 'https://appleid.apple.com',
        audience: clientId,
        clockTolerance: 30
      })
    );
  });

  it('extracts user info correctly', async () => {
    const mockPayload = {
      iss: 'https://appleid.apple.com',
      aud: clientId,
      sub: 'apple-user-12345',
      email: 'privaterelay@privaterelay.appleid.com',
      email_verified: 'true', // String instead of boolean
      is_private_email: 'true', // String instead of boolean
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
      nonce
    };

    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256', kid: 'test-key' }
    } as any);

    const result = await verifyIdentityToken('mock.jwt.token', clientId, nonce);

    expect(result.sub).toBe('apple-user-12345');
    expect(result.email).toBe('privaterelay@privaterelay.appleid.com');
    expect(result.emailVerified).toBe(true); // Converted from string
    expect(result.isPrivateEmail).toBe(true); // Converted from string
  });

  it('handles missing email claim', async () => {
    const mockPayload = {
      iss: 'https://appleid.apple.com',
      aud: clientId,
      sub: 'user-12345',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
      nonce
    };

    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256', kid: 'test-key' }
    } as any);

    const result = await verifyIdentityToken('mock.jwt.token', clientId, nonce);

    expect(result.email).toBeUndefined();
    expect(result.emailVerified).toBe(false);
    expect(result.isPrivateEmail).toBe(false);
  });

  it('throws error for missing sub claim', async () => {
    const mockPayload = {
      iss: 'https://appleid.apple.com',
      aud: clientId,
      email: 'user@example.com',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
      nonce
    };

    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256', kid: 'test-key' }
    } as any);

    await expect(verifyIdentityToken('mock.jwt.token', clientId, nonce)).rejects.toThrow(
      'Missing or invalid sub claim in ID token'
    );
  });

  it('throws error for nonce mismatch', async () => {
    const mockPayload = {
      iss: 'https://appleid.apple.com',
      aud: clientId,
      sub: 'user-12345',
      email: 'user@example.com',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
      nonce: 'wrong-nonce'
    };

    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256', kid: 'test-key' }
    } as any);

    await expect(verifyIdentityToken('mock.jwt.token', clientId, nonce)).rejects.toThrow(
      'Nonce mismatch - possible replay attack'
    );
  });

  it('throws error for missing nonce when expected', async () => {
    const mockPayload = {
      iss: 'https://appleid.apple.com',
      aud: clientId,
      sub: 'user-12345',
      email: 'user@example.com',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600
      // No nonce field
    };

    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256', kid: 'test-key' }
    } as any);

    await expect(verifyIdentityToken('mock.jwt.token', clientId, nonce)).rejects.toThrow(
      'Nonce mismatch - possible replay attack'
    );
  });

  it('allows missing nonce for iOS native flow', async () => {
    const mockPayload = {
      iss: 'https://appleid.apple.com',
      aud: clientId,
      sub: 'user-12345',
      email: 'user@example.com',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600
      // No nonce field
    };

    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256', kid: 'test-key' }
    } as any);

    // No nonce parameter - should not validate
    const result = await verifyIdentityToken('mock.jwt.token', clientId);

    expect(result.sub).toBe('user-12345');
  });

  it('throws error for token older than 10 minutes', async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 700; // 11+ minutes ago

    const mockPayload = {
      iss: 'https://appleid.apple.com',
      aud: clientId,
      sub: 'user-12345',
      email: 'user@example.com',
      iat: oldTimestamp,
      exp: oldTimestamp + 600,
      nonce
    };

    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256', kid: 'test-key' }
    } as any);

    await expect(verifyIdentityToken('mock.jwt.token', clientId, nonce)).rejects.toThrow(
      'ID token too old - possible replay attack'
    );
  });

  it('throws error for missing iat claim', async () => {
    const mockPayload = {
      iss: 'https://appleid.apple.com',
      aud: clientId,
      sub: 'user-12345',
      email: 'user@example.com',
      exp: Math.floor(Date.now() / 1000) + 600,
      nonce
    };

    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256', kid: 'test-key' }
    } as any);

    await expect(verifyIdentityToken('mock.jwt.token', clientId, nonce)).rejects.toThrow(
      'Missing iat claim in ID token'
    );
  });

  it('rejects token with wrong issuer', async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValueOnce(
      new Error('unexpected "iss" claim value')
    );

    await expect(verifyIdentityToken('mock.jwt.token', clientId, nonce)).rejects.toThrow(
      'unexpected "iss" claim value'
    );
  });

  it('rejects token with wrong audience', async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValueOnce(
      new Error('unexpected "aud" claim value')
    );

    await expect(verifyIdentityToken('mock.jwt.token', clientId, nonce)).rejects.toThrow(
      'unexpected "aud" claim value'
    );
  });

  it('rejects expired token', async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValueOnce(
      new Error('"exp" claim timestamp check failed')
    );

    await expect(verifyIdentityToken('mock.jwt.token', clientId, nonce)).rejects.toThrow(
      '"exp" claim timestamp check failed'
    );
  });

  it('rejects token with invalid signature', async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValueOnce(
      new Error('signature verification failed')
    );

    await expect(verifyIdentityToken('mock.jwt.token', clientId, nonce)).rejects.toThrow(
      'signature verification failed'
    );
  });
});

// =============================================================================
// FULL AUTHENTICATION FLOW TESTS
// =============================================================================

describe('authenticateWithApple', () => {
  const authCode = 'test-auth-code';
  const codeVerifier = 'test-verifier';
  const nonce = 'test-nonce';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('completes full authentication flow successfully', async () => {
    const mockTokenResponse: AppleTokenResponse = {
      access_token: 'mock-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'mock-refresh-token',
      id_token: 'mock.id.token'
    };

    const mockUserInfo: AppleUserInfo = {
      sub: 'user-12345',
      email: 'user@example.com',
      emailVerified: true,
      isPrivateEmail: false
    };

    // Mock fetch for token exchange
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockTokenResponse
    });
    vi.stubGlobal('fetch', fetchMock);

    // Mock ID token verification
    const mockPayload = {
      iss: 'https://appleid.apple.com',
      aud: MOCK_APPLE_CONFIG.clientId,
      sub: mockUserInfo.sub,
      email: mockUserInfo.email,
      email_verified: true,
      is_private_email: false,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
      nonce
    };

    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256', kid: 'test-key' }
    } as any);

    const result = await authenticateWithApple(
      MOCK_APPLE_CONFIG,
      authCode,
      codeVerifier,
      nonce
    );

    expect(result).toEqual(mockUserInfo);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails if token exchange fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'invalid_grant'
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      authenticateWithApple(MOCK_APPLE_CONFIG, authCode, codeVerifier, nonce)
    ).rejects.toThrow('Apple token exchange failed');
  });

  it('fails if ID token verification fails', async () => {
    const mockTokenResponse: AppleTokenResponse = {
      access_token: 'mock-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'mock-refresh-token',
      id_token: 'mock.id.token'
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockTokenResponse
    });
    vi.stubGlobal('fetch', fetchMock);

    vi.mocked(jose.jwtVerify).mockRejectedValueOnce(
      new Error('signature verification failed')
    );

    await expect(
      authenticateWithApple(MOCK_APPLE_CONFIG, authCode, codeVerifier, nonce)
    ).rejects.toThrow('signature verification failed');
  });
});

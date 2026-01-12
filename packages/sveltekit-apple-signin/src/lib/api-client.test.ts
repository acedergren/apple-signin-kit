/**
 * API Client Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiClient, AuthError } from './api-client.js';

describe('createApiClient', () => {
  const mockFetch = vi.fn();
  const apiUrl = 'https://api.example.com';

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('getCurrentUser', () => {
    it('should return user on success', async () => {
      const mockUser = { id: '123', email: 'test@example.com', role: 'user' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUser)
      });

      const client = createApiClient({ apiUrl, fetch: mockFetch });
      const user = await client.getCurrentUser();

      expect(user).toEqual(mockUser);
      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/api/v1/auth/me`,
        expect.objectContaining({
          method: 'GET',
          credentials: 'include'
        })
      );
    });

    it('should throw AuthError on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: 'Invalid token' })
      });

      const client = createApiClient({ apiUrl, fetch: mockFetch });

      await expect(client.getCurrentUser()).rejects.toThrow(AuthError);
    });

    it('should forward cookies', async () => {
      const mockUser = { id: '123', email: 'test@example.com', role: 'user' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUser)
      });

      const client = createApiClient({
        apiUrl,
        cookies: 'rd_access_token=abc123; rd_refresh_token=xyz789',
        fetch: mockFetch
      });

      await client.getCurrentUser();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Cookie: 'rd_access_token=abc123; rd_refresh_token=xyz789'
          })
        })
      );
    });

    it('should filter out non-auth cookies', async () => {
      const mockUser = { id: '123', email: 'test@example.com', role: 'user' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUser)
      });

      const client = createApiClient({
        apiUrl,
        cookies: 'rd_access_token=abc123; _ga=tracking123; rd_refresh_token=xyz789',
        fetch: mockFetch
      });

      await client.getCurrentUser();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Cookie: 'rd_access_token=abc123; rd_refresh_token=xyz789'
          })
        })
      );
    });
  });

  describe('initiateAppleSignIn', () => {
    it('should return auth URL and response', async () => {
      const mockResponse = {
        ok: true,
        clone: () => ({
          json: () => Promise.resolve({ authUrl: 'https://appleid.apple.com/auth/...' })
        }),
        headers: new Headers()
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const client = createApiClient({ apiUrl, fetch: mockFetch });
      const result = await client.initiateAppleSignIn();

      expect(result.authUrl).toBe('https://appleid.apple.com/auth/...');
      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/api/v1/auth/apple`,
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('refreshToken', () => {
    it('should return response for cookie extraction', async () => {
      const mockHeaders = new Headers();
      mockHeaders.append('Set-Cookie', 'rd_access_token=new_token; HttpOnly');

      const mockResponse = {
        ok: true,
        clone: () => ({ json: () => Promise.resolve({}) }),
        headers: mockHeaders
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const client = createApiClient({ apiUrl, fetch: mockFetch });
      const result = await client.refreshToken();

      expect(result.response).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/api/v1/auth/refresh`,
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});

describe('AuthError', () => {
  it('should identify unauthorized errors', () => {
    const error = new AuthError(401, 'Unauthorized');
    expect(error.isUnauthorized).toBe(true);
    expect(error.isForbidden).toBe(false);
  });

  it('should identify forbidden errors', () => {
    const error = new AuthError(403, 'Forbidden');
    expect(error.isUnauthorized).toBe(false);
    expect(error.isForbidden).toBe(true);
  });

  it('should identify server errors', () => {
    const error = new AuthError(500, 'Internal Server Error');
    expect(error.isServerError).toBe(true);
  });

  it('should include error body', () => {
    const body = { message: 'Token expired' };
    const error = new AuthError(401, 'Unauthorized', body);
    expect(error.body).toEqual(body);
  });
});

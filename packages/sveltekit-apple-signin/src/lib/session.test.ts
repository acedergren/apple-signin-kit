/**
 * Session Utilities Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { getReturnTo } from './session.js';

// Mock SvelteKit's redirect and error
vi.mock('@sveltejs/kit', () => ({
  redirect: (status: number, location: string) => {
    const error = new Error(`Redirect: ${status} ${location}`);
    (error as unknown as { status: number; location: string }).status = status;
    (error as unknown as { status: number; location: string }).location = location;
    throw error;
  },
  error: (status: number, message: string) => {
    const error = new Error(message);
    (error as unknown as { status: number }).status = status;
    throw error;
  }
}));

describe('getReturnTo', () => {
  function createMockEvent(searchParams: Record<string, string>) {
    const url = new URL('http://localhost');
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
    return {
      url,
      locals: {},
      cookies: { getAll: () => [] }
    } as unknown as Parameters<typeof getReturnTo>[0];
  }

  it('should return returnTo from query params', () => {
    const event = createMockEvent({ returnTo: '/dashboard' });
    expect(getReturnTo(event)).toBe('/dashboard');
  });

  it('should return default path if returnTo is missing', () => {
    const event = createMockEvent({});
    expect(getReturnTo(event, '/home')).toBe('/home');
  });

  it('should return default path for absolute URLs (prevent open redirect)', () => {
    const event = createMockEvent({ returnTo: 'https://evil.com' });
    expect(getReturnTo(event, '/safe')).toBe('/safe');
  });

  it('should return default path for protocol-relative URLs', () => {
    const event = createMockEvent({ returnTo: '//evil.com' });
    expect(getReturnTo(event, '/safe')).toBe('/safe');
  });

  it('should preserve query strings in returnTo', () => {
    const event = createMockEvent({ returnTo: '/search?q=test&page=2' });
    expect(getReturnTo(event)).toBe('/search?q=test&page=2');
  });

  it('should use / as default if no default provided', () => {
    const event = createMockEvent({});
    expect(getReturnTo(event)).toBe('/');
  });
});

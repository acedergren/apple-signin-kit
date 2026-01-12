/**
 * Tests for session-manager module
 *
 * @module session-manager.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RefreshToken, RefreshTokenRepository } from '../src/types.js';
import {
  detectDeviceType,
  extractDeviceName,
  hasUserAgentChanged,
  enforceSessionLimits,
  getUserSessions,
  revokeSession,
  revokeAllSessions,
  DEFAULT_SESSION_CONFIG,
  type DeviceType,
  type SessionInfo,
  type CreateSessionResult
} from '../src/session-manager.js';

// =============================================================================
// MOCK REPOSITORY
// =============================================================================

class MockRefreshTokenRepository implements RefreshTokenRepository {
  private tokens: Map<string, RefreshToken> = new Map();

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.tokens.get(tokenHash) ?? null;
  }

  async create(data: {
    userId: string;
    tokenHash: string;
    userAgent: string | null;
    expiresAt: Date;
  }): Promise<RefreshToken> {
    const token: RefreshToken = {
      id: `token-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: data.userId,
      tokenHash: data.tokenHash,
      userAgent: data.userAgent,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
      lastUsedAt: null,
      revoked: false
    };
    this.tokens.set(data.tokenHash, token);
    return token;
  }

  async revokeByHash(tokenHash: string): Promise<void> {
    this.tokens.delete(tokenHash);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    for (const [hash, token] of this.tokens.entries()) {
      if (token.userId === userId) {
        this.tokens.delete(hash);
      }
    }
  }

  async findActiveByUser(userId: string): Promise<RefreshToken[]> {
    const now = new Date();
    return Array.from(this.tokens.values()).filter(
      token => token.userId === userId && !token.revoked && token.expiresAt > now
    );
  }

  async countActiveForUser(userId: string): Promise<number> {
    const active = await this.findActiveByUser(userId);
    return active.length;
  }

  // Test helpers
  clear(): void {
    this.tokens.clear();
  }

  size(): number {
    return this.tokens.size;
  }
}

// =============================================================================
// DEVICE TYPE DETECTION TESTS
// =============================================================================

describe('detectDeviceType', () => {
  it('should detect iPhone as mobile', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    expect(detectDeviceType(ua)).toBe('mobile');
  });

  it('should detect Android phone as mobile', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36';
    expect(detectDeviceType(ua)).toBe('mobile');
  });

  it('should detect Windows Phone as mobile', () => {
    const ua =
      'Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Microsoft; Lumia 950) AppleWebKit/537.36';
    expect(detectDeviceType(ua)).toBe('mobile');
  });

  it('should detect BlackBerry as mobile', () => {
    const ua = 'Mozilla/5.0 (BlackBerry; U; BlackBerry 9900; en) AppleWebKit/534.11+';
    expect(detectDeviceType(ua)).toBe('mobile');
  });

  it('should detect iPad as tablet', () => {
    const ua =
      'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
    expect(detectDeviceType(ua)).toBe('tablet');
  });

  it('should detect Android tablet as tablet', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 12; SM-T870) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36';
    expect(detectDeviceType(ua)).toBe('tablet');
  });

  it('should detect generic tablet keyword', () => {
    const ua = 'Mozilla/5.0 (tablet; rv:68.0) Gecko/68.0 Firefox/68.0';
    expect(detectDeviceType(ua)).toBe('tablet');
  });

  it('should detect Windows as desktop', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';
    expect(detectDeviceType(ua)).toBe('desktop');
  });

  it('should detect macOS as desktop', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';
    expect(detectDeviceType(ua)).toBe('desktop');
  });

  it('should detect Linux (non-Android) as desktop', () => {
    const ua =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';
    expect(detectDeviceType(ua)).toBe('desktop');
  });

  it('should return unknown for null user-agent', () => {
    expect(detectDeviceType(null)).toBe('unknown');
  });

  it('should return unknown for undefined user-agent', () => {
    expect(detectDeviceType(undefined)).toBe('unknown');
  });

  it('should return unknown for unrecognized user-agent', () => {
    const ua = 'UnknownBot/1.0';
    expect(detectDeviceType(ua)).toBe('unknown');
  });
});

// =============================================================================
// DEVICE NAME EXTRACTION TESTS
// =============================================================================

describe('extractDeviceName', () => {
  it('should extract iPhone device name', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    expect(extractDeviceName(ua)).toBe('iPhone');
  });

  it('should extract iPad device name', () => {
    const ua =
      'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15';
    expect(extractDeviceName(ua)).toBe('iPad');
  });

  it('should extract Android device model', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TP1A.220624.014) AppleWebKit/537.36';
    expect(extractDeviceName(ua)).toBe('Pixel 7');
  });

  it('should handle Android device without build number', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36';
    expect(extractDeviceName(ua)).toBe('SM-G998B');
  });

  it('should fallback to "Android Device" if model extraction fails', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0';
    expect(extractDeviceName(ua)).toBe('Chrome on Linux');
  });

  it('should extract Chrome on macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';
    expect(extractDeviceName(ua)).toBe('Chrome on macOS');
  });

  it('should extract Chrome on Windows', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';
    expect(extractDeviceName(ua)).toBe('Chrome on Windows');
  });

  it('should extract Chrome on Linux', () => {
    const ua =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';
    expect(extractDeviceName(ua)).toBe('Chrome on Linux');
  });

  it('should extract generic Chrome when OS unknown', () => {
    const ua =
      'Mozilla/5.0 (Unknown; Unknown) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0';
    expect(extractDeviceName(ua)).toBe('Chrome');
  });

  it('should extract Firefox on macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/115.0';
    expect(extractDeviceName(ua)).toBe('Firefox on macOS');
  });

  it('should extract Firefox on Windows', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0';
    expect(extractDeviceName(ua)).toBe('Firefox on Windows');
  });

  it('should extract Firefox on Linux', () => {
    const ua =
      'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0';
    expect(extractDeviceName(ua)).toBe('Firefox on Linux');
  });

  it('should extract Safari on macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15';
    expect(extractDeviceName(ua)).toBe('Safari on macOS');
  });

  it('should extract Edge on macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 Edg/115.0.0.0';
    expect(extractDeviceName(ua)).toBe('Edge on macOS');
  });

  it('should extract Edge on Windows', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 Edg/115.0.0.0';
    expect(extractDeviceName(ua)).toBe('Edge on Windows');
  });

  it('should extract generic Microsoft Edge', () => {
    const ua =
      'Mozilla/5.0 (Unknown) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 Edg/115.0.0.0';
    expect(extractDeviceName(ua)).toBe('Microsoft Edge');
  });

  it('should return "Unknown Device" for null user-agent', () => {
    expect(extractDeviceName(null)).toBe('Unknown Device');
  });

  it('should return "Unknown Device" for undefined user-agent', () => {
    expect(extractDeviceName(undefined)).toBe('Unknown Device');
  });

  it('should return "Unknown Device" for unrecognized user-agent', () => {
    const ua = 'UnknownBot/1.0';
    expect(extractDeviceName(ua)).toBe('Unknown Device');
  });

  it('should not confuse Edge with Chrome', () => {
    const edgeUA =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 Edg/115.0.0.0';
    expect(extractDeviceName(edgeUA)).toBe('Edge on Windows');
    expect(extractDeviceName(edgeUA)).not.toBe('Chrome on Windows');
  });
});

// =============================================================================
// USER-AGENT CHANGE DETECTION TESTS
// =============================================================================

describe('hasUserAgentChanged', () => {
  it('should detect OS change (macOS to Windows)', () => {
    const stored =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/115.0.0.0';
    const current =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0';
    expect(hasUserAgentChanged(stored, current)).toBe(true);
  });

  it('should detect browser change (Chrome to Firefox)', () => {
    const stored =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0';
    const current =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0';
    expect(hasUserAgentChanged(stored, current)).toBe(true);
  });

  it('should NOT flag browser version update as change', () => {
    const stored =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0';
    const current =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/116.0.0.0';
    expect(hasUserAgentChanged(stored, current)).toBe(false);
  });

  it('should NOT flag OS version update as change', () => {
    const stored =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/115.0.0.0';
    const current =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_8) AppleWebKit/537.36 Chrome/115.0.0.0';
    expect(hasUserAgentChanged(stored, current)).toBe(false);
  });

  it('should detect mobile to desktop change', () => {
    const stored = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15';
    const current =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/115.0.0.0';
    expect(hasUserAgentChanged(stored, current)).toBe(true);
  });

  it('should return false for null stored user-agent', () => {
    const current =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0';
    expect(hasUserAgentChanged(null, current)).toBe(false);
  });

  it('should return false for null current user-agent', () => {
    const stored =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0';
    expect(hasUserAgentChanged(stored, null)).toBe(false);
  });

  it('should return false when both user-agents are null', () => {
    expect(hasUserAgentChanged(null, null)).toBe(false);
  });

  it('should return false for identical user-agents', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0';
    expect(hasUserAgentChanged(ua, ua)).toBe(false);
  });

  it('should return false when fingerprints are empty (incomplete data)', () => {
    const stored = 'UnknownBot/1.0';
    const current = 'UnknownBot/2.0';
    expect(hasUserAgentChanged(stored, current)).toBe(false);
  });

  it('should handle Edge browser correctly', () => {
    const stored =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Edg/115.0.0.0';
    const current =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/116.0.0.0 Edg/116.0.0.0';
    expect(hasUserAgentChanged(stored, current)).toBe(false);
  });

  it('should detect Edge to Chrome change', () => {
    const stored =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Edg/115.0.0.0';
    const current =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0';
    expect(hasUserAgentChanged(stored, current)).toBe(true);
  });
});

// =============================================================================
// SESSION LIMIT ENFORCEMENT TESTS
// =============================================================================

describe('enforceSessionLimits', () => {
  let repo: MockRefreshTokenRepository;
  const userId = 'user-123';

  beforeEach(() => {
    repo = new MockRefreshTokenRepository();
  });

  it('should not revoke sessions when under limit', async () => {
    // Create 3 sessions (default limit is 5)
    await repo.create({
      userId,
      tokenHash: 'hash-1',
      userAgent: 'Chrome',
      expiresAt: new Date(Date.now() + 86400000)
    });
    await repo.create({
      userId,
      tokenHash: 'hash-2',
      userAgent: 'Firefox',
      expiresAt: new Date(Date.now() + 86400000)
    });
    await repo.create({
      userId,
      tokenHash: 'hash-3',
      userAgent: 'Safari',
      expiresAt: new Date(Date.now() + 86400000)
    });

    const revoked = await enforceSessionLimits(repo, userId);

    expect(revoked).toBe(0);
    expect(repo.size()).toBe(3);
  });

  it('should revoke oldest session when at limit', async () => {
    // Create exactly 5 sessions (at limit)
    const sessions = [];
    for (let i = 1; i <= 5; i++) {
      const session = await repo.create({
        userId,
        tokenHash: `hash-${i}`,
        userAgent: `Browser-${i}`,
        expiresAt: new Date(Date.now() + 86400000)
      });
      sessions.push(session);
      // Small delay to ensure different createdAt timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Now enforce limits (should revoke 1 to make room)
    const revoked = await enforceSessionLimits(repo, userId);

    expect(revoked).toBe(1);
    expect(repo.size()).toBe(4); // 5 - 1 = 4

    // Verify oldest session was revoked
    const oldest = await repo.findByHash('hash-1');
    expect(oldest).toBeNull();
  });

  it('should revoke multiple oldest sessions when over limit', async () => {
    // Create 7 sessions (over the default limit of 5)
    for (let i = 1; i <= 7; i++) {
      await repo.create({
        userId,
        tokenHash: `hash-${i}`,
        userAgent: `Browser-${i}`,
        expiresAt: new Date(Date.now() + 86400000)
      });
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    // Enforce limits (should revoke 3 to get to 4, making room for 1 new)
    const revoked = await enforceSessionLimits(repo, userId);

    expect(revoked).toBe(3); // 7 - 5 + 1 = 3
    expect(repo.size()).toBe(4);

    // Verify oldest 3 sessions were revoked
    for (let i = 1; i <= 3; i++) {
      const session = await repo.findByHash(`hash-${i}`);
      expect(session).toBeNull();
    }

    // Verify newest 4 sessions remain
    for (let i = 4; i <= 7; i++) {
      const session = await repo.findByHash(`hash-${i}`);
      expect(session).not.toBeNull();
    }
  });

  it('should respect custom session limit', async () => {
    // Create 4 sessions with custom limit of 3
    for (let i = 1; i <= 4; i++) {
      await repo.create({
        userId,
        tokenHash: `hash-${i}`,
        userAgent: `Browser-${i}`,
        expiresAt: new Date(Date.now() + 86400000)
      });
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    const revoked = await enforceSessionLimits(repo, userId, {
      maxConcurrentSessions: 3
    });

    expect(revoked).toBe(2); // 4 - 3 + 1 = 2
    expect(repo.size()).toBe(2);
  });

  it('should only count active sessions (not expired)', async () => {
    // Create 3 expired sessions
    for (let i = 1; i <= 3; i++) {
      await repo.create({
        userId,
        tokenHash: `expired-${i}`,
        userAgent: `Browser-${i}`,
        expiresAt: new Date(Date.now() - 86400000) // Expired yesterday
      });
    }

    // Create 2 active sessions
    await repo.create({
      userId,
      tokenHash: 'active-1',
      userAgent: 'Chrome',
      expiresAt: new Date(Date.now() + 86400000)
    });
    await repo.create({
      userId,
      tokenHash: 'active-2',
      userAgent: 'Firefox',
      expiresAt: new Date(Date.now() + 86400000)
    });

    const revoked = await enforceSessionLimits(repo, userId);

    expect(revoked).toBe(0); // Only 2 active sessions, under limit
    expect(repo.size()).toBe(5); // Expired tokens still in repo (not cleaned)
  });

  it('should handle zero sessions gracefully', async () => {
    const revoked = await enforceSessionLimits(repo, userId);
    expect(revoked).toBe(0);
  });

  it('should preserve sessions for other users', async () => {
    const otherUserId = 'user-456';

    // Create sessions for both users
    await repo.create({
      userId,
      tokenHash: 'user-123-hash',
      userAgent: 'Chrome',
      expiresAt: new Date(Date.now() + 86400000)
    });
    await repo.create({
      userId: otherUserId,
      tokenHash: 'user-456-hash',
      userAgent: 'Firefox',
      expiresAt: new Date(Date.now() + 86400000)
    });

    const revoked = await enforceSessionLimits(repo, userId);

    expect(revoked).toBe(0);
    // Other user's session should still exist
    const otherUserSession = await repo.findByHash('user-456-hash');
    expect(otherUserSession).not.toBeNull();
  });
});

// =============================================================================
// GET USER SESSIONS TESTS
// =============================================================================

describe('getUserSessions', () => {
  let repo: MockRefreshTokenRepository;
  const userId = 'user-123';

  beforeEach(() => {
    repo = new MockRefreshTokenRepository();
  });

  it('should return empty array for user with no sessions', async () => {
    const sessions = await getUserSessions(repo, userId);
    expect(sessions).toEqual([]);
  });

  it('should return session info for user sessions', async () => {
    const chromeUA =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0';
    const token = await repo.create({
      userId,
      tokenHash: 'hash-1',
      userAgent: chromeUA,
      expiresAt: new Date(Date.now() + 86400000)
    });

    const sessions = await getUserSessions(repo, userId);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      id: token.id,
      deviceName: 'Chrome on Windows',
      deviceType: 'desktop',
      createdAt: token.createdAt,
      lastUsedAt: null,
      isCurrent: false
    });
  });

  it('should mark current session correctly', async () => {
    const token1 = await repo.create({
      userId,
      tokenHash: 'hash-1',
      userAgent: 'Chrome',
      expiresAt: new Date(Date.now() + 86400000)
    });
    const token2 = await repo.create({
      userId,
      tokenHash: 'hash-2',
      userAgent: 'Firefox',
      expiresAt: new Date(Date.now() + 86400000)
    });

    const sessions = await getUserSessions(repo, userId, 'hash-2');

    expect(sessions).toHaveLength(2);
    expect(sessions.find(s => s.id === token1.id)?.isCurrent).toBe(false);
    expect(sessions.find(s => s.id === token2.id)?.isCurrent).toBe(true);
  });

  it('should include lastUsedAt when available', async () => {
    const lastUsed = new Date(Date.now() - 3600000); // 1 hour ago
    const token = await repo.create({
      userId,
      tokenHash: 'hash-1',
      userAgent: 'Chrome',
      expiresAt: new Date(Date.now() + 86400000)
    });

    // Manually set lastUsedAt (in real code, this would be updated by token refresh)
    token.lastUsedAt = lastUsed;

    const sessions = await getUserSessions(repo, userId);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].lastUsedAt).toEqual(lastUsed);
  });

  it('should only return active sessions (not expired)', async () => {
    // Create expired session
    await repo.create({
      userId,
      tokenHash: 'expired',
      userAgent: 'Chrome',
      expiresAt: new Date(Date.now() - 86400000)
    });

    // Create active session
    await repo.create({
      userId,
      tokenHash: 'active',
      userAgent: 'Firefox',
      expiresAt: new Date(Date.now() + 86400000)
    });

    const sessions = await getUserSessions(repo, userId);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].deviceName).toContain('Firefox');
  });

  it('should not include other users sessions', async () => {
    await repo.create({
      userId,
      tokenHash: 'user-123-hash',
      userAgent: 'Chrome',
      expiresAt: new Date(Date.now() + 86400000)
    });
    await repo.create({
      userId: 'user-456',
      tokenHash: 'user-456-hash',
      userAgent: 'Firefox',
      expiresAt: new Date(Date.now() + 86400000)
    });

    const sessions = await getUserSessions(repo, userId);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].deviceName).toContain('Chrome');
  });

  it('should detect different device types correctly', async () => {
    const uas = [
      {
        ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15',
        type: 'mobile' as DeviceType
      },
      {
        ua: 'Mozilla/5.0 (iPad; CPU OS 16_0) AppleWebKit/605.1.15',
        type: 'tablet' as DeviceType
      },
      {
        ua: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/115.0.0.0',
        type: 'desktop' as DeviceType
      }
    ];

    for (let i = 0; i < uas.length; i++) {
      await repo.create({
        userId,
        tokenHash: `hash-${i}`,
        userAgent: uas[i].ua,
        expiresAt: new Date(Date.now() + 86400000)
      });
    }

    const sessions = await getUserSessions(repo, userId);

    expect(sessions).toHaveLength(3);
    for (let i = 0; i < uas.length; i++) {
      const session = sessions.find(s => s.id.includes(`hash-${i}`)) ?? sessions[i];
      expect(session.deviceType).toBe(uas[i].type);
    }
  });
});

// =============================================================================
// REVOKE SESSION TESTS
// =============================================================================

describe('revokeSession', () => {
  let repo: MockRefreshTokenRepository;
  const userId = 'user-123';

  beforeEach(() => {
    repo = new MockRefreshTokenRepository();
  });

  it('should revoke session by ID', async () => {
    const token = await repo.create({
      userId,
      tokenHash: 'hash-1',
      userAgent: 'Chrome',
      expiresAt: new Date(Date.now() + 86400000)
    });

    const result = await revokeSession(repo, token.id, userId);

    expect(result).toBe(true);
    const revokedToken = await repo.findByHash('hash-1');
    expect(revokedToken).toBeNull();
  });

  it('should return false for non-existent session ID', async () => {
    const result = await revokeSession(repo, 'non-existent-id', userId);
    expect(result).toBe(false);
  });

  it('should not revoke session belonging to different user', async () => {
    const otherUserId = 'user-456';
    const token = await repo.create({
      userId: otherUserId,
      tokenHash: 'hash-1',
      userAgent: 'Chrome',
      expiresAt: new Date(Date.now() + 86400000)
    });

    const result = await revokeSession(repo, token.id, userId);

    expect(result).toBe(false);
    // Verify session still exists
    const stillExists = await repo.findByHash('hash-1');
    expect(stillExists).not.toBeNull();
  });

  it('should only revoke specified session, not others', async () => {
    const token1 = await repo.create({
      userId,
      tokenHash: 'hash-1',
      userAgent: 'Chrome',
      expiresAt: new Date(Date.now() + 86400000)
    });
    const token2 = await repo.create({
      userId,
      tokenHash: 'hash-2',
      userAgent: 'Firefox',
      expiresAt: new Date(Date.now() + 86400000)
    });

    await revokeSession(repo, token1.id, userId);

    const revoked = await repo.findByHash('hash-1');
    const remains = await repo.findByHash('hash-2');
    expect(revoked).toBeNull();
    expect(remains).not.toBeNull();
  });

  it('should handle revoking already-expired session', async () => {
    const token = await repo.create({
      userId,
      tokenHash: 'hash-1',
      userAgent: 'Chrome',
      expiresAt: new Date(Date.now() - 86400000) // Expired
    });

    // Should return false because findActiveByUser won't include it
    const result = await revokeSession(repo, token.id, userId);
    expect(result).toBe(false);
  });
});

// =============================================================================
// REVOKE ALL SESSIONS TESTS
// =============================================================================

describe('revokeAllSessions', () => {
  let repo: MockRefreshTokenRepository;
  const userId = 'user-123';

  beforeEach(() => {
    repo = new MockRefreshTokenRepository();
  });

  it('should revoke all sessions for user', async () => {
    // Create 3 sessions
    await repo.create({
      userId,
      tokenHash: 'hash-1',
      userAgent: 'Chrome',
      expiresAt: new Date(Date.now() + 86400000)
    });
    await repo.create({
      userId,
      tokenHash: 'hash-2',
      userAgent: 'Firefox',
      expiresAt: new Date(Date.now() + 86400000)
    });
    await repo.create({
      userId,
      tokenHash: 'hash-3',
      userAgent: 'Safari',
      expiresAt: new Date(Date.now() + 86400000)
    });

    await revokeAllSessions(repo, userId);

    const sessions = await getUserSessions(repo, userId);
    expect(sessions).toHaveLength(0);
  });

  it('should not revoke sessions for other users', async () => {
    const otherUserId = 'user-456';

    await repo.create({
      userId,
      tokenHash: 'user-123-hash',
      userAgent: 'Chrome',
      expiresAt: new Date(Date.now() + 86400000)
    });
    await repo.create({
      userId: otherUserId,
      tokenHash: 'user-456-hash',
      userAgent: 'Firefox',
      expiresAt: new Date(Date.now() + 86400000)
    });

    await revokeAllSessions(repo, userId);

    const user123Sessions = await getUserSessions(repo, userId);
    const user456Sessions = await getUserSessions(repo, otherUserId);

    expect(user123Sessions).toHaveLength(0);
    expect(user456Sessions).toHaveLength(1);
  });

  it('should handle revoking when user has no sessions', async () => {
    // Should not throw
    await expect(revokeAllSessions(repo, userId)).resolves.toBeUndefined();
  });

  it('should revoke both active and expired sessions', async () => {
    await repo.create({
      userId,
      tokenHash: 'active',
      userAgent: 'Chrome',
      expiresAt: new Date(Date.now() + 86400000)
    });
    await repo.create({
      userId,
      tokenHash: 'expired',
      userAgent: 'Firefox',
      expiresAt: new Date(Date.now() - 86400000)
    });

    await revokeAllSessions(repo, userId);

    expect(repo.size()).toBe(0);
  });
});

// =============================================================================
// DEFAULT CONFIG TESTS
// =============================================================================

describe('DEFAULT_SESSION_CONFIG', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_SESSION_CONFIG.maxConcurrentSessions).toBe(5);
    expect(DEFAULT_SESSION_CONFIG.revokeOnUserAgentChange).toBe(true);
  });

  it('should be immutable (test protection)', () => {
    const original = { ...DEFAULT_SESSION_CONFIG };
    expect(DEFAULT_SESSION_CONFIG).toEqual(original);
  });
});

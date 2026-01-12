/**
 * Session Manager
 *
 * Enforces concurrent session limits and manages active user sessions.
 *
 * Security Policy:
 * - Maximum 5 concurrent sessions per user (configurable)
 * - When limit exceeded, oldest session is automatically revoked
 * - Sessions can be revoked individually or all at once
 * - User-Agent binding for device tracking
 *
 * @module session-manager
 */

import type { SessionConfig, RefreshTokenRepository } from './types.js';

/**
 * Device type detection from User-Agent
 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown';

/**
 * Session info for API responses (human-friendly view of a refresh token).
 */
export interface SessionInfo {
  /** Session ID (refresh token ID) */
  id: string;
  /** Human-readable device name */
  deviceName: string;
  /** Device type category */
  deviceType: DeviceType;
  /** When session was created */
  createdAt: Date;
  /** When session was last used */
  lastUsedAt: Date | null;
  /** Whether this is the current session */
  isCurrent: boolean;
}

/**
 * Result of creating a new session.
 */
export interface CreateSessionResult {
  /** The newly created session/token */
  tokenId: string;
  /** Sessions that were revoked to make room */
  revokedCount: number;
}

/**
 * Default session configuration.
 */
export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  maxConcurrentSessions: 5,
  revokeOnUserAgentChange: true
};

/**
 * Detect device type from User-Agent string.
 *
 * @param userAgent - The User-Agent header value
 * @returns Device type category
 *
 * @example
 * ```typescript
 * detectDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0...)');
 * // Returns: 'mobile'
 * ```
 */
export function detectDeviceType(userAgent?: string | null): DeviceType {
  if (!userAgent) return 'unknown';

  const ua = userAgent.toLowerCase();

  // Check for mobile devices first
  if (
    ua.includes('iphone') ||
    (ua.includes('android') && ua.includes('mobile')) ||
    ua.includes('windows phone') ||
    ua.includes('blackberry')
  ) {
    return 'mobile';
  }

  // Check for tablets
  if (
    ua.includes('ipad') ||
    (ua.includes('android') && !ua.includes('mobile')) ||
    ua.includes('tablet')
  ) {
    return 'tablet';
  }

  // Check for desktop browsers
  if (
    ua.includes('windows') ||
    ua.includes('macintosh') ||
    (ua.includes('linux') && !ua.includes('android'))
  ) {
    return 'desktop';
  }

  return 'unknown';
}

/**
 * Extract a friendly device name from User-Agent.
 *
 * @param userAgent - The User-Agent header value
 * @returns Human-readable device name
 *
 * @example
 * ```typescript
 * extractDeviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X...) Chrome/...');
 * // Returns: 'Chrome on macOS'
 * ```
 */
export function extractDeviceName(userAgent?: string | null): string {
  if (!userAgent) return 'Unknown Device';

  const ua = userAgent;

  // iOS devices
  if (ua.includes('iPhone')) return 'iPhone';
  if (ua.includes('iPad')) return 'iPad';

  // Android devices - try to extract model
  const androidMatch = ua.match(/Android[^;]*;\s*([^)]+)\)/);
  if (androidMatch) {
    const model = androidMatch[1]?.split(' Build')[0]?.trim();
    return model || 'Android Device';
  }

  // Desktop browsers
  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    if (ua.includes('Mac OS')) return 'Chrome on macOS';
    if (ua.includes('Windows')) return 'Chrome on Windows';
    if (ua.includes('Linux')) return 'Chrome on Linux';
    return 'Chrome';
  }

  if (ua.includes('Firefox')) {
    if (ua.includes('Mac OS')) return 'Firefox on macOS';
    if (ua.includes('Windows')) return 'Firefox on Windows';
    if (ua.includes('Linux')) return 'Firefox on Linux';
    return 'Firefox';
  }

  if (ua.includes('Safari') && !ua.includes('Chrome')) {
    return 'Safari on macOS';
  }

  if (ua.includes('Edg')) {
    if (ua.includes('Mac OS')) return 'Edge on macOS';
    if (ua.includes('Windows')) return 'Edge on Windows';
    return 'Microsoft Edge';
  }

  return 'Unknown Device';
}

/**
 * Check if the User-Agent has changed significantly (possible token theft).
 *
 * @param storedUserAgent - The User-Agent stored with the token
 * @param currentUserAgent - The current request's User-Agent
 * @returns true if User-Agent appears to have changed to a different device
 */
export function hasUserAgentChanged(
  storedUserAgent: string | null,
  currentUserAgent: string | null
): boolean {
  if (!storedUserAgent || !currentUserAgent) return false;

  // Extract key identifiers for comparison
  const extractKey = (ua: string): string => {
    const lower = ua.toLowerCase();

    // Build a fingerprint from stable components
    const parts: string[] = [];

    // OS
    if (lower.includes('windows')) parts.push('windows');
    else if (lower.includes('mac os')) parts.push('macos');
    else if (lower.includes('linux')) parts.push('linux');
    else if (lower.includes('android')) parts.push('android');
    else if (lower.includes('iphone') || lower.includes('ipad')) parts.push('ios');

    // Browser family (not version)
    if (lower.includes('firefox')) parts.push('firefox');
    else if (lower.includes('edg')) parts.push('edge');
    else if (lower.includes('chrome')) parts.push('chrome');
    else if (lower.includes('safari')) parts.push('safari');

    return parts.join('-');
  };

  const storedKey = extractKey(storedUserAgent);
  const currentKey = extractKey(currentUserAgent);

  // If either key is empty, don't flag as changed (incomplete data)
  if (!storedKey || !currentKey) return false;

  return storedKey !== currentKey;
}

/**
 * Enforce session limits by revoking oldest sessions if needed.
 *
 * @param repo - Refresh token repository
 * @param userId - The user's ID
 * @param config - Session configuration
 * @returns Number of sessions revoked
 *
 * @example
 * ```typescript
 * // Before creating a new session, ensure we have room
 * const revoked = await enforceSessionLimits(tokenRepo, userId);
 * if (revoked > 0) {
 *   logger.info({ userId, revoked }, 'Revoked old sessions due to limit');
 * }
 * ```
 */
export async function enforceSessionLimits(
  repo: RefreshTokenRepository,
  userId: string,
  config: Partial<SessionConfig> = {}
): Promise<number> {
  const { maxConcurrentSessions } = { ...DEFAULT_SESSION_CONFIG, ...config };

  // Get all active sessions
  const activeSessions = await repo.findActiveByUser(userId);

  // If under limit, nothing to do
  if (activeSessions.length < maxConcurrentSessions) {
    return 0;
  }

  // Sort by creation time (oldest first)
  const sortedSessions = [...activeSessions].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  // Calculate how many to revoke (make room for 1 new session)
  const toRevokeCount = activeSessions.length - maxConcurrentSessions + 1;
  const toRevoke = sortedSessions.slice(0, toRevokeCount);

  // Revoke oldest sessions
  for (const session of toRevoke) {
    await repo.revokeByHash(session.tokenHash);
  }

  return toRevoke.length;
}

/**
 * Get all active sessions for a user formatted for API response.
 *
 * @param repo - Refresh token repository
 * @param userId - The user's ID
 * @param currentTokenHash - Hash of the current session's token (to mark as current)
 * @returns List of session info objects
 */
export async function getUserSessions(
  repo: RefreshTokenRepository,
  userId: string,
  currentTokenHash?: string
): Promise<SessionInfo[]> {
  const tokens = await repo.findActiveByUser(userId);

  return tokens.map(token => ({
    id: token.id,
    deviceName: extractDeviceName(token.userAgent),
    deviceType: detectDeviceType(token.userAgent),
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt || null,
    isCurrent: currentTokenHash ? token.tokenHash === currentTokenHash : false
  }));
}

/**
 * Revoke a specific session by its ID (not hash).
 * This is used for the sessions management UI.
 *
 * @param repo - Refresh token repository
 * @param sessionId - The session/token ID
 * @param userId - The user's ID (for authorization check)
 * @returns true if session was found and revoked
 */
export async function revokeSession(
  repo: RefreshTokenRepository,
  sessionId: string,
  userId: string
): Promise<boolean> {
  // Get all user's sessions and find by ID
  const sessions = await repo.findActiveByUser(userId);
  const session = sessions.find(s => s.id === sessionId);

  if (!session) {
    return false;
  }

  await repo.revokeByHash(session.tokenHash);
  return true;
}

/**
 * Revoke all sessions for a user (logout everywhere).
 *
 * @param repo - Refresh token repository
 * @param userId - The user's ID
 */
export async function revokeAllSessions(
  repo: RefreshTokenRepository,
  userId: string
): Promise<void> {
  await repo.revokeAllForUser(userId);
}

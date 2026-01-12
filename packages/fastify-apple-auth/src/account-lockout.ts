/**
 * Account Lockout Service
 *
 * Implements brute-force protection with progressive lockout durations.
 * Pure functions - no I/O, caller handles database operations.
 *
 * NIST 800-63B compliant lockout mechanism.
 *
 * @module account-lockout
 */

import type { LockoutConfig, UserLockoutState } from './types.js';

/**
 * Result of checking account lockout status.
 */
export interface LockoutCheckResult {
  /** Whether the account is currently locked */
  isLocked: boolean;
  /** When the lock expires (null if not locked) */
  lockedUntil: Date | null;
  /** Seconds until retry is allowed (null if not locked) */
  retryAfterSeconds: number | null;
  /** Current failed attempt count */
  failedAttempts: number;
}

/**
 * Result of recording a failed login attempt.
 */
export interface RecordFailedAttemptResult {
  /** Whether the account should be locked now */
  shouldLock: boolean;
  /** New failed attempt count */
  newFailedAttempts: number;
  /** When the lock expires (null if not locking) */
  lockedUntil: Date | null;
  /** Lock duration in ms (null if not locking) */
  lockDurationMs: number | null;
}

/**
 * Reset state for lockout (after successful login).
 */
export interface ResetLockoutResult {
  failedLoginAttempts: 0;
  lockedUntil: null;
  lastFailedAttemptAt: null;
}

/**
 * Default lockout configuration (NIST 800-63B compliant).
 */
export const DEFAULT_LOCKOUT_CONFIG: LockoutConfig = {
  threshold: 5,
  baseDurationMs: 15 * 60 * 1000, // 15 minutes
  maxDurationMs: 24 * 60 * 60 * 1000, // 24 hours
  attemptWindowMs: 15 * 60 * 1000 // 15 minutes
};

/**
 * Calculate progressive lockout duration.
 * Duration doubles with each consecutive lockout: 15min → 30min → 60min → etc.
 *
 * @param consecutiveLockouts - Number of times the account has been locked
 * @param config - Lockout configuration
 * @returns Duration in milliseconds
 *
 * @example
 * ```typescript
 * calculateLockoutDuration(1);  // 900000 (15 min)
 * calculateLockoutDuration(2);  // 1800000 (30 min)
 * calculateLockoutDuration(3);  // 3600000 (60 min)
 * calculateLockoutDuration(10); // 86400000 (24 hr max)
 * ```
 */
export function calculateLockoutDuration(
  consecutiveLockouts: number,
  config: Partial<LockoutConfig> = {}
): number {
  const { baseDurationMs, maxDurationMs } = { ...DEFAULT_LOCKOUT_CONFIG, ...config };

  // 2^n progression: 15min, 30min, 60min, 2h, 4h, 8h, 16h, max 24h
  const multiplier = Math.pow(2, Math.max(0, consecutiveLockouts - 1));
  const duration = baseDurationMs * multiplier;

  return Math.min(duration, maxDurationMs);
}

/**
 * Check if a user account is currently locked.
 *
 * @param state - Current user lockout state
 * @param now - Current timestamp (for testing)
 * @returns Lockout check result
 *
 * @example
 * ```typescript
 * const state = await userRepo.getLockoutState(userId);
 * const result = checkAccountLockout(state);
 *
 * if (result.isLocked) {
 *   return { error: 'Account locked', retryAfter: result.retryAfterSeconds };
 * }
 * ```
 */
export function checkAccountLockout(
  state: UserLockoutState,
  now: Date = new Date()
): LockoutCheckResult {
  const { lockedUntil, failedLoginAttempts } = state;

  // Not locked if no lockout timestamp
  if (!lockedUntil) {
    return {
      isLocked: false,
      lockedUntil: null,
      retryAfterSeconds: null,
      failedAttempts: failedLoginAttempts
    };
  }

  const nowMs = now.getTime();
  const lockedUntilMs = lockedUntil.getTime();

  // Lock has expired
  if (nowMs >= lockedUntilMs) {
    return {
      isLocked: false,
      lockedUntil: null,
      retryAfterSeconds: null,
      failedAttempts: failedLoginAttempts
    };
  }

  // Still locked
  const retryAfterSeconds = Math.ceil((lockedUntilMs - nowMs) / 1000);
  return {
    isLocked: true,
    lockedUntil,
    retryAfterSeconds,
    failedAttempts: failedLoginAttempts
  };
}

/**
 * Calculate the number of consecutive lockouts based on attempt history.
 * Used for progressive lockout duration.
 *
 * @param failedAttempts - Current failed attempt count
 * @param threshold - Lockout threshold
 * @returns Number of consecutive lockouts
 */
export function calculateConsecutiveLockouts(
  failedAttempts: number,
  threshold: number
): number {
  if (failedAttempts < threshold) {
    return 0;
  }
  // Each threshold breach = 1 lockout
  return Math.floor(failedAttempts / threshold);
}

/**
 * Record a failed login attempt and determine if the account should be locked.
 *
 * @param state - Current user lockout state
 * @param config - Lockout configuration
 * @param now - Current timestamp (for testing)
 * @returns Result with new state and lock status
 *
 * @example
 * ```typescript
 * const state = await userRepo.getLockoutState(userId);
 * const result = recordFailedAttempt(state);
 *
 * await userRepo.updateLockoutState(userId, {
 *   failedLoginAttempts: result.newFailedAttempts,
 *   lockedUntil: result.lockedUntil,
 *   lastFailedAttemptAt: new Date()
 * });
 *
 * if (result.shouldLock) {
 *   logger.warn({ userId, duration: result.lockDurationMs }, 'Account locked');
 * }
 * ```
 */
export function recordFailedAttempt(
  state: UserLockoutState,
  config: Partial<LockoutConfig> = {},
  now: Date = new Date()
): RecordFailedAttemptResult {
  const mergedConfig = { ...DEFAULT_LOCKOUT_CONFIG, ...config };
  const { threshold, attemptWindowMs } = mergedConfig;

  let { failedLoginAttempts } = state;
  const { lastFailedAttemptAt } = state;
  const nowMs = now.getTime();

  // Reset counter if outside the attempt window
  if (lastFailedAttemptAt) {
    const timeSinceLastAttempt = nowMs - lastFailedAttemptAt.getTime();
    if (timeSinceLastAttempt > attemptWindowMs) {
      failedLoginAttempts = 0;
    }
  }

  // Increment failed attempts
  const newFailedAttempts = failedLoginAttempts + 1;

  // Check if we should lock
  if (newFailedAttempts >= threshold) {
    const consecutiveLockouts = calculateConsecutiveLockouts(
      newFailedAttempts,
      threshold
    );
    const lockDurationMs = calculateLockoutDuration(consecutiveLockouts, mergedConfig);
    const lockedUntil = new Date(nowMs + lockDurationMs);

    return {
      shouldLock: true,
      newFailedAttempts,
      lockedUntil,
      lockDurationMs
    };
  }

  return {
    shouldLock: false,
    newFailedAttempts,
    lockedUntil: null,
    lockDurationMs: null
  };
}

/**
 * Get the state to reset lockout after successful login.
 *
 * @returns Reset state values
 *
 * @example
 * ```typescript
 * // After successful login
 * const resetState = getResetLockoutState();
 * await userRepo.updateLockoutState(userId, resetState);
 * ```
 */
export function getResetLockoutState(): ResetLockoutResult {
  return {
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastFailedAttemptAt: null
  };
}

/**
 * Determine remaining attempts before lockout.
 *
 * @param failedAttempts - Current failed attempt count
 * @param threshold - Lockout threshold
 * @returns Remaining attempts (0 if already at/over threshold)
 */
export function getRemainingAttempts(
  failedAttempts: number,
  threshold: number = DEFAULT_LOCKOUT_CONFIG.threshold
): number {
  return Math.max(0, threshold - failedAttempts);
}

/**
 * Format lockout duration for user-friendly display.
 *
 * @param durationMs - Duration in milliseconds
 * @returns Human-readable duration string
 *
 * @example
 * ```typescript
 * formatLockoutDuration(900000);    // "15 minutes"
 * formatLockoutDuration(3660000);   // "1 hour 1 minute"
 * formatLockoutDuration(86400000);  // "24 hours"
 * ```
 */
export function formatLockoutDuration(durationMs: number): string {
  const seconds = Math.ceil(durationMs / 1000);
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    if (remainingMinutes > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
    }
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }

  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }

  return `${seconds} second${seconds > 1 ? 's' : ''}`;
}

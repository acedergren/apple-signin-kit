/**
 * Account Lockout Service Tests
 *
 * Comprehensive test suite for NIST 800-63B compliant lockout mechanism.
 * Tests all pure functions with deterministic fixed timestamps.
 *
 * @module account-lockout.test
 */

import { describe, it, expect } from 'vitest';
import {
  calculateLockoutDuration,
  checkAccountLockout,
  calculateConsecutiveLockouts,
  recordFailedAttempt,
  getResetLockoutState,
  getRemainingAttempts,
  formatLockoutDuration,
  DEFAULT_LOCKOUT_CONFIG
} from '../src/account-lockout.js';
import type { UserLockoutState, LockoutConfig } from '../src/types.js';

// =============================================================================
// FIXTURES
// =============================================================================

const FIXED_NOW = new Date('2024-01-15T10:00:00Z');
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

/**
 * Create a user lockout state with defaults for testing.
 */
function createLockoutState(
  overrides: Partial<UserLockoutState> = {}
): UserLockoutState {
  return {
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastFailedAttemptAt: null,
    ...overrides
  };
}

// =============================================================================
// calculateLockoutDuration TESTS
// =============================================================================

describe('calculateLockoutDuration', () => {
  it('should return base duration for first lockout', () => {
    const duration = calculateLockoutDuration(1);
    expect(duration).toBe(15 * MS_PER_MINUTE); // 900000ms = 15 minutes
  });

  it('should double duration for second lockout (30 minutes)', () => {
    const duration = calculateLockoutDuration(2);
    expect(duration).toBe(30 * MS_PER_MINUTE); // 1800000ms = 30 minutes
  });

  it('should quadruple for third lockout (60 minutes)', () => {
    const duration = calculateLockoutDuration(3);
    expect(duration).toBe(60 * MS_PER_MINUTE); // 3600000ms = 60 minutes
  });

  it('should cap at maximum duration (24 hours)', () => {
    const duration = calculateLockoutDuration(10); // Very high consecutive lockouts
    expect(duration).toBe(24 * MS_PER_HOUR); // 86400000ms = 24 hours
  });

  it('should enforce max duration even for extreme values', () => {
    const duration = calculateLockoutDuration(100);
    expect(duration).toBe(24 * MS_PER_HOUR);
  });

  it('should handle zero consecutive lockouts', () => {
    const duration = calculateLockoutDuration(0);
    expect(duration).toBe(15 * MS_PER_MINUTE); // Still base duration
  });

  it('should use custom base duration from config', () => {
    const customConfig: Partial<LockoutConfig> = {
      baseDurationMs: 10 * MS_PER_MINUTE // 10 minutes
    };
    const duration = calculateLockoutDuration(1, customConfig);
    expect(duration).toBe(10 * MS_PER_MINUTE);
  });

  it('should use custom max duration from config', () => {
    const customConfig: Partial<LockoutConfig> = {
      maxDurationMs: 1 * MS_PER_HOUR // 1 hour max
    };
    const duration = calculateLockoutDuration(10, customConfig);
    expect(duration).toBe(1 * MS_PER_HOUR);
  });

  it('should follow exponential progression (2^n)', () => {
    expect(calculateLockoutDuration(1)).toBe(15 * MS_PER_MINUTE); // 2^0 * 15min
    expect(calculateLockoutDuration(2)).toBe(30 * MS_PER_MINUTE); // 2^1 * 15min
    expect(calculateLockoutDuration(3)).toBe(60 * MS_PER_MINUTE); // 2^2 * 15min
    expect(calculateLockoutDuration(4)).toBe(120 * MS_PER_MINUTE); // 2^3 * 15min
    expect(calculateLockoutDuration(5)).toBe(240 * MS_PER_MINUTE); // 2^4 * 15min
  });
});

// =============================================================================
// checkAccountLockout TESTS
// =============================================================================

describe('checkAccountLockout', () => {
  it('should return not locked when no lockedUntil timestamp', () => {
    const state = createLockoutState({
      failedLoginAttempts: 3
    });
    const result = checkAccountLockout(state, FIXED_NOW);

    expect(result.isLocked).toBe(false);
    expect(result.lockedUntil).toBeNull();
    expect(result.retryAfterSeconds).toBeNull();
    expect(result.failedAttempts).toBe(3);
  });

  it('should return not locked when lockedUntil is in the past', () => {
    const pastLock = new Date(FIXED_NOW.getTime() - 10 * MS_PER_MINUTE);
    const state = createLockoutState({
      failedLoginAttempts: 5,
      lockedUntil: pastLock
    });
    const result = checkAccountLockout(state, FIXED_NOW);

    expect(result.isLocked).toBe(false);
    expect(result.lockedUntil).toBeNull();
    expect(result.retryAfterSeconds).toBeNull();
    expect(result.failedAttempts).toBe(5);
  });

  it('should return locked when lockedUntil is in the future', () => {
    const futureLock = new Date(FIXED_NOW.getTime() + 15 * MS_PER_MINUTE);
    const state = createLockoutState({
      failedLoginAttempts: 5,
      lockedUntil: futureLock
    });
    const result = checkAccountLockout(state, FIXED_NOW);

    expect(result.isLocked).toBe(true);
    expect(result.lockedUntil).toEqual(futureLock);
    expect(result.retryAfterSeconds).toBe(15 * 60); // 900 seconds
    expect(result.failedAttempts).toBe(5);
  });

  it('should calculate correct retryAfterSeconds (rounded up)', () => {
    // Lock expires in 90.5 seconds
    const futureLock = new Date(FIXED_NOW.getTime() + 90500);
    const state = createLockoutState({
      failedLoginAttempts: 5,
      lockedUntil: futureLock
    });
    const result = checkAccountLockout(state, FIXED_NOW);

    expect(result.isLocked).toBe(true);
    expect(result.retryAfterSeconds).toBe(91); // Rounded up from 90.5
  });

  it('should return not locked when lockedUntil equals now (boundary)', () => {
    const state = createLockoutState({
      failedLoginAttempts: 5,
      lockedUntil: FIXED_NOW
    });
    const result = checkAccountLockout(state, FIXED_NOW);

    expect(result.isLocked).toBe(false);
  });

  it('should handle millisecond precision correctly', () => {
    // Lock expires in 1 millisecond
    const futureLock = new Date(FIXED_NOW.getTime() + 1);
    const state = createLockoutState({
      failedLoginAttempts: 5,
      lockedUntil: futureLock
    });
    const result = checkAccountLockout(state, FIXED_NOW);

    expect(result.isLocked).toBe(true);
    expect(result.retryAfterSeconds).toBe(1); // Rounded up from 0.001
  });
});

// =============================================================================
// calculateConsecutiveLockouts TESTS
// =============================================================================

describe('calculateConsecutiveLockouts', () => {
  const THRESHOLD = DEFAULT_LOCKOUT_CONFIG.threshold; // 5

  it('should return 0 when below threshold', () => {
    expect(calculateConsecutiveLockouts(0, THRESHOLD)).toBe(0);
    expect(calculateConsecutiveLockouts(1, THRESHOLD)).toBe(0);
    expect(calculateConsecutiveLockouts(4, THRESHOLD)).toBe(0);
  });

  it('should return 1 when at threshold (first lockout)', () => {
    expect(calculateConsecutiveLockouts(5, THRESHOLD)).toBe(1);
  });

  it('should return 1 for attempts just over threshold', () => {
    expect(calculateConsecutiveLockouts(6, THRESHOLD)).toBe(1);
    expect(calculateConsecutiveLockouts(9, THRESHOLD)).toBe(1);
  });

  it('should return 2 for second threshold breach', () => {
    expect(calculateConsecutiveLockouts(10, THRESHOLD)).toBe(2);
    expect(calculateConsecutiveLockouts(14, THRESHOLD)).toBe(2);
  });

  it('should return 3 for third threshold breach', () => {
    expect(calculateConsecutiveLockouts(15, THRESHOLD)).toBe(3);
    expect(calculateConsecutiveLockouts(19, THRESHOLD)).toBe(3);
  });

  it('should handle custom threshold', () => {
    expect(calculateConsecutiveLockouts(3, 3)).toBe(1);
    expect(calculateConsecutiveLockouts(6, 3)).toBe(2);
    expect(calculateConsecutiveLockouts(9, 3)).toBe(3);
  });

  it('should handle large consecutive lockouts', () => {
    expect(calculateConsecutiveLockouts(50, THRESHOLD)).toBe(10);
    expect(calculateConsecutiveLockouts(100, THRESHOLD)).toBe(20);
  });
});

// =============================================================================
// recordFailedAttempt TESTS
// =============================================================================

describe('recordFailedAttempt', () => {
  it('should increment failed attempts on first failure', () => {
    const state = createLockoutState();
    const result = recordFailedAttempt(state, {}, FIXED_NOW);

    expect(result.shouldLock).toBe(false);
    expect(result.newFailedAttempts).toBe(1);
    expect(result.lockedUntil).toBeNull();
    expect(result.lockDurationMs).toBeNull();
  });

  it('should increment failed attempts below threshold', () => {
    const state = createLockoutState({
      failedLoginAttempts: 3,
      lastFailedAttemptAt: new Date(FIXED_NOW.getTime() - 1 * MS_PER_MINUTE)
    });
    const result = recordFailedAttempt(state, {}, FIXED_NOW);

    expect(result.shouldLock).toBe(false);
    expect(result.newFailedAttempts).toBe(4);
    expect(result.lockedUntil).toBeNull();
  });

  it('should lock account when threshold is reached', () => {
    const state = createLockoutState({
      failedLoginAttempts: 4,
      lastFailedAttemptAt: new Date(FIXED_NOW.getTime() - 1 * MS_PER_MINUTE)
    });
    const result = recordFailedAttempt(state, {}, FIXED_NOW);

    expect(result.shouldLock).toBe(true);
    expect(result.newFailedAttempts).toBe(5);
    expect(result.lockDurationMs).toBe(15 * MS_PER_MINUTE);
    expect(result.lockedUntil).toEqual(
      new Date(FIXED_NOW.getTime() + 15 * MS_PER_MINUTE)
    );
  });

  it('should reset counter when outside attempt window', () => {
    const state = createLockoutState({
      failedLoginAttempts: 3,
      lastFailedAttemptAt: new Date(
        FIXED_NOW.getTime() - 20 * MS_PER_MINUTE // Beyond 15min window
      )
    });
    const result = recordFailedAttempt(state, {}, FIXED_NOW);

    expect(result.shouldLock).toBe(false);
    expect(result.newFailedAttempts).toBe(1); // Reset to 1
    expect(result.lockedUntil).toBeNull();
  });

  it('should NOT reset counter when inside attempt window', () => {
    const state = createLockoutState({
      failedLoginAttempts: 3,
      lastFailedAttemptAt: new Date(
        FIXED_NOW.getTime() - 10 * MS_PER_MINUTE // Within 15min window
      )
    });
    const result = recordFailedAttempt(state, {}, FIXED_NOW);

    expect(result.newFailedAttempts).toBe(4); // Incremented, not reset
  });

  it('should use progressive lockout duration for repeated lockouts', () => {
    // First lockout (5 attempts = 1st lockout)
    const state1 = createLockoutState({
      failedLoginAttempts: 4,
      lastFailedAttemptAt: new Date(FIXED_NOW.getTime() - 1 * MS_PER_MINUTE)
    });
    const result1 = recordFailedAttempt(state1, {}, FIXED_NOW);
    expect(result1.lockDurationMs).toBe(15 * MS_PER_MINUTE);

    // Second lockout (10 attempts = 2nd lockout)
    const state2 = createLockoutState({
      failedLoginAttempts: 9,
      lastFailedAttemptAt: new Date(FIXED_NOW.getTime() - 1 * MS_PER_MINUTE)
    });
    const result2 = recordFailedAttempt(state2, {}, FIXED_NOW);
    expect(result2.lockDurationMs).toBe(30 * MS_PER_MINUTE);

    // Third lockout (15 attempts = 3rd lockout)
    const state3 = createLockoutState({
      failedLoginAttempts: 14,
      lastFailedAttemptAt: new Date(FIXED_NOW.getTime() - 1 * MS_PER_MINUTE)
    });
    const result3 = recordFailedAttempt(state3, {}, FIXED_NOW);
    expect(result3.lockDurationMs).toBe(60 * MS_PER_MINUTE);
  });

  it('should use custom threshold from config', () => {
    const customConfig: Partial<LockoutConfig> = {
      threshold: 3
    };
    const state = createLockoutState({
      failedLoginAttempts: 2,
      lastFailedAttemptAt: new Date(FIXED_NOW.getTime() - 1 * MS_PER_MINUTE)
    });
    const result = recordFailedAttempt(state, customConfig, FIXED_NOW);

    expect(result.shouldLock).toBe(true);
    expect(result.newFailedAttempts).toBe(3);
  });

  it('should use custom attempt window from config', () => {
    const customConfig: Partial<LockoutConfig> = {
      attemptWindowMs: 5 * MS_PER_MINUTE // 5 minute window
    };
    const state = createLockoutState({
      failedLoginAttempts: 3,
      lastFailedAttemptAt: new Date(
        FIXED_NOW.getTime() - 6 * MS_PER_MINUTE // Beyond 5min window
      )
    });
    const result = recordFailedAttempt(state, customConfig, FIXED_NOW);

    expect(result.newFailedAttempts).toBe(1); // Counter reset
  });

  it('should handle no lastFailedAttemptAt (first ever attempt)', () => {
    const state = createLockoutState({
      failedLoginAttempts: 0
    });
    const result = recordFailedAttempt(state, {}, FIXED_NOW);

    expect(result.newFailedAttempts).toBe(1);
    expect(result.shouldLock).toBe(false);
  });

  it('should handle attempt exactly at window boundary', () => {
    const state = createLockoutState({
      failedLoginAttempts: 3,
      lastFailedAttemptAt: new Date(
        FIXED_NOW.getTime() - 15 * MS_PER_MINUTE // Exactly at 15min window
      )
    });
    const result = recordFailedAttempt(state, {}, FIXED_NOW);

    expect(result.newFailedAttempts).toBe(4); // NOT reset (within window)
  });

  it('should handle attempt just beyond window boundary', () => {
    const state = createLockoutState({
      failedLoginAttempts: 3,
      lastFailedAttemptAt: new Date(
        FIXED_NOW.getTime() - 15 * MS_PER_MINUTE - 1 // 1ms beyond window
      )
    });
    const result = recordFailedAttempt(state, {}, FIXED_NOW);

    expect(result.newFailedAttempts).toBe(1); // Reset
  });
});

// =============================================================================
// getResetLockoutState TESTS
// =============================================================================

describe('getResetLockoutState', () => {
  it('should return correct reset values', () => {
    const result = getResetLockoutState();

    expect(result.failedLoginAttempts).toBe(0);
    expect(result.lockedUntil).toBeNull();
    expect(result.lastFailedAttemptAt).toBeNull();
  });

  it('should return a new object each time (not mutating)', () => {
    const result1 = getResetLockoutState();
    const result2 = getResetLockoutState();

    expect(result1).not.toBe(result2); // Different object references
    expect(result1).toEqual(result2); // Same values
  });
});

// =============================================================================
// getRemainingAttempts TESTS
// =============================================================================

describe('getRemainingAttempts', () => {
  const THRESHOLD = DEFAULT_LOCKOUT_CONFIG.threshold; // 5

  it('should return full threshold when no failed attempts', () => {
    expect(getRemainingAttempts(0, THRESHOLD)).toBe(5);
  });

  it('should return correct remaining count', () => {
    expect(getRemainingAttempts(1, THRESHOLD)).toBe(4);
    expect(getRemainingAttempts(2, THRESHOLD)).toBe(3);
    expect(getRemainingAttempts(3, THRESHOLD)).toBe(2);
    expect(getRemainingAttempts(4, THRESHOLD)).toBe(1);
  });

  it('should return 0 when at threshold', () => {
    expect(getRemainingAttempts(5, THRESHOLD)).toBe(0);
  });

  it('should return 0 when over threshold', () => {
    expect(getRemainingAttempts(6, THRESHOLD)).toBe(0);
    expect(getRemainingAttempts(10, THRESHOLD)).toBe(0);
  });

  it('should use default threshold when not provided', () => {
    expect(getRemainingAttempts(3)).toBe(2); // 5 - 3 = 2
  });

  it('should handle custom threshold', () => {
    expect(getRemainingAttempts(1, 3)).toBe(2);
    expect(getRemainingAttempts(2, 3)).toBe(1);
    expect(getRemainingAttempts(3, 3)).toBe(0);
  });

  it('should never return negative values', () => {
    expect(getRemainingAttempts(100, THRESHOLD)).toBe(0);
    expect(getRemainingAttempts(999, THRESHOLD)).toBe(0);
  });
});

// =============================================================================
// formatLockoutDuration TESTS
// =============================================================================

describe('formatLockoutDuration', () => {
  describe('minutes formatting (always rounds up from seconds)', () => {
    it('should format 1 second as 1 minute (rounds up)', () => {
      expect(formatLockoutDuration(1000)).toBe('1 minute');
    });

    it('should format 30 seconds as 1 minute (rounds up)', () => {
      expect(formatLockoutDuration(30 * 1000)).toBe('1 minute');
    });

    it('should format 45 seconds as 1 minute (rounds up)', () => {
      expect(formatLockoutDuration(45 * 1000)).toBe('1 minute');
    });

    it('should round up fractional seconds to minutes', () => {
      expect(formatLockoutDuration(1500)).toBe('1 minute');
      expect(formatLockoutDuration(2999)).toBe('1 minute');
      expect(formatLockoutDuration(61 * 1000)).toBe('2 minutes');
    });
  });

  describe('minutes formatting', () => {
    it('should format 1 minute (singular)', () => {
      expect(formatLockoutDuration(1 * MS_PER_MINUTE)).toBe('1 minute');
    });

    it('should format 15 minutes (plural)', () => {
      expect(formatLockoutDuration(15 * MS_PER_MINUTE)).toBe('15 minutes');
    });

    it('should format 30 minutes', () => {
      expect(formatLockoutDuration(30 * MS_PER_MINUTE)).toBe('30 minutes');
    });
  });

  describe('hours formatting', () => {
    it('should format 1 hour (singular)', () => {
      expect(formatLockoutDuration(1 * MS_PER_HOUR)).toBe('1 hour');
    });

    it('should format 2 hours (plural)', () => {
      expect(formatLockoutDuration(2 * MS_PER_HOUR)).toBe('2 hours');
    });

    it('should format 24 hours', () => {
      expect(formatLockoutDuration(24 * MS_PER_HOUR)).toBe('24 hours');
    });
  });

  describe('compound formatting (hours + minutes)', () => {
    it('should format 1 hour 1 minute (both singular)', () => {
      const duration = 1 * MS_PER_HOUR + 1 * MS_PER_MINUTE;
      expect(formatLockoutDuration(duration)).toBe('1 hour 1 minute');
    });

    it('should format 2 hours 30 minutes (both plural)', () => {
      const duration = 2 * MS_PER_HOUR + 30 * MS_PER_MINUTE;
      expect(formatLockoutDuration(duration)).toBe('2 hours 30 minutes');
    });

    it('should format 1 hour 15 minutes (mixed singular/plural)', () => {
      const duration = 1 * MS_PER_HOUR + 15 * MS_PER_MINUTE;
      expect(formatLockoutDuration(duration)).toBe('1 hour 15 minutes');
    });

    it('should format 3 hours 1 minute (mixed plural/singular)', () => {
      const duration = 3 * MS_PER_HOUR + 1 * MS_PER_MINUTE;
      expect(formatLockoutDuration(duration)).toBe('3 hours 1 minute');
    });

    it('should round up minutes in compound format', () => {
      const duration = 1 * MS_PER_HOUR + 61 * 1000; // 1h 61s
      expect(formatLockoutDuration(duration)).toBe('1 hour 2 minutes');
    });
  });

  describe('edge cases', () => {
    it('should handle milliseconds (rounds up to 1 minute)', () => {
      expect(formatLockoutDuration(100)).toBe('1 minute');
    });

    it('should handle exactly 1 minute worth of seconds', () => {
      expect(formatLockoutDuration(60 * 1000)).toBe('1 minute');
    });

    it('should handle exactly 1 hour worth of minutes', () => {
      expect(formatLockoutDuration(60 * MS_PER_MINUTE)).toBe('1 hour');
    });

    it('should not show 0 minutes in compound format', () => {
      // Exactly 2 hours, no extra minutes
      expect(formatLockoutDuration(2 * MS_PER_HOUR)).toBe('2 hours');
    });
  });

  describe('real-world lockout durations', () => {
    it('should format default base duration (15 minutes)', () => {
      const duration = calculateLockoutDuration(1);
      expect(formatLockoutDuration(duration)).toBe('15 minutes');
    });

    it('should format second lockout (30 minutes)', () => {
      const duration = calculateLockoutDuration(2);
      expect(formatLockoutDuration(duration)).toBe('30 minutes');
    });

    it('should format third lockout (1 hour)', () => {
      const duration = calculateLockoutDuration(3);
      expect(formatLockoutDuration(duration)).toBe('1 hour');
    });

    it('should format fourth lockout (2 hours)', () => {
      const duration = calculateLockoutDuration(4);
      expect(formatLockoutDuration(duration)).toBe('2 hours');
    });

    it('should format max lockout (24 hours)', () => {
      const duration = calculateLockoutDuration(10);
      expect(formatLockoutDuration(duration)).toBe('24 hours');
    });
  });
});

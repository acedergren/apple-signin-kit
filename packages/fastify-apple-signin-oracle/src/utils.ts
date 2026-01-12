/**
 * Utility functions for Oracle adapter
 *
 * @module utils
 */

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Set version 4 (random)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  // Set variant (10xx)
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Convert Oracle NUMBER (1/0) to TypeScript boolean
 */
export function fromOracleBoolean(value: number | null | undefined): boolean {
  return value === 1;
}

/**
 * Convert Oracle DATE/TIMESTAMP to JavaScript Date
 */
export function fromOracleDate(value: Date | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

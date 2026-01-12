/**
 * Validation Schemas for Authentication Routes
 *
 * Zod schemas for validating auth-related request bodies and parameters.
 * Includes protection against:
 * - DoS via oversized inputs
 * - CSRF via state token validation
 * - Type coercion attacks
 *
 * @module schemas
 */

import { z } from 'zod';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create a strict object schema that rejects extra properties.
 * Prevents mass assignment vulnerabilities.
 *
 * @param shape - Zod object shape
 * @returns Strict Zod object schema
 */
export function strictObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict();
}

// =============================================================================
// AUTH SCHEMAS
// =============================================================================

/**
 * Apple OAuth callback body schema.
 * Validates authorization code and state token from Apple's response.
 *
 * Security:
 * - Code max length prevents DoS via oversized payloads
 * - State format validation ensures CSRF protection
 * - Character whitelist prevents injection attacks
 *
 * @example
 * ```typescript
 * const result = appleCallbackSchema.safeParse(request.body);
 * if (!result.success) {
 *   return reply.badRequest(result.error.message);
 * }
 * const { code, state } = result.data;
 * ```
 */
export const appleCallbackSchema = strictObject({
  code: z.string()
    .min(1, 'Authorization code is required')
    .max(2048, 'Authorization code too long')
    .regex(/^[A-Za-z0-9._-]+$/, 'Authorization code contains invalid characters'),

  state: z.string()
    .length(32, 'State token must be exactly 32 characters')
    .regex(/^[a-f0-9]{32}$/, 'State token must be a lowercase hex string')
});

/**
 * Login request schema for email/password authentication.
 * Ready for future non-Apple auth methods.
 */
export const loginRequestSchema = strictObject({
  email: z.string()
    .email('Invalid email address')
    .max(255, 'Email too long'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
});

/**
 * Refresh token request schema.
 * Token comes from httpOnly cookie, no body params needed.
 */
export const refreshTokenSchema = strictObject({}).optional();

/**
 * Session ID parameter schema for session management.
 * Validates UUID format for session identifiers.
 */
export const sessionIdParamSchema = strictObject({
  id: z.string()
    .uuid('Session ID must be a valid UUID')
});

/**
 * Session list query parameters.
 * Pagination for user's active sessions.
 */
export const sessionListQuerySchema = z.object({
  limit: z.preprocess(
    val => typeof val === 'string' ? parseInt(val, 10) : val,
    z.number()
      .int('Limit must be an integer')
      .min(1, 'Limit must be at least 1')
      .max(50, 'Limit cannot exceed 50')
      .default(10)
  )
}).strict();

// =============================================================================
// COMMON VALIDATION HELPERS
// =============================================================================

/**
 * Email validation with optional disposable domain blocking.
 *
 * @param blockDisposable - Whether to block disposable email domains
 * @returns Zod string schema
 */
export function createEmailSchema(blockDisposable = false) {
  const baseSchema = z.string()
    .email('Invalid email address')
    .max(255, 'Email too long')
    .toLowerCase();

  if (!blockDisposable) {
    return baseSchema;
  }

  const disposableDomains = [
    'tempmail.com',
    'guerrillamail.com',
    '10minutemail.com',
    'mailinator.com',
    'trashmail.com',
    'throwaway.email'
  ];

  return baseSchema.refine(email => {
    const domain = email.split('@')[1]?.toLowerCase();
    return !disposableDomains.includes(domain ?? '');
  }, {
    message: 'Disposable email addresses are not allowed'
  });
}

/**
 * UUID validation schema.
 */
export const uuidSchema = z.string()
  .uuid('Must be a valid UUID');

/**
 * Hex string validation (for tokens, nonces, etc.)
 *
 * @param length - Optional exact length requirement
 * @returns Zod string schema
 */
export function createHexStringSchema(length?: number) {
  let schema = z.string()
    .regex(/^[0-9a-f]+$/i, 'Must be a valid hexadecimal string');

  if (length !== undefined) {
    schema = schema.length(length, `Must be exactly ${length} characters`);
  }

  return schema;
}

/**
 * Pagination query parameters schema.
 */
export const paginationQuerySchema = z.object({
  limit: z.preprocess(
    val => typeof val === 'string' ? parseInt(val, 10) : val,
    z.number()
      .int('Limit must be an integer')
      .min(1, 'Limit must be at least 1')
      .max(100, 'Limit cannot exceed 100')
      .default(50)
  ),
  offset: z.preprocess(
    val => typeof val === 'string' ? parseInt(val, 10) : val,
    z.number()
      .int('Offset must be an integer')
      .min(0, 'Offset cannot be negative')
      .default(0)
  )
}).strict();

// =============================================================================
// TYPE EXPORTS
// =============================================================================

/**
 * Inferred types from schemas for type-safe usage.
 */
export type AppleCallbackInput = z.infer<typeof appleCallbackSchema>;
export type LoginRequestInput = z.infer<typeof loginRequestSchema>;
export type SessionIdParam = z.infer<typeof sessionIdParamSchema>;
export type SessionListQuery = z.infer<typeof sessionListQuerySchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

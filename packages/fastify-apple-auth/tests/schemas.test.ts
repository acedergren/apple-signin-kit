/**
 * Tests for Validation Schemas
 *
 * Comprehensive test suite for Zod schemas used in authentication routes.
 * Tests cover:
 * - Valid inputs
 * - Invalid inputs with expected error messages
 * - Edge cases (boundaries, special characters)
 * - Security validations (DoS prevention, injection protection)
 *
 * @module schemas.test
 */

import { describe, it, expect } from 'vitest';
import {
  appleCallbackSchema,
  loginRequestSchema,
  sessionIdParamSchema,
  sessionListQuerySchema,
  strictObject,
  createEmailSchema,
  createHexStringSchema,
  paginationQuerySchema,
  uuidSchema,
} from '../src/schemas.js';
import { z } from 'zod';

// =============================================================================
// APPLE CALLBACK SCHEMA TESTS
// =============================================================================

describe('appleCallbackSchema', () => {
  describe('valid inputs', () => {
    it('accepts valid authorization code and state', () => {
      const result = appleCallbackSchema.safeParse({
        code: 'c1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6',
        state: '0123456789abcdef0123456789abcdef',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.code).toBe('c1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6');
        expect(result.data.state).toBe('0123456789abcdef0123456789abcdef');
      }
    });

    it('accepts code with allowed special characters (. - _)', () => {
      const result = appleCallbackSchema.safeParse({
        code: 'valid-code.with_special-chars.123',
        state: 'abcdef0123456789abcdef0123456789',
      });

      expect(result.success).toBe(true);
    });

    it('accepts long authorization codes up to 2048 characters', () => {
      const longCode = 'a'.repeat(2048);
      const result = appleCallbackSchema.safeParse({
        code: longCode,
        state: '0123456789abcdef0123456789abcdef',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('invalid code', () => {
    it('rejects empty authorization code', () => {
      const result = appleCallbackSchema.safeParse({
        code: '',
        state: '0123456789abcdef0123456789abcdef',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Authorization code is required');
      }
    });

    it('rejects code exceeding 2048 characters', () => {
      const tooLongCode = 'a'.repeat(2049);
      const result = appleCallbackSchema.safeParse({
        code: tooLongCode,
        state: '0123456789abcdef0123456789abcdef',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Authorization code too long');
      }
    });

    it('rejects code with invalid characters (spaces, +, /, =)', () => {
      const invalidCodes = [
        'code with spaces',
        'code+with+plus',
        'code/with/slash',
        'code=with=equals',
        'code@with@at',
        'code#with#hash',
      ];

      invalidCodes.forEach((code) => {
        const result = appleCallbackSchema.safeParse({
          code,
          state: '0123456789abcdef0123456789abcdef',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.errors[0].message).toContain('Authorization code contains invalid characters');
        }
      });
    });

    it('rejects missing code field', () => {
      const result = appleCallbackSchema.safeParse({
        state: '0123456789abcdef0123456789abcdef',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('code');
      }
    });
  });

  describe('invalid state', () => {
    it('rejects state shorter than 32 characters', () => {
      const result = appleCallbackSchema.safeParse({
        code: 'valid-code',
        state: '0123456789abcdef',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('State token must be exactly 32 characters');
      }
    });

    it('rejects state longer than 32 characters', () => {
      const result = appleCallbackSchema.safeParse({
        code: 'valid-code',
        state: '0123456789abcdef0123456789abcdef0',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('State token must be exactly 32 characters');
      }
    });

    it('rejects state with uppercase hex characters', () => {
      const result = appleCallbackSchema.safeParse({
        code: 'valid-code',
        state: '0123456789ABCDEF0123456789ABCDEF',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('State token must be a lowercase hex string');
      }
    });

    it('rejects state with non-hex characters', () => {
      const result = appleCallbackSchema.safeParse({
        code: 'valid-code',
        state: 'ghijklmnopqrstuv0123456789abcdef',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('State token must be a lowercase hex string');
      }
    });

    it('rejects missing state field', () => {
      const result = appleCallbackSchema.safeParse({
        code: 'valid-code',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('state');
      }
    });
  });

  describe('strict mode', () => {
    it('rejects extra properties', () => {
      const result = appleCallbackSchema.safeParse({
        code: 'valid-code',
        state: '0123456789abcdef0123456789abcdef',
        extraField: 'malicious-data',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].code).toBe('unrecognized_keys');
      }
    });
  });
});

// =============================================================================
// LOGIN REQUEST SCHEMA TESTS
// =============================================================================

describe('loginRequestSchema', () => {
  describe('valid inputs', () => {
    it('accepts valid email and password', () => {
      const result = loginRequestSchema.safeParse({
        email: 'user@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('user@example.com');
        expect(result.data.password).toBe('password123');
      }
    });

    it('accepts password at minimum length (8 characters)', () => {
      const result = loginRequestSchema.safeParse({
        email: 'user@example.com',
        password: '12345678',
      });

      expect(result.success).toBe(true);
    });

    it('accepts password at maximum length (128 characters)', () => {
      const result = loginRequestSchema.safeParse({
        email: 'user@example.com',
        password: 'a'.repeat(128),
      });

      expect(result.success).toBe(true);
    });

    it('accepts email with subdomains and special characters', () => {
      const result = loginRequestSchema.safeParse({
        email: 'user+tag@mail.example.co.uk',
        password: 'password123',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('invalid email', () => {
    it('rejects invalid email format', () => {
      const invalidEmails = [
        'not-an-email',
        '@example.com',
        'user@',
        'user @example.com',
        'user@example',
      ];

      invalidEmails.forEach((email) => {
        const result = loginRequestSchema.safeParse({
          email,
          password: 'password123',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.errors[0].message).toContain('Invalid email address');
        }
      });
    });

    it('rejects email exceeding 255 characters', () => {
      const longEmail = 'a'.repeat(244) + '@example.com'; // 256 chars total
      const result = loginRequestSchema.safeParse({
        email: longEmail,
        password: 'password123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Email too long');
      }
    });

    it('rejects missing email field', () => {
      const result = loginRequestSchema.safeParse({
        password: 'password123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('email');
      }
    });
  });

  describe('invalid password', () => {
    it('rejects password shorter than 8 characters', () => {
      const result = loginRequestSchema.safeParse({
        email: 'user@example.com',
        password: '1234567',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Password must be at least 8 characters');
      }
    });

    it('rejects password exceeding 128 characters', () => {
      const result = loginRequestSchema.safeParse({
        email: 'user@example.com',
        password: 'a'.repeat(129),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Password too long');
      }
    });

    it('rejects missing password field', () => {
      const result = loginRequestSchema.safeParse({
        email: 'user@example.com',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('password');
      }
    });
  });

  describe('strict mode', () => {
    it('rejects extra properties', () => {
      const result = loginRequestSchema.safeParse({
        email: 'user@example.com',
        password: 'password123',
        extraField: 'malicious-data',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].code).toBe('unrecognized_keys');
      }
    });
  });
});

// =============================================================================
// SESSION ID PARAM SCHEMA TESTS
// =============================================================================

describe('sessionIdParamSchema', () => {
  describe('valid inputs', () => {
    it('accepts valid UUID v4', () => {
      const result = sessionIdParamSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      }
    });

    it('accepts UUID with uppercase letters', () => {
      const result = sessionIdParamSchema.safeParse({
        id: '550E8400-E29B-41D4-A716-446655440000',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('invalid UUID', () => {
    it('rejects invalid UUID format', () => {
      const invalidUUIDs = [
        'not-a-uuid',
        '550e8400-e29b-41d4-a716',
        '550e8400e29b41d4a716446655440000',
        '550e8400-e29b-41d4-a716-44665544000g',
        '',
      ];

      invalidUUIDs.forEach((id) => {
        const result = sessionIdParamSchema.safeParse({ id });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.errors[0].message).toContain('Session ID must be a valid UUID');
        }
      });
    });

    it('rejects missing id field', () => {
      const result = sessionIdParamSchema.safeParse({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('id');
      }
    });
  });

  describe('strict mode', () => {
    it('rejects extra properties', () => {
      const result = sessionIdParamSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        extraField: 'malicious-data',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].code).toBe('unrecognized_keys');
      }
    });
  });
});

// =============================================================================
// SESSION LIST QUERY SCHEMA TESTS
// =============================================================================

describe('sessionListQuerySchema', () => {
  describe('valid inputs', () => {
    it('accepts valid limit as number', () => {
      const result = sessionListQuerySchema.safeParse({
        limit: 25,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(25);
      }
    });

    it('accepts valid limit as string (preprocessing)', () => {
      const result = sessionListQuerySchema.safeParse({
        limit: '25',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(25);
      }
    });

    it('applies default value (10) when limit is missing', () => {
      const result = sessionListQuerySchema.safeParse({});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
      }
    });

    it('accepts limit at minimum boundary (1)', () => {
      const result = sessionListQuerySchema.safeParse({
        limit: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(1);
      }
    });

    it('accepts limit at maximum boundary (50)', () => {
      const result = sessionListQuerySchema.safeParse({
        limit: 50,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });
  });

  describe('invalid inputs', () => {
    it('rejects limit less than 1', () => {
      const result = sessionListQuerySchema.safeParse({
        limit: 0,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Limit must be at least 1');
      }
    });

    it('rejects limit greater than 50', () => {
      const result = sessionListQuerySchema.safeParse({
        limit: 51,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Limit cannot exceed 50');
      }
    });

    it('rejects non-integer limit', () => {
      const result = sessionListQuerySchema.safeParse({
        limit: 10.5,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Limit must be an integer');
      }
    });

    it('rejects non-numeric string limit', () => {
      const result = sessionListQuerySchema.safeParse({
        limit: 'not-a-number',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Expected number');
      }
    });
  });

  describe('strict mode', () => {
    it('rejects extra properties', () => {
      const result = sessionListQuerySchema.safeParse({
        limit: 10,
        extraField: 'malicious-data',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].code).toBe('unrecognized_keys');
      }
    });
  });
});

// =============================================================================
// HELPER FUNCTION TESTS
// =============================================================================

describe('strictObject', () => {
  it('creates schema that accepts valid properties', () => {
    const schema = strictObject({
      name: z.string(),
      age: z.number(),
    });

    const result = schema.safeParse({
      name: 'John',
      age: 30,
    });

    expect(result.success).toBe(true);
  });

  it('creates schema that rejects extra properties', () => {
    const schema = strictObject({
      name: z.string(),
    });

    const result = schema.safeParse({
      name: 'John',
      extraField: 'not-allowed',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].code).toBe('unrecognized_keys');
    }
  });

  it('creates schema that validates nested properties', () => {
    const schema = strictObject({
      user: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
    });

    const result = schema.safeParse({
      user: {
        name: 'John',
        email: 'john@example.com',
      },
    });

    expect(result.success).toBe(true);
  });
});

describe('createEmailSchema', () => {
  describe('without disposable blocking', () => {
    const emailSchema = createEmailSchema(false);

    it('accepts valid email addresses', () => {
      const validEmails = [
        'user@example.com',
        'user+tag@example.com',
        'user.name@sub.example.co.uk',
      ];

      validEmails.forEach((email) => {
        const result = emailSchema.safeParse(email);
        expect(result.success).toBe(true);
      });
    });

    it('accepts disposable email domains', () => {
      const disposableEmails = [
        'user@tempmail.com',
        'user@guerrillamail.com',
        'user@10minutemail.com',
      ];

      disposableEmails.forEach((email) => {
        const result = emailSchema.safeParse(email);
        expect(result.success).toBe(true);
      });
    });

    it('rejects invalid email format', () => {
      const result = emailSchema.safeParse('not-an-email');
      expect(result.success).toBe(false);
    });

    it('rejects email exceeding 255 characters', () => {
      const longEmail = 'a'.repeat(244) + '@example.com';
      const result = emailSchema.safeParse(longEmail);
      expect(result.success).toBe(false);
    });

    it('converts email to lowercase', () => {
      const result = emailSchema.safeParse('User@Example.COM');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('user@example.com');
      }
    });
  });

  describe('with disposable blocking', () => {
    const emailSchema = createEmailSchema(true);

    it('accepts valid non-disposable email addresses', () => {
      const validEmails = [
        'user@gmail.com',
        'user@outlook.com',
        'user@company.com',
      ];

      validEmails.forEach((email) => {
        const result = emailSchema.safeParse(email);
        expect(result.success).toBe(true);
      });
    });

    it('rejects disposable email domains', () => {
      const disposableEmails = [
        'user@tempmail.com',
        'user@guerrillamail.com',
        'user@10minutemail.com',
        'user@mailinator.com',
        'user@trashmail.com',
        'user@throwaway.email',
      ];

      disposableEmails.forEach((email) => {
        const result = emailSchema.safeParse(email);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.errors[0].message).toContain('Disposable email addresses are not allowed');
        }
      });
    });

    it('handles case-insensitive domain matching', () => {
      const result = emailSchema.safeParse('user@TempMail.COM');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Disposable email addresses are not allowed');
      }
    });

    it('handles email without domain gracefully', () => {
      const result = emailSchema.safeParse('invalid-email');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Invalid email address');
      }
    });
  });
});

describe('createHexStringSchema', () => {
  describe('without length requirement', () => {
    const hexSchema = createHexStringSchema();

    it('accepts valid hex strings of any length', () => {
      const validHex = [
        'abc123',
        'DEADBEEF',
        '0123456789abcdef',
        'a',
      ];

      validHex.forEach((hex) => {
        const result = hexSchema.safeParse(hex);
        expect(result.success).toBe(true);
      });
    });

    it('accepts both uppercase and lowercase hex', () => {
      const result1 = hexSchema.safeParse('abcdef');
      const result2 = hexSchema.safeParse('ABCDEF');
      const result3 = hexSchema.safeParse('AbCdEf');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);
    });

    it('rejects non-hex characters', () => {
      const invalidHex = [
        'ghijkl',
        'abc xyz',
        'abc-def',
        'abc_def',
      ];

      invalidHex.forEach((hex) => {
        const result = hexSchema.safeParse(hex);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.errors[0].message).toContain('Must be a valid hexadecimal string');
        }
      });
    });

    it('rejects empty string', () => {
      const result = hexSchema.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('with length requirement', () => {
    const hexSchema32 = createHexStringSchema(32);

    it('accepts hex string of exact length', () => {
      const result = hexSchema32.safeParse('0123456789abcdef0123456789abcdef');
      expect(result.success).toBe(true);
    });

    it('rejects hex string shorter than required length', () => {
      const result = hexSchema32.safeParse('0123456789abcdef');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Must be exactly 32 characters');
      }
    });

    it('rejects hex string longer than required length', () => {
      const result = hexSchema32.safeParse('0123456789abcdef0123456789abcdef0');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Must be exactly 32 characters');
      }
    });

    it('rejects non-hex characters even with correct length', () => {
      const result = hexSchema32.safeParse('g'.repeat(32));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Must be a valid hexadecimal string');
      }
    });
  });
});

describe('paginationQuerySchema', () => {
  describe('valid inputs', () => {
    it('accepts valid limit and offset as numbers', () => {
      const result = paginationQuerySchema.safeParse({
        limit: 25,
        offset: 10,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(25);
        expect(result.data.offset).toBe(10);
      }
    });

    it('accepts valid limit and offset as strings (preprocessing)', () => {
      const result = paginationQuerySchema.safeParse({
        limit: '25',
        offset: '10',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(25);
        expect(result.data.offset).toBe(10);
      }
    });

    it('applies default values when fields are missing', () => {
      const result = paginationQuerySchema.safeParse({});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
        expect(result.data.offset).toBe(0);
      }
    });

    it('accepts limit at boundaries (1-100)', () => {
      const result1 = paginationQuerySchema.safeParse({ limit: 1 });
      const result2 = paginationQuerySchema.safeParse({ limit: 100 });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it('accepts offset at minimum boundary (0)', () => {
      const result = paginationQuerySchema.safeParse({ offset: 0 });
      expect(result.success).toBe(true);
    });

    it('accepts large offset values', () => {
      const result = paginationQuerySchema.safeParse({ offset: 1000 });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid limit', () => {
    it('rejects limit less than 1', () => {
      const result = paginationQuerySchema.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Limit must be at least 1');
      }
    });

    it('rejects limit greater than 100', () => {
      const result = paginationQuerySchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Limit cannot exceed 100');
      }
    });

    it('rejects non-integer limit', () => {
      const result = paginationQuerySchema.safeParse({ limit: 10.5 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Limit must be an integer');
      }
    });
  });

  describe('invalid offset', () => {
    it('rejects negative offset', () => {
      const result = paginationQuerySchema.safeParse({ offset: -1 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Offset cannot be negative');
      }
    });

    it('rejects non-integer offset', () => {
      const result = paginationQuerySchema.safeParse({ offset: 10.5 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Offset must be an integer');
      }
    });
  });

  describe('strict mode', () => {
    it('rejects extra properties', () => {
      const result = paginationQuerySchema.safeParse({
        limit: 10,
        offset: 0,
        extraField: 'malicious-data',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].code).toBe('unrecognized_keys');
      }
    });
  });
});

describe('uuidSchema', () => {
  it('accepts valid UUID v4', () => {
    const result = uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000');
    expect(result.success).toBe(true);
  });

  it('accepts UUID with uppercase letters', () => {
    const result = uuidSchema.safeParse('550E8400-E29B-41D4-A716-446655440000');
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID format', () => {
    const invalidUUIDs = [
      'not-a-uuid',
      '550e8400-e29b-41d4-a716',
      '550e8400e29b41d4a716446655440000',
      '',
    ];

    invalidUUIDs.forEach((uuid) => {
      const result = uuidSchema.safeParse(uuid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Must be a valid UUID');
      }
    });
  });
});

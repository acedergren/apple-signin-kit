-- Migration: 0000_init_postgres
-- Description: Initial schema for Apple Sign-In authentication (PostgreSQL)
-- Created: 2025-01-10
--
-- This migration creates the auth_users and auth_refresh_tokens tables
-- required by @acedergren/fastify-apple-auth.
--
-- Usage:
--   psql -d your_database -f 0000_init_postgres.sql
--
-- Or with Drizzle Kit:
--   npx drizzle-kit push
--

-- Enable UUID extension if not already enabled (optional, for uuid_generate_v4)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- USERS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS auth_users (
    -- Primary key (UUID recommended, use crypto.randomUUID() in app code)
    id TEXT PRIMARY KEY,

    -- User's email address (may be Apple private relay)
    email TEXT NOT NULL,

    -- Apple's unique user identifier (sub claim from ID token)
    -- NULL if user was created via different auth method
    apple_user_id TEXT,

    -- User role for authorization ('user' or 'admin')
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),

    -- Account creation timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Last successful login timestamp
    last_login_at TIMESTAMPTZ,

    -- ==========================================================================
    -- Account lockout fields (NIST 800-63B compliant)
    -- ==========================================================================

    -- Number of consecutive failed login attempts
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,

    -- Account locked until this timestamp
    locked_until TIMESTAMPTZ,

    -- Timestamp of last failed login attempt
    last_failed_attempt_at TIMESTAMPTZ
);

-- Unique index on Apple user ID for fast OAuth lookups
CREATE UNIQUE INDEX IF NOT EXISTS auth_users_apple_user_id_idx
    ON auth_users (apple_user_id)
    WHERE apple_user_id IS NOT NULL;

-- Index on email for email-based lookups
CREATE INDEX IF NOT EXISTS auth_users_email_idx ON auth_users (email);

-- =============================================================================
-- REFRESH TOKENS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
    -- Primary key (UUID)
    id TEXT PRIMARY KEY,

    -- Foreign key to users table
    user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,

    -- SHA-256 hash of the refresh token (never store plaintext!)
    -- 64 characters for hex-encoded SHA-256
    token_hash TEXT NOT NULL,

    -- User-Agent string for device tracking and security
    user_agent TEXT,

    -- Token expiration timestamp
    expires_at TIMESTAMPTZ NOT NULL,

    -- Token creation timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Last time this token was used for refresh
    last_used_at TIMESTAMPTZ,

    -- Soft revocation flag (alternative to deletion)
    revoked BOOLEAN NOT NULL DEFAULT FALSE
);

-- Unique index on token hash for O(1) lookups
CREATE UNIQUE INDEX IF NOT EXISTS auth_refresh_tokens_hash_idx
    ON auth_refresh_tokens (token_hash);

-- Index for finding user's active sessions
CREATE INDEX IF NOT EXISTS auth_refresh_tokens_user_id_idx
    ON auth_refresh_tokens (user_id);

-- Composite index for cleanup queries (expired or revoked tokens)
CREATE INDEX IF NOT EXISTS auth_refresh_tokens_expires_revoked_idx
    ON auth_refresh_tokens (expires_at, revoked);

-- =============================================================================
-- COMMENTS (for documentation)
-- =============================================================================

COMMENT ON TABLE auth_users IS 'User accounts for Apple Sign-In authentication';
COMMENT ON COLUMN auth_users.apple_user_id IS 'Apple unique identifier (sub claim from ID token)';
COMMENT ON COLUMN auth_users.failed_login_attempts IS 'NIST 800-63B compliant lockout counter';
COMMENT ON COLUMN auth_users.locked_until IS 'NIST 800-63B compliant lockout timestamp';

COMMENT ON TABLE auth_refresh_tokens IS 'Refresh tokens for session management';
COMMENT ON COLUMN auth_refresh_tokens.token_hash IS 'SHA-256 hash - never store plaintext tokens';
COMMENT ON COLUMN auth_refresh_tokens.revoked IS 'Soft revocation for audit trail';

-- Migration: 0000_init_sqlite
-- Description: Initial schema for Apple Sign-In authentication (SQLite)
-- Created: 2025-01-10
--
-- This migration creates the auth_users and auth_refresh_tokens tables
-- required by @acedergren/fastify-apple-auth.
--
-- Usage:
--   sqlite3 auth.db < 0000_init_sqlite.sql
--
-- Or with Drizzle Kit:
--   npx drizzle-kit push
--
-- Note: SQLite stores timestamps as INTEGER (Unix epoch milliseconds)
-- for efficient storage and querying. Drizzle handles Date conversion.

-- =============================================================================
-- USERS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS auth_users (
    -- Primary key (UUID as text)
    id TEXT PRIMARY KEY NOT NULL,

    -- User's email address (may be Apple private relay)
    email TEXT NOT NULL,

    -- Apple's unique user identifier (sub claim from ID token)
    -- NULL if user was created via different auth method
    apple_user_id TEXT,

    -- User role for authorization ('user' or 'admin')
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),

    -- Account creation timestamp (Unix epoch milliseconds)
    created_at INTEGER NOT NULL,

    -- Last successful login timestamp (Unix epoch milliseconds)
    last_login_at INTEGER,

    -- ==========================================================================
    -- Account lockout fields (NIST 800-63B compliant)
    -- ==========================================================================

    -- Number of consecutive failed login attempts
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,

    -- Account locked until this timestamp (Unix epoch milliseconds)
    locked_until INTEGER,

    -- Timestamp of last failed login attempt (Unix epoch milliseconds)
    last_failed_attempt_at INTEGER
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
    -- Primary key (UUID as text)
    id TEXT PRIMARY KEY NOT NULL,

    -- Foreign key to users table
    user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,

    -- SHA-256 hash of the refresh token (never store plaintext!)
    -- 64 characters for hex-encoded SHA-256
    token_hash TEXT NOT NULL,

    -- User-Agent string for device tracking and security
    user_agent TEXT,

    -- Token expiration timestamp (Unix epoch milliseconds)
    expires_at INTEGER NOT NULL,

    -- Token creation timestamp (Unix epoch milliseconds)
    created_at INTEGER NOT NULL,

    -- Last time this token was used for refresh (Unix epoch milliseconds)
    last_used_at INTEGER,

    -- Soft revocation flag (0 = active, 1 = revoked)
    revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1))
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
-- ENABLE FOREIGN KEYS (SQLite requires this)
-- =============================================================================

PRAGMA foreign_keys = ON;

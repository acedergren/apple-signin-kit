-- Migration: 0000_init_mysql
-- Description: Initial schema for Apple Sign-In authentication (MySQL)
-- Created: 2025-01-10
--
-- This migration creates the auth_users and auth_refresh_tokens tables
-- required by @acedergren/fastify-apple-auth.
--
-- Usage:
--   mysql -u user -p database < 0000_init_mysql.sql
--
-- Or with Drizzle Kit:
--   npx drizzle-kit push
--

-- =============================================================================
-- USERS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS auth_users (
    -- Primary key (UUID, 36 characters)
    id VARCHAR(36) PRIMARY KEY,

    -- User's email address (may be Apple private relay)
    email VARCHAR(255) NOT NULL,

    -- Apple's unique user identifier (sub claim from ID token)
    -- NULL if user was created via different auth method
    apple_user_id VARCHAR(255),

    -- User role for authorization ('user' or 'admin')
    role VARCHAR(10) NOT NULL DEFAULT 'user',

    -- Account creation timestamp
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Last successful login timestamp
    last_login_at TIMESTAMP NULL,

    -- ==========================================================================
    -- Account lockout fields (NIST 800-63B compliant)
    -- ==========================================================================

    -- Number of consecutive failed login attempts
    failed_login_attempts INT NOT NULL DEFAULT 0,

    -- Account locked until this timestamp
    locked_until TIMESTAMP NULL,

    -- Timestamp of last failed login attempt
    last_failed_attempt_at TIMESTAMP NULL,

    -- Constraint for role values
    CONSTRAINT chk_role CHECK (role IN ('user', 'admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Unique index on Apple user ID for fast OAuth lookups
CREATE UNIQUE INDEX auth_users_apple_user_id_idx ON auth_users (apple_user_id);

-- Index on email for email-based lookups
CREATE INDEX auth_users_email_idx ON auth_users (email);

-- =============================================================================
-- REFRESH TOKENS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
    -- Primary key (UUID, 36 characters)
    id VARCHAR(36) PRIMARY KEY,

    -- Foreign key to users table
    user_id VARCHAR(36) NOT NULL,

    -- SHA-256 hash of the refresh token (never store plaintext!)
    -- 64 characters for hex-encoded SHA-256
    token_hash VARCHAR(64) NOT NULL,

    -- User-Agent string for device tracking and security
    user_agent VARCHAR(512),

    -- Token expiration timestamp
    expires_at TIMESTAMP NOT NULL,

    -- Token creation timestamp
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Last time this token was used for refresh
    last_used_at TIMESTAMP NULL,

    -- Soft revocation flag (alternative to deletion)
    revoked BOOLEAN NOT NULL DEFAULT FALSE,

    -- Foreign key constraint
    CONSTRAINT fk_refresh_tokens_user
        FOREIGN KEY (user_id)
        REFERENCES auth_users(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Unique index on token hash for O(1) lookups
CREATE UNIQUE INDEX auth_refresh_tokens_hash_idx ON auth_refresh_tokens (token_hash);

-- Index for finding user's active sessions
CREATE INDEX auth_refresh_tokens_user_id_idx ON auth_refresh_tokens (user_id);

-- Composite index for cleanup queries (expired or revoked tokens)
CREATE INDEX auth_refresh_tokens_expires_revoked_idx ON auth_refresh_tokens (expires_at, revoked);

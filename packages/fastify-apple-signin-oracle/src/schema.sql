-- ============================================================================
-- Oracle DDL for fastify-apple-signin-oracle adapter
--
-- This script creates the AUTH_USERS and AUTH_REFRESH_TOKENS tables
-- required by the @acedergren/fastify-apple-signin-oracle adapter.
--
-- Run this script against your Oracle database before using the adapter.
-- Compatible with Oracle 19c, 21c, 23ai, and 26ai.
-- ============================================================================

-- ============================================================================
-- AUTH_USERS table
-- Stores user accounts for Apple Sign-In authentication
-- ============================================================================
CREATE TABLE AUTH_USERS (
    ID              VARCHAR2(36)    NOT NULL,       -- UUID primary key
    EMAIL           VARCHAR2(255)   NOT NULL,       -- User email (may be Apple private relay)
    APPLE_USER_ID   VARCHAR2(255)   NOT NULL,       -- Apple's unique user identifier (sub claim)
    ROLE            VARCHAR2(20)    DEFAULT 'user' NOT NULL,  -- 'user' or 'admin'
    CREATED_AT      TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    LAST_LOGIN_AT   TIMESTAMP,                      -- Last successful login timestamp

    -- Account lockout fields (NIST 800-63B compliant)
    FAILED_LOGIN_ATTEMPTS     NUMBER(3)   DEFAULT 0 NOT NULL,  -- Current failed attempt count
    LOCKED_UNTIL              TIMESTAMP,                        -- Account locked until this time
    LAST_FAILED_ATTEMPT_AT    TIMESTAMP,                        -- When last failed attempt occurred

    CONSTRAINT AUTH_USERS_PK PRIMARY KEY (ID),
    CONSTRAINT AUTH_USERS_ROLE_CHK CHECK (ROLE IN ('user', 'admin'))
);

-- Unique constraint on Apple User ID (prevents duplicate Apple accounts)
CREATE UNIQUE INDEX AUTH_USERS_APPLE_USER_ID_UQ ON AUTH_USERS(APPLE_USER_ID);

-- Unique constraint on email (one account per email)
CREATE UNIQUE INDEX AUTH_USERS_EMAIL_UQ ON AUTH_USERS(LOWER(EMAIL));

-- Index for lockout queries (finding locked accounts)
CREATE INDEX AUTH_USERS_LOCKED_UNTIL_IDX ON AUTH_USERS(LOCKED_UNTIL)
    WHERE LOCKED_UNTIL IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE AUTH_USERS IS 'User accounts for Apple Sign-In authentication';
COMMENT ON COLUMN AUTH_USERS.ID IS 'UUID primary key';
COMMENT ON COLUMN AUTH_USERS.EMAIL IS 'User email address (may be Apple private relay)';
COMMENT ON COLUMN AUTH_USERS.APPLE_USER_ID IS 'Apple unique user identifier from ID token sub claim';
COMMENT ON COLUMN AUTH_USERS.ROLE IS 'User role: user (default) or admin';
COMMENT ON COLUMN AUTH_USERS.CREATED_AT IS 'Account creation timestamp';
COMMENT ON COLUMN AUTH_USERS.LAST_LOGIN_AT IS 'Last successful login timestamp';
COMMENT ON COLUMN AUTH_USERS.FAILED_LOGIN_ATTEMPTS IS 'Current count of consecutive failed login attempts';
COMMENT ON COLUMN AUTH_USERS.LOCKED_UNTIL IS 'Account is locked until this timestamp (null = not locked)';
COMMENT ON COLUMN AUTH_USERS.LAST_FAILED_ATTEMPT_AT IS 'Timestamp of last failed login attempt';


-- ============================================================================
-- AUTH_REFRESH_TOKENS table
-- Stores refresh tokens for session management
-- ============================================================================
CREATE TABLE AUTH_REFRESH_TOKENS (
    ID              VARCHAR2(36)    NOT NULL,       -- UUID primary key
    USER_ID         VARCHAR2(36)    NOT NULL,       -- Foreign key to AUTH_USERS
    TOKEN_HASH      VARCHAR2(64)    NOT NULL,       -- SHA-256 hash of token (never store plaintext!)
    USER_AGENT      VARCHAR2(512),                  -- Device/browser identifier
    EXPIRES_AT      TIMESTAMP       NOT NULL,       -- Token expiration
    CREATED_AT      TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    LAST_USED_AT    TIMESTAMP,                      -- Last token refresh
    REVOKED         NUMBER(1)       DEFAULT 0 NOT NULL,  -- 0=active, 1=revoked

    CONSTRAINT AUTH_REFRESH_TOKENS_PK PRIMARY KEY (ID),
    CONSTRAINT AUTH_REFRESH_TOKENS_USER_FK FOREIGN KEY (USER_ID)
        REFERENCES AUTH_USERS(ID) ON DELETE CASCADE,
    CONSTRAINT AUTH_REFRESH_TOKENS_REVOKED_CHK CHECK (REVOKED IN (0, 1))
);

-- Fast lookup by token hash (primary query path)
CREATE UNIQUE INDEX AUTH_REFRESH_TOKENS_HASH_UQ ON AUTH_REFRESH_TOKENS(TOKEN_HASH);

-- Index for finding active tokens by user (session management)
CREATE INDEX AUTH_REFRESH_TOKENS_USER_ACTIVE_IDX ON AUTH_REFRESH_TOKENS(USER_ID, REVOKED, EXPIRES_AT)
    WHERE REVOKED = 0;

-- Index for cleanup job (expired tokens)
CREATE INDEX AUTH_REFRESH_TOKENS_EXPIRES_IDX ON AUTH_REFRESH_TOKENS(EXPIRES_AT)
    WHERE REVOKED = 0;

-- Index for user's token count (session limits)
CREATE INDEX AUTH_REFRESH_TOKENS_USER_COUNT_IDX ON AUTH_REFRESH_TOKENS(USER_ID)
    WHERE REVOKED = 0;

-- Comments for documentation
COMMENT ON TABLE AUTH_REFRESH_TOKENS IS 'Refresh tokens for JWT session management';
COMMENT ON COLUMN AUTH_REFRESH_TOKENS.ID IS 'UUID primary key';
COMMENT ON COLUMN AUTH_REFRESH_TOKENS.USER_ID IS 'Foreign key to AUTH_USERS table';
COMMENT ON COLUMN AUTH_REFRESH_TOKENS.TOKEN_HASH IS 'SHA-256 hash of the refresh token (never store plaintext)';
COMMENT ON COLUMN AUTH_REFRESH_TOKENS.USER_AGENT IS 'Browser/device User-Agent for session tracking';
COMMENT ON COLUMN AUTH_REFRESH_TOKENS.EXPIRES_AT IS 'Token expiration timestamp';
COMMENT ON COLUMN AUTH_REFRESH_TOKENS.CREATED_AT IS 'Token creation timestamp';
COMMENT ON COLUMN AUTH_REFRESH_TOKENS.LAST_USED_AT IS 'Last time token was used for refresh';
COMMENT ON COLUMN AUTH_REFRESH_TOKENS.REVOKED IS 'Token revocation flag: 0=active, 1=revoked';


-- ============================================================================
-- Optional: Scheduled job to clean up expired tokens
--
-- Uncomment and customize for your environment.
-- Runs daily at 3 AM to delete expired/revoked tokens older than 30 days.
-- ============================================================================

/*
BEGIN
    DBMS_SCHEDULER.CREATE_JOB (
        job_name        => 'CLEANUP_EXPIRED_TOKENS',
        job_type        => 'PLSQL_BLOCK',
        job_action      => 'BEGIN
            DELETE FROM AUTH_REFRESH_TOKENS
            WHERE (REVOKED = 1 OR EXPIRES_AT < SYSTIMESTAMP)
            AND CREATED_AT < SYSTIMESTAMP - INTERVAL ''30'' DAY;
            COMMIT;
        END;',
        start_date      => SYSTIMESTAMP,
        repeat_interval => 'FREQ=DAILY; BYHOUR=3; BYMINUTE=0',
        enabled         => TRUE,
        comments        => 'Cleanup expired and revoked refresh tokens'
    );
END;
/
*/


-- ============================================================================
-- Verification queries
-- Run these to verify the schema was created correctly
-- ============================================================================

/*
-- Check tables exist
SELECT table_name FROM user_tables WHERE table_name LIKE 'AUTH_%';

-- Check indexes
SELECT index_name, table_name, uniqueness
FROM user_indexes
WHERE table_name LIKE 'AUTH_%'
ORDER BY table_name, index_name;

-- Check constraints
SELECT constraint_name, constraint_type, table_name
FROM user_constraints
WHERE table_name LIKE 'AUTH_%'
ORDER BY table_name, constraint_type;
*/

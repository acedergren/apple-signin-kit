// AuthEndpoints.swift
// API endpoint definitions for authentication

import Foundation

// MARK: - AuthEndpoints

/// Defines the authentication API endpoints.
///
/// These endpoints follow the Running Days API convention but can be
/// customized for other backends by using the `CustomEndpoints` configuration.
public enum AuthEndpoints {

    // MARK: - Standard Endpoints

    /// Apple Sign-In authentication endpoint (for iOS native apps)
    public static let appleNative = "auth/apple/native"

    /// Apple Sign-In authentication endpoint (for web apps with PKCE)
    public static let appleWeb = "auth/apple"

    /// Token refresh endpoint
    public static let refresh = "auth/refresh"

    /// Logout endpoint
    public static let logout = "auth/logout"

    /// Get current user endpoint
    public static let me = "auth/me"

    /// Check authentication status
    public static let status = "auth/status"

    // MARK: - Custom Endpoints

    /// Custom endpoint configuration for non-standard backends.
    ///
    /// Use this to configure AppleSignInKit for backends that use different
    /// endpoint paths than the default Running Days API.
    ///
    /// ## Example
    /// ```swift
    /// let customEndpoints = AuthEndpoints.CustomEndpoints(
    ///     appleNative: "api/v2/auth/apple/signin",
    ///     refresh: "api/v2/auth/token/refresh",
    ///     logout: "api/v2/auth/signout",
    ///     me: "api/v2/users/profile"
    /// )
    /// ```
    public struct CustomEndpoints: Sendable {
        public let appleNative: String
        public let appleWeb: String?
        public let refresh: String
        public let logout: String
        public let me: String

        public init(
            appleNative: String = AuthEndpoints.appleNative,
            appleWeb: String? = nil,
            refresh: String = AuthEndpoints.refresh,
            logout: String = AuthEndpoints.logout,
            me: String = AuthEndpoints.me
        ) {
            self.appleNative = appleNative
            self.appleWeb = appleWeb ?? AuthEndpoints.appleWeb
            self.refresh = refresh
            self.logout = logout
            self.me = me
        }
    }
}

// MARK: - API Response Types

/// Standard API response wrapper
public struct APIResponse<T: Decodable>: Decodable {
    public let success: Bool
    public let data: T?
    public let message: String?
    public let error: String?

    public init(success: Bool, data: T?, message: String? = nil, error: String? = nil) {
        self.success = success
        self.data = data
        self.message = message
        self.error = error
    }
}

/// Paginated API response
public struct PaginatedResponse<T: Decodable>: Decodable {
    public let data: [T]
    public let pagination: PaginationInfo

    public struct PaginationInfo: Decodable {
        public let page: Int
        public let perPage: Int
        public let total: Int
        public let totalPages: Int
    }
}

/// Cursor-based pagination response
public struct CursorPaginatedResponse<T: Decodable>: Decodable {
    public let data: [T]
    public let nextCursor: String?
    public let hasMore: Bool
}

// MARK: - Health Check

/// Health check response
public struct HealthCheckResponse: Decodable {
    public let status: String
    public let version: String?
    public let timestamp: Date?
}

// MARK: - Rate Limit Info

/// Rate limit information from response headers
public struct RateLimitInfo: Sendable {
    /// Maximum requests allowed in the window
    public let limit: Int

    /// Remaining requests in the current window
    public let remaining: Int

    /// When the rate limit window resets (Unix timestamp)
    public let resetAt: Date

    /// Seconds until the rate limit resets
    public var secondsUntilReset: Int {
        max(0, Int(resetAt.timeIntervalSinceNow))
    }

    /// Parse rate limit info from HTTP headers
    public static func from(headers: [AnyHashable: Any]) -> RateLimitInfo? {
        guard let limitString = headers["X-RateLimit-Limit"] as? String,
              let limit = Int(limitString),
              let remainingString = headers["X-RateLimit-Remaining"] as? String,
              let remaining = Int(remainingString),
              let resetString = headers["X-RateLimit-Reset"] as? String,
              let resetTimestamp = Double(resetString) else {
            return nil
        }

        return RateLimitInfo(
            limit: limit,
            remaining: remaining,
            resetAt: Date(timeIntervalSince1970: resetTimestamp)
        )
    }
}

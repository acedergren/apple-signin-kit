// AuthModels.swift
// Data models for authentication

import Foundation

// MARK: - AuthUser

/// Represents an authenticated user
public struct AuthUser: Codable, Identifiable, Sendable, Equatable {
    /// Unique user identifier
    public let id: String

    /// User's email address (may be nil if user chose to hide email)
    public let email: String?

    /// User's display name (only available on first sign-in)
    public let displayName: String?

    /// When the user account was created
    public let createdAt: Date?

    /// When the user profile was last updated
    public let updatedAt: Date?

    public init(
        id: String,
        email: String? = nil,
        displayName: String? = nil,
        createdAt: Date? = nil,
        updatedAt: Date? = nil
    ) {
        self.id = id
        self.email = email
        self.displayName = displayName
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey {
        case id
        case email
        case displayName
        case createdAt
        case updatedAt
    }
}

// MARK: - AuthSession

/// Represents an active authentication session
public struct AuthSession: Codable, Sendable {
    /// JWT access token for API requests
    public let accessToken: String

    /// Refresh token for obtaining new access tokens
    public let refreshToken: String

    /// When the access token expires
    public let expiresAt: Date

    /// The authenticated user
    public let user: AuthUser

    public init(
        accessToken: String,
        refreshToken: String,
        expiresAt: Date,
        user: AuthUser
    ) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
        self.user = user
    }

    /// Whether the access token has expired
    public var isExpired: Bool {
        expiresAt <= Date()
    }

    /// Whether the access token will expire soon (within 60 seconds)
    public var isExpiringSoon: Bool {
        expiresAt <= Date().addingTimeInterval(60)
    }
}

// MARK: - AuthState

/// Represents the current authentication state
public enum AuthState: Sendable, Equatable {
    /// Not authenticated
    case unauthenticated

    /// Currently signing in
    case signingIn

    /// Authenticated with a valid session
    case authenticated(AuthUser)

    /// Session expired, needs refresh
    case sessionExpired

    /// Authentication error occurred
    case error(String)
}

// MARK: - Apple Credential

/// Credential returned from Apple Sign-In
public struct AppleCredential: Sendable {
    /// JWT identity token from Apple
    public let identityToken: String

    /// Authorization code for token exchange
    public let authorizationCode: String

    /// Nonce used for replay attack prevention
    public let nonce: String

    /// Stable user identifier from Apple
    public let userIdentifier: String

    /// User's email (only on first sign-in)
    public let email: String?

    /// User's full name (only on first sign-in)
    public let fullName: PersonNameComponents?

    /// Formatted display name
    public var displayName: String? {
        guard let fullName else { return nil }

        var components: [String] = []
        if let givenName = fullName.givenName { components.append(givenName) }
        if let familyName = fullName.familyName { components.append(familyName) }

        return components.isEmpty ? nil : components.joined(separator: " ")
    }

    public init(
        identityToken: String,
        authorizationCode: String,
        nonce: String,
        userIdentifier: String,
        email: String?,
        fullName: PersonNameComponents?
    ) {
        self.identityToken = identityToken
        self.authorizationCode = authorizationCode
        self.nonce = nonce
        self.userIdentifier = userIdentifier
        self.email = email
        self.fullName = fullName
    }
}

// MARK: - API Request/Response Types

/// Request body for Apple native authentication
struct AppleNativeAuthRequest: Encodable {
    let identityToken: String
    let nonce: String
    let authorizationCode: String?
    let email: String?
    let fullName: String?
}

/// Response from Apple authentication endpoint
struct AppleAuthResponse: Decodable {
    let success: Bool
    let user: AuthUser
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int?
}

/// Request body for token refresh
struct RefreshTokenRequest: Encodable {
    let refreshToken: String
}

/// Response from token refresh endpoint
struct RefreshTokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
}

/// Response from /auth/me endpoint
struct MeResponse: Decodable {
    let user: AuthUser
}

/// Generic API error response
struct APIErrorResponse: Decodable {
    let success: Bool
    let message: String
    let errors: [String: [String]]?
}

// MARK: - Token Payload

/// JWT token payload structure for decoding
public struct TokenPayload: Decodable, Sendable {
    /// Subject (user ID)
    public let sub: String

    /// Expiration time (Unix timestamp)
    public let exp: Int

    /// Issued at (Unix timestamp)
    public let iat: Int

    /// Issuer
    public let iss: String?

    /// Audience
    public let aud: String?

    /// User email (if included)
    public let email: String?

    /// Expiration date
    public var expirationDate: Date {
        Date(timeIntervalSince1970: TimeInterval(exp))
    }

    /// Whether the token is expired
    public var isExpired: Bool {
        expirationDate <= Date()
    }
}

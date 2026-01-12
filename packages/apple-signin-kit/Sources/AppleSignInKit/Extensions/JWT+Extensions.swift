// JWT+Extensions.swift
// JWT token parsing utilities

import Foundation

// MARK: - JWT Decoder

/// Utilities for decoding and validating JWT tokens.
///
/// Note: This does NOT validate JWT signatures. For security-critical
/// validation, the token should be validated on the server.
public enum JWTDecoder {

    // MARK: - Decoding

    /// Decode a JWT token's payload.
    ///
    /// - Parameter token: The JWT token string
    /// - Returns: Decoded payload as a dictionary
    /// - Throws: `JWTError` if decoding fails
    ///
    /// ## Example
    /// ```swift
    /// let payload = try JWTDecoder.decode(token)
    /// print("User ID: \(payload["sub"] ?? "unknown")")
    /// ```
    public static func decode(_ token: String) throws -> [String: Any] {
        let parts = token.split(separator: ".")

        guard parts.count == 3 else {
            throw JWTError.invalidFormat
        }

        let payloadPart = String(parts[1])
        let payloadData = try base64UrlDecode(payloadPart)

        guard let payload = try JSONSerialization.jsonObject(with: payloadData) as? [String: Any] else {
            throw JWTError.invalidPayload
        }

        return payload
    }

    /// Decode a JWT token's payload into a typed structure.
    ///
    /// - Parameters:
    ///   - token: The JWT token string
    ///   - type: The type to decode into
    /// - Returns: Decoded payload
    /// - Throws: `JWTError` if decoding fails
    public static func decode<T: Decodable>(_ token: String, as type: T.Type) throws -> T {
        let parts = token.split(separator: ".")

        guard parts.count == 3 else {
            throw JWTError.invalidFormat
        }

        let payloadPart = String(parts[1])
        let payloadData = try base64UrlDecode(payloadPart)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970

        return try decoder.decode(type, from: payloadData)
    }

    /// Decode the standard JWT payload.
    ///
    /// - Parameter token: The JWT token string
    /// - Returns: Decoded `TokenPayload`
    /// - Throws: `JWTError` if decoding fails
    public static func decodePayload(_ token: String) throws -> TokenPayload {
        try decode(token, as: TokenPayload.self)
    }

    // MARK: - Validation

    /// Check if a token is expired.
    ///
    /// - Parameter token: The JWT token string
    /// - Returns: true if the token is expired
    public static func isExpired(_ token: String) -> Bool {
        guard let payload = try? decodePayload(token) else {
            return true
        }
        return payload.isExpired
    }

    /// Get the expiration date of a token.
    ///
    /// - Parameter token: The JWT token string
    /// - Returns: The expiration date, or nil if invalid
    public static func expirationDate(_ token: String) -> Date? {
        guard let payload = try? decodePayload(token) else {
            return nil
        }
        return payload.expirationDate
    }

    /// Get the subject (user ID) from a token.
    ///
    /// - Parameter token: The JWT token string
    /// - Returns: The subject claim, or nil if invalid
    public static func subject(_ token: String) -> String? {
        guard let payload = try? decodePayload(token) else {
            return nil
        }
        return payload.sub
    }

    /// Get the time remaining until expiration.
    ///
    /// - Parameter token: The JWT token string
    /// - Returns: Time interval until expiration (negative if expired)
    public static func timeUntilExpiration(_ token: String) -> TimeInterval? {
        guard let expiration = expirationDate(token) else {
            return nil
        }
        return expiration.timeIntervalSinceNow
    }

    // MARK: - Header

    /// Decode a JWT token's header.
    ///
    /// - Parameter token: The JWT token string
    /// - Returns: Decoded header as a dictionary
    /// - Throws: `JWTError` if decoding fails
    public static func decodeHeader(_ token: String) throws -> [String: Any] {
        let parts = token.split(separator: ".")

        guard parts.count == 3 else {
            throw JWTError.invalidFormat
        }

        let headerPart = String(parts[0])
        let headerData = try base64UrlDecode(headerPart)

        guard let header = try JSONSerialization.jsonObject(with: headerData) as? [String: Any] else {
            throw JWTError.invalidHeader
        }

        return header
    }

    // MARK: - Private Helpers

    private static func base64UrlDecode(_ string: String) throws -> Data {
        // Convert Base64URL to Base64
        var base64 = string
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")

        // Add padding if needed
        let paddingLength = 4 - (base64.count % 4)
        if paddingLength < 4 {
            base64 += String(repeating: "=", count: paddingLength)
        }

        guard let data = Data(base64Encoded: base64) else {
            throw JWTError.invalidBase64
        }

        return data
    }
}

// MARK: - JWT Errors

/// Errors that can occur during JWT operations
public enum JWTError: LocalizedError, Sendable {
    /// Invalid JWT format (should have 3 parts)
    case invalidFormat

    /// Invalid Base64URL encoding
    case invalidBase64

    /// Invalid header JSON
    case invalidHeader

    /// Invalid payload JSON
    case invalidPayload

    /// Token has expired
    case expired

    public var errorDescription: String? {
        switch self {
        case .invalidFormat:
            return "Invalid JWT format"
        case .invalidBase64:
            return "Invalid Base64URL encoding"
        case .invalidHeader:
            return "Invalid JWT header"
        case .invalidPayload:
            return "Invalid JWT payload"
        case .expired:
            return "Token has expired"
        }
    }
}

// MARK: - String Extensions

public extension String {

    /// Decode this string as a JWT token payload.
    ///
    /// - Returns: Decoded payload dictionary
    /// - Throws: `JWTError` if decoding fails
    func decodeJWT() throws -> [String: Any] {
        try JWTDecoder.decode(self)
    }

    /// Check if this JWT token is expired.
    var isJWTExpired: Bool {
        JWTDecoder.isExpired(self)
    }

    /// Get the expiration date of this JWT token.
    var jwtExpirationDate: Date? {
        JWTDecoder.expirationDate(self)
    }

    /// Get the subject (user ID) from this JWT token.
    var jwtSubject: String? {
        JWTDecoder.subject(self)
    }
}

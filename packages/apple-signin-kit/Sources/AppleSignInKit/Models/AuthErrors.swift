// AuthErrors.swift
// Error types for AppleSignInKit

import Foundation
import AuthenticationServices

// MARK: - AppleSignInError

/// Errors that can occur during Apple Sign-In
public enum AppleSignInError: LocalizedError, Sendable {
    /// User canceled the sign-in flow
    case canceled

    /// Sign-in failed
    case failed

    /// Invalid response from Apple
    case invalidResponse

    /// Sign-in request was not handled
    case notHandled

    /// Sign-in requires user interaction
    case notInteractive

    /// Unknown error
    case unknown

    /// Invalid credential received
    case invalidCredential

    /// Missing identity token from Apple
    case missingIdentityToken

    /// Missing authorization code from Apple
    case missingAuthorizationCode

    /// Missing nonce for security verification
    case missingNonce

    /// Apple credential has been revoked
    case credentialRevoked

    /// Apple credential not found
    case credentialNotFound

    /// Apple credential was transferred to another device
    case credentialTransferred

    public var errorDescription: String? {
        switch self {
        case .canceled:
            return "Sign in was canceled"
        case .failed:
            return "Sign in failed. Please try again."
        case .invalidResponse:
            return "Invalid response from Apple"
        case .notHandled:
            return "Sign in request was not handled"
        case .notInteractive:
            return "Sign in requires user interaction"
        case .unknown:
            return "An unknown error occurred"
        case .invalidCredential:
            return "Invalid credential received"
        case .missingIdentityToken:
            return "Missing identity token from Apple"
        case .missingAuthorizationCode:
            return "Missing authorization code from Apple"
        case .missingNonce:
            return "Missing nonce for security verification"
        case .credentialRevoked:
            return "Your Apple ID credential has been revoked"
        case .credentialNotFound:
            return "Apple ID credential not found. Please sign in again."
        case .credentialTransferred:
            return "Your Apple ID was transferred to another device"
        }
    }

    /// Create from ASAuthorizationError
    static func from(_ error: ASAuthorizationError) -> AppleSignInError {
        switch error.code {
        case .canceled:
            return .canceled
        case .failed:
            return .failed
        case .invalidResponse:
            return .invalidResponse
        case .notHandled:
            return .notHandled
        case .notInteractive:
            return .notInteractive
        case .unknown:
            return .unknown
        @unknown default:
            return .unknown
        }
    }
}

// MARK: - AuthError

/// Errors that can occur during authentication
public enum AuthError: LocalizedError, Sendable {
    /// SDK not configured
    case notConfigured

    /// No refresh token available
    case noRefreshToken

    /// Failed to refresh the session
    case refreshFailed(String)

    /// Apple Sign-In failed
    case appleSignInFailed(AppleSignInError)

    /// Network request failed
    case networkError(NetworkError)

    /// Server returned an error
    case serverError(String)

    /// Invalid response from server
    case invalidResponse

    /// Session has expired
    case sessionExpired

    /// Token decoding failed
    case tokenDecodingFailed

    /// User not authenticated
    case notAuthenticated

    public var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "AppleSignInKit has not been configured. Call AppleSignInKit.configure() first."
        case .noRefreshToken:
            return "No refresh token available. Please sign in again."
        case .refreshFailed(let reason):
            return "Failed to refresh session: \(reason)"
        case .appleSignInFailed(let error):
            return error.errorDescription
        case .networkError(let error):
            return error.errorDescription
        case .serverError(let message):
            return "Server error: \(message)"
        case .invalidResponse:
            return "Invalid response from server"
        case .sessionExpired:
            return "Your session has expired. Please sign in again."
        case .tokenDecodingFailed:
            return "Failed to decode authentication token"
        case .notAuthenticated:
            return "You are not signed in"
        }
    }

    /// Whether this error indicates the user should sign in again
    public var requiresReauthentication: Bool {
        switch self {
        case .noRefreshToken, .refreshFailed, .sessionExpired, .notAuthenticated:
            return true
        case .appleSignInFailed(let error):
            switch error {
            case .credentialRevoked, .credentialNotFound, .credentialTransferred:
                return true
            default:
                return false
            }
        default:
            return false
        }
    }
}

// MARK: - NetworkError

/// Errors that can occur during network requests
public enum NetworkError: LocalizedError, Sendable {
    /// Invalid URL
    case invalidURL

    /// Invalid response from server
    case invalidResponse

    /// HTTP 401 Unauthorized
    case unauthorized

    /// HTTP 403 Forbidden
    case forbidden

    /// HTTP 404 Not Found
    case notFound

    /// HTTP 429 Too Many Requests
    case rateLimited(retryAfter: Int?)

    /// HTTP 422 Validation Error
    case validationError(String)

    /// HTTP 5xx Server Error
    case serverError(Int)

    /// Unknown HTTP error
    case unknown(Int)

    /// No internet connection
    case noConnection

    /// Request timed out
    case timeout

    /// SSL/TLS error (certificate pinning failure, etc.)
    case sslError(String)

    /// Request was canceled
    case canceled

    /// Encoding error
    case encodingError(String)

    /// Decoding error
    case decodingError(String)

    public var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .unauthorized:
            return "Please sign in to continue"
        case .forbidden:
            return "You don't have permission to access this resource"
        case .notFound:
            return "The requested resource was not found"
        case .rateLimited(let retryAfter):
            if let seconds = retryAfter {
                return "Too many requests. Please wait \(seconds) seconds"
            }
            return "Too many requests. Please try again later"
        case .validationError(let message):
            return message
        case .serverError(let code):
            return "Server error (\(code)). Please try again later"
        case .unknown(let code):
            return "An error occurred (\(code))"
        case .noConnection:
            return "No internet connection"
        case .timeout:
            return "Request timed out. Please try again"
        case .sslError(let message):
            return "Security error: \(message)"
        case .canceled:
            return "Request was canceled"
        case .encodingError(let message):
            return "Failed to encode request: \(message)"
        case .decodingError(let message):
            return "Failed to decode response: \(message)"
        }
    }

    /// HTTP status code if applicable
    public var statusCode: Int? {
        switch self {
        case .unauthorized:
            return 401
        case .forbidden:
            return 403
        case .notFound:
            return 404
        case .rateLimited:
            return 429
        case .validationError:
            return 422
        case .serverError(let code):
            return code
        case .unknown(let code):
            return code
        default:
            return nil
        }
    }
}

// MARK: - KeychainError

/// Errors that can occur during keychain operations
public enum KeychainError: LocalizedError, Sendable {
    /// Item not found
    case itemNotFound

    /// Failed to save item
    case saveFailed(OSStatus)

    /// Failed to read item
    case readFailed(OSStatus)

    /// Failed to delete item
    case deleteFailed(OSStatus)

    /// Duplicate item exists
    case duplicateItem

    /// Data encoding/decoding failed
    case dataConversionFailed

    public var errorDescription: String? {
        switch self {
        case .itemNotFound:
            return "Keychain item not found"
        case .saveFailed(let status):
            return "Failed to save to keychain (error: \(status))"
        case .readFailed(let status):
            return "Failed to read from keychain (error: \(status))"
        case .deleteFailed(let status):
            return "Failed to delete from keychain (error: \(status))"
        case .duplicateItem:
            return "Item already exists in keychain"
        case .dataConversionFailed:
            return "Failed to convert keychain data"
        }
    }
}

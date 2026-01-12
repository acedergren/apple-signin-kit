// AppleSignInKit.swift
// A complete Swift SDK for Apple Sign-In authentication
//
// Created for Running Days - https://github.com/acedergren/running-days
// MIT License

import Foundation
import Combine

// MARK: - AppleSignInKit

/// Main entry point for Apple Sign-In authentication.
///
/// AppleSignInKit provides a complete solution for integrating Apple Sign-In into your iOS app,
/// including native sign-in flow, secure token storage, session management, and API communication.
///
/// ## Quick Start
///
/// ```swift
/// // 1. Configure the SDK (typically in AppDelegate or @main)
/// AppleSignInKit.configure(
///     apiBaseURL: URL(string: "https://api.yourapp.com")!,
///     clientId: "com.yourapp.ios"
/// )
///
/// // 2. Use in SwiftUI
/// struct LoginView: View {
///     @StateObject private var auth = AppleSignInKit.shared.authManager
///
///     var body: some View {
///         AppleSignInButton()
///             .onSignIn { user in
///                 print("Welcome \(user.email ?? "User")")
///             }
///     }
/// }
/// ```
@MainActor
public final class AppleSignInKit: ObservableObject {

    // MARK: - Singleton

    /// Shared instance of AppleSignInKit
    public static let shared = AppleSignInKit()

    // MARK: - Published Properties

    /// The authentication manager for session management
    @Published public private(set) var authManager: AuthManager

    /// Current configuration
    public private(set) var configuration: Configuration?

    // MARK: - Configuration

    /// SDK configuration options
    public struct Configuration: Sendable {
        /// Base URL for the authentication API
        public let apiBaseURL: URL

        /// Client identifier (usually the app bundle ID)
        public let clientId: String

        /// Keychain service identifier for secure storage
        public let keychainService: String

        /// Whether to enable certificate pinning (recommended for production)
        public let enableCertificatePinning: Bool

        /// SHA-256 hashes of pinned certificates (required if certificate pinning is enabled)
        public let pinnedCertificateHashes: Set<String>

        /// Request timeout interval in seconds
        public let requestTimeout: TimeInterval

        /// Whether to enable debug logging
        public let debugLogging: Bool

        /// Custom User-Agent header value
        public let userAgent: String?

        /// Creates a new configuration
        /// - Parameters:
        ///   - apiBaseURL: Base URL for the authentication API
        ///   - clientId: Client identifier (usually the app bundle ID)
        ///   - keychainService: Keychain service identifier (defaults to bundle ID)
        ///   - enableCertificatePinning: Whether to enable certificate pinning
        ///   - pinnedCertificateHashes: SHA-256 hashes of pinned certificates
        ///   - requestTimeout: Request timeout in seconds (default: 30)
        ///   - debugLogging: Enable debug logging (default: false in release)
        ///   - userAgent: Custom User-Agent header value
        public init(
            apiBaseURL: URL,
            clientId: String,
            keychainService: String? = nil,
            enableCertificatePinning: Bool = false,
            pinnedCertificateHashes: Set<String> = [],
            requestTimeout: TimeInterval = 30,
            debugLogging: Bool = false,
            userAgent: String? = nil
        ) {
            self.apiBaseURL = apiBaseURL
            self.clientId = clientId
            self.keychainService = keychainService ?? clientId
            self.enableCertificatePinning = enableCertificatePinning
            self.pinnedCertificateHashes = pinnedCertificateHashes
            self.requestTimeout = requestTimeout
            #if DEBUG
            self.debugLogging = debugLogging
            #else
            self.debugLogging = false
            #endif
            self.userAgent = userAgent
        }
    }

    // MARK: - Initialization

    private init() {
        // Create auth manager with default (unconfigured) state
        self.authManager = AuthManager()
    }

    // MARK: - Configuration

    /// Configure the SDK with the required settings.
    ///
    /// Call this method once during app startup, typically in `AppDelegate` or the `@main` struct.
    ///
    /// - Parameter config: The SDK configuration
    ///
    /// ## Example
    /// ```swift
    /// @main
    /// struct MyApp: App {
    ///     init() {
    ///         AppleSignInKit.configure(
    ///             apiBaseURL: URL(string: "https://api.myapp.com")!,
    ///             clientId: "com.myapp.ios"
    ///         )
    ///     }
    /// }
    /// ```
    public static func configure(_ config: Configuration) {
        Task { @MainActor in
            shared.configuration = config

            // Initialize components with configuration
            let keychain = KeychainManager(service: config.keychainService)
            let apiClient = APIClient(configuration: config)
            let appleService = AppleSignInService()

            shared.authManager = AuthManager(
                keychain: keychain,
                apiClient: apiClient,
                appleSignInService: appleService,
                debugLogging: config.debugLogging
            )

            // Restore session if available
            await shared.authManager.restoreSession()
        }
    }

    /// Convenience method to configure with minimal parameters
    /// - Parameters:
    ///   - apiBaseURL: Base URL for the authentication API
    ///   - clientId: Client identifier (usually the app bundle ID)
    public static func configure(apiBaseURL: URL, clientId: String? = nil) {
        let resolvedClientId = clientId ?? Bundle.main.bundleIdentifier ?? "com.apple-signin-kit"
        configure(Configuration(apiBaseURL: apiBaseURL, clientId: resolvedClientId))
    }

    // MARK: - Convenience Access

    /// Whether the user is currently authenticated
    public var isAuthenticated: Bool {
        authManager.isAuthenticated
    }

    /// The currently signed-in user, if any
    public var currentUser: AuthUser? {
        authManager.currentUser
    }

    /// Sign in with Apple
    /// - Returns: The authenticated user
    /// - Throws: `AppleSignInError` or `AuthError` if sign-in fails
    public func signIn() async throws -> AuthUser {
        try await authManager.signInWithApple()
    }

    /// Sign out the current user
    public func signOut() async {
        await authManager.signOut()
    }

    /// Check if the Apple credential is still valid
    /// - Returns: true if the credential is valid
    public func checkCredentialState() async -> Bool {
        await authManager.checkAppleCredentialState()
    }

    /// Get a valid access token for API requests
    /// - Returns: A valid access token, or nil if not authenticated
    public func getAccessToken() async -> String? {
        await authManager.getValidAccessToken()
    }
}

// MARK: - Logging

internal func log(_ message: String, file: String = #file, function: String = #function, line: Int = #line) {
    #if DEBUG
    if Task.isCancelled { return }
    Task { @MainActor in
        guard AppleSignInKit.shared.configuration?.debugLogging == true else { return }
        let filename = (file as NSString).lastPathComponent
        print("[AppleSignInKit] \(filename):\(line) \(function) - \(message)")
    }
    #endif
}

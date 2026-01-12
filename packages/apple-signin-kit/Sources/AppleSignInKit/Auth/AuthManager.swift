// AuthManager.swift
// Session management, token refresh, and authentication state

import Foundation
import Combine
import AuthenticationServices

// MARK: - AuthManager

/// Manages authentication state, session tokens, and sign-in/sign-out operations.
///
/// AuthManager is the primary interface for authentication operations. It handles:
/// - Apple Sign-In flow orchestration
/// - JWT token storage and refresh
/// - Session state management
/// - Credential validation
///
/// ## Usage
/// ```swift
/// // Access via AppleSignInKit
/// let authManager = AppleSignInKit.shared.authManager
///
/// // Check auth state
/// if authManager.isAuthenticated {
///     print("User: \(authManager.currentUser?.email ?? "Unknown")")
/// }
///
/// // Sign in
/// let user = try await authManager.signInWithApple()
///
/// // Sign out
/// await authManager.signOut()
/// ```
@MainActor
public final class AuthManager: ObservableObject {

    // MARK: - Published Properties

    /// Current authentication state
    @Published public private(set) var authState: AuthState = .unauthenticated

    /// Current authenticated user (nil if not authenticated)
    @Published public private(set) var currentUser: AuthUser?

    /// Whether sign-in is in progress
    @Published public private(set) var isSigningIn = false

    /// Last authentication error
    @Published public private(set) var lastError: AuthError?

    // MARK: - Computed Properties

    /// Whether the user is currently authenticated with a valid session
    public var isAuthenticated: Bool {
        if case .authenticated = authState {
            return currentUser != nil && hasValidToken
        }
        return false
    }

    /// Whether we have a valid (non-expired) access token
    private var hasValidToken: Bool {
        guard let expiry = keychain.readDate(key: .tokenExpiry) else { return false }
        return expiry > Date()
    }

    // MARK: - Dependencies

    private let keychain: KeychainManager
    private let apiClient: APIClient
    private let appleSignInService: AppleSignInService
    private let debugLogging: Bool

    // MARK: - Combine

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    /// Initialize with default (unconfigured) dependencies
    public init() {
        self.keychain = KeychainManager(service: "com.apple-signin-kit")
        self.apiClient = APIClient(configuration: nil)
        self.appleSignInService = AppleSignInService()
        self.debugLogging = false
    }

    /// Initialize with configured dependencies
    internal init(
        keychain: KeychainManager,
        apiClient: APIClient,
        appleSignInService: AppleSignInService,
        debugLogging: Bool = false
    ) {
        self.keychain = keychain
        self.apiClient = apiClient
        self.appleSignInService = appleSignInService
        self.debugLogging = debugLogging

        // Observe Apple Sign-In processing state
        appleSignInService.$isProcessing
            .receive(on: DispatchQueue.main)
            .sink { [weak self] processing in
                self?.isSigningIn = processing
            }
            .store(in: &cancellables)
    }

    // MARK: - Sign In

    /// Sign in with Apple.
    ///
    /// Presents the Apple Sign-In sheet, exchanges the credential with the backend,
    /// and stores the session tokens securely.
    ///
    /// - Returns: The authenticated user
    /// - Throws: `AuthError` if sign-in fails
    ///
    /// ## Example
    /// ```swift
    /// do {
    ///     let user = try await authManager.signInWithApple()
    ///     print("Welcome \(user.displayName ?? user.email ?? "User")")
    /// } catch AuthError.appleSignInFailed(.canceled) {
    ///     print("User canceled sign-in")
    /// } catch {
    ///     print("Sign-in failed: \(error.localizedDescription)")
    /// }
    /// ```
    public func signInWithApple() async throws -> AuthUser {
        guard apiClient.isConfigured else {
            throw AuthError.notConfigured
        }

        lastError = nil
        authState = .signingIn

        do {
            // Get Apple credential via sign-in sheet
            log("Starting Apple Sign-In...")
            let appleCredential = try await appleSignInService.signIn()

            // Exchange with backend for JWT tokens
            log("Exchanging credential with backend...")
            let response = try await exchangeAppleCredential(appleCredential)

            // Store tokens and Apple user identifier
            storeAuthTokens(response)
            keychain.save(key: .appleUserIdentifier, value: appleCredential.userIdentifier)

            // Update state
            currentUser = response.user
            authState = .authenticated(response.user)

            log("Sign-in successful: \(response.user.id)")
            return response.user

        } catch let error as AppleSignInError {
            log("Apple Sign-In failed: \(error.localizedDescription)")
            let authError = AuthError.appleSignInFailed(error)
            lastError = authError
            authState = .error(error.localizedDescription)
            throw authError

        } catch let error as NetworkError {
            log("Network error during sign-in: \(error.localizedDescription)")
            let authError = AuthError.networkError(error)
            lastError = authError
            authState = .error(error.localizedDescription)
            throw authError

        } catch {
            log("Unexpected error during sign-in: \(error.localizedDescription)")
            let authError = AuthError.serverError(error.localizedDescription)
            lastError = authError
            authState = .error(error.localizedDescription)
            throw authError
        }
    }

    /// Exchange Apple credential with backend for JWT tokens
    private func exchangeAppleCredential(_ credential: AppleCredential) async throws -> AppleAuthResponse {
        let request = AppleNativeAuthRequest(
            identityToken: credential.identityToken,
            nonce: credential.nonce,
            authorizationCode: credential.authorizationCode,
            email: credential.email,
            fullName: credential.displayName
        )

        // Call backend Apple native auth endpoint (for iOS apps)
        return try await apiClient.post(
            "auth/apple/native",
            body: request,
            requiresAuth: false
        )
    }

    /// Store authentication tokens from response
    private func storeAuthTokens(_ response: AppleAuthResponse) {
        keychain.save(key: .accessToken, value: response.accessToken)
        keychain.save(key: .refreshToken, value: response.refreshToken)

        // Calculate expiry - default to 15 minutes if not provided
        let expirySeconds = response.expiresIn ?? 900
        let expiry = Date().addingTimeInterval(TimeInterval(expirySeconds))
        keychain.save(key: .tokenExpiry, date: expiry)
        keychain.save(key: .userId, value: response.user.id)

        log("Tokens stored, expires at: \(expiry)")
    }

    // MARK: - Credential State

    /// Check if Apple credential is still valid.
    ///
    /// Call this on app launch to verify the user's Apple credential hasn't been revoked.
    ///
    /// - Returns: true if credential is valid, false if user should re-authenticate
    public func checkAppleCredentialState() async -> Bool {
        guard let appleUserId = keychain.read(key: .appleUserIdentifier) else {
            log("No Apple user ID stored - user needs to sign in")
            return false
        }

        let state = await appleSignInService.checkCredentialState(userIdentifier: appleUserId)

        switch state {
        case .authorized:
            log("Apple credential is authorized")
            return true

        case .revoked:
            log("Apple credential was revoked - signing out")
            await signOut()
            return false

        case .notFound:
            log("Apple credential not found - signing out")
            await signOut()
            return false

        case .transferred:
            log("Apple credential was transferred - signing out")
            await signOut()
            return false

        @unknown default:
            log("Unknown credential state - treating as invalid")
            return false
        }
    }

    // MARK: - Sign Out

    /// Sign out and clear the session.
    ///
    /// This will:
    /// 1. Revoke the session on the server (best effort)
    /// 2. Clear all stored tokens from keychain
    /// 3. Reset authentication state
    public func signOut() async {
        log("Signing out...")

        // Try to revoke session on server (ignore errors)
        if hasValidToken {
            do {
                try await apiClient.post("auth/logout", body: EmptyBody(), requiresAuth: true)
                log("Server session revoked")
            } catch {
                log("Failed to revoke server session: \(error.localizedDescription)")
            }
        }

        // Clear local state
        keychain.clearAll()
        currentUser = nil
        authState = .unauthenticated
        lastError = nil

        log("Sign out complete")
    }

    // MARK: - Token Management

    /// Get a valid access token, refreshing if necessary.
    ///
    /// - Returns: A valid access token, or nil if not authenticated
    public func getValidAccessToken() async -> String? {
        guard let token = keychain.read(key: .accessToken) else {
            log("No access token stored")
            return nil
        }

        // Check if token is expired or expiring soon
        if let expiry = keychain.readDate(key: .tokenExpiry), expiry < Date().addingTimeInterval(30) {
            log("Token expired or expiring soon, attempting refresh...")
            do {
                return try await refreshToken()
            } catch {
                log("Token refresh failed: \(error.localizedDescription)")
                return nil
            }
        }

        return token
    }

    /// Refresh the access token using the refresh token
    private func refreshToken() async throws -> String {
        guard let refreshToken = keychain.read(key: .refreshToken) else {
            log("No refresh token available")
            authState = .sessionExpired
            throw AuthError.noRefreshToken
        }

        log("Refreshing token...")

        do {
            let response: RefreshTokenResponse = try await apiClient.post(
                "auth/refresh",
                body: RefreshTokenRequest(refreshToken: refreshToken),
                requiresAuth: false
            )

            // Store new tokens
            keychain.save(key: .accessToken, value: response.accessToken)
            keychain.save(key: .refreshToken, value: response.refreshToken)

            let expiry = Date().addingTimeInterval(TimeInterval(response.expiresIn))
            keychain.save(key: .tokenExpiry, date: expiry)

            log("Token refreshed, new expiry: \(expiry)")

            return response.accessToken

        } catch let error as NetworkError {
            log("Token refresh network error: \(error.localizedDescription)")

            // If refresh fails with 401, clear session
            if case .unauthorized = error {
                await signOut()
            }

            throw AuthError.refreshFailed(error.localizedDescription)

        } catch {
            log("Token refresh failed: \(error.localizedDescription)")
            throw AuthError.refreshFailed(error.localizedDescription)
        }
    }

    // MARK: - Session Restoration

    /// Restore session from stored tokens.
    ///
    /// Called automatically during SDK configuration. Can also be called
    /// manually to re-attempt session restoration.
    public func restoreSession() async {
        log("Attempting session restoration...")

        // Check for valid token
        if !hasValidToken {
            if keychain.read(key: .refreshToken) != nil {
                log("Token expired, attempting refresh...")
                do {
                    _ = try await refreshToken()
                } catch {
                    log("Token refresh failed during restoration")
                    keychain.clearAll()
                    authState = .unauthenticated
                    return
                }
            } else {
                log("No tokens stored")
                authState = .unauthenticated
                return
            }
        }

        // Verify Apple credential is still valid
        let credentialValid = await checkAppleCredentialState()
        guard credentialValid else {
            log("Apple credential invalid during restoration")
            return
        }

        // Fetch current user
        do {
            currentUser = try await fetchCurrentUser()
            authState = .authenticated(currentUser!)
            log("Session restored for user: \(currentUser?.id ?? "unknown")")
        } catch {
            log("Failed to fetch user during restoration: \(error.localizedDescription)")
            keychain.clearAll()
            authState = .unauthenticated
        }
    }

    /// Fetch the current user from the API
    private func fetchCurrentUser() async throws -> AuthUser {
        let response: MeResponse = try await apiClient.get("auth/me", requiresAuth: true)
        return response.user
    }
}

// MARK: - Helper Types

private struct EmptyBody: Encodable {}

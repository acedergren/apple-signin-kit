// AppleSignInService.swift
// Native Apple Sign-In flow wrapper using AuthenticationServices

import AuthenticationServices
import CryptoKit
import Foundation

#if canImport(UIKit)
import UIKit
#endif

// MARK: - AppleSignInService

/// Handles the native Apple Sign-In flow using AuthenticationServices framework.
///
/// This service manages the ASAuthorizationController presentation and delegation,
/// providing a clean async/await interface for sign-in operations.
@MainActor
public final class AppleSignInService: NSObject, Sendable {

    // MARK: - State

    /// Whether sign-in is currently in progress
    @Published public private(set) var isProcessing = false

    /// Last error that occurred during sign-in
    @Published public private(set) var lastError: Error?

    // MARK: - Private Properties

    private var continuation: CheckedContinuation<AppleCredential, Error>?
    private var currentNonce: String?

    // MARK: - Initialization

    public override init() {
        super.init()
    }

    // MARK: - Sign In

    /// Initiate Apple Sign-In flow.
    ///
    /// Presents the Apple Sign-In sheet and waits for user authentication.
    ///
    /// - Returns: The Apple Sign-In credential containing identity token and user info
    /// - Throws: `AppleSignInError` if sign-in fails
    ///
    /// ## Example
    /// ```swift
    /// do {
    ///     let credential = try await appleSignInService.signIn()
    ///     print("User ID: \(credential.userIdentifier)")
    /// } catch AppleSignInError.canceled {
    ///     print("User canceled sign-in")
    /// } catch {
    ///     print("Sign-in failed: \(error)")
    /// }
    /// ```
    public func signIn() async throws -> AppleCredential {
        isProcessing = true
        lastError = nil

        defer { isProcessing = false }

        log("Starting Apple Sign-In flow")

        // Generate nonce for replay attack prevention
        let (rawNonce, hashedNonce) = Self.generateNonce()
        self.currentNonce = rawNonce

        // Create request
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.email, .fullName]
        request.nonce = hashedNonce

        // Create controller
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self

        // Perform request and await result via continuation
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            controller.performRequests()
        }
    }

    // MARK: - Credential State

    /// Check if a previously signed-in user's credential is still valid.
    ///
    /// Call this method on app launch to verify the Apple credential hasn't been revoked.
    ///
    /// - Parameter userIdentifier: The Apple user identifier from previous sign-in
    /// - Returns: The credential state (authorized, revoked, notFound, or transferred)
    ///
    /// ## Example
    /// ```swift
    /// let state = await appleSignInService.checkCredentialState(userIdentifier: savedUserId)
    /// switch state {
    /// case .authorized:
    ///     print("Credential is still valid")
    /// case .revoked:
    ///     print("User revoked access - sign out required")
    /// case .notFound:
    ///     print("Credential not found - sign in again")
    /// case .transferred:
    ///     print("Account transferred to another device")
    /// }
    /// ```
    public func checkCredentialState(userIdentifier: String) async -> ASAuthorizationAppleIDProvider.CredentialState {
        log("Checking credential state for user: \(userIdentifier.prefix(8))...")

        return await withCheckedContinuation { continuation in
            let provider = ASAuthorizationAppleIDProvider()
            provider.getCredentialState(forUserID: userIdentifier) { state, error in
                if let error = error {
                    log("Credential state check failed: \(error.localizedDescription)")
                    continuation.resume(returning: .notFound)
                    return
                }

                log("Credential state: \(state.description)")
                continuation.resume(returning: state)
            }
        }
    }

    /// Convert credential state to AppleSignInError if invalid
    public func validateCredentialState(_ state: ASAuthorizationAppleIDProvider.CredentialState) throws {
        switch state {
        case .authorized:
            return
        case .revoked:
            throw AppleSignInError.credentialRevoked
        case .notFound:
            throw AppleSignInError.credentialNotFound
        case .transferred:
            throw AppleSignInError.credentialTransferred
        @unknown default:
            throw AppleSignInError.unknown
        }
    }
}

// MARK: - Nonce Generation

private extension AppleSignInService {
    /// Generate a cryptographically secure random nonce for replay attack prevention.
    ///
    /// - Returns: Tuple of (rawNonce, sha256HashedNonce)
    ///   - rawNonce: The original value to send to the backend
    ///   - hashedNonce: SHA256 hash to set on ASAuthorizationAppleIDRequest.nonce
    static func generateNonce() -> (raw: String, hashed: String) {
        // Generate 32 random bytes (256 bits of entropy)
        var randomBytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)

        guard status == errSecSuccess else {
            // Fallback to UUID if SecRandomCopyBytes fails (extremely rare)
            log("SecRandomCopyBytes failed, using UUID fallback")
            let fallback = UUID().uuidString.replacingOccurrences(of: "-", with: "")
            return (fallback, sha256Hash(fallback))
        }

        // Convert to hex string (64 characters, within 16-64 char API requirement)
        let rawNonce = randomBytes.map { String(format: "%02x", $0) }.joined()
        let hashedNonce = sha256Hash(rawNonce)

        return (rawNonce, hashedNonce)
    }

    /// SHA256 hash a string and return hex-encoded result
    static func sha256Hash(_ input: String) -> String {
        let inputData = Data(input.utf8)
        let hashedData = SHA256.hash(data: inputData)
        return hashedData.compactMap { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - ASAuthorizationControllerDelegate

extension AppleSignInService: ASAuthorizationControllerDelegate {
    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        log("Authorization completed successfully")

        guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            log("Invalid credential type received")
            continuation?.resume(throwing: AppleSignInError.invalidCredential)
            continuation = nil
            currentNonce = nil
            return
        }

        // Extract identity token (JWT)
        guard let identityTokenData = appleIDCredential.identityToken,
              let identityToken = String(data: identityTokenData, encoding: .utf8)
        else {
            log("Missing identity token")
            continuation?.resume(throwing: AppleSignInError.missingIdentityToken)
            continuation = nil
            currentNonce = nil
            return
        }

        // Extract authorization code
        guard let authorizationCodeData = appleIDCredential.authorizationCode,
              let authorizationCode = String(data: authorizationCodeData, encoding: .utf8)
        else {
            log("Missing authorization code")
            continuation?.resume(throwing: AppleSignInError.missingAuthorizationCode)
            continuation = nil
            currentNonce = nil
            return
        }

        // Verify nonce was set (security check)
        guard let nonce = currentNonce else {
            log("Missing nonce - security violation")
            continuation?.resume(throwing: AppleSignInError.missingNonce)
            continuation = nil
            return
        }

        // Build credential
        let credential = AppleCredential(
            identityToken: identityToken,
            authorizationCode: authorizationCode,
            nonce: nonce,
            userIdentifier: appleIDCredential.user,
            email: appleIDCredential.email,
            fullName: appleIDCredential.fullName
        )

        log("Credential created successfully (user: \(appleIDCredential.user.prefix(8))...)")

        continuation?.resume(returning: credential)
        continuation = nil
        currentNonce = nil
    }

    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        lastError = error
        currentNonce = nil

        // Map ASAuthorizationError to our error type
        if let authError = error as? ASAuthorizationError {
            log("Authorization failed with ASAuthorizationError: \(authError.code)")
            continuation?.resume(throwing: AppleSignInError.from(authError))
        } else {
            log("Authorization failed with error: \(error.localizedDescription)")
            continuation?.resume(throwing: error)
        }

        continuation = nil
    }
}

// MARK: - ASAuthorizationControllerPresentationContextProviding

extension AppleSignInService: ASAuthorizationControllerPresentationContextProviding {
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        #if canImport(UIKit)
        // Get the key window for presenting the sign-in sheet
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first
        else {
            // Fallback: find any available window
            if let window = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .flatMap({ $0.windows })
                .first(where: { $0.isKeyWindow })
            {
                return window
            }

            // Last resort: create a new window (shouldn't happen in practice)
            log("Warning: No window available, creating new window for Apple Sign-In")
            let window = UIWindow()
            return window
        }
        return window
        #else
        // macOS implementation
        guard let window = NSApplication.shared.keyWindow else {
            fatalError("No window available for Apple Sign-In presentation")
        }
        return window
        #endif
    }
}

// MARK: - CredentialState Description

extension ASAuthorizationAppleIDProvider.CredentialState: CustomStringConvertible {
    public var description: String {
        switch self {
        case .authorized:
            return "authorized"
        case .revoked:
            return "revoked"
        case .notFound:
            return "notFound"
        case .transferred:
            return "transferred"
        @unknown default:
            return "unknown"
        }
    }
}

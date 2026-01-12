# AppleSignInKit

A complete Swift iOS SDK for Apple Sign-In authentication. Zero-config where possible, production-ready out of the box.

## Features

- Native Apple Sign-In with `ASAuthorizationAppleIDProvider`
- Secure token storage using iOS Keychain
- Automatic session management and token refresh
- SwiftUI button component with built-in loading states
- Optional certificate pinning for enhanced security
- Combine publishers for reactive authentication
- JWT token utilities
- Full async/await support (iOS 15+)

## Requirements

- iOS 15.0+ / macOS 12.0+
- Swift 5.9+
- Xcode 15+

## Installation

### Swift Package Manager

Add to your `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/acedergren/running-days", from: "1.0.0")
]
```

Or add via Xcode:
1. File > Add Package Dependencies
2. Enter: `https://github.com/acedergren/running-days`
3. Select the `AppleSignInKit` product

## Quick Start

### 1. Configure the SDK

Configure AppleSignInKit once during app startup:

```swift
import AppleSignInKit

@main
struct MyApp: App {
    init() {
        // Minimal configuration
        AppleSignInKit.configure(
            apiBaseURL: URL(string: "https://api.yourapp.com")!
        )
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

### 2. Add the Sign-In Button

```swift
import SwiftUI
import AppleSignInKit

struct LoginView: View {
    var body: some View {
        VStack(spacing: 20) {
            Text("Welcome")
                .font(.largeTitle)

            AppleSignInButton()
                .frame(height: 50)
                .padding(.horizontal)
                .onSignIn { user in
                    print("Welcome \(user.email ?? "User")")
                    // Navigate to main app
                }
                .onError { error in
                    print("Sign-in failed: \(error.localizedDescription)")
                }
                .onCancel {
                    print("User canceled sign-in")
                }
        }
    }
}
```

### 3. Check Authentication State

```swift
struct ContentView: View {
    @StateObject private var auth = AppleSignInKit.shared.authManager

    var body: some View {
        Group {
            if auth.isAuthenticated {
                MainAppView()
            } else {
                LoginView()
            }
        }
        .task {
            // Validate Apple credential on app launch
            await AppleSignInKit.shared.checkCredentialState()
        }
    }
}
```

## Advanced Configuration

### Full Configuration Options

```swift
AppleSignInKit.configure(
    AppleSignInKit.Configuration(
        apiBaseURL: URL(string: "https://api.yourapp.com")!,
        clientId: "com.yourapp.ios",
        keychainService: "com.yourapp.auth", // Custom keychain service
        enableCertificatePinning: true,      // Recommended for production
        pinnedCertificateHashes: [
            "BASE64_HASH_OF_CERT_1",
            "BASE64_HASH_OF_CERT_2"           // Backup cert for rotation
        ],
        requestTimeout: 30,
        debugLogging: false,                  // Auto-disabled in release
        userAgent: "MyApp/1.0"
    )
)
```

### Certificate Pinning

Generate certificate hashes:

```bash
# Get your server certificate
openssl s_client -servername api.yourapp.com -connect api.yourapp.com:443 </dev/null 2>/dev/null | openssl x509 -outform DER > cert.der

# Generate SHA-256 hash
openssl dgst -sha256 -binary cert.der | openssl base64
```

## API Reference

### AppleSignInKit

The main entry point for the SDK.

```swift
// Singleton access
let kit = AppleSignInKit.shared

// Check if authenticated
if kit.isAuthenticated {
    print("User: \(kit.currentUser?.email ?? "Unknown")")
}

// Sign in
let user = try await kit.signIn()

// Sign out
await kit.signOut()

// Validate Apple credential
let isValid = await kit.checkCredentialState()

// Get access token for API requests
if let token = await kit.getAccessToken() {
    // Use token for authenticated requests
}
```

### AuthManager

Manages authentication state and session tokens.

```swift
@StateObject private var auth = AppleSignInKit.shared.authManager

// Observable properties
auth.isAuthenticated     // Bool
auth.currentUser         // AuthUser?
auth.isSigningIn         // Bool
auth.authState           // AuthState enum
auth.lastError           // AuthError?

// Sign in with Apple
let user = try await auth.signInWithApple()

// Sign out
await auth.signOut()

// Restore session on app launch
await auth.restoreSession()

// Get valid access token (auto-refreshes if expired)
if let token = await auth.getValidAccessToken() {
    // Use token
}

// Check Apple credential state
let isValid = await auth.checkAppleCredentialState()
```

### AppleSignInButton

SwiftUI component for the sign-in button.

```swift
// Default style
AppleSignInButton()

// Customized
AppleSignInButton(
    type: .signUp,           // .signIn, .signUp, .continue
    style: .white,           // .black, .white, .whiteOutline
    cornerRadius: 12
)
.onSignIn { user in }
.onError { error in }
.onCancel { }
```

### CustomAppleSignInButton

Fully customizable button when you need complete control:

```swift
CustomAppleSignInButton(
    title: "Continue with Apple",
    showIcon: true,
    backgroundColor: .black,
    foregroundColor: .white,
    cornerRadius: 12
) {
    try await AppleSignInKit.shared.signIn()
}
```

### AuthUser

User data model:

```swift
struct AuthUser: Codable, Identifiable {
    let id: String
    let email: String?
    let displayName: String?
    let createdAt: Date?
    let updatedAt: Date?
}
```

### AuthState

Authentication state enum:

```swift
enum AuthState {
    case unauthenticated
    case signingIn
    case authenticated(AuthUser)
    case sessionExpired
    case error(String)
}
```

## Combine Integration

Use reactive publishers for auth state changes:

```swift
import Combine

class MyViewModel: ObservableObject {
    private var cancellables = Set<AnyCancellable>()

    init() {
        // Listen for user changes
        AppleSignInKit.shared.authManager.$currentUser
            .sink { user in
                if let user = user {
                    print("User signed in: \(user.id)")
                } else {
                    print("User signed out")
                }
            }
            .store(in: &cancellables)

        // Listen for auth state changes
        AppleSignInKit.shared.authManager.$authState
            .sink { state in
                switch state {
                case .authenticated(let user):
                    print("Authenticated: \(user.email ?? "")")
                case .unauthenticated:
                    print("Not authenticated")
                case .signingIn:
                    print("Signing in...")
                case .sessionExpired:
                    print("Session expired")
                case .error(let message):
                    print("Error: \(message)")
                }
            }
            .store(in: &cancellables)
    }
}
```

## JWT Utilities

Decode and validate JWT tokens:

```swift
import AppleSignInKit

// Decode token payload
let payload = try JWTDecoder.decode(token)
print("User ID: \(payload["sub"] ?? "")")

// Decode to typed structure
let tokenPayload = try JWTDecoder.decodePayload(token)
print("Expires at: \(tokenPayload.expirationDate)")

// Check expiration
if token.isJWTExpired {
    print("Token has expired")
}

// Get subject (user ID)
if let userId = token.jwtSubject {
    print("User ID: \(userId)")
}

// Get time until expiration
if let remaining = JWTDecoder.timeUntilExpiration(token) {
    print("Expires in \(remaining) seconds")
}
```

## Backend API Contract

AppleSignInKit expects your backend to implement these endpoints:

### POST /auth/apple/native

Exchange Apple credential for JWT tokens.

**Request:**
```json
{
    "identityToken": "eyJhbGciOiJSUzI1...",
    "nonce": "random_nonce_string",
    "authorizationCode": "auth_code_from_apple",
    "email": "user@example.com",       // Optional, only on first sign-in
    "fullName": "John Doe"             // Optional, only on first sign-in
}
```

**Response:**
```json
{
    "success": true,
    "user": {
        "id": "user_123",
        "email": "user@example.com",
        "displayName": "John Doe",
        "createdAt": "2024-01-15T10:30:00Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1...",
    "refreshToken": "refresh_token_here",
    "expiresIn": 900
}
```

### POST /auth/refresh

Refresh access token.

**Request:**
```json
{
    "refreshToken": "refresh_token_here"
}
```

**Response:**
```json
{
    "accessToken": "new_access_token",
    "refreshToken": "new_refresh_token",
    "expiresIn": 900
}
```

### POST /auth/logout

Revoke session.

**Request:** Empty body with Authorization header

**Response:** 200 OK

### GET /auth/me

Get current user.

**Response:**
```json
{
    "user": {
        "id": "user_123",
        "email": "user@example.com",
        "displayName": "John Doe",
        "createdAt": "2024-01-15T10:30:00Z"
    }
}
```

## Error Handling

### AppleSignInError

Errors from the Apple Sign-In flow:

```swift
enum AppleSignInError {
    case canceled              // User canceled
    case failed               // General failure
    case invalidResponse      // Invalid Apple response
    case missingIdentityToken // No identity token
    case credentialRevoked    // Apple credential revoked
    case credentialNotFound   // Credential not found
}
```

### AuthError

Authentication errors:

```swift
enum AuthError {
    case notConfigured        // SDK not configured
    case noRefreshToken       // No refresh token available
    case refreshFailed(String) // Token refresh failed
    case appleSignInFailed(AppleSignInError)
    case networkError(NetworkError)
    case sessionExpired       // Session has expired
}

// Check if re-authentication is needed
if error.requiresReauthentication {
    // Prompt user to sign in again
}
```

### NetworkError

Network-level errors:

```swift
enum NetworkError {
    case unauthorized         // 401
    case forbidden           // 403
    case notFound            // 404
    case rateLimited(retryAfter: Int?)  // 429
    case serverError(Int)    // 5xx
    case timeout
    case noConnection
    case sslError(String)    // Certificate pinning failure
}
```

## App Store Requirements

When using Apple Sign-In:

1. **Capability**: Enable "Sign in with Apple" in your app's capabilities
2. **Entitlement**: Add the `com.apple.developer.applesignin` entitlement
3. **App Store**: Apps using third-party sign-in MUST also offer Apple Sign-In

## Security Best Practices

1. **Enable certificate pinning** in production
2. **Validate tokens on your backend** - never trust client-side validation alone
3. **Check Apple credential state** on app launch to detect revocations
4. **Use HTTPS only** for all API communication
5. **Store tokens in Keychain** (handled automatically by this SDK)
6. **Implement token refresh** to minimize credential exposure

## Testing

### Unit Tests

```swift
import XCTest
@testable import AppleSignInKit

class AuthTests: XCTestCase {
    func testKeychainStorage() {
        let keychain = KeychainManager(service: "com.test.app")
        keychain.save(key: .accessToken, value: "test")
        XCTAssertEqual(keychain.read(key: .accessToken), "test")
        keychain.clearAll()
    }
}
```

### Integration Testing

For integration tests, mock the `APIClient`:

```swift
// Create a mock API client for testing
class MockAPIClient: APIClient {
    var mockResponse: Any?
    var mockError: Error?

    override func post<T: Encodable, R: Decodable>(
        _ path: String,
        body: T,
        requiresAuth: Bool
    ) async throws -> R {
        if let error = mockError {
            throw error
        }
        return mockResponse as! R
    }
}
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Please read the [Contributing Guide](CONTRIBUTING.md) first.

## Support

- [GitHub Issues](https://github.com/acedergren/running-days/issues)
- [Documentation](https://running-days.com/docs)

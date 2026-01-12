# Swift SDK API

API reference for `apple-signin-kit` iOS SDK.

## AppleSignInService

Main authentication service.

### Initialization

```swift
let service = AppleSignInService()

// With custom configuration
let service = AppleSignInService(
    apiUrl: URL(string: "https://api.yourapp.com")!,
    keychainService: "com.yourapp.auth"
)
```

### Properties

```swift
@Observable
final class AppleSignInService {
    /// Current authenticated session
    var session: Session?

    /// Whether user is authenticated
    var isAuthenticated: Bool { session != nil }

    /// Current user
    var user: User? { session?.user }

    /// Loading state
    var isLoading: Bool
}
```

### Methods

#### signIn()

Present Apple Sign-In and authenticate:

```swift
func signIn() async throws -> Session

// Usage
do {
    let session = try await service.signIn()
    print("Signed in as: \(session.user.email)")
} catch {
    print("Sign-in failed: \(error)")
}
```

#### handleAuthorization(_:)

Process ASAuthorization result:

```swift
func handleAuthorization(_ result: Result<ASAuthorization, Error>) async throws -> Session

// Usage with SignInWithAppleButton
SignInWithAppleButton(.signIn, onRequest: configure, onCompletion: { result in
    Task {
        let session = try await service.handleAuthorization(result)
    }
})
```

#### refreshSession()

Refresh access token:

```swift
func refreshSession() async throws -> Session

// Usage
let newSession = try await service.refreshSession()
```

#### signOut()

Sign out and clear tokens:

```swift
func signOut() async

// Usage
await service.signOut()
```

#### checkCredentialState()

Verify Apple ID status:

```swift
func checkCredentialState() async throws -> ASAuthorizationAppleIDProvider.CredentialState

// Usage
let state = try await service.checkCredentialState()
switch state {
case .authorized: // Valid
case .revoked: // User revoked
case .notFound: // Not signed in
case .transferred: // Account transferred
}
```

#### startCredentialStateMonitoring()

Monitor for credential changes:

```swift
func startCredentialStateMonitoring() async

// Usage in view
.task {
    await service.startCredentialStateMonitoring()
}
```

## Session

Authenticated session data.

```swift
struct Session: Codable, Sendable {
    /// Session ID
    let id: String

    /// Associated user
    let user: User

    /// Access token
    let accessToken: String

    /// Refresh token
    let refreshToken: String

    /// Access token expiration
    let expiresAt: Date

    /// Whether access token is expired
    var isExpired: Bool {
        Date() >= expiresAt
    }
}
```

## User

User account data.

```swift
struct User: Codable, Sendable, Identifiable {
    /// Unique identifier
    let id: String

    /// Apple user identifier
    let appleId: String

    /// Email address
    let email: String

    /// Whether email is verified
    let emailVerified: Bool

    /// Full name (optional)
    let fullName: String?

    /// Account creation date
    let createdAt: Date
}
```

## KeychainManager

Secure token storage.

### Initialization

```swift
let keychain = KeychainManager(service: "com.yourapp.auth")
```

### Methods

#### store(token:for:)

Store a token:

```swift
func store(token: String, for key: KeychainKey) throws

// Usage
try keychain.store(token: accessToken, for: .accessToken)
```

#### retrieve(for:)

Retrieve a token:

```swift
func retrieve(for key: KeychainKey) throws -> String?

// Usage
if let token = try keychain.retrieve(for: .accessToken) {
    // Use token
}
```

#### delete(for:)

Delete a token:

```swift
func delete(for key: KeychainKey) throws

// Usage
try keychain.delete(for: .refreshToken)
```

#### deleteAll()

Delete all stored tokens:

```swift
func deleteAll() throws

// Usage
try keychain.deleteAll()
```

### KeychainKey

```swift
enum KeychainKey: String {
    case accessToken = "access_token"
    case refreshToken = "refresh_token"
    case userId = "user_id"
}
```

## AppleSignInError

Error types.

```swift
enum AppleSignInError: Error, LocalizedError {
    /// User cancelled sign-in
    case userCancelled

    /// Invalid credential from Apple
    case invalidCredential

    /// Nonce validation failed
    case invalidNonce

    /// Backend authentication failed
    case authenticationFailed(reason: String)

    /// Network error
    case networkError(underlying: Error)

    /// Keychain operation failed
    case keychainError(status: OSStatus)

    /// Access token expired
    case tokenExpired

    /// Apple credential revoked
    case credentialRevoked

    var errorDescription: String? {
        switch self {
        case .userCancelled:
            return "Sign-in was cancelled"
        case .invalidCredential:
            return "Invalid Apple credential"
        case .invalidNonce:
            return "Security validation failed"
        case .authenticationFailed(let reason):
            return "Authentication failed: \(reason)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .keychainError(let status):
            return "Keychain error: \(status)"
        case .tokenExpired:
            return "Session expired"
        case .credentialRevoked:
            return "Apple ID access revoked"
        }
    }
}
```

## SwiftUI Components

### AppleSignInButton

Native Apple button wrapper:

```swift
import AuthenticationServices

SignInWithAppleButton(
    .signIn,               // or .signUp, .continue
    onRequest: { request in
        request.requestedScopes = [.email, .fullName]
        request.nonce = service.generateNonce()
    },
    onCompletion: { result in
        Task {
            try await service.handleAuthorization(result)
        }
    }
)
.signInWithAppleButtonStyle(.black)  // .white, .whiteOutline
.frame(height: 50)
```

### Style Options

```swift
enum SignInWithAppleButton.Style {
    case black      // Black background, white text
    case white      // White background, black text
    case whiteOutline // White background, black border
}
```

## Environment Integration

### Environment Object

```swift
@main
struct MyApp: App {
    @State private var authService = AppleSignInService()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(authService)
        }
    }
}

// In views
struct ProfileView: View {
    @Environment(AppleSignInService.self) var auth

    var body: some View {
        if let user = auth.user {
            Text("Hello, \(user.fullName ?? user.email)")
        }
    }
}
```

## Networking

### APIClient

HTTP client for backend communication:

```swift
let client = APIClient(
    baseURL: URL(string: "https://api.yourapp.com")!,
    session: .shared
)

// Make authenticated request
let response = try await client.request(
    path: "/api/protected",
    method: .get,
    accessToken: session.accessToken
)
```

### Request/Response Types

```swift
struct AuthRequest: Encodable {
    let identityToken: String
    let authorizationCode: String
    let user: AppleUserInfo?
    let nonce: String
}

struct AuthResponse: Decodable {
    let user: User
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
}
```

## Testing

### Mock Service

```swift
#if DEBUG
@Observable
final class MockAppleSignInService: AppleSignInServiceProtocol {
    var session: Session?
    var isLoading = false
    var shouldFail = false
    var mockUser = User.mock

    func signIn() async throws -> Session {
        isLoading = true
        defer { isLoading = false }

        if shouldFail {
            throw AppleSignInError.authenticationFailed(reason: "Mock error")
        }

        let session = Session(
            id: UUID().uuidString,
            user: mockUser,
            accessToken: "mock-access-token",
            refreshToken: "mock-refresh-token",
            expiresAt: Date().addingTimeInterval(900)
        )
        self.session = session
        return session
    }

    // Implement other methods...
}
#endif
```

### Preview Support

```swift
extension User {
    static var mock: User {
        User(
            id: "mock-id",
            appleId: "mock-apple-id",
            email: "test@example.com",
            emailVerified: true,
            fullName: "Test User",
            createdAt: Date()
        )
    }
}

#Preview {
    LoginView()
        .environment(MockAppleSignInService())
}
```

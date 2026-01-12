# apple-signin-kit (iOS)

Native Swift SDK for Apple Sign-In on iOS, iPadOS, and macOS.

## Features

- **Swift 6 Ready** - Strict concurrency with `@Sendable` and actors
- **@Observable Pattern** - Modern SwiftUI state management
- **Keychain Storage** - Secure token persistence
- **Credential State Monitoring** - Automatic revocation detection

## Requirements

- iOS 17.0+ / macOS 14.0+
- Swift 6.0+
- Xcode 16.0+

## Installation

### Swift Package Manager

```swift
// Package.swift
dependencies: [
    .package(
        url: "https://github.com/acedergren/apple-signin-sdk",
        from: "1.0.0"
    )
]

targets: [
    .target(
        name: "YourApp",
        dependencies: [
            .product(name: "AppleSignInKit", package: "apple-signin-sdk")
        ]
    )
]
```

### Xcode

1. File → Add Package Dependencies
2. Enter: `https://github.com/acedergren/apple-signin-sdk`
3. Select version and add `AppleSignInKit`

## Quick Start

### 1. Enable Capability

In Xcode:

1. Select your target
2. Go to "Signing & Capabilities"
3. Add "Sign in with Apple"

### 2. Create Sign-In View

```swift
import SwiftUI
import AppleSignInKit

struct LoginView: View {
    @State private var authService = AppleSignInService()

    var body: some View {
        VStack(spacing: 20) {
            Text("Welcome")
                .font(.largeTitle)

            SignInWithAppleButton(.signIn, onRequest: configure, onCompletion: handle)
                .signInWithAppleButtonStyle(.black)
                .frame(height: 50)
        }
        .padding()
    }

    private func configure(_ request: ASAuthorizationAppleIDRequest) {
        request.requestedScopes = [.email, .fullName]
        request.nonce = authService.generateNonce()
    }

    private func handle(_ result: Result<ASAuthorization, Error>) {
        Task {
            do {
                let session = try await authService.handleAuthorization(result)
                print("Signed in: \(session.user.email)")
            } catch {
                print("Sign-in failed: \(error)")
            }
        }
    }
}
```

## AppleSignInService

Main service for handling authentication.

### Initialization

```swift
let authService = AppleSignInService(
    apiUrl: URL(string: "https://api.yourapp.com")!,
    keychainService: "com.yourapp.auth"
)
```

### Methods

#### signIn()

Presents Apple Sign-In and authenticates with backend:

```swift
do {
    let session = try await authService.signIn()
    // session.user, session.accessToken, session.refreshToken
} catch AppleSignInError.userCancelled {
    // User cancelled
} catch AppleSignInError.authenticationFailed(let reason) {
    // Backend rejected
} catch {
    // Other error
}
```

#### handleAuthorization(_:)

Process authorization result (for custom UI):

```swift
let session = try await authService.handleAuthorization(result)
```

#### refreshSession()

Refresh access token:

```swift
let newSession = try await authService.refreshSession()
```

#### signOut()

Sign out and clear tokens:

```swift
await authService.signOut()
```

#### checkCredentialState()

Verify Apple ID credential status:

```swift
let state = try await authService.checkCredentialState()
switch state {
case .authorized:
    // Valid
case .revoked:
    // User revoked
case .notFound:
    // Not signed in
case .transferred:
    // Account transferred
}
```

### Properties

```swift
// Current session (observable)
@Published var session: Session?

// Is user authenticated
var isAuthenticated: Bool { session != nil }

// Current user
var user: User? { session?.user }
```

## KeychainManager

Secure token storage using iOS Keychain.

```swift
let keychain = KeychainManager(service: "com.yourapp.auth")

// Store token
try keychain.store(token: accessToken, for: .accessToken)

// Retrieve token
let token = try keychain.retrieve(for: .accessToken)

// Delete token
try keychain.delete(for: .accessToken)

// Delete all
try keychain.deleteAll()
```

### Security Attributes

Tokens are stored with:

- `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`
- Data protection class: Complete until first user authentication
- Not synchronized to iCloud Keychain

## Error Handling

```swift
enum AppleSignInError: Error {
    case userCancelled
    case invalidCredential
    case invalidNonce
    case authenticationFailed(reason: String)
    case networkError(underlying: Error)
    case keychainError(status: OSStatus)
    case tokenExpired
    case credentialRevoked
}
```

Handle errors:

```swift
do {
    let session = try await authService.signIn()
} catch let error as AppleSignInError {
    switch error {
    case .userCancelled:
        // Do nothing
        break
    case .credentialRevoked:
        // Sign out and show login
        await authService.signOut()
    case .networkError(let underlying):
        // Show retry UI
        showError("Network error: \(underlying.localizedDescription)")
    default:
        showError(error.localizedDescription)
    }
}
```

## SwiftUI Integration

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

struct ContentView: View {
    @Environment(AppleSignInService.self) var auth

    var body: some View {
        if auth.isAuthenticated {
            HomeView()
        } else {
            LoginView()
        }
    }
}
```

### Observation

```swift
struct ProfileView: View {
    @Environment(AppleSignInService.self) var auth

    var body: some View {
        // Automatically updates when session changes
        if let user = auth.user {
            Text("Hello, \(user.fullName ?? user.email)")
        }
    }
}
```

## Credential State Monitoring

Monitor Apple ID status changes:

```swift
struct RootView: View {
    @Environment(AppleSignInService.self) var auth

    var body: some View {
        ContentView()
            .task {
                await auth.startCredentialStateMonitoring()
            }
    }
}
```

The service automatically:

- Checks credential state on app launch
- Monitors for revocation notifications
- Signs out if credential is revoked

## Backend Integration

The SDK sends credentials to your backend:

```swift
// POST /api/auth/apple/native
{
    "identityToken": "eyJ...",  // Apple ID token
    "authorizationCode": "...", // Exchange code
    "user": {                   // Only on first sign-in
        "email": "user@example.com",
        "fullName": {
            "givenName": "John",
            "familyName": "Doe"
        }
    },
    "nonce": "..."              // For verification
}
```

## Testing

### Mock Service

```swift
#if DEBUG
class MockAppleSignInService: AppleSignInServiceProtocol {
    var mockSession: Session?
    var shouldFail = false

    func signIn() async throws -> Session {
        if shouldFail {
            throw AppleSignInError.authenticationFailed(reason: "Mock error")
        }
        return mockSession ?? .mock
    }
}
#endif
```

### Preview Support

```swift
#Preview {
    LoginView()
        .environment(MockAppleSignInService())
}
```

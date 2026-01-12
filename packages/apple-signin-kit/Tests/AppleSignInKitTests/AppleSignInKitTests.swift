// AppleSignInKitTests.swift
// Unit tests for AppleSignInKit

import XCTest
@testable import AppleSignInKit

final class AppleSignInKitTests: XCTestCase {

    // MARK: - KeychainManager Tests

    func testKeychainSaveAndRead() throws {
        let keychain = KeychainManager(service: "com.test.applesigninkit")

        // Clean up first
        keychain.clearAll()

        // Test string save/read
        keychain.save(key: .accessToken, value: "test_token_123")
        let token = keychain.read(key: .accessToken)
        XCTAssertEqual(token, "test_token_123")

        // Clean up
        keychain.clearAll()
    }

    func testKeychainDateSaveAndRead() throws {
        let keychain = KeychainManager(service: "com.test.applesigninkit")

        keychain.clearAll()

        let testDate = Date()
        keychain.save(key: .tokenExpiry, date: testDate)

        let readDate = keychain.readDate(key: .tokenExpiry)
        XCTAssertNotNil(readDate)

        // Compare with 1 second tolerance (timestamp precision)
        if let readDate = readDate {
            XCTAssertEqual(readDate.timeIntervalSince1970, testDate.timeIntervalSince1970, accuracy: 1.0)
        }

        keychain.clearAll()
    }

    func testKeychainDelete() throws {
        let keychain = KeychainManager(service: "com.test.applesigninkit")

        keychain.clearAll()

        keychain.save(key: .userId, value: "user_123")
        XCTAssertNotNil(keychain.read(key: .userId))

        keychain.delete(key: .userId)
        XCTAssertNil(keychain.read(key: .userId))

        keychain.clearAll()
    }

    func testKeychainClearAll() throws {
        let keychain = KeychainManager(service: "com.test.applesigninkit")

        keychain.save(key: .accessToken, value: "token")
        keychain.save(key: .refreshToken, value: "refresh")
        keychain.save(key: .userId, value: "user")

        keychain.clearAll()

        XCTAssertNil(keychain.read(key: .accessToken))
        XCTAssertNil(keychain.read(key: .refreshToken))
        XCTAssertNil(keychain.read(key: .userId))
    }

    func testKeychainExists() throws {
        let keychain = KeychainManager(service: "com.test.applesigninkit")

        keychain.clearAll()

        XCTAssertFalse(keychain.exists(key: .accessToken))

        keychain.save(key: .accessToken, value: "token")
        XCTAssertTrue(keychain.exists(key: .accessToken))

        keychain.clearAll()
    }

    // MARK: - JWT Decoder Tests

    func testJWTDecodeValidToken() throws {
        // Sample JWT (not a real token, just for structure testing)
        // Header: {"alg":"HS256","typ":"JWT"}
        // Payload: {"sub":"user123","exp":9999999999,"iat":1000000000}
        let token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIiwiZXhwIjo5OTk5OTk5OTk5LCJpYXQiOjEwMDAwMDAwMDB9.signature"

        let payload = try JWTDecoder.decode(token)
        XCTAssertEqual(payload["sub"] as? String, "user123")
    }

    func testJWTDecodeInvalidFormat() {
        let invalidToken = "not.a.valid.jwt.token"

        XCTAssertThrowsError(try JWTDecoder.decode(invalidToken)) { error in
            XCTAssertTrue(error is JWTError)
        }
    }

    func testJWTSubjectExtraction() {
        let token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIiwiZXhwIjo5OTk5OTk5OTk5LCJpYXQiOjEwMDAwMDAwMDB9.signature"

        XCTAssertEqual(token.jwtSubject, "user123")
    }

    func testJWTExpirationCheck() {
        // Expired token (exp: 1000000000 - year 2001)
        let expiredToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIiwiZXhwIjoxMDAwMDAwMDAwLCJpYXQiOjEwMDAwMDAwMDB9.signature"

        XCTAssertTrue(expiredToken.isJWTExpired)

        // Future token (exp: 9999999999 - year 2286)
        let validToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIiwiZXhwIjo5OTk5OTk5OTk5LCJpYXQiOjEwMDAwMDAwMDB9.signature"

        XCTAssertFalse(validToken.isJWTExpired)
    }

    // MARK: - Date Extensions Tests

    func testDateIsPast() {
        let pastDate = Date().addingTimeInterval(-3600) // 1 hour ago
        let futureDate = Date().addingTimeInterval(3600) // 1 hour from now

        XCTAssertTrue(pastDate.isPast)
        XCTAssertFalse(futureDate.isPast)
    }

    func testDateIsFuture() {
        let pastDate = Date().addingTimeInterval(-3600)
        let futureDate = Date().addingTimeInterval(3600)

        XCTAssertFalse(pastDate.isFuture)
        XCTAssertTrue(futureDate.isFuture)
    }

    func testDateISO8601String() {
        let date = Date(timeIntervalSince1970: 1704067200) // 2024-01-01T00:00:00Z
        let isoString = date.iso8601String

        XCTAssertTrue(isoString.contains("2024"))
        XCTAssertTrue(isoString.contains("01"))
    }

    func testDateAdding() {
        let now = Date()

        let oneHourLater = now.adding(hours: 1)
        XCTAssertEqual(oneHourLater.timeIntervalSince(now), 3600, accuracy: 1)

        let oneMinuteLater = now.adding(minutes: 1)
        XCTAssertEqual(oneMinuteLater.timeIntervalSince(now), 60, accuracy: 1)
    }

    func testTimeIntervalHelpers() {
        XCTAssertEqual(TimeInterval.seconds(30), 30)
        XCTAssertEqual(TimeInterval.minutes(5), 300)
        XCTAssertEqual(TimeInterval.hours(2), 7200)
        XCTAssertEqual(TimeInterval.days(1), 86400)
    }

    // MARK: - AuthUser Tests

    func testAuthUserEquatable() {
        let user1 = AuthUser(id: "123", email: "test@example.com")
        let user2 = AuthUser(id: "123", email: "test@example.com")
        let user3 = AuthUser(id: "456", email: "other@example.com")

        XCTAssertEqual(user1, user2)
        XCTAssertNotEqual(user1, user3)
    }

    func testAuthUserCodable() throws {
        let user = AuthUser(
            id: "user_123",
            email: "test@example.com",
            displayName: "Test User",
            createdAt: Date(),
            updatedAt: nil
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        let data = try encoder.encode(user)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let decoded = try decoder.decode(AuthUser.self, from: data)

        XCTAssertEqual(decoded.id, user.id)
        XCTAssertEqual(decoded.email, user.email)
        XCTAssertEqual(decoded.displayName, user.displayName)
    }

    // MARK: - AuthSession Tests

    func testAuthSessionIsExpired() {
        let pastExpiry = Date().addingTimeInterval(-3600) // 1 hour ago
        let expiredSession = AuthSession(
            accessToken: "token",
            refreshToken: "refresh",
            expiresAt: pastExpiry,
            user: AuthUser(id: "123")
        )

        XCTAssertTrue(expiredSession.isExpired)

        let futureExpiry = Date().addingTimeInterval(3600) // 1 hour from now
        let validSession = AuthSession(
            accessToken: "token",
            refreshToken: "refresh",
            expiresAt: futureExpiry,
            user: AuthUser(id: "123")
        )

        XCTAssertFalse(validSession.isExpired)
    }

    func testAuthSessionIsExpiringSoon() {
        let soonExpiry = Date().addingTimeInterval(30) // 30 seconds from now
        let expiringSoonSession = AuthSession(
            accessToken: "token",
            refreshToken: "refresh",
            expiresAt: soonExpiry,
            user: AuthUser(id: "123")
        )

        XCTAssertTrue(expiringSoonSession.isExpiringSoon)

        let laterExpiry = Date().addingTimeInterval(120) // 2 minutes from now
        let validSession = AuthSession(
            accessToken: "token",
            refreshToken: "refresh",
            expiresAt: laterExpiry,
            user: AuthUser(id: "123")
        )

        XCTAssertFalse(validSession.isExpiringSoon)
    }

    // MARK: - Error Tests

    func testAppleSignInErrorDescriptions() {
        let errors: [AppleSignInError] = [
            .canceled,
            .failed,
            .invalidResponse,
            .missingIdentityToken,
            .credentialRevoked
        ]

        for error in errors {
            XCTAssertNotNil(error.errorDescription)
            XCTAssertFalse(error.errorDescription!.isEmpty)
        }
    }

    func testAuthErrorRequiresReauthentication() {
        let requiresReauth: [AuthError] = [
            .noRefreshToken,
            .refreshFailed("test"),
            .sessionExpired,
            .notAuthenticated,
            .appleSignInFailed(.credentialRevoked)
        ]

        for error in requiresReauth {
            XCTAssertTrue(error.requiresReauthentication, "\(error) should require reauthentication")
        }

        let doesNotRequireReauth: [AuthError] = [
            .notConfigured,
            .networkError(.timeout),
            .serverError("test"),
            .appleSignInFailed(.canceled)
        ]

        for error in doesNotRequireReauth {
            XCTAssertFalse(error.requiresReauthentication, "\(error) should not require reauthentication")
        }
    }

    func testNetworkErrorStatusCodes() {
        XCTAssertEqual(NetworkError.unauthorized.statusCode, 401)
        XCTAssertEqual(NetworkError.forbidden.statusCode, 403)
        XCTAssertEqual(NetworkError.notFound.statusCode, 404)
        XCTAssertEqual(NetworkError.rateLimited(retryAfter: 60).statusCode, 429)
        XCTAssertEqual(NetworkError.serverError(500).statusCode, 500)
        XCTAssertNil(NetworkError.timeout.statusCode)
    }

    // MARK: - Configuration Tests

    func testConfigurationDefaults() {
        let config = AppleSignInKit.Configuration(
            apiBaseURL: URL(string: "https://api.example.com")!,
            clientId: "com.example.app"
        )

        XCTAssertEqual(config.apiBaseURL.absoluteString, "https://api.example.com")
        XCTAssertEqual(config.clientId, "com.example.app")
        XCTAssertEqual(config.keychainService, "com.example.app")
        XCTAssertFalse(config.enableCertificatePinning)
        XCTAssertTrue(config.pinnedCertificateHashes.isEmpty)
        XCTAssertEqual(config.requestTimeout, 30)
    }

    func testConfigurationCustomValues() {
        let config = AppleSignInKit.Configuration(
            apiBaseURL: URL(string: "https://api.example.com")!,
            clientId: "com.example.app",
            keychainService: "com.example.keychain",
            enableCertificatePinning: true,
            pinnedCertificateHashes: ["hash1", "hash2"],
            requestTimeout: 60,
            userAgent: "MyApp/1.0"
        )

        XCTAssertEqual(config.keychainService, "com.example.keychain")
        XCTAssertTrue(config.enableCertificatePinning)
        XCTAssertEqual(config.pinnedCertificateHashes.count, 2)
        XCTAssertEqual(config.requestTimeout, 60)
        XCTAssertEqual(config.userAgent, "MyApp/1.0")
    }
}

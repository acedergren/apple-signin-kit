// KeychainManager.swift
// Secure token storage using iOS Keychain Services

import Foundation
import Security

// MARK: - KeychainManager

/// Secure storage for authentication tokens using iOS Keychain Services.
///
/// KeychainManager provides a type-safe interface for storing and retrieving
/// sensitive data in the iOS Keychain. Data is stored with:
/// - `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` accessibility
/// - iCloud sync disabled for security
/// - Automatic data encoding/decoding
///
/// ## Usage
/// ```swift
/// let keychain = KeychainManager(service: "com.myapp.auth")
///
/// // Save a value
/// keychain.save(key: .accessToken, value: "jwt_token")
///
/// // Read a value
/// if let token = keychain.read(key: .accessToken) {
///     print("Token: \(token)")
/// }
///
/// // Delete a value
/// keychain.delete(key: .accessToken)
/// ```
public final class KeychainManager: @unchecked Sendable {

    // MARK: - Keys

    /// Predefined keychain keys for authentication data
    public enum Key: String, CaseIterable, Sendable {
        /// JWT access token
        case accessToken = "access_token"

        /// JWT refresh token
        case refreshToken = "refresh_token"

        /// Token expiration timestamp
        case tokenExpiry = "token_expiry"

        /// User ID
        case userId = "user_id"

        /// Apple user identifier (for credential state checks)
        case appleUserIdentifier = "apple_user_identifier"
    }

    // MARK: - Properties

    private let service: String
    private let accessGroup: String?

    /// Lock for thread-safe access
    private let lock = NSLock()

    // MARK: - Initialization

    /// Create a new KeychainManager instance.
    ///
    /// - Parameters:
    ///   - service: The keychain service identifier (typically the app bundle ID)
    ///   - accessGroup: Optional keychain access group for sharing between apps
    public init(service: String, accessGroup: String? = nil) {
        self.service = service
        self.accessGroup = accessGroup
    }

    // MARK: - String Operations

    /// Save a string value to the keychain.
    ///
    /// - Parameters:
    ///   - key: The key to store the value under
    ///   - value: The string value to store
    public func save(key: Key, value: String) {
        guard let data = value.data(using: .utf8) else {
            log("Failed to encode string for key: \(key.rawValue)")
            return
        }
        save(key: key.rawValue, data: data)
    }

    /// Read a string value from the keychain.
    ///
    /// - Parameter key: The key to read
    /// - Returns: The stored string value, or nil if not found
    public func read(key: Key) -> String? {
        guard let data = read(key: key.rawValue) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// Delete a value from the keychain.
    ///
    /// - Parameter key: The key to delete
    public func delete(key: Key) {
        delete(key: key.rawValue)
    }

    // MARK: - Date Operations

    /// Save a Date to the keychain.
    ///
    /// - Parameters:
    ///   - key: The key to store the date under
    ///   - date: The date to store
    public func save(key: Key, date: Date) {
        save(key: key, value: String(date.timeIntervalSince1970))
    }

    /// Read a Date from the keychain.
    ///
    /// - Parameter key: The key to read
    /// - Returns: The stored date, or nil if not found
    public func readDate(key: Key) -> Date? {
        guard let string = read(key: key),
              let interval = Double(string) else { return nil }
        return Date(timeIntervalSince1970: interval)
    }

    // MARK: - Data Operations

    /// Save raw data to the keychain.
    ///
    /// - Parameters:
    ///   - key: The key to store the data under
    ///   - data: The data to store
    public func save(key: Key, data: Data) {
        save(key: key.rawValue, data: data)
    }

    /// Read raw data from the keychain.
    ///
    /// - Parameter key: The key to read
    /// - Returns: The stored data, or nil if not found
    public func readData(key: Key) -> Data? {
        read(key: key.rawValue)
    }

    // MARK: - Codable Operations

    /// Save a Codable value to the keychain.
    ///
    /// - Parameters:
    ///   - key: The key to store the value under
    ///   - value: The Codable value to store
    /// - Throws: Encoding errors
    public func save<T: Encodable>(key: Key, value: T) throws {
        let encoder = JSONEncoder()
        let data = try encoder.encode(value)
        save(key: key.rawValue, data: data)
    }

    /// Read a Codable value from the keychain.
    ///
    /// - Parameter key: The key to read
    /// - Returns: The decoded value, or nil if not found
    /// - Throws: Decoding errors
    public func read<T: Decodable>(key: Key, as type: T.Type) throws -> T? {
        guard let data = read(key: key.rawValue) else { return nil }
        let decoder = JSONDecoder()
        return try decoder.decode(type, from: data)
    }

    // MARK: - Batch Operations

    /// Clear all stored authentication values.
    public func clearAll() {
        lock.lock()
        defer { lock.unlock() }

        for key in Key.allCases {
            delete(key: key.rawValue)
        }

        log("Cleared all keychain items")
    }

    /// Check if a key exists in the keychain.
    ///
    /// - Parameter key: The key to check
    /// - Returns: true if the key exists
    public func exists(key: Key) -> Bool {
        read(key: key.rawValue) != nil
    }

    // MARK: - Private Implementation

    private func save(key: String, data: Data) {
        lock.lock()
        defer { lock.unlock() }

        var query = baseQuery(for: key)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        query[kSecAttrSynchronizable as String] = kCFBooleanFalse

        // Delete existing item first
        let deleteQuery = baseQuery(for: key)
        SecItemDelete(deleteQuery as CFDictionary)

        // Add new item
        let status = SecItemAdd(query as CFDictionary, nil)

        if status != errSecSuccess {
            log("Keychain save failed for key \(key): \(status)")
        }
    }

    private func read(key: String) -> Data? {
        lock.lock()
        defer { lock.unlock() }

        var query = baseQuery(for: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess else {
            if status != errSecItemNotFound {
                log("Keychain read failed for key \(key): \(status)")
            }
            return nil
        }

        return result as? Data
    }

    private func delete(key: String) {
        lock.lock()
        defer { lock.unlock() }

        let query = baseQuery(for: key)
        let status = SecItemDelete(query as CFDictionary)

        if status != errSecSuccess && status != errSecItemNotFound {
            log("Keychain delete failed for key \(key): \(status)")
        }
    }

    private func baseQuery(for key: String) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]

        if let accessGroup = accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }

        return query
    }
}

// MARK: - Result-Based API

extension KeychainManager {
    /// Save a string value to the keychain with result.
    ///
    /// - Parameters:
    ///   - key: The key to store the value under
    ///   - value: The string value to store
    /// - Returns: Result indicating success or failure
    @discardableResult
    public func saveWithResult(key: Key, value: String) -> Result<Void, KeychainError> {
        guard let data = value.data(using: .utf8) else {
            return .failure(.dataConversionFailed)
        }
        return saveWithResult(key: key.rawValue, data: data)
    }

    /// Read a string value from the keychain with result.
    ///
    /// - Parameter key: The key to read
    /// - Returns: Result containing the string value or an error
    public func readWithResult(key: Key) -> Result<String, KeychainError> {
        switch readWithResult(key: key.rawValue) {
        case .success(let data):
            guard let string = String(data: data, encoding: .utf8) else {
                return .failure(.dataConversionFailed)
            }
            return .success(string)
        case .failure(let error):
            return .failure(error)
        }
    }

    private func saveWithResult(key: String, data: Data) -> Result<Void, KeychainError> {
        lock.lock()
        defer { lock.unlock() }

        var query = baseQuery(for: key)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        query[kSecAttrSynchronizable as String] = kCFBooleanFalse

        // Delete existing item first
        let deleteQuery = baseQuery(for: key)
        SecItemDelete(deleteQuery as CFDictionary)

        // Add new item
        let status = SecItemAdd(query as CFDictionary, nil)

        switch status {
        case errSecSuccess:
            return .success(())
        case errSecDuplicateItem:
            return .failure(.duplicateItem)
        default:
            return .failure(.saveFailed(status))
        }
    }

    private func readWithResult(key: String) -> Result<Data, KeychainError> {
        lock.lock()
        defer { lock.unlock() }

        var query = baseQuery(for: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        switch status {
        case errSecSuccess:
            guard let data = result as? Data else {
                return .failure(.dataConversionFailed)
            }
            return .success(data)
        case errSecItemNotFound:
            return .failure(.itemNotFound)
        default:
            return .failure(.readFailed(status))
        }
    }
}

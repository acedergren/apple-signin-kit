// APIClient.swift
// HTTP client with async/await and optional certificate pinning

import Foundation
import CommonCrypto

// MARK: - APIClient

/// HTTP client for authentication API communication.
///
/// APIClient provides a type-safe interface for making HTTP requests to the backend API.
/// It supports:
/// - Async/await pattern
/// - Automatic JSON encoding/decoding
/// - JWT token injection
/// - Certificate pinning (optional)
/// - Request timeout configuration
///
/// ## Usage
/// ```swift
/// let client = APIClient(configuration: config)
///
/// // GET request
/// let user: User = try await client.get("users/me")
///
/// // POST request
/// let response: LoginResponse = try await client.post("auth/login", body: credentials)
/// ```
public actor APIClient {

    // MARK: - Properties

    private let configuration: AppleSignInKit.Configuration?
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let sessionDelegate: CertificatePinningDelegate?

    /// Whether the client is configured
    var isConfigured: Bool {
        configuration != nil
    }

    // MARK: - Initialization

    /// Create an API client with optional configuration.
    ///
    /// - Parameter configuration: SDK configuration (nil creates an unconfigured client)
    init(configuration: AppleSignInKit.Configuration?) {
        self.configuration = configuration

        // Configure JSON decoder
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        self.decoder = decoder

        // Configure JSON encoder
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.keyEncodingStrategy = .convertToSnakeCase
        self.encoder = encoder

        // Configure URL session
        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.timeoutIntervalForRequest = configuration?.requestTimeout ?? 30
        sessionConfig.timeoutIntervalForResource = (configuration?.requestTimeout ?? 30) * 2
        sessionConfig.waitsForConnectivity = true
        sessionConfig.allowsConstrainedNetworkAccess = false

        // Configure cache
        sessionConfig.urlCache = URLCache(
            memoryCapacity: 5 * 1024 * 1024,  // 5MB memory cache
            diskCapacity: 20 * 1024 * 1024    // 20MB disk cache
        )
        sessionConfig.requestCachePolicy = .returnCacheDataElseLoad

        // Configure certificate pinning if enabled
        if let config = configuration, config.enableCertificatePinning, !config.pinnedCertificateHashes.isEmpty {
            let delegate = CertificatePinningDelegate(
                pinnedHashes: config.pinnedCertificateHashes,
                pinnedHost: config.apiBaseURL.host ?? ""
            )
            self.sessionDelegate = delegate
            self.session = URLSession(configuration: sessionConfig, delegate: delegate, delegateQueue: nil)
        } else {
            self.sessionDelegate = nil
            self.session = URLSession(configuration: sessionConfig)
        }
    }

    // MARK: - Request Building

    private func buildRequest(
        path: String,
        method: HTTPMethod = .get,
        body: Data? = nil,
        requiresAuth: Bool = true
    ) async throws -> URLRequest {
        guard let config = configuration else {
            throw NetworkError.invalidURL
        }

        let url = config.apiBaseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        // Add User-Agent if configured
        if let userAgent = config.userAgent {
            request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        } else {
            request.setValue("AppleSignInKit/1.0", forHTTPHeaderField: "User-Agent")
        }

        // Add auth token if required
        if requiresAuth {
            // Use a callback to get the token to avoid circular dependency
            if let token = await getAuthToken() {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }
        }

        request.httpBody = body
        return request
    }

    /// Get auth token - implemented via callback to avoid circular dependency
    private var tokenProvider: (() async -> String?)?

    /// Set the token provider for authenticated requests
    func setTokenProvider(_ provider: @escaping () async -> String?) {
        self.tokenProvider = provider
    }

    private func getAuthToken() async -> String? {
        await tokenProvider?()
    }

    // MARK: - GET Requests

    /// Execute a GET request.
    ///
    /// - Parameters:
    ///   - path: API path relative to base URL
    ///   - requiresAuth: Whether to include authorization header
    /// - Returns: Decoded response
    public func get<T: Decodable>(_ path: String, requiresAuth: Bool = true) async throws -> T {
        let request = try await buildRequest(path: path, requiresAuth: requiresAuth)
        return try await execute(request)
    }

    /// Execute a GET request with query parameters.
    ///
    /// - Parameters:
    ///   - path: API path relative to base URL
    ///   - queryItems: URL query parameters
    ///   - requiresAuth: Whether to include authorization header
    /// - Returns: Decoded response
    public func get<T: Decodable>(
        _ path: String,
        queryItems: [URLQueryItem],
        requiresAuth: Bool = true
    ) async throws -> T {
        guard let config = configuration else {
            throw NetworkError.invalidURL
        }

        var components = URLComponents(url: config.apiBaseURL.appendingPathComponent(path), resolvingAgainstBaseURL: true)
        components?.queryItems = queryItems

        guard let url = components?.url else {
            throw NetworkError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if requiresAuth, let token = await getAuthToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        return try await execute(request)
    }

    // MARK: - POST Requests

    /// Execute a POST request with a request body.
    ///
    /// - Parameters:
    ///   - path: API path relative to base URL
    ///   - body: Request body to encode
    ///   - requiresAuth: Whether to include authorization header
    /// - Returns: Decoded response
    public func post<T: Encodable, R: Decodable>(
        _ path: String,
        body: T,
        requiresAuth: Bool = true
    ) async throws -> R {
        let bodyData: Data
        do {
            bodyData = try encoder.encode(body)
        } catch {
            throw NetworkError.encodingError(error.localizedDescription)
        }

        let request = try await buildRequest(
            path: path,
            method: .post,
            body: bodyData,
            requiresAuth: requiresAuth
        )
        return try await execute(request)
    }

    /// Execute a POST request without expecting a response body.
    ///
    /// - Parameters:
    ///   - path: API path relative to base URL
    ///   - body: Request body to encode
    ///   - requiresAuth: Whether to include authorization header
    public func post<T: Encodable>(
        _ path: String,
        body: T,
        requiresAuth: Bool = true
    ) async throws {
        let bodyData: Data
        do {
            bodyData = try encoder.encode(body)
        } catch {
            throw NetworkError.encodingError(error.localizedDescription)
        }

        let request = try await buildRequest(
            path: path,
            method: .post,
            body: bodyData,
            requiresAuth: requiresAuth
        )
        _ = try await executeRaw(request)
    }

    // MARK: - PUT Requests

    /// Execute a PUT request with a request body.
    ///
    /// - Parameters:
    ///   - path: API path relative to base URL
    ///   - body: Request body to encode
    ///   - requiresAuth: Whether to include authorization header
    /// - Returns: Decoded response
    public func put<T: Encodable, R: Decodable>(
        _ path: String,
        body: T,
        requiresAuth: Bool = true
    ) async throws -> R {
        let bodyData: Data
        do {
            bodyData = try encoder.encode(body)
        } catch {
            throw NetworkError.encodingError(error.localizedDescription)
        }

        let request = try await buildRequest(
            path: path,
            method: .put,
            body: bodyData,
            requiresAuth: requiresAuth
        )
        return try await execute(request)
    }

    // MARK: - DELETE Requests

    /// Execute a DELETE request.
    ///
    /// - Parameters:
    ///   - path: API path relative to base URL
    ///   - requiresAuth: Whether to include authorization header
    public func delete(_ path: String, requiresAuth: Bool = true) async throws {
        let request = try await buildRequest(path: path, method: .delete, requiresAuth: requiresAuth)
        _ = try await executeRaw(request)
    }

    // MARK: - Execution

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let data = try await executeRaw(request)

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            log("Decoding error: \(error)")
            throw NetworkError.decodingError(error.localizedDescription)
        }
    }

    private func executeRaw(_ request: URLRequest) async throws -> Data {
        log("Request: \(request.httpMethod ?? "GET") \(request.url?.absoluteString ?? "unknown")")

        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await session.data(for: request)
        } catch let urlError as URLError {
            log("URL error: \(urlError.code) - \(urlError.localizedDescription)")
            throw mapURLError(urlError)
        } catch {
            log("Request failed: \(error.localizedDescription)")
            throw NetworkError.unknown(0)
        }

        try validateResponse(response, data: data)

        log("Response: \(data.count) bytes")
        return data
    }

    private func validateResponse(_ response: URLResponse, data: Data) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }

        log("Status: \(httpResponse.statusCode)")

        switch httpResponse.statusCode {
        case 200...299:
            return

        case 401:
            throw NetworkError.unauthorized

        case 403:
            throw NetworkError.forbidden

        case 404:
            throw NetworkError.notFound

        case 429:
            let retryAfter = httpResponse.value(forHTTPHeaderField: "Retry-After").flatMap { Int($0) }
            throw NetworkError.rateLimited(retryAfter: retryAfter)

        case 422:
            if let errorResponse = try? decoder.decode(APIErrorResponse.self, from: data) {
                throw NetworkError.validationError(errorResponse.message)
            }
            throw NetworkError.validationError("Validation failed")

        case 500...599:
            throw NetworkError.serverError(httpResponse.statusCode)

        default:
            throw NetworkError.unknown(httpResponse.statusCode)
        }
    }

    private func mapURLError(_ error: URLError) -> NetworkError {
        switch error.code {
        case .notConnectedToInternet, .networkConnectionLost:
            return .noConnection
        case .timedOut:
            return .timeout
        case .cancelled:
            return .canceled
        case .serverCertificateUntrusted, .serverCertificateHasBadDate,
             .serverCertificateNotYetValid, .serverCertificateHasUnknownRoot,
             .clientCertificateRejected, .clientCertificateRequired:
            return .sslError(error.localizedDescription)
        default:
            return .unknown(error.errorCode)
        }
    }
}

// MARK: - HTTP Methods

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
    case patch = "PATCH"
}

// MARK: - Certificate Pinning

/// URLSession delegate for SSL certificate pinning.
///
/// Validates server certificates against pinned public key hashes
/// to prevent man-in-the-middle attacks.
final class CertificatePinningDelegate: NSObject, URLSessionDelegate, @unchecked Sendable {

    private let pinnedHashes: Set<String>
    private let pinnedHost: String

    init(pinnedHashes: Set<String>, pinnedHost: String) {
        self.pinnedHashes = pinnedHashes
        self.pinnedHost = pinnedHost
        super.init()
    }

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        // Only handle server trust challenges
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        // Only pin for our API domain
        guard challenge.protectionSpace.host == pinnedHost else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        // Evaluate server trust
        var error: CFError?
        let isValid = SecTrustEvaluateWithError(serverTrust, &error)

        guard isValid else {
            log("Certificate validation failed: \(error?.localizedDescription ?? "unknown")")
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // Get the certificate chain
        guard let serverCertificates = SecTrustCopyCertificateChain(serverTrust) as? [SecCertificate],
              let leafCertificate = serverCertificates.first else {
            log("Failed to get certificate chain")
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // Extract public key and compute hash
        guard let publicKey = SecCertificateCopyKey(leafCertificate),
              let publicKeyData = SecKeyCopyExternalRepresentation(publicKey, nil) as Data? else {
            log("Failed to extract public key")
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // Compute SHA-256 hash of public key
        let hash = publicKeyData.sha256Base64()

        // Verify against pinned hashes
        if pinnedHashes.contains(hash) {
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
        } else {
            log("Certificate pinning failed! Expected one of: \(pinnedHashes), got: \(hash)")
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }
}

// MARK: - Data SHA-256 Extension

extension Data {
    /// Compute SHA-256 hash and return as Base64 string
    func sha256Base64() -> String {
        var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        self.withUnsafeBytes { bufferPointer in
            _ = CC_SHA256(bufferPointer.baseAddress, CC_LONG(self.count), &hash)
        }
        return Data(hash).base64EncodedString()
    }
}

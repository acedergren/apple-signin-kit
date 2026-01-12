// Combine+Extensions.swift
// Combine framework extensions for reactive authentication

import Combine
import Foundation

// MARK: - Publisher Extensions

public extension Publisher {

    /// Retry a publisher with exponential backoff.
    ///
    /// - Parameters:
    ///   - maxRetries: Maximum number of retry attempts
    ///   - initialDelay: Initial delay before first retry (default: 1 second)
    ///   - maxDelay: Maximum delay between retries (default: 30 seconds)
    ///   - shouldRetry: Closure to determine if an error should be retried
    /// - Returns: A publisher that retries with backoff
    func retryWithBackoff(
        maxRetries: Int,
        initialDelay: TimeInterval = 1.0,
        maxDelay: TimeInterval = 30.0,
        shouldRetry: @escaping (Error) -> Bool = { _ in true }
    ) -> AnyPublisher<Output, Failure> {
        self
            .catch { error -> AnyPublisher<Output, Failure> in
                guard shouldRetry(error) else {
                    return Fail(error: error).eraseToAnyPublisher()
                }

                var currentRetry = 0
                var currentDelay = initialDelay

                return Just(())
                    .flatMap { _ -> AnyPublisher<Output, Failure> in
                        if currentRetry >= maxRetries {
                            return Fail(error: error).eraseToAnyPublisher()
                        }

                        currentRetry += 1
                        currentDelay = min(currentDelay * 2, maxDelay)

                        return Just(())
                            .delay(for: .seconds(currentDelay), scheduler: DispatchQueue.main)
                            .flatMap { _ in self }
                            .eraseToAnyPublisher()
                    }
                    .eraseToAnyPublisher()
            }
            .eraseToAnyPublisher()
    }

    /// Convert a publisher to use async/await.
    ///
    /// - Returns: The first value or throws an error
    func asyncFirst() async throws -> Output where Failure == Error {
        try await withCheckedThrowingContinuation { continuation in
            var cancellable: AnyCancellable?
            var finished = false

            cancellable = first()
                .sink(
                    receiveCompletion: { completion in
                        guard !finished else { return }
                        finished = true

                        switch completion {
                        case .finished:
                            break
                        case .failure(let error):
                            continuation.resume(throwing: error)
                        }
                        cancellable?.cancel()
                    },
                    receiveValue: { value in
                        guard !finished else { return }
                        finished = true
                        continuation.resume(returning: value)
                        cancellable?.cancel()
                    }
                )
        }
    }
}

// MARK: - Auth State Publisher

/// A publisher that emits authentication state changes.
@MainActor
public class AuthStatePublisher: ObservableObject {

    /// Current authentication state
    @Published public private(set) var state: AuthState = .unauthenticated

    /// Current user (nil if not authenticated)
    @Published public private(set) var user: AuthUser?

    /// Whether the user is authenticated
    public var isAuthenticated: Bool {
        if case .authenticated = state {
            return user != nil
        }
        return false
    }

    private var cancellables = Set<AnyCancellable>()

    public init() {
        // Subscribe to AuthManager state changes
        AppleSignInKit.shared.authManager.$authState
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                self?.state = state
                if case .authenticated(let user) = state {
                    self?.user = user
                } else {
                    self?.user = nil
                }
            }
            .store(in: &cancellables)
    }

    /// Publisher for state changes
    public var statePublisher: AnyPublisher<AuthState, Never> {
        $state.eraseToAnyPublisher()
    }

    /// Publisher for user changes
    public var userPublisher: AnyPublisher<AuthUser?, Never> {
        $user.eraseToAnyPublisher()
    }

    /// Publisher that emits when the user signs in
    public var signInPublisher: AnyPublisher<AuthUser, Never> {
        $user
            .compactMap { $0 }
            .eraseToAnyPublisher()
    }

    /// Publisher that emits when the user signs out
    public var signOutPublisher: AnyPublisher<Void, Never> {
        $state
            .filter { state in
                if case .unauthenticated = state {
                    return true
                }
                return false
            }
            .map { _ in () }
            .eraseToAnyPublisher()
    }
}

// MARK: - Async Sequence Extensions

public extension AsyncSequence {

    /// Collect all elements into an array.
    ///
    /// - Returns: Array of all elements
    func collect() async throws -> [Element] {
        var results: [Element] = []
        for try await element in self {
            results.append(element)
        }
        return results
    }

    /// Get the first element, or nil if the sequence is empty.
    ///
    /// - Returns: The first element or nil
    func first() async throws -> Element? {
        for try await element in self {
            return element
        }
        return nil
    }
}

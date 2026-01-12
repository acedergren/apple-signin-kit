// AppleSignInButton.swift
// SwiftUI Apple Sign-In button component

import SwiftUI
import AuthenticationServices

// MARK: - AppleSignInButton

/// A customizable Apple Sign-In button for SwiftUI.
///
/// This button provides a native-looking Apple Sign-In experience with
/// built-in loading state handling and callback support.
///
/// ## Basic Usage
/// ```swift
/// AppleSignInButton()
///     .onSignIn { user in
///         print("Welcome \(user.email ?? "User")")
///     }
/// ```
///
/// ## Customized Usage
/// ```swift
/// AppleSignInButton(
///     type: .signUp,
///     style: .white,
///     cornerRadius: 12
/// )
/// .onSignIn { user in
///     navigateToHome()
/// }
/// .onError { error in
///     showError(error)
/// }
/// ```
public struct AppleSignInButton: View {

    // MARK: - Configuration

    /// Button label type
    public enum LabelType {
        case signIn
        case signUp
        case `continue`

        var asAuthButtonType: ASAuthorizationAppleIDButton.ButtonType {
            switch self {
            case .signIn: return .signIn
            case .signUp: return .signUp
            case .continue: return .continue
            }
        }
    }

    /// Button style
    public enum ButtonStyle {
        case black
        case white
        case whiteOutline

        var asAuthButtonStyle: ASAuthorizationAppleIDButton.Style {
            switch self {
            case .black: return .black
            case .white: return .white
            case .whiteOutline: return .whiteOutline
            }
        }
    }

    // MARK: - Properties

    private let type: LabelType
    private let style: ButtonStyle
    private let cornerRadius: CGFloat

    @StateObject private var viewModel = AppleSignInButtonViewModel()

    // Callbacks
    private var onSignIn: ((AuthUser) -> Void)?
    private var onError: ((Error) -> Void)?
    private var onCancel: (() -> Void)?

    // MARK: - Initialization

    /// Create an Apple Sign-In button.
    ///
    /// - Parameters:
    ///   - type: The button label type (default: .signIn)
    ///   - style: The button visual style (default: .black)
    ///   - cornerRadius: Corner radius for the button (default: 8)
    public init(
        type: LabelType = .signIn,
        style: ButtonStyle = .black,
        cornerRadius: CGFloat = 8
    ) {
        self.type = type
        self.style = style
        self.cornerRadius = cornerRadius
    }

    // MARK: - Body

    public var body: some View {
        Group {
            if viewModel.isLoading {
                loadingView
            } else {
                signInButton
            }
        }
        .frame(height: 50)
        .onChange(of: viewModel.signedInUser) { _, user in
            if let user = user {
                onSignIn?(user)
            }
        }
        .onChange(of: viewModel.error) { _, error in
            if let error = error {
                if case AuthError.appleSignInFailed(.canceled) = error {
                    onCancel?()
                } else {
                    onError?(error)
                }
            }
        }
    }

    // MARK: - Subviews

    private var signInButton: some View {
        SignInWithAppleButtonRepresentable(
            type: type.asAuthButtonType,
            style: style.asAuthButtonStyle,
            cornerRadius: cornerRadius
        ) {
            Task {
                await viewModel.signIn()
            }
        }
    }

    private var loadingView: some View {
        HStack(spacing: 8) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: loadingTextColor))

            Text("Signing in...")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(loadingTextColor)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 50)
        .background(loadingBackgroundColor)
        .cornerRadius(cornerRadius)
    }

    private var loadingBackgroundColor: Color {
        switch style {
        case .black:
            return Color.black.opacity(0.8)
        case .white, .whiteOutline:
            return Color.white.opacity(0.8)
        }
    }

    private var loadingTextColor: Color {
        switch style {
        case .black:
            return .white
        case .white, .whiteOutline:
            return .black
        }
    }

    // MARK: - Modifiers

    /// Called when sign-in succeeds.
    ///
    /// - Parameter action: Closure called with the authenticated user
    /// - Returns: Modified button
    public func onSignIn(_ action: @escaping (AuthUser) -> Void) -> AppleSignInButton {
        var button = self
        button.onSignIn = action
        return button
    }

    /// Called when sign-in fails with an error.
    ///
    /// - Parameter action: Closure called with the error
    /// - Returns: Modified button
    public func onError(_ action: @escaping (Error) -> Void) -> AppleSignInButton {
        var button = self
        button.onError = action
        return button
    }

    /// Called when the user cancels sign-in.
    ///
    /// - Parameter action: Closure called when canceled
    /// - Returns: Modified button
    public func onCancel(_ action: @escaping () -> Void) -> AppleSignInButton {
        var button = self
        button.onCancel = action
        return button
    }
}

// MARK: - ViewModel

@MainActor
private class AppleSignInButtonViewModel: ObservableObject {
    @Published var isLoading = false
    @Published var signedInUser: AuthUser?
    @Published var error: AuthError?

    func signIn() async {
        isLoading = true
        error = nil
        signedInUser = nil

        do {
            let user = try await AppleSignInKit.shared.signIn()
            signedInUser = user
        } catch let authError as AuthError {
            error = authError
        } catch let appleError as AppleSignInError {
            error = .appleSignInFailed(appleError)
        } catch {
            self.error = .serverError(error.localizedDescription)
        }

        isLoading = false
    }
}

// MARK: - UIViewRepresentable

private struct SignInWithAppleButtonRepresentable: UIViewRepresentable {
    let type: ASAuthorizationAppleIDButton.ButtonType
    let style: ASAuthorizationAppleIDButton.Style
    let cornerRadius: CGFloat
    let onTap: () -> Void

    func makeUIView(context: Context) -> ASAuthorizationAppleIDButton {
        let button = ASAuthorizationAppleIDButton(type: type, style: style)
        button.cornerRadius = cornerRadius
        button.addTarget(context.coordinator, action: #selector(Coordinator.handleTap), for: .touchUpInside)
        return button
    }

    func updateUIView(_ uiView: ASAuthorizationAppleIDButton, context: Context) {
        uiView.cornerRadius = cornerRadius
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onTap: onTap)
    }

    class Coordinator: NSObject {
        let onTap: () -> Void

        init(onTap: @escaping () -> Void) {
            self.onTap = onTap
        }

        @objc func handleTap() {
            onTap()
        }
    }
}

// MARK: - Custom Styled Button

/// A custom-styled Apple Sign-In button that doesn't use ASAuthorizationAppleIDButton.
///
/// Use this when you need more control over the button appearance while still
/// following Apple's Human Interface Guidelines.
public struct CustomAppleSignInButton: View {

    // MARK: - Properties

    private let title: String
    private let showIcon: Bool
    private let backgroundColor: Color
    private let foregroundColor: Color
    private let cornerRadius: CGFloat
    private let action: () async -> Void

    @State private var isLoading = false

    // MARK: - Initialization

    /// Create a custom Apple Sign-In button.
    ///
    /// - Parameters:
    ///   - title: Button title (default: "Sign in with Apple")
    ///   - showIcon: Whether to show the Apple logo (default: true)
    ///   - backgroundColor: Button background color (default: .black)
    ///   - foregroundColor: Button text/icon color (default: .white)
    ///   - cornerRadius: Corner radius (default: 8)
    ///   - action: Async action to perform on tap
    public init(
        title: String = "Sign in with Apple",
        showIcon: Bool = true,
        backgroundColor: Color = .black,
        foregroundColor: Color = .white,
        cornerRadius: CGFloat = 8,
        action: @escaping () async -> Void
    ) {
        self.title = title
        self.showIcon = showIcon
        self.backgroundColor = backgroundColor
        self.foregroundColor = foregroundColor
        self.cornerRadius = cornerRadius
        self.action = action
    }

    // MARK: - Body

    public var body: some View {
        Button {
            Task {
                isLoading = true
                await action()
                isLoading = false
            }
        } label: {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: foregroundColor))
                } else {
                    if showIcon {
                        Image(systemName: "apple.logo")
                            .font(.system(size: 18, weight: .medium))
                    }

                    Text(isLoading ? "Signing in..." : title)
                        .font(.system(size: 17, weight: .semibold))
                }
            }
            .foregroundColor(foregroundColor)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(backgroundColor.opacity(isLoading ? 0.8 : 1.0))
            .cornerRadius(cornerRadius)
        }
        .disabled(isLoading)
    }
}

// MARK: - Preview

#if DEBUG
struct AppleSignInButton_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 20) {
            AppleSignInButton()
                .padding(.horizontal)

            AppleSignInButton(type: .signUp, style: .white)
                .padding(.horizontal)

            AppleSignInButton(type: .continue, style: .whiteOutline)
                .padding(.horizontal)

            CustomAppleSignInButton {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
            .padding(.horizontal)
        }
        .padding(.vertical)
        .background(Color.gray.opacity(0.2))
    }
}
#endif

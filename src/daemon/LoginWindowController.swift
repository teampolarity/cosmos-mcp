// Native sign-in window — magic code + Sign in with Apple (no WKWebView).

import AppKit
import AuthenticationServices

final class LoginWindowController: NSWindowController, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private enum Step {
        case email
        case code
        case waitlist
    }

    private var onSuccess: (() -> Void)?
    private var step: Step = .email
    private var pendingEmail = ""

    private var titleLabel: NSTextField!
    private var subtitleLabel: NSTextField!
    private var emailField: NSTextField!
    private var codeField: NSTextField!
    private var errorLabel: NSTextField!
    private var primaryButton: NSButton!
    private var appleButton: NSButton!
    private var backButton: NSButton!
    private var waitlistLabel: NSTextField!
    private var stackView: NSStackView!

    init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 400, height: 460),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Cosmos"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.isReleasedWhenClosed = false

        let visualEffect = NSVisualEffectView()
        visualEffect.blendingMode = .behindWindow
        visualEffect.state = .active
        visualEffect.material = .hudWindow
        visualEffect.autoresizingMask = [.width, .height]
        window.contentView = visualEffect

        super.init(window: window)
        buildUI()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    func present(onSuccess: @escaping () -> Void) {
        self.onSuccess = onSuccess
        step = .email
        pendingEmail = ""
        emailField.stringValue = ""
        codeField.stringValue = ""
        errorLabel.stringValue = ""
        renderStep()
        window?.center()
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }

    private func buildUI() {
        guard let content = window?.contentView else { return }

        titleLabel = label("cosmos", size: 28, weight: .medium, color: .white)
        subtitleLabel = label("cosmos for mac — sign in to continue", size: 11, weight: .regular, color: NSColor(white: 0.55, alpha: 1))
        emailField = field(placeholder: "you@somewhere.com")
        codeField = field(placeholder: "000000")
        codeField.isHidden = true
        errorLabel = label("", size: 11, weight: .regular, color: NSColor.systemRed)
        errorLabel.maximumNumberOfLines = 4

        appleButton = NSButton(title: "Continue with Apple", target: self, action: #selector(startAppleSignIn))
        styleSecondary(appleButton)

        primaryButton = NSButton(title: "Send code", target: self, action: #selector(primaryAction))
        stylePrimary(primaryButton)

        backButton = NSButton(title: "Use a different email", target: self, action: #selector(showEmailStep))
        styleLink(backButton)
        backButton.isHidden = true

        waitlistLabel = label(
            "You are signed in, but Cosmos is invite-only right now. Join the waitlist at cosmos.polarity-lab.com or return with an invite code.",
            size: 12,
            weight: .regular,
            color: NSColor(white: 0.7, alpha: 1)
        )
        waitlistLabel.isHidden = true
        waitlistLabel.maximumNumberOfLines = 0

        stackView = NSStackView(views: [
            titleLabel,
            subtitleLabel,
            appleButton,
            separator(),
            emailField,
            codeField,
            errorLabel,
            primaryButton,
            backButton,
            waitlistLabel,
        ])
        stackView.orientation = .vertical
        stackView.alignment = .leading
        stackView.spacing = 12
        stackView.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(stackView)

        NSLayoutConstraint.activate([
            stackView.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 28),
            stackView.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -28),
            stackView.topAnchor.constraint(equalTo: content.topAnchor, constant: 54),
            emailField.widthAnchor.constraint(equalTo: stackView.widthAnchor),
            codeField.widthAnchor.constraint(equalTo: stackView.widthAnchor),
            primaryButton.widthAnchor.constraint(equalTo: stackView.widthAnchor),
            appleButton.widthAnchor.constraint(equalTo: stackView.widthAnchor),
        ])
    }

    private func label(_ text: String, size: CGFloat, weight: NSFont.Weight, color: NSColor) -> NSTextField {
        let field = NSTextField(labelWithString: text)
        field.font = NSFont.systemFont(ofSize: size, weight: weight)
        field.textColor = color
        field.alignment = .left
        return field
    }

    private func field(placeholder: String) -> NSTextField {
        let field = NSTextField(string: "")
        field.placeholderString = placeholder
        field.font = NSFont.systemFont(ofSize: 14)
        field.textColor = .white
        field.backgroundColor = NSColor(white: 0.08, alpha: 1)
        field.isBordered = true
        field.focusRingType = .none
        field.bezelStyle = .roundedBezel
        return field
    }

    private func separator() -> NSView {
        let wrap = NSView()
        wrap.translatesAutoresizingMaskIntoConstraints = false
        let line = NSBox()
        line.boxType = .separator
        line.translatesAutoresizingMaskIntoConstraints = false
        let orLabel = NSTextField(labelWithString: "OR")
        orLabel.font = NSFont.systemFont(ofSize: 10, weight: .medium)
        orLabel.textColor = NSColor(white: 0.45, alpha: 1)
        orLabel.translatesAutoresizingMaskIntoConstraints = false
        wrap.addSubview(line)
        wrap.addSubview(orLabel)
        NSLayoutConstraint.activate([
            wrap.heightAnchor.constraint(equalToConstant: 20),
            wrap.widthAnchor.constraint(equalToConstant: 344),
            line.leadingAnchor.constraint(equalTo: wrap.leadingAnchor),
            line.trailingAnchor.constraint(equalTo: wrap.trailingAnchor),
            line.centerYAnchor.constraint(equalTo: wrap.centerYAnchor),
            orLabel.centerXAnchor.constraint(equalTo: wrap.centerXAnchor),
            orLabel.centerYAnchor.constraint(equalTo: wrap.centerYAnchor),
        ])
        return wrap
    }

    private func stylePrimary(_ button: NSButton) {
        button.bezelStyle = .rounded
        button.controlSize = .large
        button.font = NSFont.systemFont(ofSize: 12, weight: .semibold)
        button.contentTintColor = NSColor(red: 0.498, green: 0.929, blue: 0.780, alpha: 1)
    }

    private func styleSecondary(_ button: NSButton) {
        button.bezelStyle = .rounded
        button.controlSize = .large
        button.font = NSFont.systemFont(ofSize: 12, weight: .medium)
    }

    private func styleLink(_ button: NSButton) {
        button.isBordered = false
        button.font = NSFont.systemFont(ofSize: 11)
        button.contentTintColor = NSColor(white: 0.55, alpha: 1)
    }

    private func renderStep() {
        switch step {
        case .email:
            subtitleLabel.stringValue = "cosmos for mac — sign in to continue"
            emailField.isHidden = false
            codeField.isHidden = true
            backButton.isHidden = true
            waitlistLabel.isHidden = true
            appleButton.isHidden = false
            primaryButton.title = "Send code"
            primaryButton.isHidden = false
        case .code:
            subtitleLabel.stringValue = "Check your inbox for a six-digit code"
            emailField.isHidden = true
            codeField.isHidden = false
            backButton.isHidden = false
            waitlistLabel.isHidden = true
            appleButton.isHidden = true
            primaryButton.title = "Verify"
            primaryButton.isHidden = false
        case .waitlist:
            subtitleLabel.stringValue = "invite-only beta"
            emailField.isHidden = true
            codeField.isHidden = true
            backButton.isHidden = true
            waitlistLabel.isHidden = false
            appleButton.isHidden = true
            primaryButton.isHidden = true
        }
    }

    @objc private func showEmailStep() {
        step = .email
        errorLabel.stringValue = ""
        renderStep()
    }

    @objc private func primaryAction() {
        errorLabel.stringValue = ""
        switch step {
        case .email:
            sendCode()
        case .code:
            verifyCode()
        case .waitlist:
            break
        }
    }

    private func sendCode() {
        let email = emailField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard email.contains("@"), email.contains(".") else {
            errorLabel.stringValue = "Enter a valid email"
            return
        }
        pendingEmail = email
        setLoading(true)
        CosmosAuthClient.requestCode(email: email) { [weak self] result in
            guard let self else { return }
            self.setLoading(false)
            switch result {
            case .success:
                self.step = .code
                self.codeField.stringValue = ""
                self.renderStep()
                self.window?.makeFirstResponder(self.codeField)
            case .failure(let err):
                self.errorLabel.stringValue = err.message
            }
        }
    }

    private func verifyCode() {
        let code = codeField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard code.count == 6, code.allSatisfy(\.isNumber) else {
            errorLabel.stringValue = "Enter the 6-digit code"
            return
        }
        setLoading(true)
        CosmosAuthClient.verifyCode(email: pendingEmail, code: code) { [weak self] result in
            guard let self else { return }
            self.setLoading(false)
            switch result {
            case .success(let session):
                self.finish(session: session)
            case .failure(let err):
                self.errorLabel.stringValue = err.message
            }
        }
    }

    @objc private func startAppleSignIn() {
        errorLabel.stringValue = ""
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.email, .fullName]
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        window ?? NSApp.windows.first ?? ASPresentationAnchor()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            errorLabel.stringValue = "Apple sign-in failed"
            return
        }
        setLoading(true)
        CosmosAuthClient.signInWithApple(identityToken: identityToken) { [weak self] result in
            guard let self else { return }
            self.setLoading(false)
            switch result {
            case .success(let session):
                self.finish(session: session)
            case .failure(let err):
                self.errorLabel.stringValue = err.message
            }
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let ns = error as NSError
        if ns.domain == ASAuthorizationError.errorDomain, ns.code == ASAuthorizationError.canceled.rawValue {
            return
        }
        errorLabel.stringValue = "Apple sign-in failed — try email instead"
    }

    private func finish(session: CosmosSession) {
        guard session.hasAppAccess else {
            CosmosAuthStore.save(session)
            step = .waitlist
            renderStep()
            return
        }
        CosmosAuthStore.save(session)
        window?.orderOut(nil)
        onSuccess?()
        onSuccess = nil
    }

    private func setLoading(_ loading: Bool) {
        primaryButton.isEnabled = !loading
        appleButton.isEnabled = !loading
        emailField.isEnabled = !loading
        codeField.isEnabled = !loading
        primaryButton.title = loading
            ? (step == .code ? "Verifying…" : "Sending…")
            : (step == .code ? "Verify" : "Send code")
    }
}

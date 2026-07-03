// Shared Cosmos GPS palette for native SwiftUI surfaces.

import SwiftUI

enum CosmosTheme {
    static let void = Color.black
    static let surface = Color(white: 0.04)
    static let surfaceRaised = Color(red: 0.067, green: 0.067, blue: 0.078)
    static let text = Color.white.opacity(0.92)
    static let textSecondary = Color.white.opacity(0.65)
    static let textMuted = Color.white.opacity(0.5)
    static let textFaint = Color.white.opacity(0.35)
    static let border = Color.white.opacity(0.08)
    static let accent = Color(red: 0.133, green: 0.827, blue: 0.933)
    static let accentDim = Color(red: 0.133, green: 0.827, blue: 0.933).opacity(0.14)
    static let ok = Color(red: 0.204, green: 0.827, blue: 0.6)
    static let err = Color(red: 0.973, green: 0.443, blue: 0.443)
    static let warn = Color(red: 0.984, green: 0.749, blue: 0.141)
}

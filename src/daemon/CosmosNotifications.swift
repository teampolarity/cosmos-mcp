// App-wide notifications for native Thread / Settings coordination.

import Foundation

extension Notification.Name {
    static let cosmosShowConnect = Notification.Name("cosmosShowConnect")
    static let cosmosRefreshThread = Notification.Name("cosmosRefreshThread")
    static let cosmosMcpKeyProvisioned = Notification.Name("cosmosMcpKeyProvisioned")
}

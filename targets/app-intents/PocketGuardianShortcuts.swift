import AppIntents
import Foundation
import UIKit

@available(iOS 17.0, *)
enum ShortcutSourceOption: String, AppEnum {
    case auto = "auto"
    case efingo = "efingo"
    case wallet = "wallet"
    case transferPage = "transfer_page"

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "消費來源")
    static var caseDisplayRepresentations: [ShortcutSourceOption: DisplayRepresentation] = [
        .auto: "自動判斷（推薦）",
        .efingo: "玉山銀行通知 (e.Fingo)",
        .wallet: "iOS 27 錢包 (Wallet / Apple Pay)",
        .transferPage: "轉帳成功畫面 (截圖 OCR)"
    ]
}

@available(iOS 17.0, *)
struct IngestNotificationIntent: AppIntent {
    static var title: LocalizedStringResource = "🛡️ 智慧入帳（接收錢包、通知或轉帳文字）"
    static var description = IntentDescription("支援 iOS 27「錢包 (Wallet)」自動化、玉山銀行通知與轉帳畫面 OCR。可直接用 AI 提示詞產生模塊或手動傳入商家與金額。")
    static var openAppWhenRun: Bool = false

    @Parameter(
        title: "通知或畫面文字",
        description: "選填：可傳入文字、通知或已擷取的文字",
        default: ""
    )
    var rawText: String

    @Parameter(
        title: "錢包 / Apple Pay 金額（選填）",
        description: "可選取「文字 (商家 數量)」、「通知」或「已擷取的文字」"
    )
    var amount: String?

    @Parameter(
        title: "錢包 / Apple Pay 商家（選填）",
        description: "可選取「文字 (商家 數量)」、「通知」或「已擷取的文字」"
    )
    var merchant: String?

    @Parameter(
        title: "畫面截圖影像（選填，AI 視覺辨識存/提圓圈）",
        description: "選填：可直接選取「螢幕快照」，由雲端 AI 視覺模型直接看圖辨識青色「存」字或橘色「提」字圓圈"
    )
    var screenshot: IntentFile?

    @Parameter(title: "來源通道", default: .auto)
    var source: ShortcutSourceOption

    @Parameter(title: "Cloudflare Webhook 網址", default: "https://pocket-guardian-api.mr-haibaoseal.workers.dev/api/ingest")
    var webhookUrl: String

    func perform() async throws -> some IntentResult & ProvidesDialog & ReturnsValue<String> {
        guard let url = URL(string: webhookUrl) else {
            return .result(value: "網址格式錯誤", dialog: "⚠️ Webhook 網址格式錯誤")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var payload: [String: Any] = ["text": rawText]
        if let amount = amount, !amount.isEmpty {
            payload["amount"] = amount
        }
        if let merchant = merchant, !merchant.isEmpty {
            payload["merchant"] = merchant
        }
        if let screenshot = screenshot,
           let uiImage = UIImage(data: screenshot.data) {
            let maxDim: CGFloat = 900
            let scale = min(1.0, maxDim / max(uiImage.size.width, uiImage.size.height))
            let targetSize = CGSize(width: uiImage.size.width * scale, height: uiImage.size.height * scale)
            UIGraphicsBeginImageContextWithOptions(targetSize, true, 1.0)
            uiImage.draw(in: CGRect(origin: .zero, size: targetSize))
            let resized = UIGraphicsGetImageFromCurrentImageContext()
            UIGraphicsEndImageContext()
            if let jpegData = (resized ?? uiImage).jpegData(compressionQuality: 0.6) {
                payload["imageBase64"] = jpegData.base64EncodedString()
            }
        }
        if source != .auto {
            payload["source"] = source.rawValue
        }
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        let (data, _) = try await URLSession.shared.data(for: request)
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let message = json["message"] as? String {
            return .result(value: message, dialog: IntentDialog(stringLiteral: message))
        }
        return .result(value: "✅ 已傳送至錢呢[BROKE AF]", dialog: "✅ 已傳送至錢呢[BROKE AF]")
    }
}

@available(iOS 17.0, *)
struct CheckSafeToSpendIntent: AppIntent {
    static var title: LocalizedStringResource = "🔋 查詢今日安全額度"
    static var description = IntentDescription("查詢今天還能花多少錢與目前財力電量百分比。")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Cloudflare Summary 網址", default: "https://pocket-guardian-api.mr-haibaoseal.workers.dev/api/widget-summary")
    var summaryUrl: String

    func perform() async throws -> some IntentResult & ProvidesDialog & ReturnsValue<String> {
        guard let url = URL(string: summaryUrl) else {
            return .result(value: "網址錯誤", dialog: "⚠️ 網址錯誤")
        }
        let (data, _) = try await URLSession.shared.data(from: url)
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let widget = json["widget"] as? [String: Any],
           let todayLeft = widget["todayLeft"] as? Int,
           let battery = widget["batteryPercent"] as? Int {
            let text = "🔋 今日財力 \(battery)%｜還可花 $\(todayLeft)"
            return .result(value: text, dialog: IntentDialog(stringLiteral: text))
        }
        return .result(value: "無法取得額度", dialog: "⚠️ 無法取得今日安全額度")
    }
}

@available(iOS 17.0, *)
struct PocketGuardianShortcutsProvider: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: IngestNotificationIntent(),
            phrases: [
                "用 \(.applicationName) 智慧入帳",
                "傳送通知到 \(.applicationName)"
            ],
            shortTitle: "🛡️ 智慧入帳",
            systemImageName: "shield.checkered"
        )
        AppShortcut(
            intent: CheckSafeToSpendIntent(),
            phrases: [
                "查詢 \(.applicationName) 今日安全額度",
                "今天還能花多少錢 \(.applicationName)"
            ],
            shortTitle: "🔋 查今日額度",
            systemImageName: "battery.100.bolt"
        )
    }
}

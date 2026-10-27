import AppIntents
import Foundation

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
        .wallet: "Apple Pay 錢包通知",
        .transferPage: "玉山轉帳成功畫面 (OCR)"
    ]
}

@available(iOS 17.0, *)
struct IngestNotificationIntent: AppIntent {
    static var title: LocalizedStringResource = "🛡️ 智慧入帳（接收通知或轉帳文字）"
    static var description = IntentDescription("將 iOS 27 玉山銀行通知、Apple Pay 通知或轉帳成功畫面文字直接送入防打架引擎，背景執行不跳轉畫面。")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "通知或畫面文字")
    var rawText: String

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
        if source != .auto {
            payload["source"] = source.rawValue
        }
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        let (data, _) = try await URLSession.shared.data(for: request)
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let message = json["message"] as? String {
            return .result(value: message, dialog: IntentDialog(stringLiteral: message))
        }
        return .result(value: "✅ 已傳送至守財靈", dialog: "✅ 已傳送至守財靈")
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

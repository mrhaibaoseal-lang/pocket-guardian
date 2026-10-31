import AppIntents
import CoreGraphics
import Foundation
import SwiftUI
import UIKit
import UserNotifications
import Vision
import WidgetKit

@objc(PocketWidgetReloader)
public class PocketWidgetReloader: NSObject {
    @objc public static func reloadAllWithDelay() {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                WidgetCenter.shared.reloadAllTimelines()
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) {
                WidgetCenter.shared.reloadAllTimelines()
            }
        }
    }
}

@available(iOS 17.0, *)
enum ShortcutBannerMode: String, AppEnum {
    case richSnippet = "rich_snippet"
    case nativeNotification = "native_notification"

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "頂部通知樣式")
    static var caseDisplayRepresentations: [ShortcutBannerMode: DisplayRepresentation] = [
        .richSnippet: "✨ 黑曜毛玻璃字卡（捷徑預設）",
        .nativeNotification: "🔔 iOS 原生橫幅推播（免按完成・4秒自動收起）"
    ]
}

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
    static var title: LocalizedStringResource = "🛡️ 智慧入帳"
    static var description = IntentDescription("接收錢包、銀行通知或螢幕快照截圖自動記帳。")
    static var openAppWhenRun: Bool = false

    @Parameter(
        title: "畫面截圖影像",
        description: "選填：螢幕快照原圖"
    )
    var screenshot: IntentFile?

    @Parameter(
        title: "通知或畫面文字",
        description: "選填：通知或畫面文字",
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

    @Parameter(title: "來源通道", default: .auto)
    var source: ShortcutSourceOption

    @Parameter(title: "頂部通知樣式", default: .richSnippet)
    var bannerMode: ShortcutBannerMode

    @Parameter(title: "Cloudflare Webhook 網址", default: "https://pocket-guardian-api.mr-haibaoseal.workers.dev/api/ingest")
    var webhookUrl: String

    private func detectCircleBadgeKind(cgImage: CGImage, amountBox: CGRect) -> String? {
        let width = cgImage.width
        let height = cgImage.height
        guard width > 40, height > 40 else { return nil }

        let centerY = 1.0 - amountBox.midY
        let bandHalfH = max(0.018, amountBox.height * 0.7)
        let yStart = max(0, Int((centerY - bandHalfH) * Double(height)))
        let yEnd = min(height - 1, Int((centerY + bandHalfH) * Double(height)))
        let xStart = max(0, Int(0.03 * Double(width)))
        let xEnd = min(width - 1, Int(max(0.28, amountBox.minX) * Double(width)))
        guard xEnd > xStart, yEnd > yStart else { return nil }

        let cropRect = CGRect(x: xStart, y: yStart, width: xEnd - xStart, height: yEnd - yStart)
        guard let cropped = cgImage.cropping(to: cropRect) else { return nil }

        let cw = cropped.width
        let ch = cropped.height
        var rawData = [UInt8](repeating: 0, count: cw * ch * 4)
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(
            data: &rawData,
            width: cw,
            height: ch,
            bitsPerComponent: 8,
            bytesPerRow: cw * 4,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        ctx.draw(cropped, in: CGRect(x: 0, y: 0, width: cw, height: ch))

        var tealCount = 0
        var orangeRedCount = 0
        for i in stride(from: 0, to: rawData.count, by: 4) {
            let r = Int(rawData[i])
            let g = Int(rawData[i + 1])
            let b = Int(rawData[i + 2])
            if g > 125 && b > 115 && r < 95 && (g - r) > 45 && (b - r) > 35 {
                tealCount += 1
            }
            if r > 175 && b < 120 && (r - b) > 65 && (r - g) > 25 {
                orangeRedCount += 1
            }
        }

        let minPixels = max(12, (cw * ch) / 45)
        if tealCount >= minPixels && tealCount > orangeRedCount * 2 {
            return "存"
        }
        if orangeRedCount >= minPixels && orangeRedCount > tealCount * 2 {
            return "提"
        }
        return nil
    }

    private func analyzeScreenshotImage(_ uiImage: UIImage) -> (ocrText: String, base64Jpeg: String?) {
        var base64Jpeg: String? = nil
        let maxDim: CGFloat = 900
        let scale = min(1.0, maxDim / max(uiImage.size.width, uiImage.size.height))
        let targetSize = CGSize(width: uiImage.size.width * scale, height: uiImage.size.height * scale)
        UIGraphicsBeginImageContextWithOptions(targetSize, true, 1.0)
        uiImage.draw(in: CGRect(origin: .zero, size: targetSize))
        let resized = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()
        if let jpegData = (resized ?? uiImage).jpegData(compressionQuality: 0.6) {
            base64Jpeg = jpegData.base64EncodedString()
        }

        guard let cgImage = uiImage.cgImage else {
            return ("", base64Jpeg)
        }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["zh-Hant", "zh-Hans", "en-US"]
        request.usesLanguageCorrection = true

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        try? handler.perform([request])

        let observations = (request.results ?? []).sorted { a, b in
            if abs(a.boundingBox.midY - b.boundingBox.midY) > 0.014 {
                return a.boundingBox.midY > b.boundingBox.midY
            }
            return a.boundingBox.minX < b.boundingBox.minX
        }

        var lines: [String] = []
        var sawDateLine = false
        var badgeResolved = false

        for obs in observations {
            guard let top = obs.topCandidates(1).first else { continue }
            var line = top.string.trimmingCharacters(in: .whitespacesAndNewlines)
            if line.isEmpty { continue }

            if line.range(of: #"\d{4}[/-]\d{1,2}[/-]\d{1,2}"#, options: .regularExpression) != nil {
                sawDateLine = true
            } else if sawDateLine && !badgeResolved &&
                      line.range(of: #"^[+-]?\s*(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$"#, options: .regularExpression) != nil {
                badgeResolved = true
                if let badge = detectCircleBadgeKind(cgImage: cgImage, amountBox: obs.boundingBox) {
                    line = "\(badge) \(line)"
                }
            }
            lines.append(line)
        }

        return (lines.joined(separator: "\n"), base64Jpeg)
    }

    private func sendNativeBanner(title: String, subtitle: String, body: String) async {
        let center = UNUserNotificationCenter.current()
        _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        let content = UNMutableNotificationContent()
        content.title = title
        if !subtitle.isEmpty {
            content.subtitle = subtitle
        }
        content.body = body
        content.sound = .default
        let req = UNNotificationRequest(
            identifier: "imbrokeaf.ingest.\(UUID().uuidString)",
            content: content,
            trigger: nil
        )
        try? await center.add(req)
    }

    func perform() async throws -> some IntentResult & ProvidesDialog & ReturnsValue<String> & ShowsSnippetView {
        guard let url = URL(string: webhookUrl) else {
            let errModel = IngestSnippetModel(
                status: "error",
                badgeText: "設定錯誤",
                merchant: "Webhook 網址格式錯誤",
                category: "請檢查捷徑網址設定",
                amountText: "--",
                isIncome: false,
                todayLeft: nil,
                batteryPercent: nil,
                bankBalance: nil
            )
            return .result(
                value: "網址格式錯誤",
                dialog: IntentDialog(stringLiteral: "靠北我錢呢 · 設定錯誤"),
                view: IngestResultSnippetView(model: errModel)
            )
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var effectiveText = rawText
        var payload: [String: Any] = [:]

        if let screenshot = screenshot,
           let uiImage = UIImage(data: screenshot.data) {
            let analyzed = analyzeScreenshotImage(uiImage)
            if let b64 = analyzed.base64Jpeg {
                payload["imageBase64"] = b64
            }
            if effectiveText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !analyzed.ocrText.isEmpty {
                effectiveText = analyzed.ocrText
            }
        }

        payload["text"] = effectiveText
        if let amount = amount, !amount.isEmpty {
            payload["amount"] = amount
        }
        if let merchant = merchant, !merchant.isEmpty {
            payload["merchant"] = merchant
        }
        if source != .auto {
            payload["source"] = source.rawValue
        }
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        let (data, _) = try await URLSession.shared.data(for: request)
        WidgetCenter.shared.reloadAllTimelines()
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            let message = (json["message"] as? String) ?? "✅ 已傳送至靠北我錢呢"
            let model = IngestSnippetModel.from(json: json, fallbackMessage: message)

            if bannerMode == .nativeNotification {
                await sendNativeBanner(
                    title: model.notificationTitle,
                    subtitle: model.notificationSubtitle,
                    body: model.notificationBody
                )
            }

            return .result(
                value: message,
                dialog: IntentDialog(stringLiteral: model.compactDialogHeader),
                view: IngestResultSnippetView(model: model)
            )
        }

        let fallback = IngestSnippetModel(
            status: "new_tx",
            badgeText: "已連線",
            merchant: "已傳送至靠北我錢呢",
            category: "雲端同步完成",
            amountText: "OK",
            isIncome: false,
            todayLeft: nil,
            batteryPercent: nil,
            bankBalance: nil
        )
        return .result(
            value: "✅ 已傳送至靠北我錢呢[ImbrokeAF]",
            dialog: IntentDialog(stringLiteral: "靠北我錢呢 · ImbrokeAF"),
            view: IngestResultSnippetView(model: fallback)
        )
    }
}

@available(iOS 17.0, *)
struct IngestSnippetModel {
    let status: String
    let badgeText: String
    let merchant: String
    let category: String
    let amountText: String
    let isIncome: Bool
    let todayLeft: Int?
    let batteryPercent: Int?
    let bankBalance: Int?

    var compactDialogHeader: String {
        switch status {
        case "new_tx":
            return isIncome ? "靠北我錢呢 · 入帳成功" : "靠北我錢呢 · 已記一筆"
        case "merged_tx":
            return "靠北我錢呢 · 雙通道合體"
        case "duplicate":
            return "靠北我錢呢 · 已攔截重複"
        case "ignored":
            return "靠北我錢呢 · 已略過非消費"
        case "parse_failed":
            return "靠北我錢呢 · 未偵測到交易"
        default:
            return "靠北我錢呢 · ImbrokeAF"
        }
    }

    var notificationTitle: String {
        switch status {
        case "new_tx", "merged_tx":
            return "\(merchant)  \(amountText)"
        case "duplicate":
            return "🛡️ 已自動攔截重複觸發"
        case "ignored":
            return "🛡️ 已略過非消費通知"
        default:
            return "⚠️ 未偵測到交易或轉帳金額"
        }
    }

    var notificationSubtitle: String {
        switch status {
        case "new_tx":
            return "✓ 自動入帳 · \(category)"
        case "merged_tx":
            return "⚡ Apple Pay + 銀行推播自動合體"
        default:
            return ""
        }
    }

    var notificationBody: String {
        if let left = todayLeft, let bat = batteryPercent, let bank = bankBalance {
            return "🔋 今日還可花 $\(left)（\(bat)%）｜🏦 銀行 $\(bank)"
        }
        return category
    }

    static func from(json: [String: Any], fallbackMessage: String) -> IngestSnippetModel {
        let status = (json["status"] as? String) ?? "new_tx"
        let widget = json["widget"] as? [String: Any]
        let todayLeft = widget?["todayLeft"] as? Int
        let battery = widget?["batteryPercent"] as? Int
        let bankVal = (widget?["bank"] as? Double).map { Int($0) } ?? (widget?["bank"] as? Int)

        if let tx = json["transaction"] as? [String: Any] {
            let rawAmount = (tx["amount"] as? Int) ?? Int((tx["amount"] as? Double) ?? 0)
            let txType = (tx["type"] as? String) ?? "expense"
            let isInc = (txType == "income")
            let merch = (tx["merchant"] as? String) ?? "一般消費"
            let cat = (tx["category"] as? String) ?? "自動分類"
            let method = (tx["method"] as? String) ?? ""

            let methodLabel: String
            switch method {
            case "apple_pay": methodLabel = "Apple Pay · \(cat)"
            case "debit_card": methodLabel = "金融卡 · \(cat)"
            case "bank_transfer": methodLabel = isInc ? "銀行轉入 · \(cat)" : "網銀轉帳 · \(cat)"
            default: methodLabel = cat
            }

            let badge = (status == "merged_tx") ? "雙通道合體" : (isInc ? "收入入帳" : "自動入帳")
            let formattedAmt = isInc ? "+$\(rawAmount)" : "-$\(rawAmount)"

            return IngestSnippetModel(
                status: status,
                badgeText: badge,
                merchant: merch,
                category: methodLabel,
                amountText: formattedAmt,
                isIncome: isInc,
                todayLeft: todayLeft,
                batteryPercent: battery,
                bankBalance: bankVal
            )
        }

        if status == "duplicate" {
            return IngestSnippetModel(
                status: status,
                badgeText: "防重扣保護",
                merchant: "已攔截重複交易通知",
                category: "3 分鐘內相同交易不會重複扣款",
                amountText: "PASS",
                isIncome: false,
                todayLeft: todayLeft,
                batteryPercent: battery,
                bankBalance: bankVal
            )
        }

        if status == "ignored" {
            return IngestSnippetModel(
                status: status,
                badgeText: "智慧過濾",
                merchant: "已略過非消費或自己轉帳",
                category: "促銷廣告、驗證碼或內部轉帳不計支出",
                amountText: "SKIP",
                isIncome: false,
                todayLeft: todayLeft,
                batteryPercent: battery,
                bankBalance: bankVal
            )
        }

        if status == "parse_failed" {
            return IngestSnippetModel(
                status: status,
                badgeText: "未偵測到金額",
                merchant: "畫面中無交易或轉帳金額",
                category: "請在轉帳成功頁、存摺明細或通知觸發",
                amountText: "!",
                isIncome: false,
                todayLeft: todayLeft,
                batteryPercent: battery,
                bankBalance: bankVal
            )
        }

        return IngestSnippetModel(
            status: status,
            badgeText: "系統通知",
            merchant: fallbackMessage,
            category: "靠北我錢呢 · ImbrokeAF",
            amountText: "",
            isIncome: false,
            todayLeft: todayLeft,
            batteryPercent: battery,
            bankBalance: bankVal
        )
    }
}
@available(iOS 17.0, *)
struct IngestResultSnippetView: View {
    let model: IngestSnippetModel

    private var accentColor: Color {
        switch model.status {
        case "new_tx":
            return model.isIncome ? Color(red: 0.20, green: 0.83, blue: 0.60) : Color(red: 0.37, green: 0.92, blue: 0.83)
        case "merged_tx":
            return Color(red: 0.58, green: 0.77, blue: 0.99)
        case "duplicate", "ignored":
            return Color(red: 0.66, green: 0.55, blue: 0.98)
        default:
            return Color(red: 0.98, green: 0.75, blue: 0.14)
        }
    }

    private var iconName: String {
        switch model.status {
        case "new_tx": return model.isIncome ? "arrow.down.left.circle.fill" : "checkmark.circle.fill"
        case "merged_tx": return "bolt.horizontal.circle.fill"
        case "duplicate", "ignored": return "shield.lefthalf.filled.badge.checkmark"
        default: return "viewfinder.trianglebadge.exclamationmark"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                HStack(spacing: 5) {
                    Image(systemName: iconName)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(accentColor)
                    Text(model.badgeText)
                        .font(.system(size: 11, weight: .heavy, design: .rounded))
                        .foregroundColor(accentColor)
                }
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .background(accentColor.opacity(0.16))
                .clipShape(Capsule())
                Spacer()
                Text("靠北我錢呢 · ImbrokeAF")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundColor(Color(red: 0.58, green: 0.64, blue: 0.72))
            }

            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(model.merchant)
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Text(model.category)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color(red: 0.64, green: 0.70, blue: 0.78))
                        .lineLimit(1)
                }
                Spacer()
                if !model.amountText.isEmpty {
                    Text(model.amountText)
                        .font(.system(size: 24, weight: .black, design: .rounded))
                        .foregroundColor(model.isIncome ? Color(red: 0.20, green: 0.83, blue: 0.60) : (model.status == "parse_failed" ? accentColor : .white))
                }
            }

            if let todayLeft = model.todayLeft, let battery = model.batteryPercent {
                VStack(spacing: 5) {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Color.white.opacity(0.10)).frame(height: 6)
                            Capsule()
                                .fill(LinearGradient(
                                    colors: [Color(red: 0.37, green: 0.92, blue: 0.83), Color(red: 0.58, green: 0.77, blue: 0.99), Color(red: 0.66, green: 0.33, blue: 0.97)],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                ))
                                .frame(width: max(8, geo.size.width * CGFloat(min(max(battery, 0), 100)) / 100.0), height: 6)
                        }
                    }
                    .frame(height: 6)

                    HStack {
                        Text("🔋 今日還可花 $\(todayLeft)")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundColor(Color(red: 0.37, green: 0.92, blue: 0.83))
                        Spacer()
                        if let bank = model.bankBalance {
                            Text("🏦 銀行 $\(bank)")
                                .font(.system(size: 11, weight: .semibold, design: .rounded))
                                .foregroundColor(Color(red: 0.64, green: 0.70, blue: 0.78))
                        }
                    }
                }
                .padding(.top, 2)
            }
        }
        .padding(14)
        .background(LinearGradient(
            colors: [Color(red: 0.11, green: 0.14, blue: 0.21), Color(red: 0.06, green: 0.08, blue: 0.13)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        ))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(LinearGradient(
                    colors: [Color.white.opacity(0.32), Color(red: 0.37, green: 0.92, blue: 0.83).opacity(0.35), Color(red: 0.58, green: 0.20, blue: 0.92).opacity(0.28)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ), lineWidth: 1.2)
        )
        .padding(.horizontal, 4)
        .padding(.vertical, 2)
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
struct QuickRecordExpenseIntent: AppIntent {
    static var title: LocalizedStringResource = "⚡ 快速記一筆支出"
    static var description = IntentDescription("輸入金額與品項，直接背景寫入帳本並即時更新桌面小工具餘額。")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "消費金額 (NT$)")
    var amount: Int

    @Parameter(title: "品項或商家", default: "快速消費")
    var merchant: String

    @Parameter(title: "Cloudflare Webhook 網址", default: "https://pocket-guardian-api.mr-haibaoseal.workers.dev/api/ingest")
    var webhookUrl: String

    func perform() async throws -> some IntentResult & ProvidesDialog & ReturnsValue<String> {
        guard amount > 0, let url = URL(string: webhookUrl) else {
            return .result(value: "金額或網址錯誤", dialog: "⚠️ 請輸入大於 0 的金額")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let stamp = Int(Date().timeIntervalSince1970 * 1000)
        let payload: [String: Any] = [
            "source": "wallet",
            "amount": "\(amount)",
            "merchant": merchant,
            "text": "NT$\(amount) \(merchant) [shortcut:\(stamp)]"
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        let (data, _) = try await URLSession.shared.data(for: request)
        WidgetCenter.shared.reloadAllTimelines()

        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let widget = json["widget"] as? [String: Any],
           let todayLeft = widget["todayLeft"] as? Int,
           let bankVal = (widget["bank"] as? Double).map({ Int($0) }) ?? (widget["bank"] as? Int) {
            let msg = "✅ 已記 \(merchant) -$\(amount)｜🔋 今日還可花 $\(todayLeft)｜🏦 銀行 $\(bankVal)"
            return .result(value: msg, dialog: IntentDialog(stringLiteral: msg))
        }

        let fallback = "✅ 已記 \(merchant) -$\(amount)"
        return .result(value: fallback, dialog: IntentDialog(stringLiteral: fallback))
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
            intent: QuickRecordExpenseIntent(),
            phrases: [
                "用 \(.applicationName) 快速記帳",
                "在 \(.applicationName) 記一筆支出"
            ],
            shortTitle: "⚡ 快速記帳",
            systemImageName: "bolt.circle.fill"
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

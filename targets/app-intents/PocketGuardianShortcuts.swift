import AppIntents
import CoreGraphics
import Foundation
import UIKit
import Vision

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
    static var title: LocalizedStringResource = "🛡️ 智慧入帳（接收錢包、通知或轉帳截圖）"
    static var description = IntentDescription("支援直接傳入「螢幕快照」圖片（AI 直接看圖辨識青色存字/橘色提字圓圈與各家排版）、iOS 27「錢包」自動化與玉山銀行通知。")
    static var openAppWhenRun: Bool = false

    @Parameter(
        title: "畫面截圖影像（直接選取「螢幕快照」）",
        description: "推薦：截圖後直接選取「螢幕快照」原圖（不需先擷取文字），自動看圖辨識青色「存」或橘色「提」圓圈與金額"
    )
    var screenshot: IntentFile?

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

    @Parameter(title: "來源通道", default: .auto)
    var source: ShortcutSourceOption

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

    func perform() async throws -> some IntentResult & ProvidesDialog & ReturnsValue<String> {
        guard let url = URL(string: webhookUrl) else {
            return .result(value: "網址格式錯誤", dialog: "⚠️ Webhook 網址格式錯誤")
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

import AppIntents
import Foundation
import SwiftUI
import WidgetKit

// MARK: - Models & Local Cache

struct WidgetSummaryPayload: Codable {
    let todayLeft: Int
    let dailyAllowance: Int
    let batteryPercent: Int
    let weather: String
    let bank: Double
    let cash: Double
    let trueAvailable: Int
    let updatedAt: String
}

struct WidgetApiResponse: Decodable {
    let ok: Bool
    let widget: WidgetSummaryPayload?
}

enum PocketWidgetStorage {
    private static let payloadKey = "PG_WIDGET_CACHED_PAYLOAD_V2"
    private static let statusKey = "PG_WIDGET_STATUS_TEXT_V2"
    private static let statusTimeKey = "PG_WIDGET_STATUS_TIME_V2"
    private static let fetchedAtKey = "PG_WIDGET_FETCHED_AT_V2"

    static let fallbackPayload = WidgetSummaryPayload(
        todayLeft: 0,
        dailyAllowance: 0,
        batteryPercent: 100,
        weather: "green",
        bank: 0,
        cash: 0,
        trueAvailable: 0,
        updatedAt: ""
    )

    static func savePayload(_ payload: WidgetSummaryPayload, statusText: String? = nil) {
        let defaults = UserDefaults.standard
        if let data = try? JSONEncoder().encode(payload) {
            defaults.set(data, forKey: payloadKey)
            defaults.set(Date().timeIntervalSince1970, forKey: fetchedAtKey)
        }
        if let statusText = statusText {
            defaults.set(statusText, forKey: statusKey)
            defaults.set(Date().timeIntervalSince1970, forKey: statusTimeKey)
        }
    }

    static func loadCachedPayload() -> WidgetSummaryPayload {
        let defaults = UserDefaults.standard
        if let data = defaults.data(forKey: payloadKey),
           let decoded = try? JSONDecoder().decode(WidgetSummaryPayload.self, from: data) {
            return decoded
        }
        return fallbackPayload
    }

    static func isFreshWithin(seconds: TimeInterval) -> Bool {
        let ts = UserDefaults.standard.double(forKey: fetchedAtKey)
        guard ts > 0 else { return false }
        return (Date().timeIntervalSince1970 - ts) <= seconds
    }

    static func recentStatusText() -> String? {
        let defaults = UserDefaults.standard
        let ts = defaults.double(forKey: statusTimeKey)
        guard ts > 0, (Date().timeIntervalSince1970 - ts) <= 180 else {
            return nil
        }
        return defaults.string(forKey: statusKey)
    }

    static func workerBaseUrl() -> String {
        let custom = UserDefaults.standard.string(forKey: "PG_WORKER_URL") ?? ""
        let trimmed = custom.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            return trimmed
                .replacingOccurrences(of: "/api/widget-summary", with: "")
                .replacingOccurrences(of: "/api/ingest", with: "")
        }
        return "https://pocket-guardian-api.mr-haibaoseal.workers.dev"
    }
}

enum PocketWidgetFetcher {
    static func fetchLatest(statusOverride: String? = nil) async -> WidgetSummaryPayload {
        let base = PocketWidgetStorage.workerBaseUrl()
        let ts = Int(Date().timeIntervalSince1970 * 1000)
        guard let url = URL(string: "\(base)/api/widget-summary?t=\(ts)") else {
            return PocketWidgetStorage.loadCachedPayload()
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 8

        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            if let decoded = try? JSONDecoder().decode(WidgetApiResponse.self, from: data),
               let widget = decoded.widget {
                PocketWidgetStorage.savePayload(widget, statusText: statusOverride)
                return widget
            }
        } catch {
            // Fall back to last cached payload when offline
        }
        return PocketWidgetStorage.loadCachedPayload()
    }
}

// MARK: - Interactive Widget Intents (iOS 17+)

@available(iOS 17.0, *)
struct RefreshWidgetIntent: AppIntent {
    static var title: LocalizedStringResource = "🔄 即時刷新桌面餘額"
    static var description = IntentDescription("立即向雲端同步最新玉山銀行、現金與今日可用額度。")
    static var openAppWhenRun: Bool = false

    init() {}

    func perform() async throws -> some IntentResult {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        let timeStr = formatter.string(from: Date())
        _ = await PocketWidgetFetcher.fetchLatest(statusOverride: "✓ 同步 \(timeStr)")
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

@available(iOS 17.0, *)
struct QuickWidgetExpenseIntent: AppIntent {
    static var title: LocalizedStringResource = "⚡ 桌面閃電扣款"
    static var description = IntentDescription("免開 App 直接在桌面小工具記一筆常用消費並即時更新餘額。")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "金額")
    var amount: Int

    @Parameter(title: "品項名稱")
    var merchant: String

    @Parameter(title: "分類")
    var category: String

    init() {
        self.amount = 100
        self.merchant = "快速消費"
        self.category = "食物"
    }

    init(amount: Int, merchant: String, category: String) {
        self.amount = amount
        self.merchant = merchant
        self.category = category
    }

    func perform() async throws -> some IntentResult {
        let base = PocketWidgetStorage.workerBaseUrl()
        guard let url = URL(string: "\(base)/api/ingest") else {
            return .result()
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 8

        let stamp = Int(Date().timeIntervalSince1970 * 1000)
        let payload: [String: Any] = [
            "source": "wallet",
            "amount": "\(amount)",
            "merchant": merchant,
            "text": "NT$\(amount) \(merchant) [widget:\(stamp)]"
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            if let decoded = try? JSONDecoder().decode(WidgetApiResponse.self, from: data),
               let widget = decoded.widget {
                PocketWidgetStorage.savePayload(widget, statusText: "✓ \(merchant) -$\(amount)")
            } else {
                _ = await PocketWidgetFetcher.fetchLatest(statusOverride: "✓ \(merchant) -$\(amount)")
            }
        } catch {
            // Keep existing cache on network error
        }

        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

// MARK: - Timeline Provider

struct PocketEntry: TimelineEntry {
    let date: Date
    let payload: WidgetSummaryPayload
    let statusText: String?
}

struct PocketProvider: TimelineProvider {
    func placeholder(in context: Context) -> PocketEntry {
        PocketEntry(date: Date(), payload: PocketWidgetStorage.loadCachedPayload(), statusText: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (PocketEntry) -> Void) {
        completion(PocketEntry(date: Date(), payload: PocketWidgetStorage.loadCachedPayload(), statusText: PocketWidgetStorage.recentStatusText()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PocketEntry>) -> Void) {
        if PocketWidgetStorage.isFreshWithin(seconds: 3) {
            let now = Date()
            let cached = PocketWidgetStorage.loadCachedPayload()
            let status = PocketWidgetStorage.recentStatusText()
            let nextRefresh = Calendar.current.date(byAdding: .minute, value: 10, to: now) ?? now.addingTimeInterval(600)
            completion(Timeline(entries: [PocketEntry(date: now, payload: cached, statusText: status)], policy: .after(nextRefresh)))
            return
        }

        Task {
            let fresh = await PocketWidgetFetcher.fetchLatest()
            let now = Date()
            let status = PocketWidgetStorage.recentStatusText()
            let nextRefresh = Calendar.current.date(byAdding: .minute, value: 10, to: now) ?? now.addingTimeInterval(600)
            let timeline = Timeline(entries: [PocketEntry(date: now, payload: fresh, statusText: status)], policy: .after(nextRefresh))
            completion(timeline)
        }
    }
}

// MARK: - Helpers & Theme (Obsidian Platinum & Jade)

private func ledgerURL(_ path: String, category: String? = nil) -> URL {
    var comps = URLComponents()
    comps.scheme = "myledger"
    comps.host = path
    if let category = category, !category.isEmpty {
        comps.queryItems = [URLQueryItem(name: "category", value: category)]
    }
    return comps.url ?? URL(string: "myledger://dashboard")!
}

private func formatMoney(_ value: Double) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = 0
    let num = NSNumber(value: Int(value.rounded()))
    return formatter.string(from: num) ?? "\(Int(value.rounded()))"
}

private func formatIntMoney(_ value: Int) -> String {
    return formatMoney(Double(value))
}

private let obsidianBgTop = Color(red: 0.06, green: 0.09, blue: 0.11)
private let obsidianBgBottom = Color(red: 0.02, green: 0.04, blue: 0.05)
private let glassFill = Color.white.opacity(0.065)
private let glassStroke = Color.white.opacity(0.14)
private let jadePrimary = Color(red: 0.06, green: 0.73, blue: 0.51)
private let jadeBright = Color(red: 0.20, green: 0.83, blue: 0.60)
private let textPrimary = Color(red: 0.97, green: 0.98, blue: 0.99)
private let textSecondary = Color(red: 0.75, green: 0.80, blue: 0.86)
private let textMuted = Color(red: 0.54, green: 0.60, blue: 0.68)

extension View {
    @ViewBuilder
    func pocketWidgetBackground() -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(for: .widget) {
                ZStack {
                    LinearGradient(colors: [obsidianBgTop, obsidianBgBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
                    Circle().fill(jadePrimary.opacity(0.14)).frame(width: 150, height: 150).blur(radius: 36).offset(x: -55, y: -45)
                }
            }
        } else {
            self.background(LinearGradient(colors: [obsidianBgTop, obsidianBgBottom], startPoint: .topLeading, endPoint: .bottomTrailing))
        }
    }
}

// MARK: - Widget 1: Real-Time Balance & Safe-To-Spend Dashboard

struct PocketGuardianWidgetEntryView: View {
    var entry: PocketProvider.Entry
    @Environment(\.widgetFamily) var family

    var themeColor: Color {
        switch entry.payload.weather {
        case "red": return Color(red: 0.96, green: 0.32, blue: 0.32)
        case "yellow": return Color(red: 0.98, green: 0.72, blue: 0.14)
        default: return jadeBright
        }
    }

    var timeString: String {
        if let status = entry.statusText, !status.isEmpty {
            return status
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return "更新 \(formatter.string(from: entry.date))"
    }

    var clampedBattery: CGFloat {
        CGFloat(min(max(entry.payload.batteryPercent, 0), 100)) / 100.0
    }

    var body: some View {
        switch family {
        case .accessoryCircular:
            Gauge(value: Double(min(max(entry.payload.batteryPercent, 0), 100)), in: 0...100) {
                Text("🔋")
            } currentValueLabel: {
                Text("$\(entry.payload.todayLeft)")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
            }
            .gaugeStyle(.accessoryCircular)
            .pocketWidgetBackground()

        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text("🔋 今日可用 \(entry.payload.batteryPercent)%")
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                    Spacer()
                }
                Text("$\(formatIntMoney(entry.payload.todayLeft))")
                    .font(.system(size: 16, weight: .heavy, design: .rounded))
                Text("🏦 $\(formatMoney(entry.payload.bank)) · 💵 $\(formatMoney(entry.payload.cash))")
                    .font(.system(size: 10, weight: .medium, design: .rounded))
                    .foregroundColor(.secondary)
            }
            .pocketWidgetBackground()

        case .systemMedium:
            mediumDashboardBody

        default:
            smallDashboardBody
        }
    }

    var mediumDashboardBody: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 5) {
                    Text("🔋 今日可用")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundColor(textSecondary)
                    Text("\(entry.payload.batteryPercent)%")
                        .font(.system(size: 11, weight: .heavy, design: .rounded))
                        .foregroundColor(themeColor)
                    Spacer(minLength: 2)
                    if #available(iOS 17.0, *) {
                        Button(intent: RefreshWidgetIntent()) {
                            HStack(spacing: 2) {
                                Image(systemName: "arrow.clockwise")
                                    .font(.system(size: 9, weight: .bold))
                                Text("刷新")
                                    .font(.system(size: 9, weight: .bold, design: .rounded))
                            }
                            .foregroundColor(textPrimary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(glassFill)
                            .clipShape(Capsule())
                            .overlay(Capsule().stroke(glassStroke, lineWidth: 0.8))
                        }
                        .buttonStyle(.plain)
                    }
                }

                Text("$\(formatIntMoney(entry.payload.todayLeft))")
                    .font(.system(size: 26, weight: .black, design: .rounded))
                    .foregroundColor(themeColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.white.opacity(0.10)).frame(height: 6)
                        Capsule()
                            .fill(LinearGradient(colors: [jadePrimary, themeColor], startPoint: .leading, endPoint: .trailing))
                            .frame(width: max(6, geo.size.width * clampedBattery), height: 6)
                    }
                }
                .frame(height: 6)

                HStack(spacing: 6) {
                    accountMiniCard(title: "🏦 玉山銀行", amount: entry.payload.bank)
                    accountMiniCard(title: "💵 現金錢包", amount: entry.payload.cash)
                }

                HStack {
                    Text("本月剩 $\(formatIntMoney(entry.payload.trueAvailable))")
                        .font(.system(size: 9, weight: .semibold, design: .rounded))
                        .foregroundColor(textMuted)
                    Spacer()
                    Text(timeString)
                        .font(.system(size: 9, weight: .semibold, design: .rounded))
                        .foregroundColor(jadeBright.opacity(0.9))
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity)

            VStack(spacing: 6) {
                HStack(spacing: 6) {
                    Link(destination: ledgerURL("expense")) {
                        VStack(spacing: 3) {
                            Text("➕").font(.system(size: 14))
                            Text("記收支")
                                .font(.system(size: 11, weight: .heavy, design: .rounded))
                                .foregroundColor(Color(red: 0.02, green: 0.08, blue: 0.05))
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(LinearGradient(colors: [jadeBright, jadePrimary], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    quickTileLink(icon: "🏧", label: "ATM", path: "atm")
                }
                HStack(spacing: 6) {
                    quickTileLink(icon: "🤬", label: "罵醒我", path: "scold")
                    quickTileLink(icon: "🤝", label: "欠款", path: "debts")
                }
            }
            .frame(width: 122)
        }
        .padding(12)
        .pocketWidgetBackground()
    }

    var smallDashboardBody: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Text("🔋 今日可用")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(textSecondary)
                Spacer(minLength: 2)
                Text("\(entry.payload.batteryPercent)%")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .foregroundColor(themeColor)
                if #available(iOS 17.0, *) {
                    Button(intent: RefreshWidgetIntent()) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(textPrimary)
                            .frame(width: 20, height: 20)
                            .background(glassFill)
                            .clipShape(Circle())
                            .overlay(Circle().stroke(glassStroke, lineWidth: 0.7))
                    }
                    .buttonStyle(.plain)
                }
            }

            Text("$\(formatIntMoney(entry.payload.todayLeft))")
                .font(.system(size: 24, weight: .black, design: .rounded))
                .foregroundColor(themeColor)
                .lineLimit(1)
                .minimumScaleFactor(0.65)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.10)).frame(height: 6)
                    Capsule()
                        .fill(LinearGradient(colors: [jadePrimary, themeColor], startPoint: .leading, endPoint: .trailing))
                        .frame(width: max(6, geo.size.width * clampedBattery), height: 6)
                }
            }
            .frame(height: 6)

            VStack(spacing: 3) {
                HStack {
                    Text("🏦 玉山").font(.system(size: 10, weight: .semibold, design: .rounded)).foregroundColor(textMuted)
                    Spacer()
                    Text("$\(formatMoney(entry.payload.bank))").font(.system(size: 11, weight: .heavy, design: .rounded)).foregroundColor(textPrimary)
                }
                HStack {
                    Text("💵 現金").font(.system(size: 10, weight: .semibold, design: .rounded)).foregroundColor(textMuted)
                    Spacer()
                    Text("$\(formatMoney(entry.payload.cash))").font(.system(size: 11, weight: .heavy, design: .rounded)).foregroundColor(textPrimary)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(glassFill)
            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(glassStroke, lineWidth: 0.7))

            HStack(spacing: 4) {
                Text(timeString)
                    .font(.system(size: 9, weight: .medium, design: .rounded))
                    .foregroundColor(textMuted)
                    .lineLimit(1)
                Spacer(minLength: 2)
                Link(destination: ledgerURL("expense")) {
                    Text("＋記帳")
                        .font(.system(size: 10, weight: .heavy, design: .rounded))
                        .foregroundColor(Color(red: 0.02, green: 0.08, blue: 0.05))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(jadeBright)
                        .clipShape(Capsule())
                }
            }
        }
        .padding(11)
        .pocketWidgetBackground()
    }

    private func accountMiniCard(title: String, amount: Double) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title)
                .font(.system(size: 9, weight: .semibold, design: .rounded))
                .foregroundColor(textMuted)
            Text("$\(formatMoney(amount))")
                .font(.system(size: 12, weight: .heavy, design: .rounded))
                .foregroundColor(textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 7)
        .padding(.vertical, 5)
        .background(glassFill)
        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(glassStroke, lineWidth: 0.7))
    }

    private func quickTileLink(icon: String, label: String, path: String) -> some View {
        Link(destination: ledgerURL(path)) {
            VStack(spacing: 3) {
                Text(icon).font(.system(size: 14))
                Text(label)
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(textPrimary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(glassFill)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(glassStroke, lineWidth: 0.8))
        }
    }
}

// MARK: - Widget 2: Quick Bookkeeping & 1-Tap Instant Deduct Widget

struct PocketQuickAddWidgetEntryView: View {
    var entry: PocketProvider.Entry
    @Environment(\.widgetFamily) var family

    var statusLabel: String {
        if let status = entry.statusText, !status.isEmpty {
            return status
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return "同步 \(formatter.string(from: entry.date))"
    }

    var body: some View {
        switch family {
        case .systemMedium:
            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 6) {
                    Text("🔋 今日 $\(formatIntMoney(entry.payload.todayLeft))")
                        .font(.system(size: 11, weight: .heavy, design: .rounded))
                        .foregroundColor(jadeBright)
                    Text("｜").font(.system(size: 10)).foregroundColor(textMuted)
                    Text("🏦 $\(formatMoney(entry.payload.bank))")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundColor(textPrimary)
                    Text("💵 $\(formatMoney(entry.payload.cash))")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundColor(textSecondary)
                    Spacer(minLength: 2)
                    Text(statusLabel)
                        .font(.system(size: 9, weight: .semibold, design: .rounded))
                        .foregroundColor(jadeBright.opacity(0.9))
                        .lineLimit(1)
                    if #available(iOS 17.0, *) {
                        Button(intent: RefreshWidgetIntent()) {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(textPrimary)
                                .frame(width: 20, height: 20)
                                .background(glassFill)
                                .clipShape(Circle())
                                .overlay(Circle().stroke(glassStroke, lineWidth: 0.7))
                        }
                        .buttonStyle(.plain)
                    }
                }

                HStack(spacing: 6) {
                    Link(destination: ledgerURL("expense")) {
                        HStack(spacing: 4) {
                            Text("✍️").font(.system(size: 12))
                            Text("自訂記收支")
                                .font(.system(size: 11, weight: .heavy, design: .rounded))
                                .foregroundColor(Color(red: 0.02, green: 0.08, blue: 0.05))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7)
                        .background(LinearGradient(colors: [jadeBright, jadePrimary], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    sheetLinkPill(icon: "🏧", label: "ATM 存提", path: "atm")
                    sheetLinkPill(icon: "🪄", label: "魔術平帳", path: "reconcile")
                }

                if #available(iOS 17.0, *) {
                    HStack(spacing: 6) {
                        instantDeductButton(title: "🏪 超商", amount: 65, merchant: "超商消費", category: "超商")
                        instantDeductButton(title: "🍱 便當", amount: 120, merchant: "午餐便當", category: "午餐/便當")
                        instantDeductButton(title: "🥤 飲料", amount: 60, merchant: "手搖飲料", category: "飲料")
                        instantDeductButton(title: "🚇 車費", amount: 40, merchant: "大眾運輸", category: "車費")
                    }
                }
            }
            .padding(11)
            .pocketWidgetBackground()

        default:
            smallQuickAddBody
        }
    }

    var smallQuickAddBody: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Text("🏦 $\(formatMoney(entry.payload.bank))")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .foregroundColor(jadeBright)
                    .lineLimit(1)
                Spacer(minLength: 2)
                if #available(iOS 17.0, *) {
                    Button(intent: RefreshWidgetIntent()) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(textPrimary)
                            .frame(width: 18, height: 18)
                            .background(glassFill)
                            .clipShape(Circle())
                            .overlay(Circle().stroke(glassStroke, lineWidth: 0.7))
                    }
                    .buttonStyle(.plain)
                }
            }

            Link(destination: ledgerURL("expense")) {
                HStack(spacing: 4) {
                    Text("➕").font(.system(size: 11))
                    Text("自訂金額記帳")
                        .font(.system(size: 11, weight: .heavy, design: .rounded))
                        .foregroundColor(Color(red: 0.02, green: 0.08, blue: 0.05))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
                .background(LinearGradient(colors: [jadeBright, jadePrimary], startPoint: .topLeading, endPoint: .bottomTrailing))
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            }

            VStack(spacing: 5) {
                HStack(spacing: 5) {
                    categoryTile(label: "🏪 超商", path: "expense", category: "超商")
                    categoryTile(label: "🍱 食物", path: "expense", category: "食物")
                }
                HStack(spacing: 5) {
                    categoryTile(label: "🥤 飲料", path: "expense", category: "飲料")
                    categoryTile(label: "🏧 ATM", path: "atm", category: nil)
                }
            }
        }
        .padding(11)
        .pocketWidgetBackground()
    }

    private func sheetLinkPill(icon: String, label: String, path: String) -> some View {
        Link(destination: ledgerURL(path)) {
            HStack(spacing: 4) {
                Text(icon).font(.system(size: 12))
                Text(label)
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(textPrimary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .background(glassFill)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(glassStroke, lineWidth: 0.8))
        }
    }

    private func categoryTile(label: String, path: String, category: String?) -> some View {
        Link(destination: ledgerURL(path, category: category)) {
            Text(label)
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundColor(textPrimary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(glassFill)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(glassStroke, lineWidth: 0.7))
        }
    }

    @available(iOS 17.0, *)
    private func instantDeductButton(title: String, amount: Int, merchant: String, category: String) -> some View {
        Button(intent: QuickWidgetExpenseIntent(amount: amount, merchant: merchant, category: category)) {
            VStack(spacing: 2) {
                Text(title)
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundColor(textSecondary)
                Text("-$\(amount)")
                    .font(.system(size: 12, weight: .heavy, design: .rounded))
                    .foregroundColor(jadeBright)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.vertical, 5)
            .background(glassFill)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(glassStroke, lineWidth: 0.7))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Widget Definitions & Bundle

struct PocketGuardianWidget: Widget {
    let kind: String = "PocketGuardianWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PocketProvider()) { entry in
            PocketGuardianWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("🔋 實時財力＆帳戶餘額")
        .description("即時顯示今日可用額度、玉山銀行與現金餘額，附桌面一鍵刷新與快速記帳。")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryCircular,
            .accessoryRectangular
        ])
        .contentMarginsDisabled()
    }
}

struct PocketQuickBookkeepingWidget: Widget {
    let kind: String = "PocketQuickBookkeepingWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PocketProvider()) { entry in
            PocketQuickAddWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("⚡ 極速記帳＆閃電扣款")
        .description("桌面一鍵開啟記收支/ATM/平帳面板，或免開 App 直接閃電記下超商、便當、飲料、車費。")
        .supportedFamilies([
            .systemSmall,
            .systemMedium
        ])
        .contentMarginsDisabled()
    }
}

@main
struct PocketGuardianWidgetBundle: WidgetBundle {
    var body: some Widget {
        PocketGuardianWidget()
        PocketQuickBookkeepingWidget()
    }
}

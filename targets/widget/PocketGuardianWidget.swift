import AppIntents
import Foundation
import SwiftUI
import UIKit
import WidgetKit

// MARK: - Models & Local Cache

struct WidgetSummaryPayload: Codable {
    let totalBalance: Double?
    let todayLeft: Int
    let dailyAllowance: Int
    let batteryPercent: Int
    let weather: String
    let bank: Double
    let cash: Double
    let trueAvailable: Int
    let updatedAt: String

    var displayTotalBalance: Double {
        totalBalance ?? (bank + cash)
    }
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
        totalBalance: 0,
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

// MARK: - Helpers & Theme (iOS system palette, matches src/theme/index.ts)

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
    let rounded = Int(value.rounded())
    let body = formatter.string(from: NSNumber(value: abs(rounded))) ?? "\(abs(rounded))"
    return rounded < 0 ? "-$\(body)" : "$\(body)"
}

private func formatIntMoney(_ value: Int) -> String {
    return formatMoney(Double(value))
}

/// Strip a leading "✓ " style marker so status text reads like a plain caption.
private func cleanStatus(_ text: String) -> String {
    var s = text
    for prefix in ["✓ ", "✓", "⚠️ ", "⚠️"] where s.hasPrefix(prefix) {
        s = String(s.dropFirst(prefix.count))
    }
    return s
}

private enum PG {
    static let accent = Color(uiColor: .systemGreen)
    static let negative = Color(uiColor: .systemRed)
    static let warning = Color(uiColor: .systemOrange)
    static let blue = Color(uiColor: .systemBlue)
    static let cyan = Color(uiColor: .systemCyan)
    static let teal = Color(uiColor: .systemTeal)
    static let indigo = Color(uiColor: .systemIndigo)
    static let brown = Color(uiColor: .systemBrown)
    static let gray = Color(uiColor: .systemGray)
    static let canvas = Color(uiColor: .systemBackground)
    static let cell = Color(uiColor: .secondarySystemBackground)
    static let fill = Color(uiColor: .tertiarySystemFill)
    static let track = Color(uiColor: .systemFill)
}

extension View {
    /// Home-screen widgets: plain system background (white / black), follows light & dark.
    func pocketWidgetBackground() -> some View {
        self.containerBackground(for: .widget) { PG.canvas }
    }

    /// Lock-screen accessories: let the system draw its own vibrant material.
    func pocketAccessoryBackground() -> some View {
        self.containerBackground(for: .widget) { Color.clear }
    }
}

/// Rounded-square SF Symbol tile, same as the app's IconTile.
private struct SymbolTile: View {
    let symbol: String
    let color: Color
    var size: CGFloat = 22

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.5, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(color, in: RoundedRectangle(cornerRadius: size * 0.27, style: .continuous))
            .widgetAccentable()
    }
}

private struct RefreshButton: View {
    var body: some View {
        Button(intent: RefreshWidgetIntent()) {
            Image(systemName: "arrow.clockwise")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
                .frame(width: 24, height: 24)
                .background(PG.fill, in: Circle())
        }
        .buttonStyle(.plain)
    }
}

private struct BudgetBar: View {
    let fraction: CGFloat
    let color: Color

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(PG.track)
                Capsule()
                    .fill(color)
                    .frame(width: max(4, geo.size.width * fraction))
                    .widgetAccentable()
            }
        }
        .frame(height: 4)
    }
}

// MARK: - Widget 1: Total Balance

struct PocketGuardianWidgetEntryView: View {
    var entry: PocketProvider.Entry
    @Environment(\.widgetFamily) var family

    var budgetColor: Color {
        switch entry.payload.weather {
        case "red": return PG.negative
        case "yellow": return PG.warning
        default: return PG.accent
        }
    }

    var balanceColor: Color {
        entry.payload.displayTotalBalance < 0 ? PG.negative : Color.primary
    }

    var statusString: String {
        if let status = entry.statusText, !status.isEmpty {
            return cleanStatus(status)
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return "\(formatter.string(from: entry.date)) 更新"
    }

    var budgetFraction: CGFloat {
        CGFloat(min(max(entry.payload.batteryPercent, 0), 100)) / 100.0
    }

    var body: some View {
        switch family {
        case .accessoryCircular:
            Gauge(value: Double(min(max(entry.payload.batteryPercent, 0), 100)), in: 0...100) {
                Image(systemName: "dollarsign")
            } currentValueLabel: {
                Text(formatMoney(entry.payload.displayTotalBalance))
                    .font(.system(size: 11, weight: .semibold))
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
            }
            .gaugeStyle(.accessoryCircular)
            .pocketAccessoryBackground()

        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text("總餘額")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                Text(formatMoney(entry.payload.displayTotalBalance))
                    .font(.system(size: 20, weight: .bold))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .widgetAccentable()
                HStack(spacing: 6) {
                    Label(formatMoney(entry.payload.bank), systemImage: "building.columns.fill")
                    Label(formatMoney(entry.payload.cash), systemImage: "wallet.bifold.fill")
                }
                .font(.system(size: 11, weight: .medium))
                .labelStyle(CompactLabelStyle())
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .pocketAccessoryBackground()

        case .systemMedium:
            mediumBody

        default:
            smallBody
        }
    }

    // Header + hero number + budget bar, shared by small & medium.
    var balanceBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center) {
                Text("總餘額")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 4)
                RefreshButton()
            }
            Text(formatMoney(entry.payload.displayTotalBalance))
                .font(.system(size: 30, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(balanceColor)
                .lineLimit(1)
                .minimumScaleFactor(0.55)
                .widgetAccentable()
            BudgetBar(fraction: budgetFraction, color: budgetColor)
                .padding(.top, 2)
            Text("今日可用 \(formatIntMoney(entry.payload.todayLeft))")
                .font(.system(size: 12, weight: .regular))
                .monospacedDigit()
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
    }

    var smallBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            balanceBlock
            Spacer(minLength: 6)
            VStack(spacing: 5) {
                accountRow(symbol: "building.columns.fill", color: PG.blue, title: "銀行", amount: entry.payload.bank)
                accountRow(symbol: "wallet.bifold.fill", color: PG.accent, title: "現金", amount: entry.payload.cash)
            }
        }
        .padding(16)
        .pocketWidgetBackground()
        .widgetURL(ledgerURL("dashboard"))
    }

    var mediumBody: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                balanceBlock
                Spacer(minLength: 6)
                VStack(spacing: 5) {
                    accountRow(symbol: "building.columns.fill", color: PG.blue, title: "銀行", amount: entry.payload.bank)
                    accountRow(symbol: "wallet.bifold.fill", color: PG.accent, title: "現金", amount: entry.payload.cash)
                }
            }
            .frame(maxWidth: .infinity)

            VStack(spacing: 8) {
                HStack(spacing: 8) {
                    actionTile(symbol: "plus", color: PG.accent, label: "記一筆", path: "expense")
                    actionTile(symbol: "arrow.left.arrow.right", color: PG.cyan, label: "ATM", path: "atm")
                }
                HStack(spacing: 8) {
                    actionTile(symbol: "bolt.fill", color: PG.warning, label: "罵醒我", path: "scold")
                    actionTile(symbol: "person.2.fill", color: PG.indigo, label: "欠款", path: "debts")
                }
            }
            .frame(width: 136)
        }
        .padding(16)
        .pocketWidgetBackground()
        .widgetURL(ledgerURL("dashboard"))
    }

    private func accountRow(symbol: String, color: Color, title: String, amount: Double) -> some View {
        HStack(spacing: 6) {
            SymbolTile(symbol: symbol, color: color, size: 18)
            Text(title)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            Spacer(minLength: 4)
            Text(formatMoney(amount))
                .font(.system(size: 13, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(amount < 0 ? PG.negative : Color.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }

    private func actionTile(symbol: String, color: Color, label: String, path: String) -> some View {
        Link(destination: ledgerURL(path)) {
            VStack(spacing: 5) {
                SymbolTile(symbol: symbol, color: color, size: 26)
                Text(label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(PG.cell, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }
}

private struct CompactLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 3) {
            configuration.icon.font(.system(size: 9))
            configuration.title
        }
    }
}

// MARK: - Widget 2: Quick Bookkeeping

struct PocketQuickAddWidgetEntryView: View {
    var entry: PocketProvider.Entry
    @Environment(\.widgetFamily) var family

    var statusLabel: String {
        if let status = entry.statusText, !status.isEmpty {
            return cleanStatus(status)
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return "\(formatter.string(from: entry.date)) 同步"
    }

    var balanceColor: Color {
        entry.payload.displayTotalBalance < 0 ? PG.negative : Color.primary
    }

    var body: some View {
        switch family {
        case .systemMedium:
            mediumBody
        default:
            smallBody
        }
    }

    var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            VStack(alignment: .leading, spacing: 0) {
                Text("總餘額")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                Text(formatMoney(entry.payload.displayTotalBalance))
                    .font(.system(size: 20, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(balanceColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .widgetAccentable()
            }
            Spacer(minLength: 4)
            RefreshButton()
        }
    }

    var mediumBody: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 6) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("總餘額")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text(formatMoney(entry.payload.displayTotalBalance))
                        .font(.system(size: 22, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(balanceColor)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .widgetAccentable()
                }
                Spacer(minLength: 4)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(statusLabel)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    HStack(spacing: 8) {
                        Label(formatMoney(entry.payload.bank), systemImage: "building.columns.fill")
                        Label(formatMoney(entry.payload.cash), systemImage: "wallet.bifold.fill")
                    }
                    .labelStyle(CompactLabelStyle())
                    .font(.system(size: 12, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                }
                RefreshButton()
            }

            HStack(spacing: 8) {
                primaryLink(label: "記一筆", path: "expense")
                pillLink(symbol: "arrow.left.arrow.right", color: PG.cyan, label: "ATM", path: "atm")
                pillLink(symbol: "slider.horizontal.3", color: PG.gray, label: "校正", path: "reconcile")
            }

            HStack(spacing: 8) {
                instantDeductButton(symbol: "storefront.fill", color: PG.blue, title: "超商", amount: 65, merchant: "超商消費", category: "超商")
                instantDeductButton(symbol: "fork.knife", color: PG.warning, title: "便當", amount: 120, merchant: "午餐便當", category: "午餐/便當")
                instantDeductButton(symbol: "cup.and.saucer.fill", color: PG.brown, title: "飲料", amount: 60, merchant: "手搖飲料", category: "飲料")
                instantDeductButton(symbol: "car.fill", color: PG.teal, title: "車費", amount: 40, merchant: "大眾運輸", category: "車費")
            }
        }
        .padding(16)
        .pocketWidgetBackground()
    }

    var smallBody: some View {
        VStack(alignment: .leading, spacing: 8) {
            header
            primaryLink(label: "記一筆", path: "expense")
            VStack(spacing: 6) {
                HStack(spacing: 6) {
                    categoryTile(symbol: "storefront.fill", color: PG.blue, label: "超商", path: "expense", category: "超商")
                    categoryTile(symbol: "fork.knife", color: PG.warning, label: "食物", path: "expense", category: "食物")
                }
                HStack(spacing: 6) {
                    categoryTile(symbol: "cup.and.saucer.fill", color: PG.brown, label: "飲料", path: "expense", category: "飲料")
                    categoryTile(symbol: "arrow.left.arrow.right", color: PG.cyan, label: "ATM", path: "atm", category: nil)
                }
            }
        }
        .padding(14)
        .pocketWidgetBackground()
    }

    private func primaryLink(label: String, path: String) -> some View {
        Link(destination: ledgerURL(path)) {
            HStack(spacing: 4) {
                Image(systemName: "plus")
                    .font(.system(size: 12, weight: .bold))
                Text(label)
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .background(PG.accent, in: Capsule())
            .widgetAccentable()
        }
    }

    private func pillLink(symbol: String, color: Color, label: String, path: String) -> some View {
        Link(destination: ledgerURL(path)) {
            HStack(spacing: 4) {
                Image(systemName: symbol)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(color)
                Text(label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.primary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .background(PG.cell, in: Capsule())
        }
    }

    private func categoryTile(symbol: String, color: Color, label: String, path: String, category: String?) -> some View {
        Link(destination: ledgerURL(path, category: category)) {
            HStack(spacing: 5) {
                SymbolTile(symbol: symbol, color: color, size: 18)
                Text(label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 7)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(PG.cell, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }

    private func instantDeductButton(symbol: String, color: Color, title: String, amount: Int, merchant: String, category: String) -> some View {
        Button(intent: QuickWidgetExpenseIntent(amount: amount, merchant: merchant, category: category)) {
            VStack(spacing: 3) {
                SymbolTile(symbol: symbol, color: color, size: 20)
                Text(title)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                Text("-$\(amount)")
                    .font(.system(size: 12, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(.primary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(PG.cell, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
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
        .configurationDisplayName("總餘額")
        .description("一眼看清總餘額（銀行＋現金）與今日可用額度。")
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
        .configurationDisplayName("快速記帳")
        .description("一鍵開啟記一筆／ATM／校正餘額，或免開 App 直接記下超商、便當、飲料、車費。")
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

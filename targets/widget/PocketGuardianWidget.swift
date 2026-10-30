import WidgetKit
import SwiftUI

struct WidgetSummaryPayload: Decodable {
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
    let widget: WidgetSummaryPayload
}

struct PocketEntry: TimelineEntry {
    let date: Date
    let payload: WidgetSummaryPayload
}

struct PocketProvider: TimelineProvider {
    let defaultPayload = WidgetSummaryPayload(
        todayLeft: 420,
        dailyAllowance: 500,
        batteryPercent: 84,
        weather: "green",
        bank: 24500,
        cash: 1200,
        trueAvailable: 24910,
        updatedAt: ""
    )

    func placeholder(in context: Context) -> PocketEntry {
        PocketEntry(date: Date(), payload: defaultPayload)
    }

    func getSnapshot(in context: Context, completion: @escaping (PocketEntry) -> Void) {
        completion(PocketEntry(date: Date(), payload: defaultPayload))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PocketEntry>) -> Void) {
        let endpoint = UserDefaults.standard.string(forKey: "PG_WORKER_URL")
            ?? "https://pocket-guardian-api.mr-haibaoseal.workers.dev/api/widget-summary"
        guard let url = URL(string: endpoint) else {
            let entry = PocketEntry(date: Date(), payload: defaultPayload)
            completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(900))))
            return
        }

        URLSession.shared.dataTask(with: url) { data, _, _ in
            var result = defaultPayload
            if let data = data,
               let decoded = try? JSONDecoder().decode(WidgetApiResponse.self, from: data) {
                result = decoded.widget
            }
            let now = Date()
            let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: now) ?? now.addingTimeInterval(900)
            let timeline = Timeline(entries: [PocketEntry(date: now, payload: result)], policy: .after(nextRefresh))
            completion(timeline)
        }.resume()
    }
}

/**
 * Synchronized Swift Design Tokens (matching `src/theme/tokens.ts`)
 */
enum ThemeTokens {
    static let backgroundBase = Color(red: 0.043, green: 0.047, blue: 0.059) // #0B0C0F
    static let textPrimary = Color.white.opacity(0.92)
    static let textSecondary = Color.white.opacity(0.60)
    static let textTertiary = Color.white.opacity(0.38)
    static let accentPrimary = Color(red: 0.494, green: 0.600, blue: 0.702) // #7E99B3
    static let semanticRemaining = Color(red: 0.580, green: 0.690, blue: 0.761) // #94B0C2
    static let semanticWarning = Color(red: 0.722, green: 0.525, blue: 0.282) // #B88648
    static let semanticDanger = Color(red: 0.710, green: 0.353, blue: 0.322) // #B55A52
}

struct PocketGuardianWidgetEntryView: View {
    var entry: PocketProvider.Entry
    @Environment(\.widgetFamily) var family

    var themeColor: Color {
        switch entry.payload.weather {
        case "red": return ThemeTokens.semanticDanger
        case "yellow": return ThemeTokens.semanticWarning
        default: return ThemeTokens.semanticRemaining
        }
    }

    var timeString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: entry.date)
    }

    var body: some View {
        switch family {
        case .accessoryCircular:
            Gauge(value: Double(entry.payload.batteryPercent), in: 0...100) {
                Image(systemName: "chart.bar")
            } currentValueLabel: {
                Text("$\(entry.payload.todayLeft)")
                    .font(.system(size: 11, weight: .medium).monospacedDigit())
            }
            .gaugeStyle(.accessoryCircular)

        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Image(systemName: "chart.bar")
                        .font(.system(size: 11, weight: .medium))
                    Text("今日可用 \(entry.payload.batteryPercent)%")
                        .font(.system(size: 12, weight: .medium))
                    Spacer()
                }
                Text("$\(entry.payload.todayLeft)")
                    .font(.system(size: 15, weight: .semibold).monospacedDigit())
                ProgressView(value: Double(entry.payload.batteryPercent), total: 100)
            }

        default:
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("今日可用額度")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(ThemeTokens.textSecondary)
                    Spacer()
                    Text("\(entry.payload.batteryPercent)%")
                        .font(.system(size: 12, weight: .medium).monospacedDigit())
                        .foregroundColor(themeColor)
                }

                Text("$\(entry.payload.todayLeft)")
                    .font(.system(size: 28, weight: .medium).monospacedDigit())
                    .foregroundColor(ThemeTokens.textPrimary)

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 999, style: .continuous)
                            .fill(Color.white.opacity(0.08))
                            .frame(height: 4)
                        RoundedRectangle(cornerRadius: 999, style: .continuous)
                            .fill(themeColor)
                            .frame(width: geo.size.width * CGFloat(entry.payload.batteryPercent) / 100.0, height: 4)
                    }
                }
                .frame(height: 4)

                HStack {
                    HStack(spacing: 3) {
                        Image(systemName: "creditcard")
                        Text("$\(Int(entry.payload.bank))")
                    }
                    Spacer()
                    HStack(spacing: 3) {
                        Image(systemName: "banknote")
                        Text("$\(Int(entry.payload.cash))")
                    }
                    Spacer()
                    Text(timeString)
                }
                .font(.system(size: 10, weight: .regular).monospacedDigit())
                .foregroundColor(ThemeTokens.textTertiary)
            }
            .padding(14)
            .background(ThemeTokens.backgroundBase)
            .widgetURL(URL(string: "myledger://dashboard"))
        }
    }
}

@main
struct PocketGuardianWidget: Widget {
    let kind: String = "PocketGuardianWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PocketProvider()) { entry in
            PocketGuardianWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("守財靈・財力電量")
        .description("一眼看懂今天還能花多少錢與銀行/現金餘額")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryCircular,
            .accessoryRectangular
        ])
    }
}

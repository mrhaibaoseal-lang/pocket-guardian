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

struct PocketGuardianWidgetEntryView: View {
    var entry: PocketProvider.Entry
    @Environment(\.widgetFamily) var family

    var themeColor: Color {
        switch entry.payload.weather {
        case "red": return Color(red: 0.94, green: 0.27, blue: 0.27)
        case "yellow": return Color(red: 0.96, green: 0.62, blue: 0.04)
        default: return Color(red: 0.06, green: 0.73, blue: 0.51)
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
                Text("🔋")
            } currentValueLabel: {
                Text("$\(entry.payload.todayLeft)")
                    .font(.system(size: 11, weight: .bold))
            }
            .gaugeStyle(.accessoryCircular)

        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text("🔋 今日財力 \(entry.payload.batteryPercent)%")
                        .font(.system(size: 12, weight: .semibold))
                    Spacer()
                }
                Text("還可花 $\(entry.payload.todayLeft)")
                    .font(.system(size: 15, weight: .heavy))
                ProgressView(value: Double(entry.payload.batteryPercent), total: 100)
            }

        default:
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("🔋 今日安全額度")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("\(entry.payload.batteryPercent)%")
                        .font(.system(size: 12, weight: .heavy))
                        .foregroundColor(themeColor)
                }

                Text("$\(entry.payload.todayLeft)")
                    .font(.system(size: 28, weight: .black))
                    .foregroundColor(themeColor)

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 6)
                            .fill(Color.gray.opacity(0.2))
                            .frame(height: 10)
                        RoundedRectangle(cornerRadius: 6)
                            .fill(themeColor)
                            .frame(width: geo.size.width * CGFloat(entry.payload.batteryPercent) / 100.0, height: 10)
                    }
                }
                .frame(height: 10)

                HStack {
                    Text("🏦 $\(Int(entry.payload.bank))")
                    Spacer()
                    Text("💵 $\(Int(entry.payload.cash))")
                    Spacer()
                    Text("更新 \(timeString)")
                }
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.secondary)
            }
            .padding(12)
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
        .configurationDisplayName("靠北我錢呢・財力電量")
        .description("一眼看懂今天還能花多少錢與銀行/現金餘額")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryCircular,
            .accessoryRectangular
        ])
    }
}

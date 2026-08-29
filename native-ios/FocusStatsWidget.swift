import WidgetKit
import SwiftUI

// The idle-state Home Screen widget: streak, pearls, and how much focus is left
// before the next real-shop reward. Tapping it opens the app straight into a
// session via the mrtapioca://start URL scheme.
//
// This is the second widget KIND inside the existing FocusWidget extension, not a
// new target. That matters for the release wrappers: tools/set-ios-version.mjs and
// tools/check-release.mjs both hard-assert exactly ten build configurations (five
// targets x two configs), and a sixth target would fail the very first step of
// npm run ios:release-setup.
//
// Deployment target is 16.6, so everything here has to work on iOS 16:
// containerBackground is gated behind an availability check and there are no
// AppIntent buttons (17+). A widget cannot run code on tap; the URL is the whole
// interaction.

private let bark = Color(red: 0.239, green: 0.129, blue: 0.090)     // #3d2117
private let cream = Color(red: 0.99, green: 0.96, blue: 0.92)
private let caramel = Color(red: 0.85, green: 0.62, blue: 0.36)
private let teal = Color(red: 0.184, green: 0.561, blue: 0.514)

struct FocusStatsEntry: TimelineEntry {
    let date: Date
    let streak: Int
    let pearls: Int
    let rewardLeftMinutes: Int?
    let stale: Bool

    static let placeholder = FocusStatsEntry(date: Date(), streak: 5, pearls: 24,
                                             rewardLeftMinutes: 40, stale: false)
}

struct FocusStatsProvider: TimelineProvider {
    func placeholder(in context: Context) -> FocusStatsEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (FocusStatsEntry) -> Void) {
        completion(context.isPreview ? .placeholder : entryNow())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FocusStatsEntry>) -> Void) {
        // One entry, and a refresh a few hours out purely as a backstop. The app
        // pushes a reload through WidgetStatsPlugin whenever the numbers actually
        // change, which is the only time they can change: nothing here ticks on its
        // own. Asking for a tighter cadence would just spend the widget's refresh
        // budget redrawing identical numbers.
        completion(Timeline(entries: [entryNow()],
                            policy: .after(Date().addingTimeInterval(4 * 60 * 60))))
    }

    private func entryNow() -> FocusStatsEntry {
        let s = SharedStats.load()
        return FocusStatsEntry(date: Date(), streak: s.streak, pearls: s.pearls,
                               rewardLeftMinutes: s.rewardLeftMinutes, stale: s.isStale)
    }
}

// "1 h 20 m" reads badly on a widget and "80 min" reads long. Match the app's own
// durationLabel shape instead: 40m, 1h, 1h 20m.
private func shortDuration(_ minutes: Int) -> String {
    if minutes < 60 { return "\(minutes)m" }
    let h = minutes / 60, m = minutes % 60
    return m == 0 ? "\(h)h" : "\(h)h \(m)m"
}

private struct StatPair: View {
    let value: String
    let label: String
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value)
                .font(.system(size: 22, weight: .heavy, design: .default))
                .foregroundColor(cream)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            Text(label)
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(cream.opacity(0.62))
                .lineLimit(1)
        }
    }
}

struct FocusStatsView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FocusStatsEntry

    // The reward line is the one number in this app connected to something real, so
    // it gets the accent. Three states, and the third is not "0": unknown must read
    // as unknown, because a widget that says "0m to your next reward" to someone who
    // has not synced is promising a free drink.
    private var rewardLine: (text: String, accent: Bool) {
        if entry.stale { return ("Open to refresh", false) }
        guard let left = entry.rewardLeftMinutes else { return ("Reward progress syncing", false) }
        if left <= 0 { return ("A reward is ready", true) }
        return ("\(shortDuration(left)) to your next reward", false)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Text("🧋").font(.system(size: 15))
                Text("Mr. Tapioca")
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundColor(cream.opacity(0.75))
                    .lineLimit(1)
            }
            Spacer(minLength: 6)

            if family == .systemMedium {
                HStack(alignment: .top, spacing: 22) {
                    StatPair(value: entry.stale ? "—" : "\(entry.streak)",
                             label: entry.streak == 1 ? "day streak" : "day streak")
                    StatPair(value: entry.stale ? "—" : "\(entry.pearls)", label: "pearls")
                    Spacer(minLength: 0)
                }
            } else {
                HStack(alignment: .top, spacing: 16) {
                    StatPair(value: entry.stale ? "—" : "\(entry.streak)", label: "day streak")
                    StatPair(value: entry.stale ? "—" : "\(entry.pearls)", label: "pearls")
                }
            }

            Spacer(minLength: 6)
            Text(rewardLine.text)
                .font(.system(size: 11, weight: .heavy))
                .foregroundColor(rewardLine.accent ? caramel : cream.opacity(0.8))
                .lineLimit(2)
                .minimumScaleFactor(0.85)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 6)
            Text("Tap to brew")
                .font(.system(size: 11, weight: .heavy))
                .foregroundColor(bark)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Capsule().fill(caramel))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(URL(string: "mrtapioca://start"))
    }
}

struct FocusStatsWidget: Widget {
    let kind = "FocusStats"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FocusStatsProvider()) { entry in
            if #available(iOS 17.0, *) {
                FocusStatsView(entry: entry)
                    .padding(2)
                    .containerBackground(bark.gradient, for: .widget)
            } else {
                // iOS 16 has no containerBackground, and a widget with no background
                // renders on the system default, which is nearly white here and makes
                // the cream text invisible. Paint it ourselves.
                ZStack {
                    bark
                    FocusStatsView(entry: entry).padding(14)
                }
            }
        }
        .configurationDisplayName("Focus at a glance")
        .description("Your streak, your pearls, and how much focus is left before your next real boba reward.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

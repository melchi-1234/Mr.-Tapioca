import ActivityKit
import WidgetKit
import SwiftUI

// The Lock Screen banner + Dynamic Island for a running focus session.
// Timer views count down on their own — no updates needed while running.
// Goes in the FocusWidget extension target (see LIVE_ACTIVITY_SETUP.md).

private let bark = Color(red: 0.239, green: 0.129, blue: 0.090)     // #3d2117
private let cream = Color(red: 0.99, green: 0.96, blue: 0.92)
private let caramel = Color(red: 0.85, green: 0.62, blue: 0.36)

struct FocusWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusActivityAttributes.self) { context in
            // ── Lock Screen banner ─────────────────────────────────────────
            HStack(spacing: 12) {
                Text("🧋").font(.system(size: 34))
                VStack(alignment: .leading, spacing: 3) {
                    Text(context.attributes.drinkName)
                        .font(.headline)
                        .foregroundColor(cream)
                        .lineLimit(1)
                    Text("Mr. Tapioca is mixing — stay focused!")
                        .font(.caption)
                        .foregroundColor(cream.opacity(0.7))
                        .lineLimit(1)
                    ProgressView(timerInterval: context.state.startDate...context.state.endDate,
                                 countsDown: false,
                                 label: { EmptyView() },
                                 currentValueLabel: { EmptyView() })
                        .tint(caramel)
                }
                Spacer()
                Text(timerInterval: context.state.startDate...context.state.endDate,
                     countsDown: true)
                    .font(.title2.weight(.heavy))
                    .monospacedDigit()
                    .foregroundColor(cream)
                    .lineLimit(1)                 // long sessions show H:MM:SS —
                    .minimumScaleFactor(0.5)      // shrink to fit, never wrap
                    .frame(width: 90)
                    .multilineTextAlignment(.trailing)
            }
            .padding(16)
            .activityBackgroundTint(bark)
            .activitySystemActionForegroundColor(cream)

        } dynamicIsland: { context in
            DynamicIsland {
                // ── Expanded (long-press the island) ──────────────────────
                DynamicIslandExpandedRegion(.leading) {
                    Text("🧋").font(.system(size: 30))
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 3) {
                        Text(context.attributes.drinkName)
                            .font(.headline)
                            .lineLimit(1)
                        ProgressView(timerInterval: context.state.startDate...context.state.endDate,
                                     countsDown: false,
                                     label: { EmptyView() },
                                     currentValueLabel: { EmptyView() })
                            .tint(caramel)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: context.state.startDate...context.state.endDate,
                         countsDown: true)
                        .font(.title3.weight(.heavy))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .frame(width: 72)
                }
            } compactLeading: {
                // ── Pill around the notch, left side ──────────────────────
                Text("🧋")
            } compactTrailing: {
                Text(timerInterval: context.state.startDate...context.state.endDate,
                     countsDown: true)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .frame(maxWidth: 56)
            } minimal: {
                Text("🧋")
            }
        }
    }
}

/**
 * The 30-day bar chart, hand-rolled SVG (`what.md` §7.9: no chart library, gray-scale).
 *
 * Bars are proportional to the tallest day in the window rather than to a fixed scale, so a
 * light-goal user's chart is still readable — the point is the shape of the last month, not an
 * absolute axis.
 */

import type { ChartDay } from '../../engine/chart-data.ts';
import { strings } from '../../strings.ts';

const WIDTH = 300;
const HEIGHT = 80;
const GAP = 2;

export function ChartBars({ days }: { readonly days: readonly ChartDay[] }) {
  const max = Math.max(1, ...days.map((d) => d.presentations));
  const barWidth = (WIDTH - GAP * (days.length - 1)) / days.length;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      height={HEIGHT}
      role="img"
      aria-label={strings.progress.chartTitle}
    >
      {days.map((day, index) => {
        const barHeight = Math.max(1, (day.presentations / max) * HEIGHT);
        const x = index * (barWidth + GAP);
        const y = HEIGHT - barHeight;
        return (
          <rect
            key={day.key}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={Math.min(2, barWidth / 2)}
            fill={
              day.isToday
                ? 'var(--fg)'
                : day.presentations > 0
                  ? 'var(--fg-muted)'
                  : 'var(--border)'
            }
          />
        );
      })}
    </svg>
  );
}

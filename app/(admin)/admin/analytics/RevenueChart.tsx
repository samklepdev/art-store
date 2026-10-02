import { formatMoney } from "@/lib/money";
import type { DailyRevenue } from "@/lib/admin/analyticsSeries";
import styles from "./analytics.module.css";

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 12, right: 8, bottom: 8, left: 8 };

/**
 * A hand-rolled inline-SVG daily-revenue bar chart. Server component: the data
 * is static per render, so no client JS. Bars scale to the window's max daily
 * revenue; an all-zero window renders flat (no divide-by-zero). A visually
 * hidden table gives screen readers an equivalent.
 */
export function RevenueChart({ data, currency }: { data: DailyRevenue[]; currency: string }) {
  const max = Math.max(0, ...data.map((d) => d.revenueCents));
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const barW = data.length > 0 ? plotW / data.length : plotW;

  return (
    <figure className={styles.chart}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Daily revenue for the last ${data.length} days`}
        className={styles.chartSvg}
      >
        {data.map((d, i) => {
          const h = max === 0 ? 0 : (d.revenueCents / max) * plotH;
          const x = PAD.left + i * barW;
          const y = PAD.top + (plotH - h);
          return (
            <rect
              key={d.date}
              x={x + barW * 0.1}
              y={y}
              width={barW * 0.8}
              height={h}
              className={styles.bar}
            >
              <title>{`${d.date}: ${formatMoney(d.revenueCents, currency)}`}</title>
            </rect>
          );
        })}
      </svg>
      <table className="visually-hidden">
        <caption>Daily revenue for the last {data.length} days</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{formatMoney(d.revenueCents, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

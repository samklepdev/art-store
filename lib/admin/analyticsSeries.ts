export type DailyRevenue = { date: string; revenueCents: number };

/** Formats a Date's local Y/M/D as YYYY-MM-DD. */
function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Expands sparse per-day revenue rows into a continuous, zero-filled series of
 * exactly `days` entries ending on `endDate` (inclusive), oldest first. Days
 * with no orders get revenueCents = 0; rows outside the window are ignored.
 *
 * `endDate` is a parameter (not read from the clock) so the function is
 * deterministic and testable.
 */
export function fillDailySeries(
  rows: DailyRevenue[],
  endDate: Date,
  days: number,
): DailyRevenue[] {
  const byDate = new Map<string, number>();
  for (const row of rows) byDate.set(row.date, row.revenueCents);

  const series: DailyRevenue[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const date = toISODate(d);
    series.push({ date, revenueCents: byDate.get(date) ?? 0 });
  }
  return series;
}

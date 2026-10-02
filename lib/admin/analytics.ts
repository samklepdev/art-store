import "server-only";
import { pool } from "@/lib/db";
import { fillDailySeries, type DailyRevenue } from "@/lib/admin/analyticsSeries";

// Single source of truth for the daily shape lives in analyticsSeries; re-export
// so consumers can import everything analytics-related from this module.
export type { DailyRevenue };

export type TopItem = { description: string; quantity: number; revenueCents: number };

export type RevenueAnalytics = {
  totals: {
    revenueCents: number;
    orderCount: number;
    avgOrderValueCents: number;
    itemsSold: number;
  };
  daily: DailyRevenue[];
  topItems: TopItem[];
};

const WINDOW_DAYS = 30;

/**
 * Sales analytics over the last `days` calendar days (inclusive), computed from
 * orders/order_items. Refunded orders are excluded from every metric. Money is
 * integer cents; the store is single-currency, so amounts are summed directly.
 */
export async function getRevenueAnalytics(days: number = WINDOW_DAYS): Promise<RevenueAnalytics> {
  // Window start: today minus (days - 1), so today plus the preceding days-1
  // calendar days are included. current_date is the DB server's date.
  const since = `o.created_at >= (current_date - (($1::int) - 1))`;

  const totalsQ = pool.query<{ revenueCents: number; orderCount: number }>(
    `SELECT COALESCE(SUM(o.total_cents), 0)::int AS "revenueCents",
            COUNT(*)::int                        AS "orderCount"
       FROM orders o
      WHERE o.status <> 'refunded' AND ${since}`,
    [days],
  );

  const itemsSoldQ = pool.query<{ itemsSold: number }>(
    `SELECT COALESCE(SUM(oi.quantity), 0)::int AS "itemsSold"
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE o.status <> 'refunded' AND ${since}`,
    [days],
  );

  const dailyQ = pool.query<DailyRevenue>(
    `SELECT to_char(o.created_at::date, 'YYYY-MM-DD') AS "date",
            SUM(o.total_cents)::int                   AS "revenueCents"
       FROM orders o
      WHERE o.status <> 'refunded' AND ${since}
      GROUP BY o.created_at::date
      ORDER BY o.created_at::date`,
    [days],
  );

  const topItemsQ = pool.query<TopItem>(
    `SELECT oi.description           AS "description",
            SUM(oi.quantity)::int    AS "quantity",
            SUM(oi.total_cents)::int AS "revenueCents"
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE o.status <> 'refunded' AND ${since}
      GROUP BY oi.description
      ORDER BY SUM(oi.total_cents) DESC, oi.description
      LIMIT 5`,
    [days],
  );

  const [totals, itemsSold, daily, topItems] = await Promise.all([
    totalsQ,
    itemsSoldQ,
    dailyQ,
    topItemsQ,
  ]);

  const revenueCents = totals.rows[0]?.revenueCents ?? 0;
  const orderCount = totals.rows[0]?.orderCount ?? 0;
  const avgOrderValueCents = orderCount === 0 ? 0 : Math.round(revenueCents / orderCount);

  return {
    totals: {
      revenueCents,
      orderCount,
      avgOrderValueCents,
      itemsSold: itemsSold.rows[0]?.itemsSold ?? 0,
    },
    daily: fillDailySeries(daily.rows, new Date(), days),
    topItems: topItems.rows,
  };
}

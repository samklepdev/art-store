# Admin Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `/admin/analytics` screen showing last-30-days revenue stats, a revenue-over-time chart, and top-selling items, computed entirely from existing `orders` / `order_items`.

**Architecture:** A pure, unit-tested `fillDailySeries` zero-filler feeds a `server-only` `getRevenueAnalytics` data module. A server-rendered inline-SVG `RevenueChart` and a server-component page render the results. No schema changes, no new dependencies, no writes.

**Tech Stack:** Next.js (this repo's vendored build — read `node_modules/next/dist/docs/` before touching page/route conventions), React Server Components, node-postgres (`pool`), CSS Modules, Vitest. Chart is hand-rolled inline SVG (no chart library).

## Global Constraints

- **No schema changes.** Read only from existing `orders` and `order_items`.
- **No new dependencies.** The project is deliberately dependency-light (`pg`, `next`, `react`, `stripe`, `aws`). The chart is hand-rolled inline SVG.
- **Money stays in integer cents** end to end; format only at the edge with `formatMoney(cents, site.currency)` from `@/lib/money` (single-currency store — aggregate in cents, format once with `site.currency`, never per-row).
- **Revenue = `SUM(orders.total_cents)`** (money received, including shipping) for orders with **`status <> 'refunded'`** (both `paid` and `fulfilled` count; `refunded` excluded from every metric).
- **All metrics use the same window:** the last `30` calendar days inclusive — orders with `created_at >= current_date - (days - 1)`, bucketed by `created_at::date` in the **database server's timezone** (accepted per spec for a single-owner admin).
- **Average order value** = `orderCount === 0 ? 0 : Math.round(revenueCents / orderCount)` (never divide by zero).
- **`requireAdmin()` guards the page** (called at the top). The screen is read-only: no actions, no `revalidatePath`, no storefront impact. Unexpected DB errors propagate to the existing `(admin)` error boundary.
- **Data-access SQL is not unit-tested** (matches `lib/admin/orders.ts` / `products.ts`); only the pure `fillDailySeries` is. Page/chart verified by `npm run typecheck` and `npm run build`.

---

## File Structure

- **Create** `lib/admin/analyticsSeries.ts` — pure `fillDailySeries` + `DailyRevenue` type (single source of truth for that shape). Unit-tested.
- **Create** `lib/admin/analyticsSeries.test.ts` — Vitest unit tests.
- **Create** `lib/admin/analytics.ts` — `server-only` `getRevenueAnalytics` + `TopItem` / `RevenueAnalytics` types; re-exports `DailyRevenue`.
- **Create** `app/(admin)/admin/analytics/analytics.module.css` — styles for the chart (Task 3) and the page (Task 4).
- **Create** `app/(admin)/admin/analytics/RevenueChart.tsx` — server-rendered inline-SVG bar chart.
- **Create** `app/(admin)/admin/analytics/page.tsx` — the analytics page (server component).
- **Modify** `app/(admin)/layout.tsx` — add an **Analytics** nav link.
- **Modify** `README.md` — document the analytics screen.

---

## Task 1: Pure daily-series fill

**Files:**
- Create: `lib/admin/analyticsSeries.ts`
- Test: `lib/admin/analyticsSeries.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `type DailyRevenue = { date: string; revenueCents: number }` (date is `YYYY-MM-DD`)
  - `fillDailySeries(rows: DailyRevenue[], endDate: Date, days: number): DailyRevenue[]` — returns exactly `days` entries, oldest first, ending on `endDate` inclusive; missing days get `revenueCents: 0`; rows outside the window are ignored.

- [ ] **Step 1: Write the failing test**

Create `lib/admin/analyticsSeries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fillDailySeries } from "./analyticsSeries";

// Local midnight, timezone-independent for the test runner.
const END = new Date(2026, 8, 29); // 2026-09-29

describe("fillDailySeries", () => {
  it("returns exactly `days` entries, oldest first, ending on endDate", () => {
    const series = fillDailySeries([], END, 3);
    expect(series.map((d) => d.date)).toEqual(["2026-09-27", "2026-09-28", "2026-09-29"]);
  });

  it("zero-fills days with no rows", () => {
    const series = fillDailySeries([{ date: "2026-09-28", revenueCents: 500 }], END, 3);
    expect(series).toEqual([
      { date: "2026-09-27", revenueCents: 0 },
      { date: "2026-09-28", revenueCents: 500 },
      { date: "2026-09-29", revenueCents: 0 },
    ]);
  });

  it("uses the revenue from matching rows", () => {
    const rows = [
      { date: "2026-09-27", revenueCents: 100 },
      { date: "2026-09-29", revenueCents: 300 },
    ];
    expect(fillDailySeries(rows, END, 3).map((d) => d.revenueCents)).toEqual([100, 0, 300]);
  });

  it("ignores rows outside the window", () => {
    const rows = [
      { date: "2026-09-20", revenueCents: 999 }, // before window
      { date: "2026-10-05", revenueCents: 999 }, // after window
      { date: "2026-09-28", revenueCents: 500 },
    ];
    const series = fillDailySeries(rows, END, 3);
    expect(series).toEqual([
      { date: "2026-09-27", revenueCents: 0 },
      { date: "2026-09-28", revenueCents: 500 },
      { date: "2026-09-29", revenueCents: 0 },
    ]);
  });

  it("handles an empty window as all zeros", () => {
    const series = fillDailySeries([], END, 1);
    expect(series).toEqual([{ date: "2026-09-29", revenueCents: 0 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- analyticsSeries`
Expected: FAIL — cannot find module `./analyticsSeries` (or `fillDailySeries is not a function`).

- [ ] **Step 3: Write minimal implementation**

Create `lib/admin/analyticsSeries.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- analyticsSeries`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/admin/analyticsSeries.ts lib/admin/analyticsSeries.test.ts
git commit -m "Add pure daily-revenue series fill"
```

---

## Task 2: Data access — `lib/admin/analytics.ts`

**Files:**
- Create: `lib/admin/analytics.ts`

**Interfaces:**
- Consumes: `pool` from `@/lib/db`; `fillDailySeries` + `DailyRevenue` from `@/lib/admin/analyticsSeries`.
- Produces:
  - `type TopItem = { description: string; quantity: number; revenueCents: number }`
  - `type RevenueAnalytics = { totals: { revenueCents: number; orderCount: number; avgOrderValueCents: number; itemsSold: number }; daily: DailyRevenue[]; topItems: TopItem[] }`
  - re-exported `DailyRevenue`
  - `getRevenueAnalytics(days?: number): Promise<RevenueAnalytics>` (defaults to 30)

- [ ] **Step 1: Write the module**

Create `lib/admin/analytics.ts`:

```ts
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
```

Note: `new Date()` is the runtime's "today"; `current_date` in SQL is the DB server's date. A timezone difference between the two can misplace the boundary day of the chart, which is accepted per the spec (single-owner admin). Totals come from their own `SUM` query and are unaffected.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/admin/analytics.ts
git commit -m "Add revenue analytics data-access module"
```

---

## Task 3: Revenue chart + stylesheet

**Files:**
- Create: `app/(admin)/admin/analytics/RevenueChart.tsx`
- Create: `app/(admin)/admin/analytics/analytics.module.css`

**Interfaces:**
- Consumes: `formatMoney` (`@/lib/money`), `DailyRevenue` (`@/lib/admin/analyticsSeries`).
- Produces: `RevenueChart({ data, currency }: { data: DailyRevenue[]; currency: string })` — a server component rendering an inline-SVG bar chart plus a visually-hidden data table.

**Before writing the chart:** load the **dataviz** skill (`Skill` tool, `dataviz`) and follow its palette/axis/accessibility guidance. The bar fill color below is a placeholder blue from the dataviz default palette — keep it accessible in light and dark.

- [ ] **Step 1: Write the stylesheet (chart classes)**

Create `app/(admin)/admin/analytics/analytics.module.css`:

```css
/* Chart (Task 3). Page classes are appended in Task 4. */
.chart {
  margin: 0;
}

.chartSvg {
  display: block;
  width: 100%;
  height: auto;
}

.bar {
  fill: #2563eb;
}
```

- [ ] **Step 2: Write the chart component**

Create `app/(admin)/admin/analytics/RevenueChart.tsx`:

```tsx
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
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: typecheck clean; build succeeds (the component is not yet imported, which is fine — Task 4 wires it in).

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/admin/analytics/RevenueChart.tsx" "app/(admin)/admin/analytics/analytics.module.css"
git commit -m "Add inline-SVG revenue chart component"
```

---

## Task 4: Analytics page + nav link

**Files:**
- Create: `app/(admin)/admin/analytics/page.tsx`
- Modify: `app/(admin)/admin/analytics/analytics.module.css` (append page classes)
- Modify: `app/(admin)/layout.tsx`

**Interfaces:**
- Consumes: `requireAdmin` (`@/lib/admin/auth`), `getRevenueAnalytics` (`@/lib/admin/analytics`), `formatMoney` (`@/lib/money`), `site` (`@/lib/site`), `RevenueChart` (`./RevenueChart`).
- Produces: the route `/admin/analytics`.

- [ ] **Step 1: Append page styles**

Append to `app/(admin)/admin/analytics/analytics.module.css`:

```css
/* Page (Task 4). */
.header {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.heading {
  font-size: 1.5rem;
  margin: 0;
}

.windowLabel {
  color: var(--muted, #737373);
  font-size: 0.875rem;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem;
  border: 1px solid var(--border, #e5e5e5);
  border-radius: 0.5rem;
}

.tileLabel {
  color: var(--muted, #737373);
  font-size: 0.8125rem;
}

.tileValue {
  font-size: 1.25rem;
  font-weight: 700;
}

.section {
  margin: 1.5rem 0;
}

.sectionHeading {
  font-size: 1rem;
  margin: 0 0 0.5rem;
}

.empty {
  color: var(--muted, #737373);
}

.tableWrap {
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9375rem;
}

.table th,
.table td {
  text-align: left;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--border, #e5e5e5);
  vertical-align: middle;
}
```

- [ ] **Step 2: Write the page**

Create `app/(admin)/admin/analytics/page.tsx`:

```tsx
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { getRevenueAnalytics } from "@/lib/admin/analytics";
import { formatMoney } from "@/lib/money";
import { site } from "@/lib/site";
import { RevenueChart } from "./RevenueChart";
import styles from "./analytics.module.css";

export const metadata: Metadata = { title: "Analytics" };

export default async function AdminAnalytics() {
  await requireAdmin();
  const { totals, daily, topItems } = await getRevenueAnalytics();

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.heading}>Analytics</h1>
        <span className={styles.windowLabel}>Last 30 days</span>
      </div>

      <div className={styles.tiles}>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Revenue</span>
          <span className={styles.tileValue}>{formatMoney(totals.revenueCents, site.currency)}</span>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Orders</span>
          <span className={styles.tileValue}>{totals.orderCount}</span>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Avg order value</span>
          <span className={styles.tileValue}>
            {formatMoney(totals.avgOrderValueCents, site.currency)}
          </span>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Items sold</span>
          <span className={styles.tileValue}>{totals.itemsSold}</span>
        </div>
      </div>

      {totals.orderCount === 0 ? (
        <p className={styles.empty}>No orders in the last 30 days.</p>
      ) : (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionHeading}>Revenue over time</h2>
            <RevenueChart data={daily} currency={site.currency} />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionHeading}>Top-selling items</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topItems.map((item) => (
                    <tr key={item.description}>
                      <td>{item.description}</td>
                      <td>{item.quantity}</td>
                      <td>{formatMoney(item.revenueCents, site.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 3: Add the nav link**

In `app/(admin)/layout.tsx`, add an Analytics link immediately after the Orders link:

```tsx
        <nav className={styles.nav}>
          <Link href="/admin">Products</Link>
          <Link href="/admin/orders">Orders</Link>
          <Link href="/admin/analytics">Analytics</Link>
          <Link href="/">View store</Link>
          <form action={logout}>
            <button type="submit" className={styles.linkButton}>
              Sign out
            </button>
          </form>
        </nav>
```

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: typecheck clean; build compiles the `/admin/analytics` route with no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/admin/analytics/page.tsx" "app/(admin)/admin/analytics/analytics.module.css" "app/(admin)/layout.tsx"
git commit -m "Add admin analytics page and nav link"
```

---

## Task 5: Documentation + full verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the analytics screen**

In `README.md`, add this bullet to the admin feature list, immediately after the "Managing orders" bullet:

```markdown
- **Sales analytics.** `/admin/analytics` shows the last 30 days at a glance: total revenue,
  order count, average order value, items sold, a daily revenue chart, and top-selling items.
  Refunded orders are excluded. Traffic/page-view analytics is not included.
```

- [ ] **Step 2: Run the full suite**

Run: `npm run test && npm run typecheck && npm run build`
Expected: all tests pass (including `analyticsSeries`), typecheck clean, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document the admin analytics screen"
```

---

## Self-Review Notes

- **Spec coverage:** pure series fill + tests (Task 1) ← spec §2 and §Testing; data access `getRevenueAnalytics` (Task 2) ← spec §1 and §Data model (revenue definition, window, refunded exclusion, avg-order-value zero guard, itemsSold); chart (Task 3) ← spec §4; page + tiles + top-items table + empty state (Task 4) ← spec §3; nav link (Task 4) ← spec §5; README (Task 5) ← spec §Documentation. Error handling (`requireAdmin`, error boundary, no mutation) is realized in Tasks 2/4 and the Global Constraints.
- **Type consistency:** `DailyRevenue` is defined once in `analyticsSeries.ts` (Task 1) and re-exported by `analytics.ts` (Task 2); the chart (Task 3) and page (Task 4) import the same shapes. `getRevenueAnalytics` returns `RevenueAnalytics` with `totals`/`daily`/`topItems`, consumed by the page exactly as declared. `RevenueChart` props (`data: DailyRevenue[]`, `currency: string`) match the page's call site.
- **Constraints honored:** integer cents with edge formatting via `site.currency`; revenue = non-refunded `total_cents`; single 30-day window across all metrics; avg-order-value zero guard; no schema changes; no new dependencies (hand-rolled SVG); `requireAdmin` at page top; read-only (no `revalidatePath`).
- **Deliberate:** the DB-timezone bucketing and the `new Date()` vs `current_date` boundary caveat are accepted per spec for a single-owner admin; totals are computed by a separate `SUM` query and are unaffected by any boundary skew. The chart color is a dataviz-palette placeholder; the implementer loads the dataviz skill in Task 3 to finalize palette/a11y.

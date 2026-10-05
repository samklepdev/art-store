# Admin analytics dashboard — design

**Date:** 2026-09-29

## Problem

The admin can manage products and view/fulfill orders, but there is no at-a-glance view
of how the shop is doing. To answer "how much have I sold lately and what's selling," the
owner has to open the Stripe dashboard or query Postgres. The `orders` / `order_items`
tables already hold everything needed for a sales view; nothing surfaces it.

## Scope

Build an admin screen at **`/admin/analytics`** showing headline sales stats and a
revenue-over-time chart for a recent window, computed entirely from existing data.

- Headline stat tiles: total revenue, order count, average order value, items sold.
- A daily revenue-over-time bar chart.
- A short "top-selling items" table.

**All metrics are scoped to the same rolling window (the last 30 days)** so the tiles, chart,
and table are mutually consistent and unambiguous. The screen is labelled with that window.

**Out of scope** (deliberate, YAGNI):

- **Page-view / traffic analytics.** There is no traffic data source today: nothing tracks
  visits, and `proxy.ts` only runs on `/admin/*`. Adding it means a new table, broadening the
  proxy matcher to storefront routes, and fire-and-forget logging — and the charts stay empty
  until real traffic accrues. It is a separate feature with its own spec, plan, and branch.
- **Configurable date ranges / granularity.** Fixed at last-30-days, daily. Easy to
  parameterize later; a single window keeps v1 legible.
- **Multi-currency aggregation.** The store is single-currency (`usd`, `site.currency`).
  Summing amounts across currencies would be meaningless, so metrics aggregate in integer
  cents and format once with `site.currency`. If the store ever adds a second currency this
  screen must be revisited.
- **Exporting, comparisons vs. previous period, per-product drilldowns.**

## Data model

No schema changes. Everything comes from the existing tables:

- `orders(id, currency, subtotal_cents, shipping_cents, total_cents, status, created_at, …)`
- `order_items(id, order_id, description, quantity, unit_price_cents, total_cents, …)`

**Definitions (fixed for v1):**

- **Revenue** = `SUM(orders.total_cents)` — actual money received, *including* shipping.
- **Refunded orders are excluded** from every metric: the window filter is
  `status <> 'refunded'` (so `paid` and `fulfilled` both count). Nothing in the app sets
  `refunded` today, but the filter is correct if it ever appears.
- **Window** = orders with `created_at >= (current_date - 29 days)` — i.e. today plus the
  preceding 29 calendar days, 30 days inclusive. Days are bucketed by `created_at::date` in
  the **database server's timezone**; for a single-owner admin this is acceptable and is noted
  here so it is a conscious choice, not an accident.
- **Items sold** = `SUM(order_items.quantity)` over items belonging to in-window,
  non-refunded orders.
- **Average order value** = `revenueCents / orderCount`, integer-divided in cents, or `0`
  when `orderCount` is `0` (never divide by zero).

## Components

### 1. Data access — `lib/admin/analytics.ts`

New `server-only` module mirroring `lib/admin/orders.ts`. One exported function:

```ts
// DailyRevenue is defined in analyticsSeries.ts (§2, the single source of truth)
// and re-exported here so consumers can import either shape from one module:
import { fillDailySeries, type DailyRevenue } from "@/lib/admin/analyticsSeries";
export type { DailyRevenue };

export type TopItem = { description: string; quantity: number; revenueCents: number };

export type RevenueAnalytics = {
  totals: {
    revenueCents: number;
    orderCount: number;
    avgOrderValueCents: number;
    itemsSold: number;
  };
  daily: DailyRevenue[];   // exactly `days` entries, oldest first, zero-filled
  topItems: TopItem[];     // up to 5, highest revenue first
};

export async function getRevenueAnalytics(days?: number): Promise<RevenueAnalytics>;
```

- `days` defaults to `30`.
- Runs a small number of aggregate queries against `orders` / `order_items`, all filtered to
  the window and `status <> 'refunded'`:
  - **totals**: one row of `SUM(total_cents)`, `COUNT(*)`, and (via `order_items`)
    `SUM(quantity)`.
  - **daily**: `created_at::date` grouped, `SUM(total_cents)` per day — a **sparse** result
    (only days that had orders).
  - **topItems**: `order_items` joined to in-window non-refunded orders, grouped by
    `description`, `SUM(quantity)` and `SUM(total_cents)`, ordered by revenue desc, `LIMIT 5`.
- The sparse daily rows are passed through `fillDailySeries` (below) to produce the continuous
  `daily` array. `avgOrderValueCents` is computed here as `orderCount === 0 ? 0 :
  Math.round(revenueCents / orderCount)`.
- Money stays in integer cents throughout; formatting happens only in the page.

Data-access SQL is not unit-tested, matching the `orders.ts` / `products.ts` convention.

### 2. Pure series fill — `lib/admin/analyticsSeries.ts` (+ `.test.ts`)

The one piece of pure, testable logic, following the repo's convention of extracting testable
units (`slug.ts`, `orderStatus.ts`).

```ts
export type DailyRevenue = { date: string; revenueCents: number };

/**
 * Expands sparse per-day revenue rows into a continuous, zero-filled series of
 * exactly `days` entries ending on `endDate` (inclusive), oldest first. Days
 * with no orders get revenueCents = 0. Rows outside the window are ignored.
 */
export function fillDailySeries(
  rows: DailyRevenue[],
  endDate: Date,
  days: number,
): DailyRevenue[];
```

- `endDate` is passed in (not read from the clock) so the function is deterministic and
  testable. `getRevenueAnalytics` passes "today".
- Dates are `YYYY-MM-DD` strings; the function builds the window from `endDate` back
  `days - 1` days and matches rows by date string.

`DailyRevenue` is defined here and re-exported by `analytics.ts` (single source of truth for
the shape), so the two modules can't drift.

Unit-tested in `lib/admin/analyticsSeries.test.ts`:
- zero-fills days with no orders,
- an empty `rows` array yields `days` all-zero entries,
- a row outside the window is ignored,
- the series has exactly `days` entries, oldest first, with correct boundary dates.

### 3. Page — `app/(admin)/admin/analytics/page.tsx`

Server component under the existing `(admin)` group.

- `requireAdmin()` at the top, then `getRevenueAnalytics()`.
- Renders, in order: a heading noting the window ("Last 30 days"), a row of stat tiles
  (revenue, orders, avg order value, items sold — money via `formatMoney(cents,
  site.currency)`), the revenue chart, and the top-items table.
- Empty state (no orders in the window): the tiles show zeros and the chart/table render an
  unobtrusive "No orders in the last 30 days." message rather than an empty chart.
- Styled with a new sibling `analytics.module.css`.

### 4. Revenue chart — `app/(admin)/admin/analytics/RevenueChart.tsx`

A hand-rolled **inline-SVG** bar chart — zero new dependencies, matching the project's
dependency-light house style. Implemented as a **server** component (the data is static per
render; no interactivity requiring client JS):

- One bar per day in the `daily` series; bar height scales to the max daily revenue in the
  window (all-zero window → all bars flat/empty, handled without dividing by zero).
- Per-bar `<title>` gives the date and formatted revenue on hover.
- A visually-hidden `<table>` of the same data provides an accessible, screen-reader-friendly
  equivalent (the repo already uses the `visually-hidden` global class).
- Colors and layout follow the **dataviz** skill's guidance (palette, axis/label treatment,
  accessible contrast). The implementation plan will load that skill before writing chart code.

Single-series and revenue-specific by intent (YAGNI) — no premature generic charting library.

### 5. Navigation

Add an **Analytics** link to `app/(admin)/layout.tsx` nav, alongside **Products** and
**Orders**.

## Data flow

1. Owner opens `/admin/analytics` → `requireAdmin()` guards it.
2. `getRevenueAnalytics()` runs the aggregate queries, computes totals + avg, and calls
   `fillDailySeries` to build the continuous daily series.
3. The page renders tiles, `RevenueChart`, and the top-items table from that one result.

The screen is read-only: no actions, no writes, so no `revalidatePath` and no storefront
impact.

## Error handling

- The page guards with `requireAdmin()` (redirects to login when the session expired).
- No user input to validate (fixed window, no query params in v1).
- Unexpected DB errors propagate to the existing `(admin)` error boundary
  (`app/(admin)/error.tsx`), consistent with the rest of the admin. There is no "expected
  failure returned as data" path because there is no mutation.

## Testing

- `lib/admin/analyticsSeries.test.ts` — unit tests for `fillDailySeries` (zero-fill, empty
  input, out-of-window rows ignored, exact length and boundary dates, oldest-first order).
- Data-access (`getRevenueAnalytics`) and the page/chart are not unit-tested, matching the
  existing admin convention; verification is `npm run typecheck` and `npm run build`.

## Documentation

Update the README admin section: a sales analytics screen now exists at `/admin/analytics`
showing revenue, order count, average order value, items sold, a 30-day revenue chart, and
top-selling items; refunded orders are excluded and page-view/traffic analytics is not
included.

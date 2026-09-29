# Admin Orders Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the shop owner an admin screen to view paid orders and mark them fulfilled, without opening Stripe or Postgres.

**Architecture:** A new `server-only` data-access module (`lib/admin/orders.ts`) mirrors `lib/admin/products.ts`. One pure, unit-tested guard (`lib/admin/orderStatus.ts`) validates the settable statuses. A server action added to the existing `app/(admin)/admin/actions.ts` flips status and revalidates. Two pages under the existing `(admin)` route group render the list and detail; a small client component drives the fulfillment toggle. No schema changes.

**Tech Stack:** Next.js (this repo's vendored build — read `node_modules/next/dist/docs/` before touching page/route conventions), React Server Components + server actions, node-postgres (`pool`), CSS Modules, Vitest.

## Global Constraints

- **No schema changes.** The `orders` and `order_items` tables already exist; use them as-is.
- **Money stays in integer cents** end to end; format only at the edge with `formatMoney(cents, currency)` from `@/lib/money`. Currency comes from the order row (`order.currency`), never `site.currency`.
- **`requireAdmin()` guards every page and action**, and in actions it stays **outside** the `try` — it calls `redirect()`, which works by throwing, so a `try` around it would swallow the navigation. Expected failures are returned as `{ ok: false, error }` data, never thrown.
- **node-postgres returns `timestamptz` columns as JS `Date` at runtime.** `pool.query<T>()`'s generic is a compile-time assertion that coerces nothing (see the comment in `lib/admin/products.ts:11-13`). The public types declare `createdAt: string` (ISO), so map the `Date` to `.toISOString()` at the data-access boundary.
- **SQL data-access functions are not unit-tested** (matching `lib/admin/products.ts`); only the pure guard is. Their verification is `npm run typecheck`.
- **Follow existing relative-import conventions:** pages/components import the actions module by relative path (e.g. `./actions`, `../../actions`), and import `lib` modules via the `@/` alias.

---

## File Structure

- **Create** `lib/admin/orderStatus.ts` — pure guard: `SETTABLE_STATUSES`, `SettableStatus`, `isSettableStatus`. Unit-tested.
- **Create** `lib/admin/orderStatus.test.ts` — Vitest unit tests for the guard.
- **Create** `lib/admin/orders.ts` — `server-only` data access: `listOrders`, `getOrder`, `setOrderStatus`, plus address mapping.
- **Modify** `lib/types.ts` — add `OrderStatus`, `OrderSummary`, `OrderItem`, `ShippingAddress`, `OrderDetail`.
- **Modify** `app/(admin)/admin/actions.ts` — add `setOrderStatusAction`.
- **Create** `app/(admin)/admin/orders/page.tsx` — orders list (server component).
- **Create** `app/(admin)/admin/orders/orders.module.css` — styles for both list and detail.
- **Create** `app/(admin)/admin/orders/[id]/page.tsx` — order detail (server component).
- **Create** `app/(admin)/admin/orders/[id]/FulfillmentControl.tsx` — `"use client"` toggle.
- **Modify** `app/(admin)/layout.tsx` — add an **Orders** nav link.
- **Modify** `README.md` — update the "Managing orders" note.

---

## Task 1: Status guard + shared types

**Files:**
- Create: `lib/admin/orderStatus.ts`
- Test: `lib/admin/orderStatus.test.ts`
- Modify: `lib/types.ts` (append)

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `SETTABLE_STATUSES: readonly ["paid", "fulfilled"]`
  - `type SettableStatus = "paid" | "fulfilled"`
  - `isSettableStatus(x: unknown): x is SettableStatus`
  - Types in `lib/types.ts`: `OrderStatus`, `OrderSummary`, `OrderItem`, `ShippingAddress`, `OrderDetail` (exact shapes below).

- [ ] **Step 1: Write the failing test**

Create `lib/admin/orderStatus.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isSettableStatus } from "./orderStatus";

describe("isSettableStatus", () => {
  it("accepts paid", () => {
    expect(isSettableStatus("paid")).toBe(true);
  });

  it("accepts fulfilled", () => {
    expect(isSettableStatus("fulfilled")).toBe(true);
  });

  it("rejects refunded (set only in Stripe, never by the admin)", () => {
    expect(isSettableStatus("refunded")).toBe(false);
  });

  it("rejects unknown strings", () => {
    expect(isSettableStatus("shipped")).toBe(false);
    expect(isSettableStatus("")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isSettableStatus(null)).toBe(false);
    expect(isSettableStatus(undefined)).toBe(false);
    expect(isSettableStatus(1)).toBe(false);
    expect(isSettableStatus({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- orderStatus`
Expected: FAIL — cannot find module `./orderStatus` (or `isSettableStatus is not a function`).

- [ ] **Step 3: Write minimal implementation**

Create `lib/admin/orderStatus.ts`:

```ts
/**
 * The statuses the admin may set from the order screen. `refunded` is
 * deliberately excluded: refunds are issued in the Stripe dashboard, and
 * nothing in the app ever sets that status (see
 * docs/superpowers/specs/2026-09-29-admin-orders-design.md).
 */
export const SETTABLE_STATUSES = ["paid", "fulfilled"] as const;

export type SettableStatus = (typeof SETTABLE_STATUSES)[number];

/** Narrows untrusted action input to a status the admin is allowed to set. */
export function isSettableStatus(x: unknown): x is SettableStatus {
  return typeof x === "string" && (SETTABLE_STATUSES as readonly string[]).includes(x);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- orderStatus`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the shared types**

Append to `lib/types.ts`:

```ts
export type OrderStatus = "paid" | "fulfilled" | "refunded";

export type OrderSummary = {
  id: number;
  email: string | null;
  customerName: string | null;
  currency: string;
  totalCents: number;
  status: OrderStatus;
  itemCount: number;
  createdAt: string; // ISO
};

export type OrderItem = {
  id: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

export type ShippingAddress = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

export type OrderDetail = {
  id: number;
  stripeSessionId: string;
  email: string | null;
  customerName: string | null;
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  shippingAddress: ShippingAddress | null;
  status: OrderStatus;
  createdAt: string; // ISO
  items: OrderItem[];
};
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/admin/orderStatus.ts lib/admin/orderStatus.test.ts lib/types.ts
git commit -m "Add order status guard and admin order types"
```

---

## Task 2: Data access — `lib/admin/orders.ts`

**Files:**
- Create: `lib/admin/orders.ts`

**Interfaces:**
- Consumes: `pool` from `@/lib/db`; `OrderDetail`, `OrderItem`, `OrderStatus`, `OrderSummary`, `ShippingAddress` from `@/lib/types`.
- Produces:
  - `listOrders(): Promise<OrderSummary[]>` — all orders newest-first, each with an `itemCount`.
  - `getOrder(id: number): Promise<OrderDetail | null>` — order + its items; `null` when the id doesn't exist.
  - `setOrderStatus(id: number, status: OrderStatus): Promise<void>` — updates `orders.status`.

- [ ] **Step 1: Write the module**

Create `lib/admin/orders.ts`:

```ts
import "server-only";
import { pool } from "@/lib/db";
import type {
  OrderDetail,
  OrderItem,
  OrderStatus,
  OrderSummary,
  ShippingAddress,
} from "@/lib/types";

// node-postgres parses timestamptz into a JS Date at runtime; the query generic
// is a compile-time assertion only (see lib/admin/products.ts), so the raw row
// carries a Date and we map it to an ISO string at this boundary.
type OrderSummaryRow = Omit<OrderSummary, "createdAt"> & { createdAt: Date };

export async function listOrders(): Promise<OrderSummary[]> {
  const { rows } = await pool.query<OrderSummaryRow>(
    `SELECT
       o.id,
       o.email,
       o.customer_name AS "customerName",
       o.currency,
       o.total_cents   AS "totalCents",
       o.status,
       o.created_at    AS "createdAt",
       (SELECT COUNT(*)::int FROM order_items WHERE order_id = o.id) AS "itemCount"
     FROM orders o
     ORDER BY o.created_at DESC, o.id DESC`,
  );
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

// The shipping_address jsonb is Stripe's Address shape (snake_case). recordOrder
// stores `shipping.address` verbatim: line1, line2, city, state, postal_code,
// country — any of which may be absent.
type StripeAddress = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

type OrderRow = {
  id: number;
  stripeSessionId: string;
  email: string | null;
  customerName: string | null;
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  shippingAddress: StripeAddress | null;
  status: OrderStatus;
  createdAt: Date;
};

function mapAddress(raw: StripeAddress | null): ShippingAddress | null {
  if (!raw) return null;
  return {
    line1: raw.line1 ?? null,
    line2: raw.line2 ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    postalCode: raw.postal_code ?? null,
    country: raw.country ?? null,
  };
}

export async function getOrder(id: number): Promise<OrderDetail | null> {
  const { rows } = await pool.query<OrderRow>(
    `SELECT
       id,
       stripe_session_id AS "stripeSessionId",
       email,
       customer_name  AS "customerName",
       currency,
       subtotal_cents AS "subtotalCents",
       shipping_cents AS "shippingCents",
       total_cents    AS "totalCents",
       shipping_address AS "shippingAddress",
       status,
       created_at     AS "createdAt"
     FROM orders WHERE id = $1`,
    [id],
  );
  const order = rows[0];
  if (!order) return null;

  const { rows: items } = await pool.query<OrderItem>(
    `SELECT id,
            description,
            quantity,
            unit_price_cents AS "unitPriceCents",
            total_cents      AS "totalCents"
       FROM order_items
      WHERE order_id = $1
      ORDER BY id`,
    [id],
  );

  return {
    ...order,
    createdAt: order.createdAt.toISOString(),
    shippingAddress: mapAddress(order.shippingAddress),
    items,
  };
}

export async function setOrderStatus(id: number, status: OrderStatus): Promise<void> {
  await pool.query(`UPDATE orders SET status = $2 WHERE id = $1`, [id, status]);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/admin/orders.ts
git commit -m "Add admin orders data-access module"
```

---

## Task 3: Server action — `setOrderStatusAction`

**Files:**
- Modify: `app/(admin)/admin/actions.ts`

**Interfaces:**
- Consumes: `requireAdmin` (`@/lib/admin/auth`), `messageForDbError` (`@/lib/admin/errors`), `revalidatePath` (`next/cache`), `setOrderStatus` (`@/lib/admin/orders`), `isSettableStatus` + `SettableStatus` (`@/lib/admin/orderStatus`), and the existing `ActionResult` type in this file.
- Produces: `setOrderStatusAction(id: number, status: SettableStatus): Promise<ActionResult>`.

- [ ] **Step 1: Add the imports**

At the top of `app/(admin)/admin/actions.ts`, alongside the existing `@/lib/admin/*` imports, add:

```ts
import { setOrderStatus } from "@/lib/admin/orders";
import { isSettableStatus, type SettableStatus } from "@/lib/admin/orderStatus";
```

- [ ] **Step 2: Add the action**

Append to `app/(admin)/admin/actions.ts` (after the image actions, at end of file):

```ts
export async function setOrderStatusAction(
  id: number,
  status: SettableStatus,
): Promise<ActionResult> {
  // requireAdmin() stays outside the try: it redirects on an expired session by
  // throwing, and a try here would swallow that navigation.
  await requireAdmin();

  if (!Number.isInteger(id)) return { ok: false, error: "Unknown order." };
  // The typed param is a compile-time hint only; a server action receives
  // untrusted input, so re-validate at the boundary.
  if (!isSettableStatus(status)) {
    return { ok: false, error: "That status can't be set here." };
  }

  try {
    await setOrderStatus(id, status);
  } catch (error) {
    return { ok: false, error: messageForDbError(error) ?? "Couldn't update. Try again." };
  }

  // Admin-only: no storefront revalidation. Order status never affects a
  // storefront page.
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  return { ok: true };
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/admin/actions.ts"
git commit -m "Add setOrderStatusAction server action"
```

---

## Task 4: Orders list page + styles + nav link

**Files:**
- Create: `app/(admin)/admin/orders/page.tsx`
- Create: `app/(admin)/admin/orders/orders.module.css`
- Modify: `app/(admin)/layout.tsx`

**Interfaces:**
- Consumes: `requireAdmin` (`@/lib/admin/auth`), `listOrders` (`@/lib/admin/orders`), `formatMoney` (`@/lib/money`), `site` (`@/lib/site`), `OrderStatus` (`@/lib/types`).
- Produces: the route `/admin/orders`; CSS classes reused by Task 5 (`header`, `heading`, `tableWrap`, `table`, `muted`, plus status badges).

- [ ] **Step 1: Write the stylesheet**

Create `app/(admin)/admin/orders/orders.module.css`:

```css
.header {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.heading {
  font-size: 1.5rem;
  margin: 0;
}

/* Wide tables scroll inside their own container rather than the page. */
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

.orderLink {
  font-weight: 600;
}

.muted {
  color: var(--muted, #737373);
  font-size: 0.8125rem;
}

.customerEmail {
  display: block;
  color: var(--muted, #737373);
  font-size: 0.8125rem;
}

.badgePaid,
.badgeFulfilled,
.badgeRefunded {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.badgePaid {
  background: #dbeafe;
  color: #1e40af;
}

.badgeFulfilled {
  background: #dcfce7;
  color: #166534;
}

.badgeRefunded {
  background: #f5f5f5;
  color: #525252;
}

/* Detail page */
.backLink {
  font-size: 0.9375rem;
}

.section {
  margin: 1.5rem 0;
}

.sectionHeading {
  font-size: 1rem;
  margin: 0 0 0.5rem;
}

.addressLines {
  font-style: normal;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.totals {
  margin: 1rem 0 0;
  max-width: 20rem;
  margin-left: auto;
}

.totalRow {
  display: flex;
  justify-content: space-between;
  padding: 0.25rem 0;
}

.grandTotal {
  border-top: 1px solid var(--border, #e5e5e5);
  margin-top: 0.25rem;
  padding-top: 0.5rem;
  font-weight: 700;
}

.control {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.rowError {
  font-size: 0.8125rem;
  color: var(--danger, #b91c1c);
}

.sessionId {
  margin-top: 0.75rem;
  color: var(--muted, #737373);
  font-size: 0.8125rem;
  word-break: break-all;
}
```

- [ ] **Step 2: Write the list page**

Create `app/(admin)/admin/orders/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listOrders } from "@/lib/admin/orders";
import { formatMoney } from "@/lib/money";
import { site } from "@/lib/site";
import type { OrderStatus } from "@/lib/types";
import styles from "./orders.module.css";

export const metadata: Metadata = { title: "Orders" };

const dateFormat = new Intl.DateTimeFormat(site.locale, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const STATUS_LABEL: Record<OrderStatus, string> = {
  paid: "Paid",
  fulfilled: "Fulfilled",
  refunded: "Refunded",
};

const STATUS_CLASS: Record<OrderStatus, string> = {
  paid: styles.badgePaid,
  fulfilled: styles.badgeFulfilled,
  refunded: styles.badgeRefunded,
};

export default async function AdminOrders() {
  await requireAdmin();
  const orders = await listOrders();

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.heading}>Orders</h1>
      </div>

      {orders.length === 0 ? (
        <p>No orders yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/admin/orders/${order.id}`} className={styles.orderLink}>
                      #{order.id}
                    </Link>
                  </td>
                  <td>{dateFormat.format(new Date(order.createdAt))}</td>
                  <td>
                    {order.customerName ?? <span className={styles.muted}>—</span>}
                    {order.email && <span className={styles.customerEmail}>{order.email}</span>}
                  </td>
                  <td>{order.itemCount}</td>
                  <td>{formatMoney(order.totalCents, order.currency)}</td>
                  <td>
                    <span className={STATUS_CLASS[order.status]}>{STATUS_LABEL[order.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Add the nav link**

In `app/(admin)/layout.tsx`, add an Orders link immediately after the Products link:

```tsx
        <nav className={styles.nav}>
          <Link href="/admin">Products</Link>
          <Link href="/admin/orders">Orders</Link>
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
Expected: typecheck clean; build compiles `/admin/orders` with no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/admin/orders/page.tsx" "app/(admin)/admin/orders/orders.module.css" "app/(admin)/layout.tsx"
git commit -m "Add admin orders list page and nav link"
```

---

## Task 5: Order detail page + fulfillment control

**Files:**
- Create: `app/(admin)/admin/orders/[id]/page.tsx`
- Create: `app/(admin)/admin/orders/[id]/FulfillmentControl.tsx`

**Interfaces:**
- Consumes: `requireAdmin` (`@/lib/admin/auth`), `getOrder` (`@/lib/admin/orders`), `formatMoney` (`@/lib/money`), `site` (`@/lib/site`), `OrderStatus`/`ShippingAddress` (`@/lib/types`), `notFound` (`next/navigation`), `setOrderStatusAction` (`../../actions`), and `orders.module.css` from Task 4 (`../orders.module.css`).
- Produces: the route `/admin/orders/[id]`.

- [ ] **Step 1: Write the client control**

Create `app/(admin)/admin/orders/[id]/FulfillmentControl.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import type { OrderStatus } from "@/lib/types";
import { setOrderStatusAction } from "../../actions";
import styles from "../orders.module.css";

export function FulfillmentControl({
  orderId,
  status,
}: {
  orderId: number;
  status: OrderStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Nothing in the app sets `refunded`; if one ever appears, there is no admin
  // action for it — refunds live in Stripe.
  if (status === "refunded") {
    return <p className={styles.muted}>This order was refunded in Stripe.</p>;
  }

  const next = status === "paid" ? "fulfilled" : "paid";
  const label = status === "paid" ? "Mark fulfilled" : "Mark paid";

  return (
    <div className={styles.control}>
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          // Await the promise so React holds the transition pending (a
          // synchronous undefined would end it at once). No try/catch:
          // setOrderStatusAction calls requireAdmin(), which redirects on an
          // expired session, and a catch here would swallow that navigation.
          // Expected failures arrive as a returned ActionResult.
          startTransition(async () => {
            setError(null);
            const result = await setOrderStatusAction(orderId, next);
            if (!result.ok) setError(result.error);
          })
        }
      >
        {label}
      </button>
      {error && (
        <span className={styles.rowError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the detail page**

Create `app/(admin)/admin/orders/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getOrder } from "@/lib/admin/orders";
import { formatMoney } from "@/lib/money";
import { site } from "@/lib/site";
import type { OrderStatus, ShippingAddress } from "@/lib/types";
import { FulfillmentControl } from "./FulfillmentControl";
import styles from "../orders.module.css";

export const metadata: Metadata = { title: "Order" };

const dateFormat = new Intl.DateTimeFormat(site.locale, {
  dateStyle: "long",
  timeStyle: "short",
});

const STATUS_LABEL: Record<OrderStatus, string> = {
  paid: "Paid",
  fulfilled: "Fulfilled",
  refunded: "Refunded",
};

const STATUS_CLASS: Record<OrderStatus, string> = {
  paid: styles.badgePaid,
  fulfilled: styles.badgeFulfilled,
  refunded: styles.badgeRefunded,
};

function addressLines(address: ShippingAddress): string[] {
  return [
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
    address.country,
  ].filter((line): line is string => Boolean(line && line.trim()));
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();

  const order = await getOrder(id);
  if (!order) notFound();

  const lines = order.shippingAddress ? addressLines(order.shippingAddress) : [];

  return (
    <>
      <p>
        <Link href="/admin/orders" className={styles.backLink}>
          ← All orders
        </Link>
      </p>

      <div className={styles.header}>
        <h1 className={styles.heading}>Order #{order.id}</h1>
        <span className={STATUS_CLASS[order.status]}>{STATUS_LABEL[order.status]}</span>
      </div>

      <p className={styles.muted}>Placed {dateFormat.format(new Date(order.createdAt))}</p>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Customer</h2>
        <p>{order.customerName ?? "—"}</p>
        {order.email && <p>{order.email}</p>}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Shipping address</h2>
        {lines.length > 0 ? (
          <address className={styles.addressLines}>
            {lines.map((line, i) => (
              <span key={i}>{line}</span>
            ))}
          </address>
        ) : (
          <p className={styles.muted}>No shipping address on file.</p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Items</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>{formatMoney(item.unitPriceCents, order.currency)}</td>
                  <td>{formatMoney(item.totalCents, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className={styles.totals}>
          <div className={styles.totalRow}>
            <dt>Subtotal</dt>
            <dd>{formatMoney(order.subtotalCents, order.currency)}</dd>
          </div>
          <div className={styles.totalRow}>
            <dt>Shipping</dt>
            <dd>{formatMoney(order.shippingCents, order.currency)}</dd>
          </div>
          <div className={`${styles.totalRow} ${styles.grandTotal}`}>
            <dt>Total</dt>
            <dd>{formatMoney(order.totalCents, order.currency)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.section}>
        <FulfillmentControl orderId={order.id} status={order.status} />
        <p className={styles.sessionId}>Stripe session: {order.stripeSessionId}</p>
      </section>
    </>
  );
}
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: typecheck clean; build compiles `/admin/orders/[id]` with no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/admin/orders/[id]/page.tsx" "app/(admin)/admin/orders/[id]/FulfillmentControl.tsx"
git commit -m "Add admin order detail page and fulfillment control"
```

---

## Task 6: Documentation + full verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the "Managing orders" note**

In `README.md`, replace the existing bullet:

```markdown
- **Managing orders.** Orders appear in both the Stripe dashboard and the `orders` /
  `order_items` tables. The admin covers products only — there is no order screen yet, and
  `orders.status` is never advanced past `paid`.
```

with:

```markdown
- **Managing orders.** Orders appear in both the Stripe dashboard and the `orders` /
  `order_items` tables. The admin has an order screen at `/admin/orders` for viewing paid
  orders and marking them fulfilled (reversible). Refunds are still issued in the Stripe
  dashboard — the app never sets the `refunded` status itself.
```

- [ ] **Step 2: Run the full suite**

Run: `npm run test && npm run typecheck && npm run build`
Expected: all tests pass (including `orderStatus`), typecheck clean, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document the admin order screen"
```

---

## Self-Review Notes

- **Spec coverage:** data access (Task 2) ← spec §1; status guard + tests (Task 1) ← spec §2 and §Testing; pages (Tasks 4–5) ← spec §3; server action (Task 3) ← spec §4; fulfillment control (Task 5) ← spec §5; nav link (Task 4) ← spec §6; README (Task 6) ← spec §Documentation. Types (Task 1) ← spec §Data model. Error handling (`requireAdmin`, `notFound`, `messageForDbError`, inline errors) is realized in Tasks 2/3/5.
- **Deviation from spec, deliberate:** `setOrderStatus` is typed `status: OrderStatus` per the spec; the action passes a value already narrowed by `isSettableStatus` to `SettableStatus` (assignable to `OrderStatus`). The `refunded` case in `FulfillmentControl` renders a note and no button — the spec says `refunded` is rendered correctly if it ever appears but is never set by the app.
- **Type consistency:** `createdAt` is `string` (ISO) in every public type and mapped from a `Date` at the data-access boundary; `SettableStatus` is used consistently for the action param and the control's `next` value; status label/class maps are duplicated across the two pages by design (the repo favors small local duplication over shared UI machinery, cf. `priceLabel` in `ProductRow`).

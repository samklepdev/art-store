# Admin order screen — design

**Date:** 2026-09-29

## Problem

The admin covers products only. The README notes: *"there is no order screen yet, and
`orders.status` is never advanced past `paid`."* Paid orders land in the `orders` /
`order_items` tables (written by the Stripe webhook) but the shop owner has no way to see them
or track fulfillment without opening the Stripe dashboard or querying Postgres directly.

## Scope

Build an admin screen to **view paid orders and mark them fulfilled**.

- View a newest-first list of all orders.
- View a single order's details: customer, shipping address, line items, totals.
- Flip status between `paid` and `fulfilled` (reversible).

**Out of scope** (deliberate, YAGNI):

- **Refunds.** Refunds are issued in the Stripe dashboard, per the README's model. The app
  never calls the Stripe refund API. The `refunded` status is rendered correctly if it ever
  appears, but nothing in the app sets it today (the webhook only handles the paid events).
- **Status filtering and pagination.** An art store's volume doesn't warrant them. A
  newest-first list is enough; both are easy to add later.
- **Order editing / manual order creation.** Orders are created only by the webhook.

## Data model

No schema changes. The existing tables already support this:

- `orders(id, stripe_session_id, email, customer_name, currency, subtotal_cents,
  shipping_cents, total_cents, shipping_address jsonb, status, created_at)` — `status` defaults
  to `'paid'` and is documented as `paid, fulfilled, refunded`.
- `order_items(id, order_id, variant_id, description, quantity, unit_price_cents, total_cents)`.

Money stays in cents throughout and is formatted at the edge with the existing `lib/money.ts`
helpers. Currency comes from the order row.

## Components

### 1. Data access — `lib/admin/orders.ts`

New `server-only` module mirroring `lib/admin/products.ts`.

- `listOrders(): Promise<OrderSummary[]>` — all orders newest-first (`created_at DESC`), each
  with a computed line-item count. One query joining/aggregating `order_items`.
- `getOrder(id: number): Promise<OrderDetail | null>` — one order plus its `order_items` rows;
  `null` when the id doesn't exist.
- `setOrderStatus(id: number, status: OrderStatus): Promise<void>` — updates `orders.status`.

Return shapes are added to `lib/types.ts` next to the existing types:

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

The `shipping_address` jsonb is Stripe's address shape (`line1`, `line2`, `city`, `state`,
`postal_code`, `country`); `getOrder` maps it to `ShippingAddress`.

### 2. Status guard — `lib/admin/orderStatus.ts` (+ `.test.ts`)

The one piece of pure, testable logic. Following the repo's convention of extracting testable
units (`slug.ts`, `variantInput.ts`):

- `SETTABLE_STATUSES = ["paid", "fulfilled"] as const` — the statuses the admin may set.
- `isSettableStatus(x: unknown): x is "paid" | "fulfilled"` — validates action input.

Unit-tested in `lib/admin/orderStatus.test.ts` (accepts the two allowed values; rejects
`refunded`, unknown strings, non-strings). Data-access SQL functions aren't unit-tested, matching
`products.ts`.

### 3. Pages — under the existing `(admin)` group

- **`app/(admin)/admin/orders/page.tsx`** — list. `requireAdmin()` at the top, then
  `listOrders()`. A table in the products-list style with columns: Order # (id), Date, Customer
  (name, with email beneath), Items, Total, Status badge. Each row links to the detail page.
  Empty state: "No orders yet." Styled with a new sibling `orders.module.css` (mirroring the
  structure of `products.module.css`).
- **`app/(admin)/admin/orders/[id]/page.tsx`** — detail. `requireAdmin()`, then `getOrder(id)`;
  `notFound()` when null. Shows customer + email, shipping address, a line-items table
  (description × qty, unit price, line total), then subtotal / shipping / total, the status, and
  the Stripe session id for cross-reference. Renders the fulfillment control (below).

### 4. Server action — in `app/(admin)/admin/actions.ts`

Add to the existing actions file (where product actions live):

```ts
export async function setOrderStatusAction(
  id: number,
  status: "paid" | "fulfilled",
): Promise<ActionResult>
```

- `requireAdmin()` outside the `try` (same redirect-safety comment pattern as the other
  actions — `redirect()` throws, so it must not be caught).
- Validate `id` is an integer and `isSettableStatus(status)`; otherwise
  `{ ok: false, error: "..." }`.
- Call `setOrderStatus(id, status)` inside the `try`; expected DB errors returned via
  `messageForDbError`, never thrown.
- On success: `revalidatePath("/admin/orders")` and `revalidatePath(`/admin/orders/${id}`)`.
  No storefront revalidation — order status is admin-only.

### 5. Fulfillment control — client component

A small `"use client"` component (like `ProductRow`) rendered on the detail page:

- Shows a **Mark fulfilled** button when status is `paid`, **Mark paid** when `fulfilled`.
- Calls `setOrderStatusAction` and surfaces any returned `error` inline.
- Preserves progressive enhancement the way the existing admin rows/forms do.

### 6. Navigation

Add an **Orders** link to `app/(admin)/layout.tsx` nav, next to **Products**.

## Data flow

1. Stripe webhook (`recordOrder`, unchanged) inserts an order with `status = 'paid'`.
2. Admin opens `/admin/orders` → `listOrders()` renders the table.
3. Admin clicks a row → `/admin/orders/[id]` → `getOrder(id)` renders the detail.
4. Admin clicks **Mark fulfilled** → `setOrderStatusAction` → `setOrderStatus` updates the row →
   `revalidatePath` refreshes the list and detail.

## Error handling

- Pages guard with `requireAdmin()` (redirects to login when the session expired).
- Detail page `notFound()`s on a missing id.
- The action validates its inputs and returns expected failures as `{ ok: false, error }` data;
  the client renders the message inline. Unexpected errors propagate to the `(admin)` error
  boundary (`app/(admin)/error.tsx`), consistent with the rest of the admin.

## Testing

- `lib/admin/orderStatus.test.ts` — unit tests for `isSettableStatus` (accepts `paid`,
  `fulfilled`; rejects `refunded`, unknown strings, `null`/numbers).
- Data-access functions (`listOrders`, `getOrder`, `setOrderStatus`) are plain SQL and are not
  unit-tested, matching the existing `products.ts` convention.

## Documentation

Update the README "Managing orders" note: an order screen now exists at `/admin/orders` for
viewing orders and marking them fulfilled; refunds are still done in Stripe.

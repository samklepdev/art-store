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

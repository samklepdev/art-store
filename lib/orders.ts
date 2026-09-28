import "server-only";
import type Stripe from "stripe";
import { pool } from "./db";

/**
 * Saves a paid Stripe Checkout session as an order and reduces stock.
 * Safe to call more than once for the same session (Stripe retries webhooks).
 */
export async function recordOrder(session: Stripe.Checkout.Session, lineItems: Stripe.LineItem[]) {
  const shipping = session.collected_information?.shipping_details ?? null;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO orders
         (stripe_session_id, email, customer_name, currency,
          subtotal_cents, shipping_cents, total_cents, shipping_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (stripe_session_id) DO NOTHING
       RETURNING id`,
      [
        session.id,
        session.customer_details?.email ?? null,
        shipping?.name ?? session.customer_details?.name ?? null,
        session.currency ?? "usd",
        session.amount_subtotal ?? 0,
        session.total_details?.amount_shipping ?? 0,
        session.amount_total ?? 0,
        shipping ? JSON.stringify(shipping.address) : null,
      ],
    );

    const orderId = inserted.rows[0]?.id;
    if (!orderId) {
      await client.query("ROLLBACK"); // already recorded
      return;
    }

    for (const item of lineItems) {
      const product = item.price?.product;
      const variantId =
        product && typeof product === "object" && "metadata" in product
          ? Number(product.metadata.variantId)
          : NaN;
      const quantity = item.quantity ?? 1;

      await client.query(
        `INSERT INTO order_items
           (order_id, variant_id, description, quantity, unit_price_cents, total_cents)
         VALUES ($1, (SELECT id FROM variants WHERE id = $2), $3, $4, $5, $6)`,
        [
          orderId,
          Number.isInteger(variantId) ? variantId : null,
          item.description ?? "",
          quantity,
          item.price?.unit_amount ?? 0,
          item.amount_total,
        ],
      );

      if (Number.isInteger(variantId)) {
        await client.query(
          `UPDATE variants SET inventory = GREATEST(inventory - $2, 0)
           WHERE id = $1 AND inventory IS NOT NULL`,
          [variantId, quantity],
        );
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

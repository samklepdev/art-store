import "server-only";
import { pool } from "@/lib/db";

export type AdminVariant = {
  id: number;
  name: string;
  kind: "original" | "print";
  priceCents: number;
  compareAtCents: number | null;
  /** null = made to order, 0 = sold out, n = limited */
  inventory: number | null;
  sku: string | null;
  position: number;
};

export type VariantInput = Omit<AdminVariant, "id">;

export async function listVariants(productId: number): Promise<AdminVariant[]> {
  const { rows } = await pool.query<AdminVariant>(
    `SELECT id, name, kind,
            price_cents      AS "priceCents",
            compare_at_cents AS "compareAtCents",
            inventory, sku, position
       FROM variants WHERE product_id = $1
      ORDER BY position, id`,
    [productId],
  );
  return rows;
}

export async function createVariant(productId: number, input: VariantInput): Promise<void> {
  await pool.query(
    `INSERT INTO variants
       (product_id, name, kind, price_cents, compare_at_cents, inventory, sku, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      productId,
      input.name,
      input.kind,
      input.priceCents,
      input.compareAtCents,
      input.inventory,
      input.sku,
      input.position,
    ],
  );
}

export async function updateVariant(id: number, input: VariantInput): Promise<void> {
  await pool.query(
    `UPDATE variants SET
       name = $2, kind = $3, price_cents = $4, compare_at_cents = $5,
       inventory = $6, sku = $7, position = $8
     WHERE id = $1`,
    [
      id,
      input.name,
      input.kind,
      input.priceCents,
      input.compareAtCents,
      input.inventory,
      input.sku,
      input.position,
    ],
  );
}

export async function deleteVariant(id: number): Promise<void> {
  await pool.query(`DELETE FROM variants WHERE id = $1`, [id]);
}

/**
 * How many order lines reference this format.
 *
 * order_items.variant_id is ON DELETE SET NULL, so deleting a format someone
 * bought would null that order line's link to what was purchased — the same
 * harm that makes product removal unpublish-only. Callers must refuse the
 * delete when this is greater than zero.
 */
export async function countOrderItems(variantId: number): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM order_items WHERE variant_id = $1`,
    [variantId],
  );
  return rows[0]?.n ?? 0;
}

export async function productIdForVariant(id: number): Promise<number | null> {
  const { rows } = await pool.query<{ product_id: number }>(
    `SELECT product_id FROM variants WHERE id = $1`,
    [id],
  );
  return rows[0]?.product_id ?? null;
}

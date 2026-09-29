import "server-only";
import { pool } from "@/lib/db";
import type { ProductImage } from "@/lib/types";

export type AdminImage = ProductImage & { position: number };

export async function listImages(productId: number): Promise<AdminImage[]> {
  const { rows } = await pool.query<AdminImage>(
    `SELECT id, url, width, height, alt_text AS alt, position
       FROM product_images WHERE product_id = $1
      ORDER BY position, id`,
    [productId],
  );
  return rows;
}

export async function addImage(
  productId: number,
  input: { url: string; width: number; height: number; alt: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO product_images (product_id, url, width, height, alt_text, position)
     VALUES ($1, $2, $3, $4, $5,
       COALESCE((SELECT MAX(position) + 1 FROM product_images WHERE product_id = $1), 0))`,
    [productId, input.url, input.width, input.height, input.alt],
  );
}

export async function updateImageAlt(id: number, alt: string): Promise<void> {
  await pool.query(`UPDATE product_images SET alt_text = $2 WHERE id = $1`, [id, alt]);
}

/** Removes the row and leaves the stored object. That is the safe direction:
 *  it can never break a live page. */
export async function deleteImage(id: number): Promise<void> {
  await pool.query(`DELETE FROM product_images WHERE id = $1`, [id]);
}

/**
 * Writes a whole new ordering in one transaction. This relies on migration 001
 * having made product_images_product_id_position_key DEFERRABLE INITIALLY
 * DEFERRED — otherwise intermediate states trip the unique constraint.
 */
export async function applyImagePositions(
  productId: number,
  positions: { id: number; position: number }[],
): Promise<void> {
  if (positions.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const { id, position } of positions) {
      await client.query(
        `UPDATE product_images SET position = $3 WHERE id = $1 AND product_id = $2`,
        [id, productId, position],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function productIdForImage(id: number): Promise<number | null> {
  const { rows } = await pool.query<{ product_id: number }>(
    `SELECT product_id FROM product_images WHERE id = $1`,
    [id],
  );
  return rows[0]?.product_id ?? null;
}

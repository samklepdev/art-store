import "server-only";
import { cache } from "react";
import { pool } from "./db";
import type { SortKey } from "./shop";
import type { Collection, Product, ProductSummary } from "./types";

const ORDER_BY: Record<SortKey, string> = {
  featured: "p.featured DESC, p.sort_order, p.id DESC",
  newest: "p.year DESC NULLS LAST, p.created_at DESC",
  "price-asc": "v.min_price ASC, p.sort_order",
  "price-desc": "v.min_price DESC, p.sort_order",
};

const IMAGE_JSON = `json_build_object(
  'id', id, 'url', url, 'width', width, 'height', height, 'alt', alt_text
)`;

type ListOptions = {
  collection?: string | null;
  sort?: SortKey;
  featuredOnly?: boolean;
  excludeId?: number;
  limit?: number;
};

export async function getProducts({
  collection = null,
  sort = "featured",
  featuredOnly = false,
  excludeId,
  limit,
}: ListOptions = {}): Promise<ProductSummary[]> {
  const { rows } = await pool.query<ProductSummary>(
    `SELECT
       p.id, p.slug, p.title, p.collection,
       v.min_price          AS "minPriceCents",
       v.max_price          AS "maxPriceCents",
       v.on_sale            AS "onSale",
       v.available,
       v.original_available AS "originalAvailable",
       COALESCE(i.images, '[]') AS images
     FROM products p
     JOIN LATERAL (
       SELECT
         MIN(price_cents) AS min_price,
         MAX(price_cents) AS max_price,
         BOOL_OR(compare_at_cents IS NOT NULL) AS on_sale,
         BOOL_OR(inventory IS NULL OR inventory > 0) AS available,
         COALESCE(BOOL_OR(kind = 'original' AND (inventory IS NULL OR inventory > 0)), false)
           AS original_available
       FROM variants WHERE product_id = p.id
     ) v ON v.min_price IS NOT NULL
     LEFT JOIN LATERAL (
       SELECT json_agg(${IMAGE_JSON} ORDER BY position) AS images
       FROM (
         SELECT * FROM product_images WHERE product_id = p.id ORDER BY position LIMIT 2
       ) first_two
     ) i ON true
     WHERE p.published
       AND ($1::text IS NULL OR p.collection = $1::text)
       AND ($2::boolean = false OR p.featured)
       AND ($3::int IS NULL OR p.id <> $3::int)
     ORDER BY ${ORDER_BY[sort]}
     LIMIT $4::int`,
    [collection, featuredOnly, excludeId ?? null, limit ?? null],
  );
  return rows;
}

export const getCollections = cache(async (): Promise<Collection[]> => {
  const { rows } = await pool.query<Collection>(
    `WITH grouped AS (
       SELECT
         collection AS name,
         COUNT(*)::int AS count,
         MIN(sort_order) AS first_order,
         (ARRAY_AGG(id ORDER BY sort_order))[1] AS first_id
       FROM products
       WHERE published AND collection IS NOT NULL
       GROUP BY collection
     )
     SELECT
       g.name, g.count,
       (SELECT ${IMAGE_JSON} FROM product_images
          WHERE product_id = g.first_id ORDER BY position LIMIT 1) AS image
     FROM grouped g
     ORDER BY g.first_order`,
  );
  return rows;
});

export const getProductBySlug = cache(async (slug: string): Promise<Product | null> => {
  const { rows } = await pool.query<Product>(
    `SELECT
       p.id, p.slug, p.title, p.year, p.medium, p.dimensions, p.description, p.collection,
       COALESCE((
         SELECT json_agg(${IMAGE_JSON} ORDER BY position)
         FROM product_images WHERE product_id = p.id
       ), '[]') AS images,
       COALESCE((
         SELECT json_agg(json_build_object(
           'id', id, 'name', name, 'kind', kind,
           'priceCents', price_cents, 'compareAtCents', compare_at_cents,
           'inventory', inventory, 'available', inventory IS NULL OR inventory > 0
         ) ORDER BY position)
         FROM variants WHERE product_id = p.id
       ), '[]') AS variants
     FROM products p
     WHERE p.published AND p.slug = $1`,
    [slug],
  );
  return rows[0] ?? null;
});

export type CheckoutVariant = {
  id: number;
  name: string;
  priceCents: number;
  inventory: number | null;
  productTitle: string;
  imageUrl: string | null;
};

/** Prices always come from the database, never from the browser. */
export async function getVariantsForCheckout(ids: number[]): Promise<CheckoutVariant[]> {
  const { rows } = await pool.query<CheckoutVariant>(
    `SELECT
       v.id, v.name, v.price_cents AS "priceCents", v.inventory,
       p.title AS "productTitle",
       (SELECT url FROM product_images WHERE product_id = p.id ORDER BY position LIMIT 1)
         AS "imageUrl"
     FROM variants v
     JOIN products p ON p.id = v.product_id
     WHERE p.published AND v.id = ANY($1::int[])`,
    [ids],
  );
  return rows;
}

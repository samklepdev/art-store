import "server-only";
import { pool } from "@/lib/db";

export type AdminProductRow = {
  id: number;
  slug: string;
  title: string;
  collection: string | null;
  published: boolean;
  featured: boolean;
  // node-postgres parses timestamptz columns into a JS Date at runtime;
  // pool.query<T>()'s generic is a compile-time assertion only and coerces
  // nothing, so this must match what the driver actually returns.
  updatedAt: Date;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  variantCount: number;
  imageUrl: string | null;
};

/**
 * Every product, published or not — deliberately unlike the storefront's
 * getProducts, which filters on `published`.
 */
export async function listAllProducts(): Promise<AdminProductRow[]> {
  const { rows } = await pool.query<AdminProductRow>(
    `SELECT
       p.id, p.slug, p.title, p.collection, p.published, p.featured,
       p.updated_at AS "updatedAt",
       v.min_price  AS "minPriceCents",
       v.max_price  AS "maxPriceCents",
       COALESCE(v.n, 0) AS "variantCount",
       (SELECT url FROM product_images
          WHERE product_id = p.id ORDER BY position LIMIT 1) AS "imageUrl"
     FROM products p
     LEFT JOIN LATERAL (
       SELECT MIN(price_cents) AS min_price,
              MAX(price_cents) AS max_price,
              COUNT(*)::int    AS n
       FROM variants WHERE product_id = p.id
     ) v ON true
     ORDER BY p.updated_at DESC, p.id DESC`,
  );
  return rows;
}

export async function setPublished(id: number, published: boolean): Promise<void> {
  await pool.query(`UPDATE products SET published = $2, updated_at = now() WHERE id = $1`, [
    id,
    published,
  ]);
}

export async function setFeatured(id: number, featured: boolean): Promise<void> {
  await pool.query(`UPDATE products SET featured = $2, updated_at = now() WHERE id = $1`, [
    id,
    featured,
  ]);
}

export async function slugForId(id: number): Promise<string | null> {
  const { rows } = await pool.query<{ slug: string }>(`SELECT slug FROM products WHERE id = $1`, [id]);
  return rows[0]?.slug ?? null;
}

/** Creates a draft. Variants and images need a product_id, so creation is
 *  deliberately minimal and the edit screen fills in the rest. */
export async function createProduct(title: string, slug: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO products (title, slug, published) VALUES ($1, $2, false) RETURNING id`,
    [title, slug],
  );
  return rows[0].id;
}

export type AdminProduct = {
  id: number;
  slug: string;
  title: string;
  year: number | null;
  medium: string | null;
  dimensions: string | null;
  description: string | null;
  collection: string | null;
  featured: boolean;
  published: boolean;
  sortOrder: number;
};

export type ProductInput = Omit<AdminProduct, "id">;

export async function getProductForAdmin(id: number): Promise<AdminProduct | null> {
  const { rows } = await pool.query<AdminProduct>(
    `SELECT id, slug, title, year, medium, dimensions, description, collection,
            featured, published, sort_order AS "sortOrder"
       FROM products WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function updateProduct(id: number, input: ProductInput): Promise<void> {
  await pool.query(
    `UPDATE products SET
       title = $2, slug = $3, year = $4, medium = $5, dimensions = $6,
       description = $7, collection = $8, featured = $9, published = $10,
       sort_order = $11, updated_at = now()
     WHERE id = $1`,
    [
      id,
      input.title,
      input.slug,
      input.year,
      input.medium,
      input.dimensions,
      input.description,
      input.collection,
      input.featured,
      input.published,
      input.sortOrder,
    ],
  );
}

/** Existing collection names, for the datalist that stops "Tidewater" drifting
 *  into "tidewater". Collections are a free-text column, not a table. */
export async function listCollectionNames(): Promise<string[]> {
  const { rows } = await pool.query<{ collection: string }>(
    `SELECT DISTINCT collection FROM products
      WHERE collection IS NOT NULL ORDER BY collection`,
  );
  return rows.map((row) => row.collection);
}

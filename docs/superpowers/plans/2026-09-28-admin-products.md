# Products Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the store a password-protected admin at `/admin` for creating and editing products, variants and images, so adding a painting no longer requires hand-written SQL.

**Architecture:** Storefront files move into an `app/(storefront)/` route group so `app/layout.tsx` can stop rendering shop chrome; admin lives in a parallel `app/(admin)/` group. Mutations are Server Actions returning a typed result, guarded by `requireAdmin()` inside every action (proxy only handles redirect UX). Images upload straight from the browser to S3-compatible storage via a presigned PUT, so file bytes never pass through the app.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Postgres via `pg`, CSS Modules, Vitest, `@aws-sdk/client-s3`.

**Spec:** `docs/superpowers/specs/2026-09-28-admin-products-design.md`

## Global Constraints

- Every admin Server Action calls `requireAdmin()` as its first statement. The proxy is not the authorization boundary.
- `proxy.ts` runs on the **Node.js runtime** in Next 16 (it is not Edge, and the `runtime` config option is unavailable there — setting it throws). It may still import only `lib/admin/session.ts`: not because Node APIs are unavailable, but to keep the request-path guard free of `pg` and `next/headers`.
- **Next 16 renamed Middleware to Proxy.** The file is `proxy.ts` at the project root, exporting a named `proxy` function (or a default export) plus `config.matcher` — not `middleware.ts`/`export function middleware`. Confirmed in `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
- All files under `lib/admin/` that touch the database start with `import "server-only";`. `lib/admin/session.ts` must **not** — it is imported by `proxy.ts`, which sits outside the normal app module graph.
- Money is stored as integer cents. Never store or compare floats.
- `inventory` is tri-state: `NULL` = made to order, `0` = sold out, `n` = limited. Forms must be able to send `NULL`.
- Product removal is unpublish only. No task in this plan issues `DELETE FROM products`. Variants and images may be deleted, but a variant that appears in `order_items` must be refused — `order_items.variant_id` is `ON DELETE SET NULL`, so deleting it would sever an order's link to what was bought.
- `schema.sql` is the baseline and is never edited. All schema change goes in `db/migrations/NNN-name.sql`.
- Reuse the existing global CSS utilities (`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-block`, `.page-width`, `.visually-hidden`) rather than restyling buttons. Per-component styles go in a sibling `*.module.css`.
- Path alias is `@/*` → repo root.
- Several tasks say "append to `app/(admin)/admin/actions.ts`" and include `import` lines with the new code. Merge those imports into the single import block at the top of the file rather than leaving them mid-file — legal in ES modules, but it reads badly and trips most lint configs.
- Verified Postgres constraint names (do not guess these):
  - `products_slug_key` (unique), `products_slug_check`, `products_year_check`
  - `variants_product_id_name_key` (unique), `variants_check` (the compare-at > price check — **not** `variants_compare_at_cents_check`), `variants_price_cents_check`, `variants_inventory_check`, `variants_kind_check`
  - `product_images_product_id_position_key` (unique), `product_images_width_check`, `product_images_height_check`

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `vitest.config.ts` | Test runner config, `@/` alias |
| `scripts/migrate.mjs` | Numbered migration runner |
| `db/migrations/001-deferrable-image-position.sql` | Make image position constraint deferrable |
| `db/migrations/002-products-updated-at.sql` | Add `products.updated_at` |
| `lib/admin/session.ts` | Web Crypto HMAC sign/verify. Import-free, no DB |
| `lib/admin/auth.ts` | Password check, cookie set/clear, `requireAdmin()` |
| `lib/admin/errors.ts` | Postgres error code → user-facing message |
| `lib/admin/products.ts` | Product reads for admin + inserts/updates |
| `lib/admin/variants.ts` | Variant CRUD |
| `lib/admin/images.ts` | Image CRUD + position reordering |
| `lib/admin/reorder.ts` | Pure reorder algorithm |
| `lib/admin/storage.ts` | S3 presign + key naming |
| `proxy.ts` | Redirects unauthenticated `/admin/*` to login (Next 16 name for Middleware) |
| `app/(storefront)/layout.tsx` | Cart provider + Header + Footer + CartDrawer |
| `app/(admin)/layout.tsx` | Admin chrome |
| `app/(admin)/error.tsx` | Admin error boundary |
| `app/(admin)/admin/actions.ts` | All `"use server"` mutations |
| `app/(admin)/admin/page.tsx` | Product list |
| `app/(admin)/admin/login/page.tsx` | Login form |
| `app/(admin)/admin/products/new/page.tsx` | Create product |
| `app/(admin)/admin/products/[id]/page.tsx` | Edit: details + variants + images |
| `app/api/admin/upload-url/route.ts` | Issues presigned PUT URLs |

**Modified:** `package.json` (scripts, deps), `app/layout.tsx` (strip chrome), `lib/money.ts` (add `parseMoney`), `.env.example`, `next.config.ts` (bucket `remotePatterns`), `README.md`.

**Moved into `app/(storefront)/`:** `page.tsx`, `page.module.css`, `shop/`, `products/`, `cart/`, `checkout/`.

---

### Task 1: Vitest setup and `parseMoney`

**Files:**
- Create: `vitest.config.ts`, `lib/money.test.ts`
- Modify: `package.json`, `lib/money.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `parseMoney(input: string): number | null` from `@/lib/money`. Returns integer cents, or `null` when the input is not a valid money string. Used by Tasks 11 and 12.

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": root },
  },
});
```

- [ ] **Step 3: Add test scripts to `package.json`**

Add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write the failing test**

Create `lib/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseMoney } from "./money";

describe("parseMoney", () => {
  it("parses whole dollars", () => {
    expect(parseMoney("220")).toBe(22000);
  });

  it("parses cents", () => {
    expect(parseMoney("220.50")).toBe(22050);
  });

  it("parses one decimal place", () => {
    expect(parseMoney("220.5")).toBe(22050);
  });

  it("strips commas, currency symbols and whitespace", () => {
    expect(parseMoney("$1,200.00")).toBe(120000);
    expect(parseMoney("  85 ")).toBe(8500);
  });

  it("avoids float drift", () => {
    expect(parseMoney("19.99")).toBe(1999);
  });

  it("accepts zero", () => {
    expect(parseMoney("0")).toBe(0);
  });

  it("rejects empty, junk, negatives and three decimals", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("   ")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("1.234")).toBeNull();
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `parseMoney` is not exported from `./money`.

- [ ] **Step 6: Implement `parseMoney`**

Append to `lib/money.ts`:

```ts
/**
 * Parses a human-typed money string into integer cents.
 * Returns null when the input is not a plain, non-negative amount
 * with at most two decimal places.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 7 tests.

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts package.json package-lock.json lib/money.ts lib/money.test.ts
git commit -m "Add Vitest and parseMoney for admin price inputs"
```

---

### Task 2: Slug derivation

**Files:**
- Create: `lib/admin/slug.ts`, `lib/admin/slug.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `slugify(title: string): string` from `@/lib/admin/slug`. Output always satisfies the `products.slug` CHECK `^[a-z0-9]+(-[a-z0-9]+)*$`, or is `""` when the title has no usable characters. Used by Tasks 10 and 11.

- [ ] **Step 1: Write the failing test**

Create `lib/admin/slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

const SLUG_CHECK = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("Harbor at Dusk")).toBe("harbor-at-dusk");
  });

  it("collapses punctuation into single hyphens", () => {
    expect(slugify("Streetlamp, 2 a.m.")).toBe("streetlamp-2-a-m");
  });

  it("strips diacritics", () => {
    expect(slugify("Café Noir")).toBe("cafe-noir");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
  });

  it("keeps digits", () => {
    expect(slugify("Study 12 x 16")).toBe("study-12-x-16");
  });

  it("returns empty string when nothing usable remains", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("")).toBe("");
  });

  it("always produces output the database CHECK accepts", () => {
    for (const title of ["Harbor at Dusk", "Café Noir", "Streetlamp, 2 a.m.", "Study 12 x 16"]) {
      expect(slugify(title)).toMatch(SLUG_CHECK);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test lib/admin/slug.test.ts`
Expected: FAIL — cannot find module `./slug`.

- [ ] **Step 3: Implement `slugify`**

Create `lib/admin/slug.ts`:

```ts
/**
 * Derives a URL slug from a product title.
 *
 * The products table enforces `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`, so this
 * strips diacritics, lowercases, collapses every run of other characters to a
 * single hyphen, and trims hyphens from the ends. Returns "" when no usable
 * characters remain — callers must treat that as a validation failure.
 */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test lib/admin/slug.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/slug.ts lib/admin/slug.test.ts
git commit -m "Add slugify for product web addresses"
```

---

### Task 3: Postgres error messages

**Files:**
- Create: `lib/admin/errors.ts`, `lib/admin/errors.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `messageForDbError(error: unknown): string | null` from `@/lib/admin/errors`. Returns a user-facing message for known constraint violations, or `null` when the error is not a recognised constraint failure (caller should rethrow or show a generic message). Used by Tasks 10, 11, 12, 15.

- [ ] **Step 1: Write the failing test**

Create `lib/admin/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { messageForDbError } from "./errors";

describe("messageForDbError", () => {
  it("names the slug collision", () => {
    const message = messageForDbError({ code: "23505", constraint: "products_slug_key" });
    expect(message).toMatch(/web address/i);
  });

  it("names the duplicate variant", () => {
    const message = messageForDbError({ code: "23505", constraint: "variants_product_id_name_key" });
    expect(message).toMatch(/format with that name/i);
  });

  it("explains the compare-at check, which Postgres names variants_check", () => {
    const message = messageForDbError({ code: "23514", constraint: "variants_check" });
    expect(message).toMatch(/compare-at/i);
  });

  it("explains the slug format check", () => {
    const message = messageForDbError({ code: "23514", constraint: "products_slug_check" });
    expect(message).toMatch(/lowercase/i);
  });

  it("explains the year range check", () => {
    const message = messageForDbError({ code: "23514", constraint: "products_year_check" });
    expect(message).toMatch(/1900/);
  });

  it("falls back to a generic message for unknown constraints of a known class", () => {
    expect(messageForDbError({ code: "23505", constraint: "something_else_key" })).not.toBeNull();
    expect(messageForDbError({ code: "23514", constraint: "something_else_check" })).not.toBeNull();
  });

  it("returns null for unrelated errors", () => {
    expect(messageForDbError({ code: "08006" })).toBeNull();
    expect(messageForDbError(new Error("boom"))).toBeNull();
    expect(messageForDbError(null)).toBeNull();
    expect(messageForDbError(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test lib/admin/errors.test.ts`
Expected: FAIL — cannot find module `./errors`.

- [ ] **Step 3: Implement `messageForDbError`**

Create `lib/admin/errors.ts`:

```ts
/**
 * Maps Postgres constraint violations to messages worth showing a person.
 *
 * Constraint names are the ones Postgres actually generated for this schema —
 * note the compare-at check is `variants_check`, not
 * `variants_compare_at_cents_check`, because it spans two columns and so
 * becomes a table-level constraint.
 */
const UNIQUE: Record<string, string> = {
  products_slug_key: "That web address is already used by another product.",
  variants_product_id_name_key: "This product already has a format with that name.",
  product_images_product_id_position_key:
    "Two images ended up in the same position. Reload the page and try again.",
};

const CHECK: Record<string, string> = {
  variants_check: "The compare-at price must be higher than the price.",
  products_slug_check:
    "The web address may only contain lowercase letters, numbers and dashes.",
  products_year_check: "The year must be between 1900 and 2100.",
  variants_price_cents_check: "The price cannot be negative.",
  variants_inventory_check: "The quantity in stock cannot be negative.",
  variants_kind_check: "A format must be either an original or a print.",
  product_images_width_check: "The image width must be a positive number of pixels.",
  product_images_height_check: "The image height must be a positive number of pixels.",
};

export function messageForDbError(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const { code, constraint } = error as { code?: string; constraint?: string };

  if (code === "23505") {
    return (constraint && UNIQUE[constraint]) ?? "That value is already taken.";
  }
  if (code === "23514") {
    return (constraint && CHECK[constraint]) ?? "That value isn't allowed.";
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test lib/admin/errors.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/errors.ts lib/admin/errors.test.ts
git commit -m "Map Postgres constraint violations to readable messages"
```

---

### Task 4: Migration runner

**Files:**
- Create: `scripts/migrate.mjs`, `db/migrations/.gitkeep`
- Modify: `package.json`

**Interfaces:**
- Consumes: `DATABASE_URL`
- Produces: `npm run db:migrate`, which applies every unapplied `db/migrations/*.sql` in filename order and records versions in `schema_migrations`. Used by Task 5.

- [ ] **Step 1: Create the migrations directory**

```bash
mkdir -p db/migrations && touch db/migrations/.gitkeep
```

- [ ] **Step 2: Write the runner**

Create `scripts/migrate.mjs`:

```js
#!/usr/bin/env node
// Applies db/migrations/*.sql in filename order, once each.
// schema.sql stays the baseline and is never edited.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const dir = path.join(process.cwd(), "db", "migrations");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`);

const { rows } = await client.query("SELECT version FROM schema_migrations");
const applied = new Set(rows.map((r) => r.version));

const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
let count = 0;

for (const file of files) {
  const version = file.replace(/\.sql$/, "");
  if (applied.has(version)) continue;

  const sql = await readFile(path.join(dir, file), "utf8");
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
    await client.query("COMMIT");
    console.log(`applied ${version}`);
    count += 1;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`failed ${version}: ${error.message}`);
    await client.end();
    process.exit(1);
  }
}

console.log(count === 0 ? "already up to date" : `applied ${count} migration(s)`);
await client.end();
```

- [ ] **Step 3: Wire up the scripts**

In `package.json`, replace the `db:setup` line and add `db:migrate`:

```json
"db:setup": "psql \"$DATABASE_URL\" -f db/schema.sql -f db/seed.sql && npm run db:migrate",
"db:migrate": "node --env-file-if-exists=.env.local scripts/migrate.mjs"
```

`--env-file-if-exists` means the script picks up `DATABASE_URL` from `.env.local` the way `next dev` does, without failing in environments that have no such file.

- [ ] **Step 4: Run it against the running database**

Run: `npm run db:migrate`
Expected: `already up to date` (no migration files yet), and the table now exists.

Verify:

```bash
docker exec art-store-postgres psql -U postgres -d art_store -c '\d schema_migrations'
```

Expected: a table with `version` and `applied_at` columns.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate.mjs db/migrations/.gitkeep package.json
git commit -m "Add a numbered SQL migration runner"
```

---

### Task 5: Migrations 001 and 002

**Files:**
- Create: `db/migrations/001-deferrable-image-position.sql`, `db/migrations/002-products-updated-at.sql`

**Interfaces:**
- Consumes: `npm run db:migrate` from Task 4
- Produces: `product_images_product_id_position_key` becomes `DEFERRABLE INITIALLY DEFERRED`, and `products.updated_at` exists as a `timestamptz NOT NULL DEFAULT now()`. Relied on by Tasks 9, 11, 15.

- [ ] **Step 1: Write migration 001**

Create `db/migrations/001-deferrable-image-position.sql`:

```sql
-- Reordering images permutes product_images.position within one transaction.
-- Postgres checks non-deferrable UNIQUE constraints as a statement proceeds, so
-- a valid final ordering can still fail on an intermediate state. Defer the
-- check to COMMIT and keep the invariant that two images can't share a slot.
ALTER TABLE product_images
  DROP CONSTRAINT product_images_product_id_position_key;

ALTER TABLE product_images
  ADD CONSTRAINT product_images_product_id_position_key
  UNIQUE (product_id, position) DEFERRABLE INITIALLY DEFERRED;
```

- [ ] **Step 2: Write migration 002**

Create `db/migrations/002-products-updated-at.sql`:

```sql
-- created_at can't answer "what did I just change", which is the default sort
-- for the admin product list. Set explicitly by admin writes, not by a trigger,
-- so ordinary storefront reads stay untouched.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
```

- [ ] **Step 3: Apply them**

Run: `npm run db:migrate`
Expected:

```
applied 001-deferrable-image-position
applied 002-products-updated-at
applied 2 migration(s)
```

- [ ] **Step 4: Verify both landed**

```bash
docker exec art-store-postgres psql -U postgres -d art_store -tAc \
  "select conname, condeferrable from pg_constraint where conname = 'product_images_product_id_position_key';"
docker exec art-store-postgres psql -U postgres -d art_store -tAc \
  "select column_name from information_schema.columns where table_name='products' and column_name='updated_at';"
```

Expected: `product_images_product_id_position_key|t` (note `t` — deferrable), then `updated_at`.

- [ ] **Step 5: Prove reordering now works**

This is the behaviour migration 001 exists for.

**Update by `id`, never by `position`.** A `WHERE position = n` clause matches rows an earlier
statement in the same transaction already moved, so it clobbers them — and it is easy to write a
sequence that leaves a genuine duplicate at `COMMIT`, which looks identical to "the migration
didn't work". This is also why `applyImagePositions` in Task 15 keys its updates on `id`.

First record the current ids and positions:

```bash
docker exec art-store-postgres psql -U postgres -d art_store -c \
  "SELECT id, position FROM product_images WHERE product_id = 1 ORDER BY position;"
```

With the seed data this is `id 3 → 0`, `id 2 → 1`, `id 1 → 2`. Swap the first two by id:

```bash
docker exec art-store-postgres psql -U postgres -d art_store -c \
  "BEGIN;
   UPDATE product_images SET position = 1 WHERE id = 3;
   UPDATE product_images SET position = 0 WHERE id = 2;
   COMMIT;"
```

After the first statement both rows sit at position 1 — the transient duplicate that a
non-deferrable constraint would reject outright. Expected: `COMMIT` with no unique violation, and
the final order `id 2 → 0`, `id 3 → 1`, `id 1 → 2`. Then restore the seed order:

```bash
docker exec art-store-postgres psql -U postgres -d art_store -c \
  "BEGIN;
   UPDATE product_images SET position = 1 WHERE id = 2;
   UPDATE product_images SET position = 0 WHERE id = 3;
   COMMIT;"
```

If your ids differ from the seed values above, substitute the ids from the `SELECT`.

- [ ] **Step 6: Run the second migration pass to confirm idempotency**

Run: `npm run db:migrate`
Expected: `already up to date`.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/001-deferrable-image-position.sql db/migrations/002-products-updated-at.sql
git commit -m "Make image position deferrable and add products.updated_at"
```

---

### Task 6: Storefront route group

**Files:**
- Create: `app/(storefront)/layout.tsx`
- Modify: `app/layout.tsx`
- Move: `app/page.tsx`, `app/page.module.css`, `app/shop/`, `app/products/`, `app/cart/`, `app/checkout/` into `app/(storefront)/`

**Interfaces:**
- Consumes: nothing
- Produces: a root layout that renders only `<html>`/`<body>`, so Task 8 can add `app/(admin)/layout.tsx` without inheriting shop chrome. All storefront URLs unchanged.

- [ ] **Step 1: Move the storefront files**

```bash
mkdir -p "app/(storefront)"
git mv app/page.tsx app/page.module.css "app/(storefront)/"
git mv app/shop app/products app/cart app/checkout "app/(storefront)/"
```

`app/globals.css`, `app/layout.tsx` and `app/api/` stay where they are. Route handlers are unaffected by route groups.

- [ ] **Step 2: Create the storefront layout with the chrome**

Create `app/(storefront)/layout.tsx`:

```tsx
import { CartDrawer } from "@/components/cart/CartDrawer";
import { CartProvider } from "@/components/cart/CartProvider";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

export default function StorefrontLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <CartProvider>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Header />
      <main id="main">{children}</main>
      <Footer />
      <CartDrawer />
    </CartProvider>
  );
}
```

- [ ] **Step 3: Strip the chrome out of the root layout**

Replace `app/layout.tsx` entirely:

```tsx
import type { Metadata } from "next";
import { Hanken_Grotesk, Tilt_Neon } from "next/font/google";
import { site } from "@/lib/site";
import "./globals.css";

// Prices and stock come from Postgres on every request, so sold-out
// originals disappear from sale immediately.
export const dynamic = "force-dynamic";

const neon = Tilt_Neon({ subsets: ["latin"], variable: "--font-neon", display: "swap" });
const text = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-text", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${site.name} | ${site.tagline}`, template: `%s | ${site.name}` },
  description: site.statement,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${neon.variable} ${text.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Verify every storefront URL still works**

Start the dev server if it is not already running (`npm run dev`), then:

```bash
SLUG=$(docker exec art-store-postgres psql -U postgres -d art_store -tAc 'select slug from products where published limit 1')
for p in / /shop /cart "/products/$SLUG"; do
  printf "%-28s " "$p"
  curl -s -o /dev/null -w "HTTP %{http_code}\n" --max-time 25 "http://localhost:3000$p"
done
```

Expected: `HTTP 200` for all four. Also confirm the header, footer and cart drawer still render:

```bash
curl -s --max-time 20 http://localhost:3000/shop | grep -c 'Shop all'
```

Expected: at least `1`.

- [ ] **Step 6: Commit**

```bash
git add -A app
git commit -m "Move storefront into a route group so the root layout holds no chrome"
```

---

### Task 7: Session signing

**Files:**
- Create: `lib/admin/session.ts`, `lib/admin/session.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: from `@/lib/admin/session` —
  - `SESSION_COOKIE: "admin_session"`
  - `SESSION_TTL_MS: number` (30 days)
  - `signSession(expiresAt: number, secret: string): Promise<string>`
  - `verifySession(token: string, secret: string, now?: number): Promise<boolean>`

  Uses Web Crypto only. Kept import-free so it is trivially unit-testable and safe to load from `proxy.ts`. Must not import `server-only` or `pg`. Used by Tasks 8 and 9.

- [ ] **Step 1: Write the failing test**

Create `lib/admin/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SESSION_TTL_MS, signSession, verifySession } from "./session";

const SECRET = "test-secret-value";

describe("session tokens", () => {
  it("verifies a token it just signed", async () => {
    const token = await signSession(Date.now() + SESSION_TTL_MS, SECRET);
    expect(await verifySession(token, SECRET)).toBe(true);
  });

  it("rejects a tampered signature", async () => {
    const token = await signSession(Date.now() + SESSION_TTL_MS, SECRET);
    const [payload, signature] = token.split(".");
    const flipped = signature.startsWith("A") ? `B${signature.slice(1)}` : `A${signature.slice(1)}`;
    expect(await verifySession(`${payload}.${flipped}`, SECRET)).toBe(false);
  });

  it("rejects a tampered expiry", async () => {
    const token = await signSession(Date.now() + 1000, SECRET);
    const [, signature] = token.split(".");
    const farFuture = String(Date.now() + 10_000_000);
    expect(await verifySession(`${farFuture}.${signature}`, SECRET)).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession(Date.now() + SESSION_TTL_MS, "other-secret");
    expect(await verifySession(token, SECRET)).toBe(false);
  });

  it("rejects an expired token", async () => {
    const token = await signSession(Date.now() - 1, SECRET);
    expect(await verifySession(token, SECRET)).toBe(false);
  });

  it("honours an injected clock", async () => {
    const expiresAt = 1_000_000;
    const token = await signSession(expiresAt, SECRET);
    expect(await verifySession(token, SECRET, expiresAt - 1)).toBe(true);
    expect(await verifySession(token, SECRET, expiresAt + 1)).toBe(false);
  });

  it("rejects malformed tokens", async () => {
    for (const bad of ["", ".", "abc", "abc.", ".abc", "not-a-number.aaaa"]) {
      expect(await verifySession(bad, SECRET)).toBe(false);
    }
  });

  // The cases above never reach atob: four are stopped by the separator guard,
  // and "abc." / "not-a-number.aaaa" decode successfully and fail on the HMAC
  // instead. These two have a valid-looking payload and a signature that atob
  // genuinely throws on, so they are what exercises the catch in fromBase64Url.
  it("rejects a signature that is not valid base64", async () => {
    expect(await verifySession("5.!!!!", SECRET)).toBe(false);
    expect(await verifySession("5.a", SECRET)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test lib/admin/session.test.ts`
Expected: FAIL — cannot find module `./session`.

- [ ] **Step 3: Implement the session module**

Create `lib/admin/session.ts`:

```ts
// Web Crypto only, and deliberately import-free: this module is imported by
// proxy.ts, which runs on every matched request. Web Crypto works in both Node
// and Edge, so this stays portable. Do not add `server-only` or any database
// import here.

export const SESSION_COOKIE = "admin_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Returns `<expiresAt>.<hmac>`. The expiry is signed, so it cannot be edited. */
export async function signSession(expiresAt: number, secret: string): Promise<string> {
  const payload = String(expiresAt);
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function verifySession(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<boolean> {
  const separator = token.indexOf(".");
  if (separator <= 0) return false;

  const payload = token.slice(0, separator);
  const signature = fromBase64Url(token.slice(separator + 1));
  if (!signature) return false;

  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signature,
    encoder.encode(payload),
  );
  if (!valid) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > now;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test lib/admin/session.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/session.ts lib/admin/session.test.ts
git commit -m "Add signed session tokens for the admin"
```

---

### Task 8: Auth gate — proxy, login, admin shell

**Files:**
- Create: `lib/admin/auth.ts`, `proxy.ts`, `app/(admin)/layout.tsx`, `app/(admin)/layout.module.css`, `app/(admin)/error.tsx`, `app/(admin)/admin/actions.ts`, `app/(admin)/admin/login/page.tsx`, `app/(admin)/admin/login/LoginForm.tsx`, `app/(admin)/admin/login/login.module.css`, `app/(admin)/admin/page.tsx`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `signSession`, `verifySession`, `SESSION_COOKIE`, `SESSION_TTL_MS` (Task 7)
- Produces:
  - `@/lib/admin/auth`: `checkPassword(candidate: string): boolean`, `isAdmin(): Promise<boolean>`, `requireAdmin(): Promise<void>` (redirects to `/admin/login` when not signed in), `startSession(): Promise<void>`, `endSession(): Promise<void>`
  - `@/app/(admin)/admin/actions`: `type ActionResult = { ok: true } | { ok: false; error: string; field?: string }`, plus `login` and `logout` actions
  - A placeholder `/admin` page, replaced in Task 9

- [ ] **Step 1: Add the new environment variables**

Append to `.env.example`:

```
# Admin (/admin). Generate the secret with: openssl rand -base64 32
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
```

Then set real values in `.env.local`:

```bash
printf '\nADMIN_PASSWORD=%s\nADMIN_SESSION_SECRET=%s\n' \
  "$(openssl rand -base64 18)" "$(openssl rand -base64 32)" >> .env.local
grep -c ADMIN_PASSWORD .env.local
```

Expected: `1`. Restart `npm run dev` so the new vars load.

- [ ] **Step 2: Write the auth module**

Create `lib/admin/auth.ts`:

```ts
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_TTL_MS, signSession, verifySession } from "./session";

function secret(): string {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value) throw new Error("ADMIN_SESSION_SECRET is not set");
  return value;
}

/**
 * Constant-time password comparison. Both sides are hashed first so the
 * comparison length never depends on the candidate, which a bare
 * timingSafeEqual on raw buffers would leak.
 */
export function checkPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}

export async function startSession(): Promise<void> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(expiresAt, secret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return verifySession(token, secret());
}

/**
 * Every admin action and page calls this first. The proxy only handles
 * redirect UX — a Server Action is a POST endpoint whose authorization must
 * not depend on route matching.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}
```

- [ ] **Step 3: Write the proxy**

Create `proxy.ts` at the repo root. Next 16 renamed Middleware to Proxy; the export must be named `proxy`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/admin/session";

export async function proxy(request: NextRequest) {
  // The login page itself must stay reachable or this redirects forever.
  if (request.nextUrl.pathname === "/admin/login") return NextResponse.next();

  const secret = process.env.ADMIN_SESSION_SECRET;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (secret && token && (await verifySession(token, secret))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/admin/:path*"] };
```

- [ ] **Step 4: Write the login and logout actions**

Create `app/(admin)/admin/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { checkPassword, endSession, startSession } from "@/lib/admin/auth";

export type ActionResult = { ok: true } | { ok: false; error: string; field?: string };

export async function login(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const password = String(formData.get("password") ?? "");

  if (!checkPassword(password)) {
    // There is no meaningful rate limiting here; a fixed delay is the honest
    // mitigation alongside a strong password.
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { ok: false, error: "Incorrect password.", field: "password" };
  }

  await startSession();
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/admin/login");
}
```

- [ ] **Step 5: Write the login form**

Create `app/(admin)/admin/login/LoginForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { login, type ActionResult } from "../actions";
import styles from "./login.module.css";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(login, null);

  return (
    <form action={formAction} className={styles.form}>
      <h1 className={styles.heading}>Sign in</h1>
      <label className={styles.label} htmlFor="password">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        className={styles.input}
        aria-describedby={state && !state.ok ? "password-error" : undefined}
      />
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {state && !state.ok && (
        <p id="password-error" className={styles.error} role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
```

Create `app/(admin)/admin/login/page.tsx`:

```tsx
import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return <LoginForm />;
}
```

Create `app/(admin)/admin/login/login.module.css`:

```css
.form {
  max-width: 22rem;
  margin: 4rem auto;
  display: grid;
  gap: 0.75rem;
}

.heading {
  font-size: 1.5rem;
  margin: 0 0 0.5rem;
}

.label {
  font-weight: 600;
  font-size: 0.875rem;
}

.input {
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--border, #d4d4d4);
  border-radius: 0.375rem;
  font: inherit;
}

.error {
  color: var(--danger, #b91c1c);
  font-size: 0.875rem;
  margin: 0;
}
```

- [ ] **Step 6: Write the admin shell and error boundary**

Create `app/(admin)/layout.tsx`:

```tsx
import Link from "next/link";
import { site } from "@/lib/site";
import { logout } from "./admin/actions";
import styles from "./layout.module.css";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <Link href="/admin" className={styles.brand}>
          {site.name} admin
        </Link>
        <nav className={styles.nav}>
          <Link href="/admin">Products</Link>
          <Link href="/">View store</Link>
          <form action={logout}>
            <button type="submit" className={styles.linkButton}>
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
```

Create `app/(admin)/layout.module.css`:

```css
.shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.25rem;
  border-bottom: 1px solid var(--border, #d4d4d4);
}

.brand {
  font-weight: 700;
  text-decoration: none;
}

.nav {
  display: flex;
  gap: 1rem;
  align-items: center;
  font-size: 0.9375rem;
}

.linkButton {
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.main {
  flex: 1;
  width: 100%;
  max-width: 68rem;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 4rem;
}
```

Create `app/(admin)/error.tsx`:

```tsx
"use client";

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" style={{ padding: "2rem 0" }}>
      <h1>Something went wrong</h1>
      <p>The admin hit an error. Your last change may not have saved.</p>
      <button type="button" className="btn btn-secondary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Add a placeholder admin page**

Create `app/(admin)/admin/page.tsx` (Task 9 replaces the body):

```tsx
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Products" };

export default async function AdminHome() {
  await requireAdmin();
  return <h1>Products</h1>;
}
```

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Verify the gate end to end**

With the dev server running:

```bash
# Unauthenticated /admin redirects to the login page
curl -s -o /dev/null -w "redirect: %{http_code} -> %{redirect_url}\n" --max-time 20 http://localhost:3000/admin

# The login page itself is reachable
curl -s -o /dev/null -w "login: %{http_code}\n" --max-time 20 http://localhost:3000/admin/login
```

Expected: `redirect: 307 -> http://localhost:3000/admin/login` and `login: 200`.

Then in a browser: open `http://localhost:3000/admin`, confirm it lands on the login form, enter the wrong password and confirm the inline error, then enter the `ADMIN_PASSWORD` from `.env.local` and confirm you reach the Products page with the admin bar and **no** shop header, footer or cart drawer. Click "Sign out" and confirm you are returned to the login page.

- [ ] **Step 10: Commit**

```bash
git add lib/admin/auth.ts proxy.ts "app/(admin)" .env.example
git commit -m "Gate /admin behind a signed session cookie"
```

---

### Task 9: Product list

**Files:**
- Create: `lib/admin/products.ts`, `app/(admin)/admin/ProductRow.tsx`, `app/(admin)/admin/products.module.css`
- Modify: `app/(admin)/admin/page.tsx`, `app/(admin)/admin/actions.ts`

**Interfaces:**
- Consumes: `requireAdmin` (Task 8), `formatMoney` from `@/lib/money`, `products.updated_at` (Task 5)
- Produces:
  - `@/lib/admin/products`: `type AdminProductRow`, `listAllProducts(): Promise<AdminProductRow[]>`, `setPublished(id: number, published: boolean): Promise<void>`, `setFeatured(id: number, featured: boolean): Promise<void>`
  - `actions.ts`: `togglePublished`, `toggleFeatured`, and the shared **module-private** `revalidateStorefront(slugs: string[])` helper used by Tasks 10–15. It must not be exported — see the note in its source below.

- [ ] **Step 1: Write the admin product queries**

Create `lib/admin/products.ts`:

```ts
import "server-only";
import { pool } from "@/lib/db";

export type AdminProductRow = {
  id: number;
  slug: string;
  title: string;
  collection: string | null;
  published: boolean;
  featured: boolean;
  updatedAt: string;
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
```

- [ ] **Step 2: Add the toggle actions and the revalidation helper**

Append to `app/(admin)/admin/actions.ts`:

```ts
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { setFeatured, setPublished, slugForId } from "@/lib/admin/products";

/**
 * Refreshes every storefront path a product change can affect. Pass both the
 * old and new slug when a slug changes, or the old URL keeps serving stale HTML.
 *
 * NOT exported: every export from a "use server" module is a callable POST
 * endpoint, and this helper has no requireAdmin() guard of its own. It is used
 * only from actions in this file.
 */
async function revalidateStorefront(slugs: string[]): Promise<void> {
  revalidatePath("/");
  revalidatePath("/shop");
  for (const slug of slugs) revalidatePath(`/products/${slug}`);
}

export async function togglePublished(id: number, published: boolean): Promise<void> {
  await requireAdmin();
  await setPublished(id, published);
  const slug = await slugForId(id);
  await revalidateStorefront(slug ? [slug] : []);
  revalidatePath("/admin");
}

export async function toggleFeatured(id: number, featured: boolean): Promise<void> {
  await requireAdmin();
  await setFeatured(id, featured);
  const slug = await slugForId(id);
  await revalidateStorefront(slug ? [slug] : []);
  revalidatePath("/admin");
}
```

- [ ] **Step 3: Write the row component**

Create `app/(admin)/admin/ProductRow.tsx`:

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useTransition } from "react";
import { formatMoney } from "@/lib/money";
import type { AdminProductRow } from "@/lib/admin/products";
import { togglePublished } from "./actions";
import styles from "./products.module.css";

function priceLabel(row: AdminProductRow): string {
  if (row.minPriceCents === null || row.maxPriceCents === null) return "No formats";
  if (row.minPriceCents === row.maxPriceCents) return formatMoney(row.minPriceCents);
  return `${formatMoney(row.minPriceCents)} – ${formatMoney(row.maxPriceCents)}`;
}

export function ProductRow({ row }: { row: AdminProductRow }) {
  const [pending, startTransition] = useTransition();

  return (
    <tr className={styles.row} data-pending={pending || undefined}>
      <td className={styles.thumbCell}>
        {row.imageUrl ? (
          <Image src={row.imageUrl} alt="" width={56} height={56} className={styles.thumb} />
        ) : (
          <span className={styles.noThumb} aria-hidden="true" />
        )}
      </td>
      <td>
        <Link href={`/admin/products/${row.id}`} className={styles.title}>
          {row.title}
        </Link>
        <span className={styles.slug}>/{row.slug}</span>
      </td>
      <td>{row.collection ?? <span className={styles.muted}>—</span>}</td>
      <td>{priceLabel(row)}</td>
      <td>{row.variantCount}</td>
      <td>
        {row.published ? (
          <span className={styles.badgeLive}>Live</span>
        ) : (
          <span className={styles.badgeDraft}>Draft</span>
        )}
        {row.featured && <span className={styles.badgeFeatured}>Featured</span>}
      </td>
      <td>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => startTransition(() => void togglePublished(row.id, !row.published))}
        >
          {row.published ? "Unpublish" : "Publish"}
        </button>
      </td>
    </tr>
  );
}
```

- [ ] **Step 4: Write the list page**

Replace `app/(admin)/admin/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listAllProducts } from "@/lib/admin/products";
import { ProductRow } from "./ProductRow";
import styles from "./products.module.css";

export const metadata: Metadata = { title: "Products" };

export default async function AdminHome() {
  await requireAdmin();
  const products = await listAllProducts();

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.heading}>Products</h1>
        <Link href="/admin/products/new" className="btn btn-primary">
          New product
        </Link>
      </div>

      {products.length === 0 ? (
        <p>No products yet. Start with “New product”.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <span className="visually-hidden">Image</span>
                </th>
                <th>Title</th>
                <th>Collection</th>
                <th>Price</th>
                <th>Formats</th>
                <th>Status</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((row) => (
                <ProductRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 5: Write the styles**

Create `app/(admin)/admin/products.module.css`:

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

.row[data-pending] {
  opacity: 0.5;
}

.thumbCell {
  width: 4rem;
}

.thumb,
.noThumb {
  display: block;
  width: 3.5rem;
  height: 3.5rem;
  object-fit: cover;
  border-radius: 0.25rem;
  background: var(--border, #e5e5e5);
}

.title {
  display: block;
  font-weight: 600;
}

.slug,
.muted {
  color: var(--muted, #737373);
  font-size: 0.8125rem;
}

.badgeLive,
.badgeDraft,
.badgeFeatured {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  margin-right: 0.25rem;
}

.badgeLive {
  background: #dcfce7;
  color: #166534;
}

.badgeDraft {
  background: #f5f5f5;
  color: #525252;
}

.badgeFeatured {
  background: #fef3c7;
  color: #92400e;
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Verify in the browser**

Sign in at `/admin`. Expected: nine seeded products listed, each with a thumbnail, price range, format count and a `Live` badge. Click "Unpublish" on one row and confirm the badge flips to `Draft` without a full page reload. Then load `/shop` and confirm that product is gone from the storefront grid — that proves `revalidateStorefront` works. Publish it again.

- [ ] **Step 8: Commit**

```bash
git add lib/admin/products.ts "app/(admin)/admin"
git commit -m "Add the admin product list with publish toggles"
```

---

### Task 10: Create a product

**Files:**
- Create: `app/(admin)/admin/products/new/page.tsx`, `app/(admin)/admin/products/new/NewProductForm.tsx`, `app/(admin)/admin/form.module.css`
- Modify: `lib/admin/products.ts`, `app/(admin)/admin/actions.ts`

**Interfaces:**
- Consumes: `slugify` (Task 2), `messageForDbError` (Task 3), `requireAdmin` (Task 8), `ActionResult` and `revalidateStorefront` (Tasks 8–9)
- Produces: `createProduct(title: string, slug: string): Promise<number>` in `@/lib/admin/products`, and the `createProductAction` Server Action. `form.module.css` is the shared form stylesheet used by Tasks 11, 12 and 15.

- [ ] **Step 1: Add the insert query**

Append to `lib/admin/products.ts`:

```ts
/** Creates a draft. Variants and images need a product_id, so creation is
 *  deliberately minimal and the edit screen fills in the rest. */
export async function createProduct(title: string, slug: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO products (title, slug, published) VALUES ($1, $2, false) RETURNING id`,
    [title, slug],
  );
  return rows[0].id;
}
```

- [ ] **Step 2: Add the action**

Append to `app/(admin)/admin/actions.ts`:

```ts
import { messageForDbError } from "@/lib/admin/errors";
import { createProduct } from "@/lib/admin/products";
import { slugify } from "@/lib/admin/slug";

export async function createProductAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "A title is required.", field: "title" };

  const typedSlug = String(formData.get("slug") ?? "").trim();
  const slug = typedSlug || slugify(title);
  if (!slug) {
    return {
      ok: false,
      error: "Add a web address — the title has no letters or numbers to build one from.",
      field: "slug",
    };
  }

  let id: number;
  try {
    id = await createProduct(title, slug);
  } catch (error) {
    const message = messageForDbError(error);
    if (message) return { ok: false, error: message, field: "slug" };
    throw error;
  }

  await revalidateStorefront([slug]);
  revalidatePath("/admin");
  redirect(`/admin/products/${id}`);
}
```

- [ ] **Step 3: Write the form**

Create `app/(admin)/admin/products/new/NewProductForm.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { slugify } from "@/lib/admin/slug";
import { createProductAction, type ActionResult } from "../../actions";
import styles from "../../form.module.css";

export function NewProductForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createProductAction,
    null,
  );
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  const error = state && !state.ok ? state : null;

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="title">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          autoFocus
          className={styles.input}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (!slugEdited) setSlug(slugify(event.target.value));
          }}
        />
        {error?.field === "title" && (
          <p className={styles.error} role="alert">
            {error.error}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="slug">
          Web address
        </label>
        <div className={styles.prefixed}>
          <span className={styles.prefix}>/products/</span>
          <input
            id="slug"
            name="slug"
            className={styles.input}
            value={slug}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(event.target.value);
            }}
          />
        </div>
        <p className={styles.hint}>Lowercase letters, numbers and dashes only.</p>
        {error?.field === "slug" && (
          <p className={styles.error} role="alert">
            {error.error}
          </p>
        )}
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create draft"}
      </button>

      {error && !error.field && (
        <p className={styles.error} role="alert">
          {error.error}
        </p>
      )}
    </form>
  );
}
```

Create `app/(admin)/admin/products/new/page.tsx`:

```tsx
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { NewProductForm } from "./NewProductForm";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireAdmin();
  return (
    <>
      <h1>New product</h1>
      <p>Give it a title now; add formats, images and details on the next screen.</p>
      <NewProductForm />
    </>
  );
}
```

- [ ] **Step 4: Write the shared form styles**

Create `app/(admin)/admin/form.module.css`:

```css
.form {
  display: grid;
  gap: 1.25rem;
  max-width: 44rem;
  margin: 1.5rem 0;
}

.section {
  border: 1px solid var(--border, #e5e5e5);
  border-radius: 0.5rem;
  padding: 1.25rem;
}

.sectionHeading {
  margin: 0 0 1rem;
  font-size: 1.125rem;
}

.grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
}

.field {
  display: grid;
  gap: 0.375rem;
}

.label {
  font-weight: 600;
  font-size: 0.875rem;
}

.input,
.textarea,
.select {
  width: 100%;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--border, #d4d4d4);
  border-radius: 0.375rem;
  font: inherit;
  background: transparent;
  color: inherit;
}

.textarea {
  min-height: 7rem;
  resize: vertical;
}

.prefixed {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.prefix {
  color: var(--muted, #737373);
  font-size: 0.875rem;
  white-space: nowrap;
}

.checkboxRow {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--muted, #737373);
}

.error {
  margin: 0;
  font-size: 0.875rem;
  color: var(--danger, #b91c1c);
}

.success {
  margin: 0;
  font-size: 0.875rem;
  color: #166534;
}

.actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Verify in the browser**

Go to `/admin/products/new`. Type `Harbor at Dusk` and confirm the web address auto-fills as `harbor-at-dusk`. Submit and confirm you land on `/admin/products/<id>`. Return to `/admin` and confirm the new product appears at the top with a `Draft` badge and "No formats".

Now test the constraint mapping: create another product and type the slug `harbor-at-dusk` by hand. Expected: the inline error "That web address is already used by another product." rather than a crash. Then try the slug `Bad Slug!`. Expected: "The web address may only contain lowercase letters, numbers and dashes."

- [ ] **Step 7: Commit**

```bash
git add lib/admin/products.ts "app/(admin)/admin"
git commit -m "Add product creation as a draft"
```

---

### Task 11: Product details form

**Files:**
- Create: `app/(admin)/admin/products/[id]/page.tsx`, `app/(admin)/admin/products/[id]/DetailsForm.tsx`
- Modify: `lib/admin/products.ts`, `app/(admin)/admin/actions.ts`

**Interfaces:**
- Consumes: `slugify`, `messageForDbError`, `requireAdmin`, `ActionResult`, `revalidateStorefront`
- Produces: in `@/lib/admin/products` — `type AdminProduct`, `getProductForAdmin(id: number): Promise<AdminProduct | null>`, `updateProduct(id: number, input: ProductInput): Promise<void>`, `listCollectionNames(): Promise<string[]>`; plus the `updateProductAction` Server Action.

- [ ] **Step 1: Add the queries**

Append to `lib/admin/products.ts`:

```ts
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
```

- [ ] **Step 2: Add the action**

Append to `app/(admin)/admin/actions.ts`:

```ts
import { getProductForAdmin, listCollectionNames, updateProduct } from "@/lib/admin/products";

function optionalText(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? null : value;
}

export async function updateProductAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { ok: false, error: "Unknown product." };

  const existing = await getProductForAdmin(id);
  if (!existing) return { ok: false, error: "That product no longer exists." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "A title is required.", field: "title" };

  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return { ok: false, error: "A web address is required.", field: "slug" };

  const yearRaw = String(formData.get("year") ?? "").trim();
  let year: number | null = null;
  if (yearRaw !== "") {
    year = Number(yearRaw);
    if (!Number.isInteger(year)) {
      return { ok: false, error: "The year must be a whole number.", field: "year" };
    }
  }

  const sortOrderRaw = String(formData.get("sortOrder") ?? "").trim();
  const sortOrder = sortOrderRaw === "" ? 0 : Number(sortOrderRaw);
  if (!Number.isInteger(sortOrder)) {
    return { ok: false, error: "Sort order must be a whole number.", field: "sortOrder" };
  }

  try {
    await updateProduct(id, {
      title,
      slug,
      year,
      medium: optionalText(formData, "medium"),
      dimensions: optionalText(formData, "dimensions"),
      description: optionalText(formData, "description"),
      collection: optionalText(formData, "collection"),
      featured: formData.get("featured") === "on",
      published: formData.get("published") === "on",
      sortOrder,
    });
  } catch (error) {
    const message = messageForDbError(error);
    if (message) return { ok: false, error: message };
    throw error;
  }

  // Both slugs: the old URL would otherwise keep serving stale HTML.
  const slugs = existing.slug === slug ? [slug] : [existing.slug, slug];
  await revalidateStorefront(slugs);
  revalidatePath("/admin");
  revalidatePath(`/admin/products/${id}`);
  return { ok: true };
}
```

- [ ] **Step 3: Write the details form**

Create `app/(admin)/admin/products/[id]/DetailsForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type { AdminProduct } from "@/lib/admin/products";
import { updateProductAction, type ActionResult } from "../../actions";
import styles from "../../form.module.css";

export function DetailsForm({
  product,
  collections,
}: {
  product: AdminProduct;
  collections: string[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    updateProductAction,
    null,
  );
  const error = state && !state.ok ? state : null;

  return (
    <form action={formAction} className={styles.section}>
      <h2 className={styles.sectionHeading}>Details</h2>
      <input type="hidden" name="id" value={product.id} />

      <div className={styles.grid}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="title">
            Title
          </label>
          <input id="title" name="title" required defaultValue={product.title} className={styles.input} />
          {error?.field === "title" && (
            <p className={styles.error} role="alert">
              {error.error}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="slug">
            Web address
          </label>
          <input id="slug" name="slug" required defaultValue={product.slug} className={styles.input} />
          {error?.field === "slug" && (
            <p className={styles.error} role="alert">
              {error.error}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="year">
            Year
          </label>
          <input
            id="year"
            name="year"
            type="number"
            min={1900}
            max={2100}
            defaultValue={product.year ?? ""}
            className={styles.input}
          />
          {error?.field === "year" && (
            <p className={styles.error} role="alert">
              {error.error}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="medium">
            Medium
          </label>
          <input
            id="medium"
            name="medium"
            placeholder="Oil on linen"
            defaultValue={product.medium ?? ""}
            className={styles.input}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="dimensions">
            Dimensions
          </label>
          <input
            id="dimensions"
            name="dimensions"
            placeholder="76 × 61 cm"
            defaultValue={product.dimensions ?? ""}
            className={styles.input}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="collection">
            Collection
          </label>
          <input
            id="collection"
            name="collection"
            list="collection-names"
            defaultValue={product.collection ?? ""}
            className={styles.input}
          />
          <datalist id="collection-names">
            {collections.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <p className={styles.hint}>Pick an existing name to avoid near-duplicates.</p>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="sortOrder">
            Sort order
          </label>
          <input
            id="sortOrder"
            name="sortOrder"
            type="number"
            defaultValue={product.sortOrder}
            className={styles.input}
          />
          {error?.field === "sortOrder" && (
            <p className={styles.error} role="alert">
              {error.error}
            </p>
          )}
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={product.description ?? ""}
          className={styles.textarea}
        />
      </div>

      <div className={styles.checkboxRow}>
        <input id="published" name="published" type="checkbox" defaultChecked={product.published} />
        <label htmlFor="published">Published — visible in the shop</label>
      </div>

      <div className={styles.checkboxRow}>
        <input id="featured" name="featured" type="checkbox" defaultChecked={product.featured} />
        <label htmlFor="featured">Featured on the home page</label>
      </div>

      <div className={styles.actions}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </button>
        {state?.ok && <p className={styles.success}>Saved.</p>}
        {error && !error.field && (
          <p className={styles.error} role="alert">
            {error.error}
          </p>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Write the edit page**

Create `app/(admin)/admin/products/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getProductForAdmin, listCollectionNames } from "@/lib/admin/products";
import { DetailsForm } from "./DetailsForm";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();

  const [product, collections] = await Promise.all([
    getProductForAdmin(id),
    listCollectionNames(),
  ]);
  if (!product) notFound();

  return (
    <>
      <h1>{product.title}</h1>
      <p>
        <Link href={`/products/${product.slug}`}>View on the storefront</Link>
      </p>
      <DetailsForm product={product} collections={collections} />
    </>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Verify in the browser**

Open a seeded product from `/admin`. Change the title and medium, save, and confirm "Saved." appears. Reload to confirm the values persisted. Load the product on the storefront and confirm the new title shows — proving revalidation.

Now test the year CHECK: set the year to `1800` and save. Expected: "The year must be between 1900 and 2100." Test the slug collision: change the slug to another product's slug. Expected: "That web address is already used by another product."

Finally test slug-change revalidation: note the current slug, change it, save, and confirm the **old** `/products/<old-slug>` URL now 404s rather than serving a cached page.

- [ ] **Step 7: Commit**

```bash
git add lib/admin/products.ts "app/(admin)/admin/products"
git commit -m "Add the product details editor"
```

---

### Task 12: Variants

**Files:**
- Create: `lib/admin/variants.ts`, `app/(admin)/admin/products/[id]/VariantsSection.tsx`, `app/(admin)/admin/products/[id]/variants.module.css`
- Modify: `app/(admin)/admin/actions.ts`, `app/(admin)/admin/products/[id]/page.tsx`

**Interfaces:**
- Consumes: `parseMoney` (Task 1), `messageForDbError`, `requireAdmin`, `ActionResult`, `revalidateStorefront`
- Produces: in `@/lib/admin/variants` — `type AdminVariant`, `type VariantInput`, `listVariants(productId)`, `createVariant(productId, input)`, `updateVariant(id, input)`, `deleteVariant(id)`, `countOrderItems(variantId)`; plus `saveVariantAction(prev, formData): Promise<ActionResult>` and `deleteVariantAction(id): Promise<ActionResult>` — the delete returns an error rather than throwing when the format has been ordered.

- [ ] **Step 1: Write the variant queries**

Create `lib/admin/variants.ts`:

```ts
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
```

- [ ] **Step 2: Add the actions**

Append to `app/(admin)/admin/actions.ts`:

```ts
import { parseMoney } from "@/lib/money";
import {
  countOrderItems,
  createVariant,
  deleteVariant,
  productIdForVariant,
  updateVariant,
  type VariantInput,
} from "@/lib/admin/variants";

function readVariantInput(formData: FormData): VariantInput | ActionResult {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "A format name is required.", field: "name" };

  const kindRaw = String(formData.get("kind") ?? "");
  if (kindRaw !== "original" && kindRaw !== "print") {
    return { ok: false, error: "Choose original or print.", field: "kind" };
  }

  const priceCents = parseMoney(String(formData.get("price") ?? ""));
  if (priceCents === null) {
    return { ok: false, error: "Enter a price like 220 or 220.50.", field: "price" };
  }

  const compareRaw = String(formData.get("compareAt") ?? "").trim();
  let compareAtCents: number | null = null;
  if (compareRaw !== "") {
    compareAtCents = parseMoney(compareRaw);
    if (compareAtCents === null) {
      return { ok: false, error: "Enter a compare-at price like 260.", field: "compareAt" };
    }
    if (compareAtCents <= priceCents) {
      return {
        ok: false,
        error: "The compare-at price must be higher than the price.",
        field: "compareAt",
      };
    }
  }

  // Tri-state inventory: the checkbox is the only way to express NULL.
  let inventory: number | null = null;
  if (formData.get("madeToOrder") !== "on") {
    const raw = String(formData.get("inventory") ?? "").trim();
    inventory = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(inventory) || inventory < 0) {
      return { ok: false, error: "Stock must be 0 or a whole number.", field: "inventory" };
    }
  }

  const positionRaw = String(formData.get("position") ?? "").trim();
  const position = positionRaw === "" ? 0 : Number(positionRaw);
  if (!Number.isInteger(position)) {
    return { ok: false, error: "Position must be a whole number.", field: "position" };
  }

  const sku = String(formData.get("sku") ?? "").trim() || null;

  return { name, kind: kindRaw, priceCents, compareAtCents, inventory, sku, position };
}

export async function saveVariantAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const productId = Number(formData.get("productId"));
  if (!Number.isInteger(productId)) return { ok: false, error: "Unknown product." };

  const parsed = readVariantInput(formData);
  if ("ok" in parsed) return parsed;

  const idRaw = String(formData.get("id") ?? "").trim();

  try {
    if (idRaw === "") {
      await createVariant(productId, parsed);
    } else {
      const id = Number(idRaw);
      if (!Number.isInteger(id)) return { ok: false, error: "Unknown format." };
      await updateVariant(id, parsed);
    }
  } catch (error) {
    const message = messageForDbError(error);
    if (message) return { ok: false, error: message };
    throw error;
  }

  const slug = await slugForId(productId);
  await revalidateStorefront(slug ? [slug] : []);
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteVariantAction(id: number): Promise<ActionResult> {
  await requireAdmin();

  // Mirrors the unpublish-only rule for products: never sever an order's link
  // to what was bought. Setting stock to 0 is how you retire a sold format.
  if ((await countOrderItems(id)) > 0) {
    return {
      ok: false,
      error:
        "This format has been ordered, so it can't be removed. Set its stock to 0 to stop selling it.",
    };
  }

  const productId = await productIdForVariant(id);
  await deleteVariant(id);
  if (productId !== null) {
    const slug = await slugForId(productId);
    await revalidateStorefront(slug ? [slug] : []);
    revalidatePath(`/admin/products/${productId}`);
  }
  revalidatePath("/admin");
  return { ok: true };
}
```

- [ ] **Step 3: Write the variants section**

Create `app/(admin)/admin/products/[id]/VariantsSection.tsx`:

```tsx
"use client";

import { useActionState, useState, useTransition } from "react";
import { formatMoney } from "@/lib/money";
import type { AdminVariant } from "@/lib/admin/variants";
import { deleteVariantAction, saveVariantAction, type ActionResult } from "../../actions";
import form from "../../form.module.css";
import styles from "./variants.module.css";

function VariantRow({
  productId,
  variant,
  onDone,
}: {
  productId: number;
  variant: AdminVariant | null;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      const result = await saveVariantAction(previous, formData);
      if (result.ok) onDone?.();
      return result;
    },
    null,
  );
  const [madeToOrder, setMadeToOrder] = useState(variant ? variant.inventory === null : false);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const error = state && !state.ok ? state : null;

  return (
    <form action={formAction} className={styles.row}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="id" value={variant?.id ?? ""} />

      <div className={styles.cells}>
        <div className={form.field}>
          <label className={form.label} htmlFor={`name-${variant?.id ?? "new"}`}>
            Format
          </label>
          <input
            id={`name-${variant?.id ?? "new"}`}
            name="name"
            required
            placeholder="Original"
            defaultValue={variant?.name ?? ""}
            className={form.input}
          />
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor={`kind-${variant?.id ?? "new"}`}>
            Kind
          </label>
          <select
            id={`kind-${variant?.id ?? "new"}`}
            name="kind"
            defaultValue={variant?.kind ?? "print"}
            className={form.select}
          >
            <option value="original">Original</option>
            <option value="print">Print</option>
          </select>
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor={`price-${variant?.id ?? "new"}`}>
            Price
          </label>
          <input
            id={`price-${variant?.id ?? "new"}`}
            name="price"
            required
            inputMode="decimal"
            placeholder="220.00"
            defaultValue={variant ? (variant.priceCents / 100).toFixed(2) : ""}
            className={form.input}
          />
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor={`compareAt-${variant?.id ?? "new"}`}>
            Compare at
          </label>
          <input
            id={`compareAt-${variant?.id ?? "new"}`}
            name="compareAt"
            inputMode="decimal"
            defaultValue={
              variant?.compareAtCents != null ? (variant.compareAtCents / 100).toFixed(2) : ""
            }
            className={form.input}
          />
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor={`inventory-${variant?.id ?? "new"}`}>
            In stock
          </label>
          <input
            id={`inventory-${variant?.id ?? "new"}`}
            name="inventory"
            type="number"
            min={0}
            disabled={madeToOrder}
            defaultValue={variant?.inventory ?? 0}
            className={form.input}
          />
          <div className={form.checkboxRow}>
            <input
              id={`madeToOrder-${variant?.id ?? "new"}`}
              name="madeToOrder"
              type="checkbox"
              checked={madeToOrder}
              onChange={(event) => setMadeToOrder(event.target.checked)}
            />
            <label htmlFor={`madeToOrder-${variant?.id ?? "new"}`}>Made to order</label>
          </div>
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor={`sku-${variant?.id ?? "new"}`}>
            SKU
          </label>
          <input
            id={`sku-${variant?.id ?? "new"}`}
            name="sku"
            defaultValue={variant?.sku ?? ""}
            className={form.input}
          />
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor={`position-${variant?.id ?? "new"}`}>
            Position
          </label>
          <input
            id={`position-${variant?.id ?? "new"}`}
            name="position"
            type="number"
            defaultValue={variant?.position ?? 0}
            className={form.input}
          />
        </div>
      </div>

      <div className={form.actions}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : variant ? "Save format" : "Add format"}
        </button>
        {variant && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={deleting}
            onClick={() =>
              startDelete(async () => {
                const result = await deleteVariantAction(variant.id);
                setDeleteError(result.ok ? null : result.error);
              })
            }
          >
            {deleting ? "Removing…" : "Remove"}
          </button>
        )}
        {state?.ok && <p className={form.success}>Saved.</p>}
        {error && (
          <p className={form.error} role="alert">
            {error.error}
          </p>
        )}
        {deleteError && (
          <p className={form.error} role="alert">
            {deleteError}
          </p>
        )}
      </div>

      {variant && (
        <p className={form.hint}>
          Shows as {formatMoney(variant.priceCents)}
          {variant.inventory === null
            ? ", made to order"
            : variant.inventory === 0
              ? ", sold out"
              : `, ${variant.inventory} in stock`}
        </p>
      )}
    </form>
  );
}

export function VariantsSection({
  productId,
  variants,
}: {
  productId: number;
  variants: AdminVariant[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section className={form.section}>
      <h2 className={form.sectionHeading}>Formats</h2>
      <p className={form.hint}>
        One row per purchasable option. Use “Made to order” for prints with no stock limit —
        that stores no quantity at all, which is different from 0 (sold out).
      </p>

      {variants.length === 0 && !adding && (
        <p>No formats yet. Add the original, then any print sizes.</p>
      )}

      {variants.map((variant) => (
        <VariantRow key={variant.id} productId={productId} variant={variant} />
      ))}

      {adding ? (
        <VariantRow productId={productId} variant={null} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
          Add a format
        </button>
      )}
    </section>
  );
}
```

Create `app/(admin)/admin/products/[id]/variants.module.css`:

```css
.row {
  border-top: 1px solid var(--border, #e5e5e5);
  padding: 1rem 0;
  display: grid;
  gap: 0.75rem;
}

.cells {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
}
```

- [ ] **Step 4: Render the section on the edit page**

In `app/(admin)/admin/products/[id]/page.tsx`, add the imports:

```tsx
import { listVariants } from "@/lib/admin/variants";
import { VariantsSection } from "./VariantsSection";
```

Change the data fetch to include variants:

```tsx
  const [product, collections, variants] = await Promise.all([
    getProductForAdmin(id),
    listCollectionNames(),
    listVariants(id),
  ]);
```

And render the section after `<DetailsForm />`:

```tsx
      <VariantsSection productId={product.id} variants={variants} />
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Verify in the browser**

Open the product you created in Task 10. Add a format named `Original`, kind Original, price `2200.00`, stock `1`. Save and confirm "Saved." and the hint line reading "Shows as $2,200.00, 1 in stock".

Add a second format `Print, 12 × 16 in`, kind Print, price `85`, and tick **Made to order**. Save, reload, and confirm the checkbox is still ticked — that proves `NULL` round-tripped rather than becoming `0`.

Test the two-column CHECK: on the Original row set compare-at to `100` (below the price) and save. Expected: "The compare-at price must be higher than the price." Test the unique constraint: add another format also named `Original`. Expected: "This product already has a format with that name."

Now publish the product from `/admin` and confirm it appears on `/shop` with the correct price range, and that the print shows "Printed to order" on the product page while the original shows "Available".

Finally, verify the order guard. Fabricate an order line against one of the formats, then try to remove it:

```bash
VARIANT=$(docker exec art-store-postgres psql -U postgres -d art_store -tAc \
  "select id from variants order by id desc limit 1")
docker exec art-store-postgres psql -U postgres -d art_store -c \
  "INSERT INTO orders (stripe_session_id, currency, subtotal_cents, shipping_cents, total_cents)
   VALUES ('cs_test_guard', 'usd', 100, 0, 100);
   INSERT INTO order_items (order_id, variant_id, description, quantity, unit_price_cents, total_cents)
   SELECT id, $VARIANT, 'guard test', 1, 100, 100 FROM orders WHERE stripe_session_id = 'cs_test_guard';"
```

Reload the edit page and click "Remove" on that format. Expected: the inline error "This format has been ordered, so it can't be removed. Set its stock to 0 to stop selling it." and the format still present after a reload. Then clean up:

```bash
docker exec art-store-postgres psql -U postgres -d art_store -c \
  "DELETE FROM orders WHERE stripe_session_id = 'cs_test_guard';"
```

Confirm "Remove" now succeeds on that format.

- [ ] **Step 7: Commit**

```bash
git add lib/admin/variants.ts "app/(admin)/admin"
git commit -m "Add variant editing with tri-state inventory"
```

---

### Task 13: Reorder algorithm

**Files:**
- Create: `lib/admin/reorder.ts`, `lib/admin/reorder.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `moveItem<T extends { id: number }>(items: T[], id: number, direction: "up" | "down"): { id: number; position: number }[]` from `@/lib/admin/reorder`. Returns every item's new zero-based position in the reordered sequence, or an empty array when the move is a no-op. Used by Task 15.

- [ ] **Step 1: Write the failing test**

Create `lib/admin/reorder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { moveItem } from "./reorder";

const items = [{ id: 10 }, { id: 20 }, { id: 30 }];

describe("moveItem", () => {
  it("moves an item up", () => {
    expect(moveItem(items, 20, "up")).toEqual([
      { id: 20, position: 0 },
      { id: 10, position: 1 },
      { id: 30, position: 2 },
    ]);
  });

  it("moves an item down", () => {
    expect(moveItem(items, 20, "down")).toEqual([
      { id: 10, position: 0 },
      { id: 30, position: 1 },
      { id: 20, position: 2 },
    ]);
  });

  it("returns no changes when the first item moves up", () => {
    expect(moveItem(items, 10, "up")).toEqual([]);
  });

  it("returns no changes when the last item moves down", () => {
    expect(moveItem(items, 30, "down")).toEqual([]);
  });

  it("returns no changes for an unknown id", () => {
    expect(moveItem(items, 99, "up")).toEqual([]);
  });

  it("returns no changes for a single item", () => {
    expect(moveItem([{ id: 1 }], 1, "up")).toEqual([]);
    expect(moveItem([{ id: 1 }], 1, "down")).toEqual([]);
  });

  it("always renumbers contiguously from zero", () => {
    const five = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
    const result = moveItem(five, 4, "up");
    expect(result.map((r) => r.position)).toEqual([0, 1, 2, 3, 4]);
    expect(result.map((r) => r.id)).toEqual([1, 2, 4, 3, 5]);
  });

  it("does not mutate its input", () => {
    const original = [{ id: 1 }, { id: 2 }];
    moveItem(original, 2, "up");
    expect(original).toEqual([{ id: 1 }, { id: 2 }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test lib/admin/reorder.test.ts`
Expected: FAIL — cannot find module `./reorder`.

- [ ] **Step 3: Implement `moveItem`**

Create `lib/admin/reorder.ts`:

```ts
/**
 * Swaps one item with its neighbour and renumbers the whole sequence from zero.
 *
 * Kept pure and free of any database import so the ordering logic is testable
 * on its own; `applyImagePositions` writes the result inside one transaction.
 * Returns [] when the move would change nothing.
 */
export function moveItem<T extends { id: number }>(
  items: T[],
  id: number,
  direction: "up" | "down",
): { id: number; position: number }[] {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return [];

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return [];

  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];

  return next.map((item, position) => ({ id: item.id, position }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test lib/admin/reorder.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/reorder.ts lib/admin/reorder.test.ts
git commit -m "Add a pure reorder algorithm for image positions"
```

---

### Task 14: Storage and presigned uploads

**Files:**
- Create: `lib/admin/storage.ts`, `app/api/admin/upload-url/route.ts`
- Modify: `package.json`, `.env.example`, `next.config.ts`

**Interfaces:**
- Consumes: `isAdmin` (Task 8)
- Produces:
  - `@/lib/admin/storage`: `MAX_UPLOAD_BYTES: number`, `ALLOWED_IMAGE_TYPES: readonly string[]`, `presignUpload(productId: number, contentType: string): Promise<{ uploadUrl: string; publicUrl: string } | null>`
  - `POST /api/admin/upload-url` accepting `{ productId, contentType, size }` and returning `{ uploadUrl, publicUrl }`. Used by Task 15.

- [ ] **Step 1: Install the S3 packages**

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 2: Add the storage environment variables**

Append to `.env.example`:

```
# Image storage. Works with any S3-compatible bucket (AWS S3, Cloudflare R2,
# Backblaze B2, MinIO). Leave S3_ENDPOINT blank for AWS.
S3_ENDPOINT=
S3_REGION=auto
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
# Public base URL the bucket serves from, e.g. https://images.example.com
S3_PUBLIC_BASE_URL=
# MinIO and some self-hosted gateways need path-style addressing
S3_FORCE_PATH_STYLE=false
```

Copy the same keys into `.env.local` with real values for your bucket.

- [ ] **Step 3: Write the storage module**

Create `lib/admin/storage.ts`:

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export const ALLOWED_IMAGE_TYPES = Object.keys(EXTENSIONS) as readonly string[];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    },
  });
}

/**
 * Issues a short-lived PUT URL so the browser uploads straight to the bucket.
 * Art scans are large; routing them through a Server Action (1 MB body limit)
 * or a route handler would mean holding whole files in app memory.
 *
 * Returns null for a content type we do not accept.
 */
export async function presignUpload(
  productId: number,
  contentType: string,
): Promise<{ uploadUrl: string; publicUrl: string } | null> {
  const extension = EXTENSIONS[contentType];
  if (!extension) return null;

  const key = `art/${productId}/${randomUUID()}.${extension}`;
  const uploadUrl = await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: requireEnv("S3_BUCKET"), Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );

  const base = requireEnv("S3_PUBLIC_BASE_URL").replace(/\/$/, "");
  return { uploadUrl, publicUrl: `${base}/${key}` };
}
```

- [ ] **Step 4: Write the route handler**

Create `app/api/admin/upload-url/route.ts`:

```ts
import { isAdmin } from "@/lib/admin/auth";
import { MAX_UPLOAD_BYTES, presignUpload } from "@/lib/admin/storage";

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { productId?: unknown; contentType?: unknown; size?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const productId = Number(body.productId);
  if (!Number.isInteger(productId)) {
    return Response.json({ error: "Unknown product." }, { status: 400 });
  }

  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `Images must be under ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` },
      { status: 400 },
    );
  }

  const presigned = await presignUpload(productId, String(body.contentType ?? ""));
  if (!presigned) {
    return Response.json({ error: "Use a JPEG, PNG, WebP or AVIF image." }, { status: 400 });
  }

  return Response.json(presigned);
}
```

- [ ] **Step 5: Allow the bucket host in `next.config.ts`**

`next/image` refuses any remote host not listed here. Add an entry built from the public base URL:

```ts
import type { NextConfig } from "next";

const bucketHost = process.env.S3_PUBLIC_BASE_URL
  ? new URL(process.env.S3_PUBLIC_BASE_URL).hostname
  : null;

const nextConfig: NextConfig = {
  images: {
    // 90 is used in the lightbox so brushwork and paper texture hold up.
    qualities: [75, 90],
    remotePatterns: [
      // Placeholder images from the seed data. Replace with your own host
      // (S3, R2, Cloudinary, etc.) or serve files from /public/art.
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      ...(bucketHost ? [{ protocol: "https" as const, hostname: bucketHost }] : []),
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 6: Configure bucket CORS**

The browser PUTs directly to the bucket, so the bucket must allow it. Apply this CORS rule (R2: Settings → CORS policy; S3: the bucket's CORS configuration), replacing the origin with your site:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Add your production origin to `AllowedOrigins` when you deploy.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Verify the endpoint**

Restart `npm run dev` so the new env vars load. First confirm it rejects anonymous callers:

```bash
curl -s -X POST http://localhost:3000/api/admin/upload-url \
  -H 'Content-Type: application/json' \
  -d '{"productId":1,"contentType":"image/jpeg","size":1000}' \
  -w '\n[HTTP %{http_code}]\n'
```

Expected: `{"error":"Not signed in."}` and `[HTTP 401]`.

Then, signed in via the browser, open the devtools console on `/admin` and run:

```js
await (await fetch("/api/admin/upload-url", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ productId: 1, contentType: "image/jpeg", size: 1000 }),
})).json();
```

Expected: an object with `uploadUrl` (a long presigned URL) and `publicUrl`. Also confirm `contentType: "image/gif"` returns the "Use a JPEG, PNG, WebP or AVIF image." error, and `size: 99999999` returns the size error.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json lib/admin/storage.ts app/api/admin/upload-url next.config.ts .env.example
git commit -m "Add presigned S3 uploads for artwork images"
```

---

### Task 15: Images

**Files:**
- Create: `lib/admin/images.ts`, `app/(admin)/admin/products/[id]/ImagesSection.tsx`, `app/(admin)/admin/products/[id]/images.module.css`
- Modify: `app/(admin)/admin/actions.ts`, `app/(admin)/admin/products/[id]/page.tsx`

**Interfaces:**
- Consumes: `moveItem` (Task 13), `MAX_UPLOAD_BYTES`/`ALLOWED_IMAGE_TYPES` (Task 14), the upload endpoint (Task 14), `messageForDbError`, `requireAdmin`, `ActionResult`, `revalidateStorefront`
- Produces: in `@/lib/admin/images` — `listImages(productId)`, `addImage(productId, input)`, `updateImageAlt(id, alt)`, `deleteImage(id)`, `applyImagePositions(productId, positions)`; plus `addImageAction`, `updateAltAction`, `deleteImageAction`, `moveImageAction`.

- [ ] **Step 1: Write the image queries**

Create `lib/admin/images.ts`:

```ts
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
```

- [ ] **Step 2: Add the actions**

Append to `app/(admin)/admin/actions.ts`:

```ts
import { moveItem } from "@/lib/admin/reorder";
import {
  addImage,
  applyImagePositions,
  deleteImage,
  listImages,
  productIdForImage,
  updateImageAlt,
} from "@/lib/admin/images";

async function revalidateProduct(productId: number): Promise<void> {
  const slug = await slugForId(productId);
  await revalidateStorefront(slug ? [slug] : []);
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin");
}

export async function addImageAction(input: {
  productId: number;
  url: string;
  width: number;
  height: number;
  alt: string;
}): Promise<ActionResult> {
  await requireAdmin();

  if (!Number.isInteger(input.productId)) return { ok: false, error: "Unknown product." };
  if (!Number.isInteger(input.width) || input.width <= 0) {
    return { ok: false, error: "The image width could not be read." };
  }
  if (!Number.isInteger(input.height) || input.height <= 0) {
    return { ok: false, error: "The image height could not be read." };
  }

  try {
    await addImage(input.productId, {
      url: input.url,
      width: input.width,
      height: input.height,
      alt: input.alt,
    });
  } catch (error) {
    const message = messageForDbError(error);
    if (message) return { ok: false, error: message };
    throw error;
  }

  await revalidateProduct(input.productId);
  return { ok: true };
}

export async function updateAltAction(id: number, alt: string): Promise<void> {
  await requireAdmin();
  await updateImageAlt(id, alt);
  const productId = await productIdForImage(id);
  if (productId !== null) await revalidateProduct(productId);
}

export async function deleteImageAction(id: number): Promise<void> {
  await requireAdmin();
  const productId = await productIdForImage(id);
  await deleteImage(id);
  if (productId !== null) await revalidateProduct(productId);
}

export async function moveImageAction(id: number, direction: "up" | "down"): Promise<void> {
  await requireAdmin();
  const productId = await productIdForImage(id);
  if (productId === null) return;

  const images = await listImages(productId);
  const positions = moveItem(images, id, direction);
  if (positions.length === 0) return;

  await applyImagePositions(productId, positions);
  await revalidateProduct(productId);
}
```

- [ ] **Step 3: Write the images section**

Create `app/(admin)/admin/products/[id]/ImagesSection.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import type { AdminImage } from "@/lib/admin/images";
import {
  addImageAction,
  deleteImageAction,
  moveImageAction,
  updateAltAction,
} from "../../actions";
import form from "../../form.module.css";
import styles from "./images.module.css";

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

/** Reads pixel dimensions in the browser. These are layout hints, not a
 *  security boundary, so client-supplied values are fine — and it saves you
 *  running `sips` by hand. */
async function readDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

function ImageCard({ image, last }: { image: AdminImage; last: boolean }) {
  const [pending, start] = useTransition();
  const [alt, setAlt] = useState(image.alt);

  return (
    <li className={styles.card} data-pending={pending || undefined}>
      <Image
        src={image.url}
        alt={alt}
        width={image.width}
        height={image.height}
        className={styles.preview}
        sizes="200px"
      />
      <div className={form.field}>
        <label className={form.label} htmlFor={`alt-${image.id}`}>
          Alt text
        </label>
        <input
          id={`alt-${image.id}`}
          className={form.input}
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          onBlur={() => {
            if (alt !== image.alt) start(() => void updateAltAction(image.id, alt));
          }}
        />
        <p className={form.hint}>
          {image.width} × {image.height} px
          {image.position === 0 && " · main image"}
        </p>
      </div>
      <div className={styles.cardActions}>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending || image.position === 0}
          onClick={() => start(() => void moveImageAction(image.id, "up"))}
        >
          ↑<span className="visually-hidden"> Move earlier</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending || last}
          onClick={() => start(() => void moveImageAction(image.id, "down"))}
        >
          ↓<span className="visually-hidden"> Move later</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => start(() => void deleteImageAction(image.id))}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

export function ImagesSection({
  productId,
  images,
}: {
  productId: number;
  images: AdminImage[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        const { width, height } = await readDimensions(file);

        const presignResponse = await fetch("/api/admin/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, contentType: file.type, size: file.size }),
        });
        const presigned = await presignResponse.json();
        if (!presignResponse.ok) throw new Error(presigned.error ?? "Could not start the upload.");

        const put = await fetch(presigned.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) throw new Error("The upload to storage failed. Check the bucket CORS rules.");

        const saved = await addImageAction({
          productId,
          url: presigned.publicUrl,
          width,
          height,
          alt: "",
        });
        if (!saved.ok) throw new Error(saved.error);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={form.section}>
      <h2 className={form.sectionHeading}>Images</h2>
      <p className={form.hint}>
        The first image is the main one; the second shows on hover in the shop grid. Dimensions
        are read from the file automatically.
      </p>

      {images.length === 0 ? (
        <p>No images yet.</p>
      ) : (
        <ul className={styles.grid}>
          {images.map((image, index) => (
            <ImageCard key={image.id} image={image} last={index === images.length - 1} />
          ))}
        </ul>
      )}

      <div className={form.field}>
        <label className={form.label} htmlFor="upload">
          Add images
        </label>
        <input
          id="upload"
          type="file"
          accept={ACCEPT}
          multiple
          disabled={busy}
          onChange={(event) => {
            void upload(event.target.files);
            event.target.value = "";
          }}
        />
        {busy && <p className={form.hint}>Uploading…</p>}
        {error && (
          <p className={form.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
```

Create `app/(admin)/admin/products/[id]/images.module.css`:

```css
.grid {
  list-style: none;
  padding: 0;
  margin: 0 0 1.25rem;
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
}

.card {
  display: grid;
  gap: 0.5rem;
  border: 1px solid var(--border, #e5e5e5);
  border-radius: 0.5rem;
  padding: 0.75rem;
}

.card[data-pending] {
  opacity: 0.5;
}

.preview {
  width: 100%;
  height: auto;
  border-radius: 0.25rem;
  background: var(--border, #e5e5e5);
}

.cardActions {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
}
```

- [ ] **Step 4: Render the section on the edit page**

In `app/(admin)/admin/products/[id]/page.tsx`, add the imports:

```tsx
import { listImages } from "@/lib/admin/images";
import { ImagesSection } from "./ImagesSection";
```

Extend the data fetch:

```tsx
  const [product, collections, variants, images] = await Promise.all([
    getProductForAdmin(id),
    listCollectionNames(),
    listVariants(id),
    listImages(id),
  ]);
```

And render after `<VariantsSection />`:

```tsx
      <ImagesSection productId={product.id} images={images} />
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Verify in the browser**

Open your product's edit page. Upload a JPEG. Expected: it appears in the grid labelled "main image" with its real pixel dimensions read from the file — no `sips` needed. Upload a second image.

Type alt text into the first image and click away. Reload and confirm it persisted.

Click ↓ on the first image. Expected: the two swap and the "main image" label moves. **This is the behaviour migration 001 exists for** — if you see a unique-violation error here, migration 001 did not apply. Confirm the storefront product page now shows the images in the new order.

Remove one image and confirm it disappears from both the admin and the storefront gallery.

- [ ] **Step 7: Commit**

```bash
git add lib/admin/images.ts "app/(admin)/admin" 
git commit -m "Add image upload, alt text, reordering and removal"
```

---

### Task 16: Documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above
- Produces: no code

- [ ] **Step 1: Replace the Setup section**

In `README.md`, replace the fenced setup block with one that covers Docker, migrations and the admin password:

```markdown
## Setup

```bash
npm install
cp .env.example .env.local        # fill in the Stripe keys, admin password and bucket
docker compose up -d              # Postgres on :5432, schema and seed applied on first boot
npm run db:migrate                # brings any existing database up to date
npm run dev
```

Generate the admin secrets with:

```bash
printf '\nADMIN_PASSWORD=%s\nADMIN_SESSION_SECRET=%s\n' \
  "$(openssl rand -base64 18)" "$(openssl rand -base64 32)" >> .env.local
```

Without Docker, create the database yourself and run `npm run db:setup`, which applies the
schema, the seed data and every migration.
```

- [ ] **Step 2: Replace the "Adding products" section**

The three raw `INSERT` statements are no longer how you add work. Replace that whole section with:

```markdown
## Adding products

Sign in at `/admin` with your `ADMIN_PASSWORD`.

1. **New product** — give it a title. The web address is derived from the title and stays
   editable. It is created as a draft, so nothing is public yet.
2. **Details** — year, medium, dimensions, description and collection. Collection is free text
   with a list of names you have already used, so pick from it rather than retyping.
3. **Formats** — one row per purchasable option. Use *Made to order* for prints with no stock
   limit; that stores no quantity at all, which is different from 0 (sold out). Set *Compare at*
   above the price to show something as on sale.
4. **Images** — upload straight from the file picker. Pixel dimensions are read from the file, so
   there is no need to run `sips`. The first image is the main one and the second shows on hover
   in the shop grid; reorder with the arrows.
5. **Publish** — tick *Published* on the details form, or use the Publish button in the list.

Products are never deleted from the admin, only unpublished — that keeps past orders linked to
what was actually bought. To clear the seeded placeholders:

`DELETE FROM products WHERE slug IN ('low-water','marsh-edge','slack-tide','estuary-study','porch-light','streetlamp','overpass','pear-study','window-study');`

Then drop the picsum hosts from `next.config.ts`.
```

- [ ] **Step 3: Update the "Managing orders" note**

Under "Things to know", replace the "Managing orders" bullet, since the claim that there is no
admin screen is now only true of orders:

```markdown
- **Managing orders.** Orders appear in both the Stripe dashboard and the `orders` /
  `order_items` tables. The admin covers products only — there is no order screen yet, and
  `orders.status` is never advanced past `paid`.
```

- [ ] **Step 4: Add a database changes section**

After "Settings", add:

```markdown
## Database changes

`db/schema.sql` is the baseline and is not edited. Every change since goes in
`db/migrations/NNN-name.sql` and is applied by `npm run db:migrate`, which records what it has
run in `schema_migrations` and applies each file once inside its own transaction.
```

- [ ] **Step 5: Verify the documented flow from scratch**

Confirm the README actually works by following it against a clean database:

```bash
docker compose down -v && docker compose up -d
sleep 10
npm run db:migrate
npm test
npm run typecheck
```

Expected: migrations apply (`applied 2 migration(s)`), all tests pass, no type errors. Then load
`/admin` in a browser, sign in, and confirm the product list renders.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "Document the admin, migrations and Docker setup"
```

---

## Verification

Run the whole suite before opening a pull request:

```bash
npm test          # all unit tests
npm run typecheck # no type errors
```

Then confirm the storefront is unbroken after the route-group move:

```bash
SLUG=$(docker exec art-store-postgres psql -U postgres -d art_store -tAc 'select slug from products where published limit 1')
for p in / /shop /cart "/products/$SLUG" /admin; do
  printf "%-28s " "$p"
  curl -s -o /dev/null -w "HTTP %{http_code}\n" --max-time 25 "http://localhost:3000$p"
done
```

Expected: `200` for the four storefront paths and `307` for `/admin` when signed out.

## Known gaps carried out of this plan

Stated in the spec and deliberately not addressed here:

- Tests cover pure functions only. The SQL in `lib/admin/*` and the deferrable-constraint
  behaviour have no automated coverage — they are verified by hand in Tasks 5, 9, 11, 12 and 15.
  Integration tests against a throwaway database are a follow-on.
- No rate limiting on login beyond a fixed delay.
- A failed `addImageAction` after a successful PUT leaves an orphaned object in the bucket.
- Deleting an image leaves its stored object behind.
- No admin product search or pagination.

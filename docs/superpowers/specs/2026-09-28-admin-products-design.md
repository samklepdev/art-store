# Admin: products — design

**Date:** 2026-09-28
**Status:** approved, ready for implementation planning
**Scope:** Phase 1 of the Shopify-parity roadmap — authentication plus product, variant and
image management. Orders, discounts, customers and storefront search are later phases.

## Problem

The storefront is complete: browse, variant picker, cart, Stripe Checkout, webhook-recorded
orders, stock decrement. The merchant half of Shopify is entirely absent. Adding a painting
today means hand-writing three `INSERT` statements (`README.md:47-64`) and looking up pixel
dimensions with `sips`. Nothing in `app/` performs a write except the Stripe webhook.

Phase 1 makes the store operable without SQL.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Auth | Single `ADMIN_PASSWORD` in env, signed cookie | Single-artist store; no users table or auth dependency needed |
| Image storage | S3-compatible object storage | Works on any host, survives redeploys, handles large scans |
| SDK | `@aws-sdk/client-s3` + presigner | One code path for AWS S3, Cloudflare R2, B2 or MinIO; bucket chosen by env var |
| Product removal | Unpublish only | `published` already exists and is honoured by every storefront query; never severs order links |
| Collections | Stay free text | Storefront already derives them from the column; normalising is Phase 5 content work |
| Mutations | Server Actions | ~12 mutations; avoids a route handler + client wrapper + hand-rolled pending state for each |
| Image dimensions | Supplied by the browser | Already decoded for the preview; layout hints, not a security boundary |

### Why Server Actions over the existing pattern

The codebase currently has no Server Actions — `app/api/checkout/route.ts` paired with
`lib/checkout-client.ts` is the only mutation path. That pattern is right for checkout, which is
a *public* endpoint a client component must call. Admin forms are a different situation: at
roughly twelve mutations, a route handler plus client wrapper plus per-form loading and error
state each is significant ceremony, and storefront revalidation would have to be solved by hand.
`useActionState` / `useFormStatus` and `revalidatePath` remove all of that.

## Architecture

### Route groups

`app/layout.tsx` currently renders `<html>`/`<body>` *and* the storefront chrome — `Header`,
`Footer`, `CartProvider`, `CartDrawer`. Anything at `app/admin/*` would inherit a cart drawer
and shop nav, and `Header` calls `getCollections()`, firing a pointless query on every admin page.

Split the layout so chrome lives in a group:

```
app/
  layout.tsx              only <html>/<body>, fonts, globals.css, metadata
  (storefront)/
    layout.tsx            CartProvider + Header + Footer + CartDrawer
    page.tsx  shop/  products/  cart/  checkout/      moved; URLs unchanged
  (admin)/
    layout.tsx            admin chrome
    error.tsx             admin-only error boundary
    admin/
      login/page.tsx
      page.tsx                    product list
      products/new/page.tsx
      products/[id]/page.tsx      details + variants + images
      actions.ts                  "use server" mutations
app/api/admin/upload-url/route.ts presigned PUT issuer
```

Parenthesised groups do not appear in URLs, so every storefront path is unchanged. This is a
mechanical file move and the correct structure once the app has a second surface.

### Module layout

`lib/admin/`, each file `server-only`:

| File | Responsibility |
|---|---|
| `auth.ts` | password check, cookie sign/verify, `requireAdmin()` |
| `products.ts` | product insert/update, publish and feature toggles |
| `variants.ts` | variant insert/update/delete |
| `images.ts` | image insert, alt text, reorder, delete |
| `storage.ts` | S3 presign, key naming |
| `errors.ts` | Postgres error code → user-facing message |

Writes deliberately do **not** join `lib/products.ts`. That module is 139 lines of read queries
serving the storefront; folding a dozen writes into it would double its size and mix two
audiences. Reads stay put, and admin screens reuse them where they fit.

`lib/money.ts` gains `parseMoney(input: string): number | null` to complement `formatMoney` —
the DB stores cents, humans type dollars.

## Authentication

`ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` in env. `/admin/login` posts to a Server Action that
compares with `crypto.timingSafeEqual` (not `===`, which leaks length and prefix timing). On
success it sets an `admin_session` cookie — `httpOnly`, `sameSite: "lax"`, `secure` in
production — containing an expiry and an HMAC signature keyed on `ADMIN_SESSION_SECRET`.

Two constraints that shape the implementation:

1. **`middleware.ts` runs on the Edge runtime**, where Node's `crypto` module is unavailable.
   Signature verification there must use Web Crypto (`crypto.subtle.verify`) — async, but
   Edge-supported. The password comparison stays in the Node-runtime Server Action, so
   `timingSafeEqual` is available there.

2. **Middleware is not the authorization boundary.** It exists for redirect UX. Every admin
   Server Action calls `requireAdmin()` first, because an action is a POST endpoint whose
   security must not depend on route matching.

Accepted limitation: no meaningful rate limiting. In-memory attempt counters are useless across
serverless instances. Mitigation is a strong password plus a fixed delay on failed attempts.

## Data model changes

### Migration runner

No migration system exists — `db/` holds only `schema.sql` (all `CREATE TABLE IF NOT EXISTS`)
and `seed.sql`, and `db:setup` replays both, applying nothing to an existing database.

`scripts/migrate.mjs`, roughly 40 lines, no new dependency (uses the installed `pg`):

- reads `db/migrations/NNN-name.sql` in filename order
- records applied versions in `schema_migrations (version text primary key, applied_at timestamptz)`
- runs each file in its own transaction so a failure rolls back cleanly

New script `db:migrate`. `db:setup` becomes schema → seed → migrate. `schema.sql` remains the
baseline and is not edited; migrations layer on top.

Docker note: the compose init hook runs `schema.sql`/`seed.sql` only on *first* boot, so
`npm run db:migrate` is the step that brings any database — fresh container or existing — up to
date. `docker-compose.yml` needs no change.

### 001 — deferrable image position

`product_images` carries `UNIQUE (product_id, position)` (`schema.sql:24`), confirmed in the live
database as `product_images_product_id_position_key`, not deferrable. Postgres checks
non-deferrable unique constraints as a statement progresses, so a reorder that permutes positions
fails on an intermediate state even though the final state is valid.

```sql
ALTER TABLE product_images DROP CONSTRAINT product_images_product_id_position_key;
ALTER TABLE product_images ADD CONSTRAINT product_images_product_id_position_key
  UNIQUE (product_id, position) DEFERRABLE INITIALLY DEFERRED;
```

Defers the check to `COMMIT`, preserving the invariant that two images cannot claim one slot.
Dropping the constraint outright would also unblock reordering but loses a real guarantee.

### 002 — `products.updated_at`

`timestamptz`, set explicitly by every admin update. `created_at` alone cannot answer "what did I
just change", which is the natural default sort for the product list.

## Image upload

Bytes never pass through the application:

1. Admin picks a file. The client reads dimensions via `createImageBitmap` and validates type and size.
2. Client POSTs filename, contentType and size to `/api/admin/upload-url`. The route calls
   `requireAdmin()`, checks contentType against a jpeg/png/webp/avif allowlist and a size cap,
   builds a key (`art/<productId>/<uuid>.<ext>`), and returns a presigned PUT URL (5 minute
   expiry) plus the eventual public URL.
3. Client `PUT`s the bytes straight to the bucket.
4. Client calls the `addImage` action with url, width, height and alt; it re-verifies admin and inserts.

Presigning avoids the body-size wall: art scans are large, and routing them through a Server
Action (1 MB default body limit) or a route handler means holding whole files in app memory.
Browser-supplied dimensions retire the `sips -g pixelWidth` chore at `README.md:68`.

Configuration required: bucket CORS must allow `PUT` from the site origin, and the bucket host
needs a `remotePatterns` entry in `next.config.ts` beside the existing picsum entries.

Accepted limitations, both deliberate:

- If step 3 succeeds and step 4 fails, an orphaned object remains in the bucket. Costs pennies,
  invisible to users, no GC job in Phase 1.
- Deleting an image removes the DB row and leaves the object. This is the safe direction — it can
  never break a live page.

### New environment variables

```
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
S3_ENDPOINT=              # blank for AWS, set for R2/MinIO
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_BASE_URL=       # public/CDN base the images are served from
```

Added to `.env.example`. New dependencies: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.

## Screens

**`/admin/login`** — single password field, inline error.

**`/admin`** — product list sorted by `updated_at` desc: thumbnail, title, collection, price
range, stock summary, published and featured badges, inline publish toggle, "New product" button.
No search or pagination in Phase 1; at this catalogue size it is noise.

**`/admin/products/new`** — title plus slug (auto-derived, editable). Creates the product with
`published = false` and redirects to edit. Create-then-enrich is forced by the data model:
variants and images need a `product_id`, so a single monolithic form would have to manage nested
unsaved state.

**`/admin/products/[id]`** — three sections, each its own form and action so one invalid row
cannot block the others:

- **Details** — title, slug, year, medium, dimensions, description, collection (text input with a
  `<datalist>` of existing names, to prevent `Tidewater` vs `tidewater` drift), featured,
  published, sort order.
- **Variants** — inline rows: name, kind, price, compare-at, inventory, sku, position; add and
  remove. Note `variants.position` carries no unique constraint (only `UNIQUE (product_id, name)`
  at `schema.sql:38`), so variant reordering needs no schema change — unlike images.
- **Images** — thumbnail grid with alt-text inputs, up/down reorder, delete, uploader.

### Data traps the forms must handle

These currently fail silently and are the most likely source of bugs:

1. **`inventory` is tri-state.** `NULL` = made to order / unlimited, `0` = sold out, a number =
   limited edition (`schema.sql:35`, consumed at `products.ts:48`). A bare number input cannot
   express `NULL`, so an explicit **"Made to order"** checkbox disables the number field and
   sends `NULL`. Getting this wrong flips availability logic with no error.
2. **`compare_at_cents > price_cents` is a CHECK** (`schema.sql:34`). Validate client-side and
   handle the violation, or a sale-price typo surfaces as a raw Postgres error.
3. **Slugs must match `^[a-z0-9]+(-[a-z0-9]+)*$`** (`schema.sql:3`). Derivation must strip
   accents and punctuation and collapse stray dashes.

## Error handling

Actions return a typed result rather than throwing:

```ts
type ActionResult = { ok: true } | { ok: false; error: string; field?: string };
```

`useActionState` renders the message inline beside the offending field. `lib/admin/errors.ts`
maps known Postgres codes to human text — `23505` unique violation (slug taken, duplicate variant
name), `23514` check violation (compare-at below price, malformed slug, year out of range).
`requireAdmin()` failure redirects to login.

Every mutation revalidates the storefront paths its change can affect: `/` (featured products and
collection tiles), `/shop` (the grid and collection filters), and `/products/<slug>` for the
edited product. A slug change must revalidate both the old and new paths.

`app/(admin)/error.tsx` covers admin crashes. The storefront's missing `error.tsx` and
`not-found.tsx` are explicitly **out of scope** — they belong to the hardening phase.

## Testing

No test tooling exists. Phase 1 adds Vitest and covers the pure logic, where the subtle bugs live:

| Target | Cases |
|---|---|
| cookie sign/verify | round-trip, tampered signature rejected, expiry honoured |
| `parseMoney` | dollars↔cents round-trip, commas, junk input |
| slug derivation | accents, punctuation, stray dashes, CHECK conformance |
| reorder algorithm | pure `(images, id, direction) → positions` |
| PG error mapping | code → message |

The reorder algorithm is specified as a pure function precisely so it is testable without a database.

**Known gap, stated plainly:** these are unit tests over pure functions. They do not cover the
SQL itself — the write queries and the deferrable-constraint behaviour want integration tests
against a throwaway database, which needs test-DB setup and teardown. That is a follow-on, not
part of Phase 1.

## Out of scope

Orders and fulfilment (Phase 2), the checkout inventory-reservation race (Phase 2), discounts
(Phase 3), customers and order-status pages (Phase 4), storefront search, a pages/nav CMS,
transactional email, analytics (Phase 5+). Normalised collections. Storefront error boundaries
and SEO files. DB integration tests. Bucket garbage collection. Admin product search and
pagination. Multiple admin users.

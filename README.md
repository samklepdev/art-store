# Art store

A storefront for original artwork and prints. Built with Next.js (App Router), TypeScript,
CSS Modules, Postgres and Stripe Checkout. It works like a Shopify store: product pages with
formats, cart drawer, sale pricing, sold-out states, collections and orders.

## What's included

- **Home:** neon hero, featured products, shop-by-collection.
- **Shop** (`/shop`): collection filters, sorting (featured, newest, price), product count.
- **Product pages** (`/products/[slug]`):
  - image gallery with thumbnails, plus a full-screen viewer you can arrow or swipe through
  - format picker (Original / print sizes), quantity, sale and compare-at price
  - Add to cart and Buy it now
  - details accordions and "More from this collection"
  - Product structured data for search engines
- **Cart:** slide-out drawer and a `/cart` page, saved in the browser, with a free-shipping progress note.
- **Checkout:** Stripe Checkout. Prices and stock are re-checked on the server, and shipping is
  charged at a flat rate that drops to free above a threshold.
- **Orders:** a Stripe webhook records each paid order in Postgres and reduces stock, so a sold
  original shows "Sold out" right away.

## Setup

```bash
npm install
cp .env.example .env.local        # fill in DATABASE_URL and the Stripe keys
createdb art_store
DATABASE_URL=postgres://... npm run db:setup
npm run dev
```

In a second terminal, forward Stripe webhooks to your machine (requires the Stripe CLI):

```bash
npm run stripe:listen
```

This prints a `whsec_...` secret. Put it in `STRIPE_WEBHOOK_SECRET` and restart `npm run dev`.
Test with card `4242 4242 4242 4242`, any future date, any CVC.

In production, add a webhook endpoint in the Stripe dashboard pointing to
`https://yourdomain.com/api/stripe/webhook` with the events `checkout.session.completed` and
`checkout.session.async_payment_succeeded`. To have Stripe email receipts, turn on
"Successful payments" under Settings → Customer emails.

## Adding products

```sql
INSERT INTO products (slug, title, year, medium, dimensions, collection, featured)
VALUES ('harbor-at-dusk', 'Harbor at Dusk', 2026, 'Oil on linen', '90 × 120 cm', 'Tidewater', true);

INSERT INTO product_images (product_id, url, width, height, alt_text, position)
SELECT id, '/art/harbor-at-dusk.jpg', 2400, 1800, 'Boats silhouetted against an orange sky', 0
FROM products WHERE slug = 'harbor-at-dusk';

INSERT INTO variants (product_id, name, kind, price_cents, inventory, position)
SELECT id, v.name, v.kind, v.price, v.inventory, v.pos
FROM products, (VALUES
  ('Original', 'original', 220000, 1, 0),
  ('Print, 12 × 16 in', 'print', 8500, NULL, 1)
) AS v(name, kind, price, inventory, pos)
WHERE slug = 'harbor-at-dusk';
```

- Prices are in cents.
- `inventory` is `1` for an original, `NULL` for made-to-order prints, or a number for limited editions.
- Image `width` and `height` must be the real pixel size. Get them with
  `sips -g pixelWidth -g pixelHeight file.jpg` (macOS) or `identify file.jpg` (ImageMagick).
- Setting `compare_at_cents` higher than `price_cents` shows the item as on sale.

To remove the placeholders:
`DELETE FROM products WHERE slug IN ('low-water','marsh-edge','slack-tide','estuary-study','porch-light','streetlamp','overpass','pear-study','window-study');`
Then drop the picsum hosts from `next.config.ts`.

## Settings

`lib/site.ts` holds your name, tagline, email, currency, shipping rate, the free-shipping
threshold and the countries you ship to. Colors live at the top of `app/globals.css`.

## Things to know

- **Two buyers, one original.** Stock is checked when checkout starts. If two people check out the
  same original at the same moment, both can pay. The order log will show it, and you refund one
  in Stripe. If this matters to you, the next step is reserving stock when a checkout session is
  created and releasing it on `checkout.session.expired`.
- **Tax.** Stripe Tax can be enabled with `automatic_tax: { enabled: true }` in
  `app/api/checkout/route.ts` once it's set up in your Stripe dashboard.
- **Managing orders.** Orders appear in both the Stripe dashboard and the `orders` /
  `order_items` tables. There's no admin screen yet.
- **Upgrading from the portfolio version:** this uses new tables (`products`, `variants`,
  `product_images`, `orders`). The old `artworks` table isn't used, and you can drop it.

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

## Settings

`lib/site.ts` holds your name, tagline, email, currency, shipping rate, the free-shipping
threshold and the countries you ship to. Colors live at the top of `app/globals.css`.

## Database changes

`db/schema.sql` is the baseline and is not edited. Every change since goes in
`db/migrations/NNN-name.sql` and is applied by `npm run db:migrate`, which records what it has
run in `schema_migrations` and applies each file once inside its own transaction.

## Things to know

- **Policy pages.** Shipping, returns, privacy and terms live at `/policies/{shipping,returns,privacy,terms}`
  and are linked in the footer. Their text is in `lib/policies.ts` (edit there); shipping facts like the
  rate and free-shipping threshold come from `lib/site.ts`. The copy is a starter template to review before
  publishing — not legal advice.
- **Two buyers, one original.** Stock is checked when checkout starts. If two people check out the
  same original at the same moment, both can pay. The order log will show it, and you refund one
  in Stripe. If this matters to you, the next step is reserving stock when a checkout session is
  created and releasing it on `checkout.session.expired`.
- **Tax.** Stripe Tax can be enabled with `automatic_tax: { enabled: true }` in
  `app/api/checkout/route.ts` once it's set up in your Stripe dashboard.
- **Managing orders.** Orders appear in both the Stripe dashboard and the `orders` /
  `order_items` tables. The admin has an order screen at `/admin/orders` for viewing paid
  orders and marking them fulfilled (reversible). Refunds are still issued in the Stripe
  dashboard — the app never sets the `refunded` status itself.
- **Sales analytics.** `/admin/analytics` shows the last 30 days at a glance: total revenue,
  order count, average order value, items sold, a daily revenue chart, and top-selling items.
  Refunded orders are excluded. Traffic/page-view analytics is not included.
- **Editing in two tabs.** Saving a product or a format overwrites the whole row, so if you edit
  the same one in two tabs the second save wins and the first is lost silently. Edit in one tab.
- **Leftover image files.** Removing an image deletes its database row but leaves the file in the
  bucket (the app's credentials can't delete objects). Harmless — nothing links to it — but the
  bucket grows over time.
- **Upgrading from the portfolio version:** this uses new tables (`products`, `variants`,
  `product_images`, `orders`). The old `artworks` table isn't used, and you can drop it.

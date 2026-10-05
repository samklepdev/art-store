# Storefront policy pages — design

**Date:** 2026-10-05

## Problem

The store sells physical goods and takes payments through Stripe, but has no customer-facing
policies: no shipping, returns/refund, privacy, or terms pages. These are expected for an
e-commerce store (and by payment processors), and the footer currently links none. Before the
store can responsibly take real orders it needs them.

## Scope

Add four static policy pages under the storefront, linked from the footer:

- **Shipping** — `/policies/shipping`
- **Returns & refunds** — `/policies/returns`
- **Privacy** — `/policies/privacy`
- **Terms of service** — `/policies/terms`

The pages are long-form text grounded in the real store settings in `lib/site.ts`. They are
**starter drafts** — each carries a visible "review before publishing; not legal advice" note.
No checkout/legal gating, no cookie banner, no account/data-export tooling (there are no
accounts). Out of scope: a Contact/About page (the footer already surfaces the email).

## Content ownership & caveat

Content is drafted here (and in the content module) from the store's settings. It is a
practical template, **not legal advice**; the shop owner reviews and customizes before
publishing. Three business specifics are chosen as defaults and flagged for confirmation:

1. **Returns window:** 14 days from delivery.
2. **Originals are final sale**; prints returnable only if damaged/defective.
3. **Governing law:** left as a `[your state/country]` placeholder.
4. **Dispatch time:** "within 3–5 business days" (placeholder; confirm).

## Architecture

One content module + one dynamic route keeps the prose in a single editable place and the
facts in sync with `lib/site.ts`.

### 1. Content module — `lib/policies.ts`

```ts
export type PolicySection = { heading?: string; paragraphs: string[] };

export type Policy = {
  slug: "shipping" | "returns" | "privacy" | "terms";
  title: string;
  updated: string;        // ISO date, e.g. "2026-10-05"
  sections: PolicySection[];
};

export const POLICIES: Policy[];               // the four, in footer order
export function getPolicy(slug: string): Policy | undefined;
export const POLICY_LINKS: { slug: string; title: string }[]; // for the footer
```

Dynamic facts are interpolated from `lib/site.ts` at module load using existing helpers
(`formatMoney`) so they never drift from the store config:

- flat shipping = `formatMoney(site.shipping.flatRateCents)` → **$12.00**
- free-shipping threshold = `formatMoney(site.shipping.freeOverCents)` → **$150.00**
- destinations = `site.shipping.countries` → **US, CA**
- contact = `site.email` → **hello@samklepper.shop**
- store name = `site.name`

### 2. Route — `app/(storefront)/policies/[slug]/page.tsx`

Server component:

- `generateStaticParams()` returns the four slugs from `POLICIES`.
- `generateMetadata({ params })` sets `title` to the policy title (or triggers the not-found
  path for an unknown slug).
- The component awaits `params`, calls `getPolicy(slug)`, and `notFound()`s when undefined.
- Renders the title, a muted "Last updated {updated}" line, the "Draft — review before
  publishing; not legal advice" note, then each section (`<h2>` + paragraphs).
- Styled with `app/(storefront)/policies/policies.module.css` (readable measure, storefront
  theme).

### 3. Footer — `components/Footer.tsx`

Add a **"Policies"** nav column (mirroring the existing "Shop" column structure) that maps
`POLICY_LINKS` to `<Link href={`/policies/${slug}`}>`.

## Draft content

Each page renders the sections below. Wording is intentionally plain.

### Shipping (`/policies/shipping`)

- **Where we ship.** We ship to the United States and Canada. All work is packed and shipped
  from the US.
- **Rates.** Standard shipping is a flat $12.00. Orders over $150.00 ship free.
- **Processing time.** Orders are prepared and dispatched within 3–5 business days. Prints are
  made to order; originals are packed with extra care.
- **Transit & tracking.** Delivery time depends on the carrier and destination. A tracking link
  is emailed when your order ships.
- **Customs & duties.** Canadian orders may be subject to import duties or taxes set by your
  country; these are the recipient's responsibility.
- **Problems.** If your order is lost or arrives damaged, email hello@samklepper.shop within 14
  days of the delivery date and we'll make it right.

### Returns & refunds (`/policies/returns`)

- **Originals.** Original works are one of a kind and are **final sale** — they can't be
  returned or exchanged. Please reach out with any questions before purchasing.
- **Prints.** If a print arrives damaged or defective, email hello@samklepper.shop within 14
  days of delivery with photos and we'll send a replacement or issue a refund.
- **Change of mind.** We don't accept change-of-mind returns on prints; contact us if there's a
  problem and we'll do our best to help.
- **Condition.** Any approved return must be unused and in its original packaging.
- **Return shipping.** We cover return shipping when an item was damaged or defective;
  otherwise the buyer pays it.
- **Refunds.** Approved refunds go back to your original payment method through Stripe, usually
  within 5–10 business days of us receiving/approving the return.

### Privacy (`/policies/privacy`)

- **What we collect.** To fulfil orders we collect your name, email, shipping address and order
  details. That's it — there are no customer accounts.
- **Payments.** Payments are processed by Stripe. Card details are entered on Stripe's systems;
  we never see or store your card number.
- **Your cart.** Your cart is stored in your own browser (local storage), not on our servers.
- **Email.** We use your email only to send order and shipping updates. Payment receipts are
  sent by Stripe.
- **No tracking.** We don't use third-party advertising or analytics trackers, and we don't
  sell your data. We share information only with Stripe (to take payment) and the shipping
  carrier (to deliver your order).
- **Cookies.** We use only the essential storage needed to run the cart and the admin sign-in.
- **Your rights.** To ask what we hold about you, or to have it deleted, email
  hello@samklepper.shop.

### Terms of service (`/policies/terms`)

- **These terms.** By buying from this store you agree to these terms. We may update them; the
  "last updated" date shows when.
- **Prices & availability.** Prices are in US dollars and may change. Availability isn't
  guaranteed — in particular, original works are one of a kind. If an original sells at the same
  moment to someone else, we'll cancel the duplicate order and refund it in full.
- **Orders.** An order is accepted when payment is captured. We may cancel and refund an order
  if an item turns out to be unavailable or if there's a pricing error.
- **Intellectual property.** All artwork and images on this site are © Sam Klepper. Buying a
  piece gives you the physical item; it does not transfer copyright or any reproduction rights.
- **Liability.** The store and its work are provided as-is to the extent the law allows; we're
  not liable for indirect or incidental damages.
- **Governing law.** These terms are governed by the laws of [your state/country].
- **Contact.** Questions: hello@samklepper.shop.

## Testing

`lib/policies.test.ts` (pure, matching the repo's `slug.ts`/`orderStatus.ts` convention):

- `getPolicy` returns the matching policy for each of the four slugs.
- `getPolicy` returns `undefined` for an unknown slug.
- `POLICIES`/`POLICY_LINKS` contain exactly the four expected slugs.
- Each policy interpolated the shipping facts (e.g. the shipping policy text contains the
  formatted flat rate and threshold) — guards against the `site.ts` interpolation silently
  breaking.

The route and footer are not unit-tested (repo convention for pages/components); verification
is `npm run typecheck` and `npm run build`.

## Documentation

Add a short "Policies" note to the README admin/store section: policy pages live at
`/policies/{shipping,returns,privacy,terms}`, are linked in the footer, and their text lives in
`lib/policies.ts` — edit there; facts like shipping rates come from `lib/site.ts`. Note the
drafts are templates to review, not legal advice.

# Storefront Policy Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four storefront policy pages (shipping, returns, privacy, terms) under `/policies/[slug]`, linked from the footer, with starter content grounded in `lib/site.ts`.

**Architecture:** A `lib/policies.ts` content module holds the four policies as data (facts interpolated from `lib/site.ts` via `formatMoney`). A single dynamic route `app/(storefront)/policies/[slug]/page.tsx` renders them. The footer gains a "Policies" column. The content module's lookup is the one unit-tested piece.

**Tech Stack:** Next.js (this repo's vendored build — read `node_modules/next/dist/docs/` before touching page/route conventions), React Server Components, CSS Modules, Vitest. No new dependencies.

## Global Constraints

- **No new dependencies.** Plain TS data + a server component.
- **Facts come from `lib/site.ts`**, interpolated with `formatMoney` from `@/lib/money` (never hard-code the shipping rate/threshold): flat rate `site.shipping.flatRateCents` → `$12.00`, free-over `site.shipping.freeOverCents` → `$150.00`, contact `site.email` → `hello@samklepper.shop`, store name `site.name` → `Sam Klepper`.
- **Content is a starter draft, not legal advice.** Every page shows a visible "Draft — review before publishing; not legal advice" note and a "Last updated" date (`2026-10-05`).
- **Four slugs only:** `shipping`, `returns`, `privacy`, `terms`. Unknown slug → `notFound()`.
- **Flagged business defaults (verbatim from the spec):** 14-day returns window; originals final sale; prints returnable only if damaged/defective; dispatch "within 3–5 business days"; governing law `[your state/country]`.
- **Route/footer are not unit-tested** (repo convention for pages/components); only `lib/policies.ts` is. Pages verified by `npm run typecheck` + `npm run build`.

---

## File Structure

- **Create** `lib/policies.ts` — `Policy`/`PolicySection` types, `POLICIES`, `getPolicy`, `POLICY_LINKS`. Unit-tested.
- **Create** `lib/policies.test.ts` — Vitest unit tests.
- **Create** `app/(storefront)/policies/[slug]/page.tsx` — dynamic policy route (server component).
- **Create** `app/(storefront)/policies/policies.module.css` — prose styling.
- **Modify** `components/Footer.tsx` — add a "Policies" column.
- **Modify** `components/Footer.module.css` — widen the grid to 4 columns.
- **Modify** `README.md` — document the policy pages.

---

## Task 1: Content module `lib/policies.ts` + tests

**Files:**
- Create: `lib/policies.ts`
- Test: `lib/policies.test.ts`

**Interfaces:**
- Consumes: `formatMoney` (`@/lib/money`), `site` (`@/lib/site`).
- Produces:
  - `type PolicySection = { heading?: string; paragraphs: string[] }`
  - `type Policy = { slug: "shipping" | "returns" | "privacy" | "terms"; title: string; updated: string; sections: PolicySection[] }`
  - `POLICIES: Policy[]` (four, in footer order: shipping, returns, privacy, terms)
  - `getPolicy(slug: string): Policy | undefined`
  - `POLICY_LINKS: { slug: string; title: string }[]`

- [ ] **Step 1: Write the failing test**

Create `lib/policies.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { POLICIES, POLICY_LINKS, getPolicy } from "./policies";
import { site } from "./site";
import { formatMoney } from "./money";

describe("policies", () => {
  it("has exactly the four expected slugs in order", () => {
    expect(POLICIES.map((p) => p.slug)).toEqual(["shipping", "returns", "privacy", "terms"]);
  });

  it("getPolicy returns the matching policy for each slug", () => {
    for (const slug of ["shipping", "returns", "privacy", "terms"] as const) {
      expect(getPolicy(slug)?.slug).toBe(slug);
    }
  });

  it("getPolicy returns undefined for an unknown slug", () => {
    expect(getPolicy("refunds")).toBeUndefined();
    expect(getPolicy("")).toBeUndefined();
  });

  it("POLICY_LINKS mirrors POLICIES (slug + title)", () => {
    expect(POLICY_LINKS).toEqual(POLICIES.map((p) => ({ slug: p.slug, title: p.title })));
  });

  it("interpolates shipping facts from site.ts (guards against drift)", () => {
    const text = getPolicy("shipping")!.sections.flatMap((s) => s.paragraphs).join(" ");
    expect(text).toContain(formatMoney(site.shipping.flatRateCents)); // $12.00
    expect(text).toContain(formatMoney(site.shipping.freeOverCents)); // $150.00
  });

  it("every policy has a title, an ISO updated date, and at least one section", () => {
    for (const p of POLICIES) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.sections.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- policies`
Expected: FAIL — cannot find module `./policies`.

- [ ] **Step 3: Write the implementation**

Create `lib/policies.ts`:

```ts
import { formatMoney } from "@/lib/money";
import { site } from "@/lib/site";

export type PolicySection = { heading?: string; paragraphs: string[] };

export type Policy = {
  slug: "shipping" | "returns" | "privacy" | "terms";
  title: string;
  updated: string; // ISO date
  sections: PolicySection[];
};

// Facts come from site.ts so the copy never drifts from the store config.
const flat = formatMoney(site.shipping.flatRateCents); // $12.00
const freeOver = formatMoney(site.shipping.freeOverCents); // $150.00
const email = site.email;
const UPDATED = "2026-10-05";

export const POLICIES: Policy[] = [
  {
    slug: "shipping",
    title: "Shipping policy",
    updated: UPDATED,
    sections: [
      {
        heading: "Where we ship",
        paragraphs: [
          "We ship to the United States and Canada. All work is packed and shipped from the US.",
        ],
      },
      {
        heading: "Rates",
        paragraphs: [`Standard shipping is a flat ${flat}. Orders over ${freeOver} ship free.`],
      },
      {
        heading: "Processing time",
        paragraphs: [
          "Orders are prepared and dispatched within 3–5 business days. Prints are made to order; originals are packed with extra care.",
        ],
      },
      {
        heading: "Transit & tracking",
        paragraphs: [
          "Delivery time depends on the carrier and destination. A tracking link is emailed when your order ships.",
        ],
      },
      {
        heading: "Customs & duties",
        paragraphs: [
          "Canadian orders may be subject to import duties or taxes set by your country; these are the recipient's responsibility.",
        ],
      },
      {
        heading: "Problems",
        paragraphs: [
          `If your order is lost or arrives damaged, email ${email} within 14 days of the delivery date and we'll make it right.`,
        ],
      },
    ],
  },
  {
    slug: "returns",
    title: "Returns & refunds",
    updated: UPDATED,
    sections: [
      {
        heading: "Originals",
        paragraphs: [
          "Original works are one of a kind and are final sale — they can't be returned or exchanged. Please reach out with any questions before purchasing.",
        ],
      },
      {
        heading: "Prints",
        paragraphs: [
          `If a print arrives damaged or defective, email ${email} within 14 days of delivery with photos and we'll send a replacement or issue a refund.`,
        ],
      },
      {
        heading: "Change of mind",
        paragraphs: [
          "We don't accept change-of-mind returns on prints; contact us if there's a problem and we'll do our best to help.",
        ],
      },
      {
        heading: "Condition",
        paragraphs: ["Any approved return must be unused and in its original packaging."],
      },
      {
        heading: "Return shipping",
        paragraphs: [
          "We cover return shipping when an item was damaged or defective; otherwise the buyer pays it.",
        ],
      },
      {
        heading: "Refunds",
        paragraphs: [
          "Approved refunds go back to your original payment method through Stripe, usually within 5–10 business days of us receiving or approving the return.",
        ],
      },
    ],
  },
  {
    slug: "privacy",
    title: "Privacy policy",
    updated: UPDATED,
    sections: [
      {
        heading: "What we collect",
        paragraphs: [
          "To fulfil orders we collect your name, email, shipping address and order details. That's it — there are no customer accounts.",
        ],
      },
      {
        heading: "Payments",
        paragraphs: [
          "Payments are processed by Stripe. Card details are entered on Stripe's systems; we never see or store your card number.",
        ],
      },
      {
        heading: "Your cart",
        paragraphs: ["Your cart is stored in your own browser (local storage), not on our servers."],
      },
      {
        heading: "Email",
        paragraphs: [
          "We use your email only to send order and shipping updates. Payment receipts are sent by Stripe.",
        ],
      },
      {
        heading: "No tracking",
        paragraphs: [
          "We don't use third-party advertising or analytics trackers, and we don't sell your data. We share information only with Stripe (to take payment) and the shipping carrier (to deliver your order).",
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "We use only the essential storage needed to run the cart and the admin sign-in.",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [`To ask what we hold about you, or to have it deleted, email ${email}.`],
      },
    ],
  },
  {
    slug: "terms",
    title: "Terms of service",
    updated: UPDATED,
    sections: [
      {
        heading: "These terms",
        paragraphs: [
          "By buying from this store you agree to these terms. We may update them; the “last updated” date shows when.",
        ],
      },
      {
        heading: "Prices & availability",
        paragraphs: [
          "Prices are in US dollars and may change. Availability isn't guaranteed — in particular, original works are one of a kind. If an original sells at the same moment to someone else, we'll cancel the duplicate order and refund it in full.",
        ],
      },
      {
        heading: "Orders",
        paragraphs: [
          "An order is accepted when payment is captured. We may cancel and refund an order if an item turns out to be unavailable or if there's a pricing error.",
        ],
      },
      {
        heading: "Intellectual property",
        paragraphs: [
          `All artwork and images on this site are © ${site.name}. Buying a piece gives you the physical item; it does not transfer copyright or any reproduction rights.`,
        ],
      },
      {
        heading: "Liability",
        paragraphs: [
          "The store and its work are provided as-is to the extent the law allows; we're not liable for indirect or incidental damages.",
        ],
      },
      {
        heading: "Governing law",
        paragraphs: ["These terms are governed by the laws of [your state/country]."],
      },
      {
        heading: "Contact",
        paragraphs: [`Questions: ${email}.`],
      },
    ],
  },
];

export function getPolicy(slug: string): Policy | undefined {
  return POLICIES.find((p) => p.slug === slug);
}

export const POLICY_LINKS = POLICIES.map((p) => ({ slug: p.slug, title: p.title }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- policies`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/policies.ts lib/policies.test.ts
git commit -m "Add policy content module (shipping, returns, privacy, terms)"
```

---

## Task 2: Policy route + stylesheet

**Files:**
- Create: `app/(storefront)/policies/[slug]/page.tsx`
- Create: `app/(storefront)/policies/policies.module.css`

**Interfaces:**
- Consumes: `getPolicy`, `POLICIES` (`@/lib/policies`); `notFound` (`next/navigation`); `Metadata` (`next`).
- Produces: the routes `/policies/shipping`, `/policies/returns`, `/policies/privacy`, `/policies/terms`.

- [ ] **Step 1: Write the stylesheet**

Create `app/(storefront)/policies/policies.module.css`:

```css
.page {
  max-width: 44rem;
}

.title {
  margin: 0 0 0.25rem;
}

.updated {
  margin: 0 0 1.5rem;
  color: var(--muted);
  font-size: 0.875rem;
}

.draftNote {
  margin: 0 0 2rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--muted);
  font-size: 0.875rem;
}

.section {
  margin: 0 0 1.75rem;
}

.sectionHeading {
  margin: 0 0 0.5rem;
  font-size: 1.125rem;
}

.section p {
  margin: 0 0 0.75rem;
}
```

- [ ] **Step 2: Write the route**

Create `app/(storefront)/policies/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { POLICIES, getPolicy } from "@/lib/policies";
import styles from "../policies.module.css";

export function generateStaticParams() {
  return POLICIES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const policy = getPolicy(slug);
  return { title: policy ? policy.title : "Policy" };
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const policy = getPolicy(slug);
  if (!policy) notFound();

  return (
    <div className={`page-width ${styles.page}`}>
      <h1 className={styles.title}>{policy.title}</h1>
      <p className={styles.updated}>Last updated {policy.updated}</p>
      <p className={styles.draftNote}>
        Draft — review before publishing. This is a template, not legal advice.
      </p>
      {policy.sections.map((section, i) => (
        <section key={i} className={styles.section}>
          {section.heading && <h2 className={styles.sectionHeading}>{section.heading}</h2>}
          {section.paragraphs.map((paragraph, j) => (
            <p key={j}>{paragraph}</p>
          ))}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: typecheck clean; build statically generates `/policies/shipping`, `/policies/returns`, `/policies/privacy`, `/policies/terms`.

- [ ] **Step 4: Commit**

```bash
git add "app/(storefront)/policies/[slug]/page.tsx" "app/(storefront)/policies/policies.module.css"
git commit -m "Add /policies/[slug] route for the policy pages"
```

---

## Task 3: Footer "Policies" column

**Files:**
- Modify: `components/Footer.tsx`
- Modify: `components/Footer.module.css`

**Interfaces:**
- Consumes: `POLICY_LINKS` (`@/lib/policies`).

- [ ] **Step 1: Add the Policies column to the footer**

In `components/Footer.tsx`, add the import and a new nav column between the "Shop" nav and the "Questions" column.

Add to the imports at the top:

```tsx
import { POLICY_LINKS } from "@/lib/policies";
```

Insert this block immediately after the closing `</nav>` of the Shop column (before the `<div>` with the "Questions" heading):

```tsx
        <nav aria-label="Policies">
          <h2 className={styles.heading}>Policies</h2>
          <ul className={styles.links}>
            {POLICY_LINKS.map((link) => (
              <li key={link.slug}>
                <Link href={`/policies/${link.slug}`}>{link.title}</Link>
              </li>
            ))}
          </ul>
        </nav>
```

- [ ] **Step 2: Widen the footer grid to fit the fourth column**

In `components/Footer.module.css`, change the grid template (there are now four columns: brand, Shop, Policies, Questions):

```css
@media (min-width: 48rem) {
  .grid {
    grid-template-columns: 2fr 1fr 1fr 1.5fr;
  }
}
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: typecheck clean; build succeeds. The footer renders a Policies column linking the four pages.

- [ ] **Step 4: Commit**

```bash
git add components/Footer.tsx components/Footer.module.css
git commit -m "Add Policies column to the storefront footer"
```

---

## Task 4: Documentation + full verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the policy pages**

In `README.md`, add this bullet to the "Things to know" list:

```markdown
- **Policy pages.** Shipping, returns, privacy and terms live at `/policies/{shipping,returns,privacy,terms}`
  and are linked in the footer. Their text is in `lib/policies.ts` (edit there); shipping facts like the
  rate and free-shipping threshold come from `lib/site.ts`. The copy is a starter template to review before
  publishing — not legal advice.
```

- [ ] **Step 2: Run the full suite**

Run: `npm run test && npm run typecheck && npm run build`
Expected: all tests pass (including `policies`), typecheck clean, build succeeds and generates the four policy routes.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document the storefront policy pages"
```

---

## Self-Review Notes

- **Spec coverage:** content module + tests (Task 1) ← spec §1 and §Testing; the four draft texts (Task 1 data) ← spec §Draft content; dynamic route + draft note + metadata + notFound (Task 2) ← spec §2; footer column (Task 3) ← spec §3; README (Task 4) ← spec §Documentation. The content-ownership caveat is realized as the per-page draft note (Task 2) and the `[your state/country]` placeholder + flagged defaults (Task 1 data, verbatim from the spec).
- **Type consistency:** `Policy`/`PolicySection` defined once in Task 1 and consumed by Task 2; `getPolicy`/`POLICIES`/`POLICY_LINKS` signatures match across tasks; the route's `params: Promise<{ slug: string }>` matches the repo's async-params convention (cf. `app/(storefront)/products/[slug]/page.tsx`); `POLICY_LINKS` shape (`{ slug, title }`) is what the footer maps over.
- **Constraints honored:** no new deps; shipping facts interpolated via `formatMoney(site.shipping.*)` (asserted by a test); four slugs with `notFound()` for the rest; per-page draft note + `Last updated`; route/footer verified by build, only the content module unit-tested.

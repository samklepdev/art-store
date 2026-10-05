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

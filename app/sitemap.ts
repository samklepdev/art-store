import type { MetadataRoute } from "next";
import { POLICIES } from "@/lib/policies";
import { getProducts } from "@/lib/products";
import { baseUrl } from "@/lib/siteUrl";

// Generated per request, not at build: it queries the product DB, which isn't
// reachable from Railway's build environment, and new products should appear
// without a redeploy.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = baseUrl();

  const staticPaths = ["", "/shop", ...POLICIES.map((p) => `/policies/${p.slug}`)];
  const productPaths = (await getProducts()).map((p) => `/products/${p.slug}`);

  return [...staticPaths, ...productPaths].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: "weekly",
  }));
}

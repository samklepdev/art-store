import type { MetadataRoute } from "next";
import { baseUrl } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] },
    sitemap: `${baseUrl()}/sitemap.xml`,
  };
}

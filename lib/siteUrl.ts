/**
 * Absolute site origin for canonical URLs (sitemap, robots). Prefers the
 * explicit NEXT_PUBLIC_SITE_URL (set once a custom domain exists), then the
 * Railway-provided public domain, then localhost for dev. Trailing slashes are
 * stripped so callers can append paths directly.
 */
export function baseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;

  return "http://localhost:3000";
}

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { baseUrl } from "./siteUrl";

const KEYS = ["NEXT_PUBLIC_SITE_URL", "RAILWAY_PUBLIC_DOMAIN"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("baseUrl", () => {
  it("uses NEXT_PUBLIC_SITE_URL when set, stripping trailing slashes", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://shop.example.com/";
    expect(baseUrl()).toBe("https://shop.example.com");
  });

  it("falls back to the Railway public domain over https", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.RAILWAY_PUBLIC_DOMAIN = "art-store-production-0f28.up.railway.app";
    expect(baseUrl()).toBe("https://art-store-production-0f28.up.railway.app");
  });

  it("falls back to localhost when nothing is set", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.RAILWAY_PUBLIC_DOMAIN;
    expect(baseUrl()).toBe("http://localhost:3000");
  });
});

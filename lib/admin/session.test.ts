import { describe, expect, it } from "vitest";
import { SESSION_TTL_MS, signSession, verifySession } from "./session";

const SECRET = "test-secret-value";

describe("session tokens", () => {
  it("verifies a token it just signed", async () => {
    const token = await signSession(Date.now() + SESSION_TTL_MS, SECRET);
    expect(await verifySession(token, SECRET)).toBe(true);
  });

  it("rejects a tampered signature", async () => {
    const token = await signSession(Date.now() + SESSION_TTL_MS, SECRET);
    const [payload, signature] = token.split(".");
    const flipped = signature.startsWith("A") ? `B${signature.slice(1)}` : `A${signature.slice(1)}`;
    expect(await verifySession(`${payload}.${flipped}`, SECRET)).toBe(false);
  });

  it("rejects a tampered expiry", async () => {
    const token = await signSession(Date.now() + 1000, SECRET);
    const [, signature] = token.split(".");
    const farFuture = String(Date.now() + 10_000_000);
    expect(await verifySession(`${farFuture}.${signature}`, SECRET)).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession(Date.now() + SESSION_TTL_MS, "other-secret");
    expect(await verifySession(token, SECRET)).toBe(false);
  });

  it("rejects an expired token", async () => {
    const token = await signSession(Date.now() - 1, SECRET);
    expect(await verifySession(token, SECRET)).toBe(false);
  });

  it("honours an injected clock", async () => {
    const expiresAt = 1_000_000;
    const token = await signSession(expiresAt, SECRET);
    expect(await verifySession(token, SECRET, expiresAt - 1)).toBe(true);
    expect(await verifySession(token, SECRET, expiresAt + 1)).toBe(false);
  });

  it("rejects malformed tokens", async () => {
    for (const bad of ["", ".", "abc", "abc.", ".abc", "not-a-number.aaaa", "5.!!!!"]) {
      expect(await verifySession(bad, SECRET)).toBe(false);
    }
  });
});

import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

const SLUG_CHECK = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("Harbor at Dusk")).toBe("harbor-at-dusk");
  });

  it("collapses punctuation into single hyphens", () => {
    expect(slugify("Streetlamp, 2 a.m.")).toBe("streetlamp-2-a-m");
  });

  it("strips diacritics", () => {
    expect(slugify("Café Noir")).toBe("cafe-noir");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
  });

  it("keeps digits", () => {
    expect(slugify("Study 12 x 16")).toBe("study-12-x-16");
  });

  it("returns empty string when nothing usable remains", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("")).toBe("");
  });

  it("always produces output the database CHECK accepts", () => {
    for (const title of ["Harbor at Dusk", "Café Noir", "Streetlamp, 2 a.m.", "Study 12 x 16"]) {
      expect(slugify(title)).toMatch(SLUG_CHECK);
    }
  });
});

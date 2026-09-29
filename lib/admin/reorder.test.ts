import { describe, expect, it } from "vitest";
import { moveItem } from "./reorder";

const items = [{ id: 10 }, { id: 20 }, { id: 30 }];

describe("moveItem", () => {
  it("moves an item up", () => {
    expect(moveItem(items, 20, "up")).toEqual([
      { id: 20, position: 0 },
      { id: 10, position: 1 },
      { id: 30, position: 2 },
    ]);
  });

  it("moves an item down", () => {
    expect(moveItem(items, 20, "down")).toEqual([
      { id: 10, position: 0 },
      { id: 30, position: 1 },
      { id: 20, position: 2 },
    ]);
  });

  it("returns no changes when the first item moves up", () => {
    expect(moveItem(items, 10, "up")).toEqual([]);
  });

  it("returns no changes when the last item moves down", () => {
    expect(moveItem(items, 30, "down")).toEqual([]);
  });

  it("returns no changes for an unknown id", () => {
    expect(moveItem(items, 99, "up")).toEqual([]);
  });

  it("returns no changes for a single item", () => {
    expect(moveItem([{ id: 1 }], 1, "up")).toEqual([]);
    expect(moveItem([{ id: 1 }], 1, "down")).toEqual([]);
  });

  it("always renumbers contiguously from zero", () => {
    const five = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
    const result = moveItem(five, 4, "up");
    expect(result.map((r) => r.position)).toEqual([0, 1, 2, 3, 4]);
    expect(result.map((r) => r.id)).toEqual([1, 2, 4, 3, 5]);
  });

  it("does not mutate its input", () => {
    const original = [{ id: 1 }, { id: 2 }];
    moveItem(original, 2, "up");
    expect(original).toEqual([{ id: 1 }, { id: 2 }]);
  });
});

/**
 * Swaps one item with its neighbour and renumbers the whole sequence from zero.
 *
 * Kept pure and free of any database import so the ordering logic is testable
 * on its own; `applyImagePositions` writes the result inside one transaction.
 * Returns [] when the move would change nothing.
 */
export function moveItem<T extends { id: number }>(
  items: T[],
  id: number,
  direction: "up" | "down",
): { id: number; position: number }[] {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return [];

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return [];

  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];

  return next.map((item, position) => ({ id: item.id, position }));
}

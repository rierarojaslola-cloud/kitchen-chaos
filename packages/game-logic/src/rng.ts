/** Small deterministic PRNG (mulberry32) so simulations are reproducible in tests. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function weightedPick<T extends { weight: number }>(items: readonly T[], rand: () => number): T | undefined {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return undefined;
  let r = rand() * total;
  for (const i of items) {
    r -= i.weight;
    if (r < 0) return i;
  }
  return items[items.length - 1];
}

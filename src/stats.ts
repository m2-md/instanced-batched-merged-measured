// src/stats.ts — percentiles. The mean lies: a single 40 ms hitch doesn't budge
// the mean but visibly wrecks the game. p95 sees it.
export function percentile(values: ArrayLike<number>, p: number): number {
  const n = values.length;
  if (n === 0) return 0;
  const sorted = Float64Array.from(values).sort();
  const idx = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
  return sorted[idx];
}

export function p50(values: ArrayLike<number>): number {
  return percentile(values, 50);
}

export function p95(values: ArrayLike<number>): number {
  return percentile(values, 95);
}

export function mean(values: ArrayLike<number>): number {
  const n = values.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += values[i];
  return sum / n;
}

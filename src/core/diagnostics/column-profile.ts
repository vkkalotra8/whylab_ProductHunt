/** Shared descriptive statistics. Missing values do not contribute to counts/ranges. */
export const isMissing = (value: string) => !value || /^(null|na|nan|n\/a)$/i.test(value);
const decimal = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

export function summarizeColumn(cells: readonly string[]) {
  const counts = new Map<string, number>();
  let missing = 0;
  let numeric = true;
  let minimum = Infinity;
  let maximum = -Infinity;
  let scale = 0;

  for (const cell of cells) {
    if (isMissing(cell)) {
      missing++;
      continue;
    }
    counts.set(cell, (counts.get(cell) ?? 0) + 1);
    const value = Number(cell);
    if (!decimal.test(cell) || !Number.isFinite(value)) {
      numeric = false;
      continue;
    }
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
    scale = Math.max(scale, Math.abs(value));
  }

  const observed = cells.length - missing;
  numeric = numeric && observed > 0;
  let mean: number | undefined;

  if (numeric) {
    // Scale first to prevent overflow, then compensate summation for cancellation.
    let sum = 0,
      correction = 0;
    for (const cell of cells) {
      if (isMissing(cell)) continue;
      const term = scale === 0 ? 0 : Number(cell) / scale;
      const next = sum + term;
      correction += Math.abs(sum) >= Math.abs(term) ? sum - next + term : term - next + sum;
      sum = next;
    }
    const normalized = Math.max(-1, Math.min(1, (sum + correction) / observed));
    mean = Math.max(minimum, Math.min(maximum, normalized * scale));
  }

  return {
    counts,
    missing,
    observed,
    numeric,
    mean,
    min: numeric ? minimum : undefined,
    max: numeric ? maximum : undefined,
  };
}

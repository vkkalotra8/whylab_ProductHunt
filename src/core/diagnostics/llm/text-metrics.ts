/**
 * Deterministic text matching and token-level NLP metrics.
 * Implements Exact Match (EM), Normalized Exact Match (NEM), and Token F1 (token-level precision, recall, harmonic mean).
 * Strictly labels tasks where reference answers are absent as UNAVAILABLE.
 */

export interface TextMatchRecordResult {
  caseId: string;
  hasReference: boolean;
  exactMatch?: boolean;
  normalizedExactMatch?: boolean;
  tokenPrecision?: number;
  tokenRecall?: number;
  tokenF1?: number;
  status: 'computed' | 'unavailable';
  reason?: string;
}

export interface TextMetricsSummary {
  evaluatedRecordCount: number;
  recordsWithReferenceCount: number;
  coverageRatio: number;
  status: 'computed' | 'unavailable';
  reason?: string;

  // Exact Match
  exactMatchCount: number;
  exactMatchRate: number; // 0.0 - 1.0

  // Normalized Exact Match
  normalizedExactMatchCount: number;
  normalizedExactMatchRate: number; // 0.0 - 1.0

  // Token F1
  meanTokenPrecision: number;
  meanTokenRecall: number;
  meanTokenF1: number;

  perRecordResults: TextMatchRecordResult[];
}

/**
 * Standard text normalization:
 * - Lowercase
 * - Remove punctuation
 * - Collapse whitespace
 * - Trim
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'<>\[\]\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenize string into lowercase alphanumeric word tokens
 */
export function tokenizeText(text: string): string[] {
  const norm = normalizeText(text);
  if (!norm) return [];
  return norm.split(/\s+/).filter(Boolean);
}

/**
 * Computes Exact Match (case-sensitive)
 */
export function computeExactMatch(prediction: string, reference: string): boolean {
  return prediction.trim() === reference.trim();
}

/**
 * Computes Normalized Exact Match (casing, punctuation, and whitespace invariant)
 */
export function computeNormalizedExactMatch(prediction: string, reference: string): boolean {
  return normalizeText(prediction) === normalizeText(reference);
}

/**
 * Token-level precision, recall, and F1 with multiset intersection
 */
export function computeTokenF1(
  prediction: string,
  reference: string
): { precision: number; recall: number; f1: number } {
  const predTokens = tokenizeText(prediction);
  const refTokens = tokenizeText(reference);

  // Both empty -> perfect match
  if (predTokens.length === 0 && refTokens.length === 0) {
    return { precision: 1.0, recall: 1.0, f1: 1.0 };
  }

  // One empty -> zero match
  if (predTokens.length === 0 || refTokens.length === 0) {
    return { precision: 0.0, recall: 0.0, f1: 0.0 };
  }

  // Multiset intersection counting
  const refCounts = new Map<string, number>();
  for (const t of refTokens) {
    refCounts.set(t, (refCounts.get(t) ?? 0) + 1);
  }

  let overlapCount = 0;
  for (const t of predTokens) {
    const count = refCounts.get(t) ?? 0;
    if (count > 0) {
      overlapCount++;
      refCounts.set(t, count - 1);
    }
  }

  const precision = overlapCount / predTokens.length;
  const recall = overlapCount / refTokens.length;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0.0;

  return {
    precision: Number(precision.toFixed(5)),
    recall: Number(recall.toFixed(5)),
    f1: Number(f1.toFixed(5)),
  };
}

/**
 * Evaluates an entire collection of LLM evaluation cases
 */
export function evaluateTextMetrics(
  records: Array<{ caseId: string; response: string; referenceAnswer?: string | null }>
): TextMetricsSummary {
  const perRecordResults: TextMatchRecordResult[] = [];
  let emCount = 0;
  let nemCount = 0;
  let sumPrecision = 0;
  let sumRecall = 0;
  let sumF1 = 0;
  let validRefCount = 0;

  for (const rec of records) {
    const hasRef =
      rec.referenceAnswer !== null &&
      rec.referenceAnswer !== undefined &&
      rec.referenceAnswer.trim() !== '';

    if (!hasRef) {
      perRecordResults.push({
        caseId: rec.caseId,
        hasReference: false,
        status: 'unavailable',
        reason: 'No reference answer provided for this case',
      });
      continue;
    }

    validRefCount++;
    const ref = rec.referenceAnswer as string;
    const isEm = computeExactMatch(rec.response, ref);
    const isNem = computeNormalizedExactMatch(rec.response, ref);
    const { precision, recall, f1 } = computeTokenF1(rec.response, ref);

    if (isEm) emCount++;
    if (isNem) nemCount++;
    sumPrecision += precision;
    sumRecall += recall;
    sumF1 += f1;

    perRecordResults.push({
      caseId: rec.caseId,
      hasReference: true,
      exactMatch: isEm,
      normalizedExactMatch: isNem,
      tokenPrecision: precision,
      tokenRecall: recall,
      tokenF1: f1,
      status: 'computed',
    });
  }

  if (validRefCount === 0) {
    return {
      evaluatedRecordCount: records.length,
      recordsWithReferenceCount: 0,
      coverageRatio: 0,
      status: 'unavailable',
      reason: 'No evaluation cases contain ground-truth reference answers. Exact-match and Token-F1 metrics are unavailable without ground truth.',
      exactMatchCount: 0,
      exactMatchRate: 0,
      normalizedExactMatchCount: 0,
      normalizedExactMatchRate: 0,
      meanTokenPrecision: 0,
      meanTokenRecall: 0,
      meanTokenF1: 0,
      perRecordResults,
    };
  }

  return {
    evaluatedRecordCount: records.length,
    recordsWithReferenceCount: validRefCount,
    coverageRatio: Number((validRefCount / records.length).toFixed(4)),
    status: 'computed',
    exactMatchCount: emCount,
    exactMatchRate: Number((emCount / validRefCount).toFixed(4)),
    normalizedExactMatchCount: nemCount,
    normalizedExactMatchRate: Number((nemCount / validRefCount).toFixed(4)),
    meanTokenPrecision: Number((sumPrecision / validRefCount).toFixed(4)),
    meanTokenRecall: Number((sumRecall / validRefCount).toFixed(4)),
    meanTokenF1: Number((sumF1 / validRefCount).toFixed(4)),
    perRecordResults,
  };
}

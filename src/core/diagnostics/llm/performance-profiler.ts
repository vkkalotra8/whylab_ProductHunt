/**
 * Performance, latency, token usage, and cost profiler for LLM evaluations.
 * Adheres strictly to the requirement that estimated cost is calculated ONLY
 * when pricing assumptions are explicitly supplied by the user.
 */

import type { LlmPricingConfig, LlmCostSummary, LlmTokenUsage } from '../../domain/llm-types.ts';

export interface LatencyHistogramBucket {
  range: string;
  minMs: number;
  maxMs: number;
  count: number;
  percentage: number;
}

export interface LatencyProfile {
  status: 'computed' | 'unavailable';
  reason?: string;
  sampleCount: number;
  minMs?: number;
  maxMs?: number;
  meanMs?: number;
  medianMs?: number; // p50
  p90Ms?: number;
  p95Ms?: number;
  p99Ms?: number;
  buckets: LatencyHistogramBucket[];
}

export interface TokenUsageProfile {
  status: 'computed' | 'unavailable';
  reason?: string;
  sampleCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  meanPromptTokens: number;
  meanCompletionTokens: number;
  meanTotalTokens: number;
}

export interface PerformanceSummary {
  latency: LatencyProfile;
  tokenUsage: TokenUsageProfile;
  cost: LlmCostSummary;
}

/**
 * Computes exact percentiles using standard linear interpolation
 */
export function computePercentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  if (p <= 0) return sortedValues[0];
  if (p >= 100) return sortedValues[sortedValues.length - 1];

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) return sortedValues[lower];
  return Number((sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight).toFixed(2));
}

/**
 * Profiles latency distributions across evaluation records
 */
export function profileLatency(latenciesMs: Array<number | null | undefined>): LatencyProfile {
  const valid = latenciesMs.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
  );

  if (valid.length === 0) {
    return {
      status: 'unavailable',
      reason: 'No latency measurements present in this evaluation dataset.',
      sampleCount: 0,
      buckets: [],
    };
  }

  const sorted = [...valid].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = Number((sum / sorted.length).toFixed(2));

  // Bucketing
  const bucketDefs = [
    { range: '< 250ms', minMs: 0, maxMs: 250 },
    { range: '250ms - 500ms', minMs: 250, maxMs: 500 },
    { range: '500ms - 1s', minMs: 500, maxMs: 1000 },
    { range: '1s - 2.5s', minMs: 1000, maxMs: 2500 },
    { range: '2.5s - 5s', minMs: 2500, maxMs: 5000 },
    { range: '>= 5s', minMs: 5000, maxMs: Infinity },
  ];

  const buckets: LatencyHistogramBucket[] = bucketDefs.map((def) => {
    const count = sorted.filter((v) => v >= def.minMs && v < def.maxMs).length;
    return {
      range: def.range,
      minMs: def.minMs,
      maxMs: def.maxMs,
      count,
      percentage: Number(((count / sorted.length) * 100).toFixed(1)),
    };
  });

  return {
    status: 'computed',
    sampleCount: sorted.length,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    meanMs: mean,
    medianMs: computePercentile(sorted, 50),
    p90Ms: computePercentile(sorted, 90),
    p95Ms: computePercentile(sorted, 95),
    p99Ms: computePercentile(sorted, 99),
    buckets,
  };
}

/**
 * Profiles token consumption across evaluation records
 */
export function profileTokenUsage(usages: Array<LlmTokenUsage | null | undefined>): TokenUsageProfile {
  let promptSum = 0;
  let completionSum = 0;
  let totalSum = 0;
  let validCount = 0;

  for (const u of usages) {
    if (!u) continue;
    const pt = u.promptTokens ?? 0;
    const ct = u.completionTokens ?? 0;
    const tt = u.totalTokens ?? pt + ct;

    if (pt > 0 || ct > 0 || tt > 0) {
      promptSum += pt;
      completionSum += ct;
      totalSum += tt;
      validCount++;
    }
  }

  if (validCount === 0) {
    return {
      status: 'unavailable',
      reason: 'No token usage records present in this evaluation dataset.',
      sampleCount: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      meanPromptTokens: 0,
      meanCompletionTokens: 0,
      meanTotalTokens: 0,
    };
  }

  return {
    status: 'computed',
    sampleCount: validCount,
    totalPromptTokens: promptSum,
    totalCompletionTokens: completionSum,
    totalTokens: totalSum,
    meanPromptTokens: Number((promptSum / validCount).toFixed(1)),
    meanCompletionTokens: Number((completionSum / validCount).toFixed(1)),
    meanTotalTokens: Number((totalSum / validCount).toFixed(1)),
  };
}

/**
 * Computes financial cost strictly and only when pricing configuration is provided
 */
export function estimateCost(
  tokenProfile: TokenUsageProfile,
  pricing?: LlmPricingConfig | null
): LlmCostSummary {
  if (!pricing) {
    return {
      status: 'unconfigured',
      reason: 'No explicit pricing assumptions provided. Financial cost is not estimated without user-supplied token rates.',
    };
  }

  if (tokenProfile.status === 'unavailable' || tokenProfile.sampleCount === 0) {
    return {
      status: 'unconfigured',
      reason: 'Token counts are unavailable in this dataset; cost cannot be computed.',
    };
  }

  const promptRate = pricing.promptCostPerMillion;
  const completionRate = pricing.completionCostPerMillion;

  if (
    typeof promptRate !== 'number' ||
    typeof completionRate !== 'number' ||
    !Number.isFinite(promptRate) ||
    !Number.isFinite(completionRate) ||
    promptRate < 0 ||
    completionRate < 0
  ) {
    return {
      status: 'unconfigured',
      reason: 'Supplied pricing rates must be non-negative finite numbers.',
    };
  }

  const promptCost = (tokenProfile.totalPromptTokens * promptRate) / 1_000_000;
  const completionCost = (tokenProfile.totalCompletionTokens * completionRate) / 1_000_000;
  const totalCost = promptCost + completionCost;

  return {
    status: 'calculated',
    estimatedCostUsd: Number(totalCost.toFixed(6)),
    promptCostUsd: Number(promptCost.toFixed(6)),
    completionCostUsd: Number(completionCost.toFixed(6)),
    pricingUsed: {
      promptCostPerMillion: promptRate,
      completionCostPerMillion: completionRate,
      currency: pricing.currency ?? 'USD',
    },
  };
}

/**
 * Complete performance, latency, and financial evaluation
 */
export function profilePerformance(
  records: Array<{ latencyMs?: number | null; tokenUsage?: LlmTokenUsage | null }>,
  pricing?: LlmPricingConfig | null
): PerformanceSummary {
  const latencies = records.map((r) => r.latencyMs);
  const usages = records.map((r) => r.tokenUsage);

  const latency = profileLatency(latencies);
  const tokenUsage = profileTokenUsage(usages);
  const cost = estimateCost(tokenUsage, pricing);

  return {
    latency,
    tokenUsage,
    cost,
  };
}

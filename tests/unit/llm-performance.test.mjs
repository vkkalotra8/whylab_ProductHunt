import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePercentile,
  profileLatency,
  profileTokenUsage,
  estimateCost,
  profilePerformance,
} from '../../src/core/diagnostics/llm/performance-profiler.ts';

test('performance-profiler: percentiles are mathematically exact', () => {
  const vals = [100, 200, 300, 400, 500];
  assert.equal(computePercentile(vals, 0), 100);
  assert.equal(computePercentile(vals, 50), 300);
  assert.equal(computePercentile(vals, 100), 500);

  // 100 numbers from 1 to 100
  const series = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(computePercentile(series, 50), 50.5);
  assert.equal(computePercentile(series, 90), 90.1);
  assert.equal(computePercentile(series, 95), 95.05);
  assert.equal(computePercentile(series, 99), 99.01);
});

test('performance-profiler: latency profile computes distribution and histogram buckets', () => {
  const latencies = [150, 240, 350, 800, 1500, 3200, 6500];
  const profile = profileLatency(latencies);

  assert.equal(profile.status, 'computed');
  assert.equal(profile.sampleCount, 7);
  assert.equal(profile.minMs, 150);
  assert.equal(profile.maxMs, 6500);
  assert.ok(profile.meanMs && profile.meanMs > 1000);
  assert.ok(profile.medianMs);
  assert.equal(profile.buckets.length, 6);

  // Check <250ms bucket has 2 items (150, 240)
  const b1 = profile.buckets.find((b) => b.range === '< 250ms');
  assert.equal(b1?.count, 2);

  // Check >=5s bucket has 1 item (6500)
  const bLast = profile.buckets.find((b) => b.range === '>= 5s');
  assert.equal(bLast?.count, 1);
});

test('performance-profiler: token usage profile aggregates prompt and completion totals', () => {
  const usages = [
    { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
    { promptTokens: 300, completionTokens: 100, totalTokens: 400 },
  ];

  const profile = profileTokenUsage(usages);
  assert.equal(profile.status, 'computed');
  assert.equal(profile.sampleCount, 3);
  assert.equal(profile.totalPromptTokens, 600);
  assert.equal(profile.totalCompletionTokens, 300);
  assert.equal(profile.totalTokens, 900);
  assert.equal(profile.meanPromptTokens, 200);
  assert.equal(profile.meanCompletionTokens, 100);
  assert.equal(profile.meanTotalTokens, 300);
});

test('performance-profiler: cost is strictly unconfigured when no pricing assumptions provided', () => {
  const tokenProfile = profileTokenUsage([
    { promptTokens: 1_000_000, completionTokens: 500_000, totalTokens: 1_500_000 },
  ]);

  // Without pricing config
  const unconfigured = estimateCost(tokenProfile, null);
  assert.equal(unconfigured.status, 'unconfigured');
  assert.equal(unconfigured.estimatedCostUsd, undefined);
  assert.match(unconfigured.reason ?? '', /No explicit pricing assumptions provided/);
});

test('performance-profiler: cost is accurately calculated when pricing parameters are explicitly supplied', () => {
  const tokenProfile = profileTokenUsage([
    { promptTokens: 1_000_000, completionTokens: 500_000, totalTokens: 1_500_000 },
  ]);

  // Pricing: $2.50 per 1M prompt, $10.00 per 1M completion
  // Prompt cost = (1,000,000 * 2.50) / 1,000,000 = $2.50
  // Completion cost = (500,000 * 10.00) / 1,000,000 = $5.00
  // Total cost = $7.50
  const cost = estimateCost(tokenProfile, {
    promptCostPerMillion: 2.5,
    completionCostPerMillion: 10.0,
    currency: 'USD',
  });

  assert.equal(cost.status, 'calculated');
  assert.equal(cost.promptCostUsd, 2.5);
  assert.equal(cost.completionCostUsd, 5.0);
  assert.equal(cost.estimatedCostUsd, 7.5);
  assert.equal(cost.pricingUsed?.currency, 'USD');
});

test('performance-profiler: full performance summary handles mixed records safely', () => {
  const records = [
    { latencyMs: 250, tokenUsage: { promptTokens: 50, completionTokens: 20 } },
    { latencyMs: null, tokenUsage: null }, // missing fields
    { latencyMs: 500, tokenUsage: { promptTokens: 100, completionTokens: 40 } },
  ];

  const summary = profilePerformance(records, {
    promptCostPerMillion: 1.0,
    completionCostPerMillion: 2.0,
  });

  assert.equal(summary.latency.sampleCount, 2);
  assert.equal(summary.tokenUsage.sampleCount, 2);
  assert.equal(summary.cost.status, 'calculated');
  assert.ok(summary.cost.estimatedCostUsd && summary.cost.estimatedCostUsd > 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingestEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';
import { runProviderBenchmark } from '../../src/server/benchmark/provider-benchmark.ts';
import { GeminiInvestigatorProvider } from '../../src/server/orchestrator/provider-gemini.ts';
import { OfflineInvestigatorProvider } from '../../src/server/orchestrator/provider-offline.ts';
import { createId } from '../../src/core/domain/primitives.ts';

const melanomaCsv = readFileSync(
  join(process.cwd(), 'public', 'fixtures', 'melanoma-synthetic.csv'),
  'utf8'
);

function makeDataset() {
  return ingestEvaluationCsv(melanomaCsv, 'melanoma-synthetic.csv', {
    datasetId: createId('dataset'),
    sourceId: createId('source'),
    labels: { positive: '1', negative: '0' },
  });
}

test('provider-benchmark: evaluates benchmark metrics deterministically on flagship dataset', async () => {
  const dataset = makeDataset();
  const offlineProvider = new OfflineInvestigatorProvider();

  const metrics = await runProviderBenchmark(dataset, offlineProvider, { maxRounds: 6 });

  assert.equal(metrics.providerName, 'offline_deterministic_investigator');
  assert.equal(metrics.model, 'deterministic-flagship');
  assert.equal(metrics.completed, true);
  assert.ok(metrics.durationMs >= 0);
  assert.ok(metrics.toolCallCount >= 1);
  assert.equal(metrics.correctToolSelectionRate, 1.0);
  assert.equal(metrics.validToolArgumentsRate, 1.0);
  assert.equal(metrics.evidenceCitationValidityRate, 1.0);
  assert.equal(metrics.structuredOutputReliabilityRate, 1.0);
  assert.equal(metrics.hasDiagnosis, true);
});

test('provider-benchmark: benchmark runs against Gemini provider with token accounting', async () => {
  const dataset = makeDataset();
  let turn = 0;
  const mockClient = {
    models: {
      generateContent: async () => {
        turn++;
        if (turn === 1) {
          return {
            functionCalls: [
              {
                name: 'profile_dataset',
                args: { datasetId: dataset.metadata.id },
              },
            ],
            usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 20, totalTokenCount: 170 },
          };
        }
        return {
          text: 'Concluded: distribution has severe class imbalance.',
          usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 30, totalTokenCount: 230 },
        };
      },
    },
  };

  const gemini = new GeminiInvestigatorProvider('dummy-key', {
    client: mockClient,
    model: 'gemini-3.8-flash',
  });

  const metrics = await runProviderBenchmark(dataset, gemini, { maxRounds: 4 });

  assert.equal(metrics.providerName, 'gemini_astra_investigator');
  assert.equal(metrics.model, 'gemini-3.8-flash');
  assert.equal(metrics.completed, true);
  assert.equal(metrics.correctToolSelectionRate, 1.0);
  assert.equal(metrics.validToolArgumentsRate, 1.0);
  assert.equal(metrics.tokenUsage.totalTokens, 400); // 170 + 230
});

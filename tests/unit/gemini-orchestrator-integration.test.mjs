import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingestEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';
import { runAutonomousInvestigation } from '../../src/server/orchestrator/investigator.ts';
import { GeminiInvestigatorProvider } from '../../src/server/orchestrator/provider-gemini.ts';
import { OpenAIInvestigatorProvider } from '../../src/server/orchestrator/provider-openai.ts';
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

test('gemini-orchestrator: completes multi-turn investigation and yields compatible NDJSON events with metadata', async () => {
  const dataset = makeDataset();
  let turnIndex = 0;
  const mockClient = {
    models: {
      generateContent: async () => {
        turnIndex++;
        if (turnIndex === 1) {
          // Turn 1: call compute_classification_metrics
          return {
            functionCalls: [
              {
                name: 'compute_classification_metrics',
                args: { datasetId: dataset.metadata.id, positiveLabel: '1' },
              },
            ],
            text: 'Measuring baseline metrics.',
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 },
          };
        } else if (turnIndex === 2) {
          // Turn 2: propose hypothesis
          return {
            text: 'Hypothesis: Extreme minority omission driven by class imbalance at standard cutoff.',
            usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 30, totalTokenCount: 180 },
          };
        } else {
          // Turn 3: conclude
          return {
            text: 'Diagnosis confirmed: recalibrating decision cutoff to 0.19 resolves clinical risk.',
            usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 40, totalTokenCount: 240 },
          };
        }
      },
    },
  };

  const provider = new GeminiInvestigatorProvider('dummy-key', {
    client: mockClient,
    model: 'gemini-3.8-flash',
  });

  const events = [];
  const generator = runAutonomousInvestigation(dataset, {
    provider,
    maxRounds: 5,
  });

  for await (const event of generator) {
    events.push(event);
  }

  // Verify event stream compatibility
  const startedEvent = events.find((e) => e.type === 'started');
  assert.ok(startedEvent);
  assert.equal(startedEvent.provider, 'gemini_astra_investigator');
  assert.equal(startedEvent.model, 'gemini-3.8-flash');

  const toolCallEvent = events.find((e) => e.type === 'tool_call');
  assert.ok(toolCallEvent);
  assert.equal(toolCallEvent.call.tool, 'compute_classification_metrics');

  const hypEvent = events.find((e) => e.type === 'hypothesis_added');
  assert.ok(hypEvent);
  assert.ok(hypEvent.hypothesis.statement.includes('Extreme minority omission'));

  const completedEvent = events.find((e) => e.type === 'completed');
  assert.ok(completedEvent);
  assert.equal(completedEvent.provider, 'gemini_astra_investigator');
  assert.equal(completedEvent.model, 'gemini-3.8-flash');
  assert.ok(completedEvent.usage);
  assert.equal(completedEvent.usage.totalTokens, 540); // 120 + 180 + 240

  assert.equal(completedEvent.investigation.status, 'completed');
  assert.ok(completedEvent.investigation.diagnosis);
});

test('gemini-orchestrator: OpenAI provider regression test passes', async () => {
  // Offline fallback path when OpenAI key is absent
  const dataset = makeDataset();
  const openaiProvider = new OpenAIInvestigatorProvider(undefined, 'gpt-4o');

  const events = [];
  const generator = runAutonomousInvestigation(dataset, {
    provider: openaiProvider,
    maxRounds: 8,
  });

  for await (const event of generator) {
    events.push(event);
  }

  const completed = events.find((e) => e.type === 'completed');
  assert.ok(completed);
  assert.equal(completed.investigation.status, 'completed');
  assert.ok(completed.investigation.diagnosis);
});

test('gemini-orchestrator: Offline deterministic provider regression test passes', async () => {
  const dataset = makeDataset();
  const offlineProvider = new OfflineInvestigatorProvider();

  const events = [];
  const generator = runAutonomousInvestigation(dataset, {
    provider: offlineProvider,
    maxRounds: 8,
  });

  for await (const event of generator) {
    events.push(event);
  }

  const completed = events.find((e) => e.type === 'completed');
  assert.ok(completed);
  assert.equal(completed.investigation.status, 'completed');
  assert.equal(completed.investigation.repairs.length, 1);
  assert.equal(completed.investigation.comparisons.length, 1);
});

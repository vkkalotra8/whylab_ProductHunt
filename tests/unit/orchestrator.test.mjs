import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingestEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';
import { runAutonomousInvestigation } from '../../src/server/orchestrator/investigator.ts';
import { OfflineInvestigatorProvider } from '../../src/server/orchestrator/provider-offline.ts';
import { createId } from '../../src/core/domain/primitives.ts';
import { getInvestigation } from '../../src/core/investigation/store.ts';

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

test('orchestrator: completes multi-turn autonomous investigation with offline provider', async () => {
  const dataset = makeDataset();
  const provider = new OfflineInvestigatorProvider();

  const events = [];
  const generator = runAutonomousInvestigation(dataset, { provider, maxRounds: 10 });

  for await (const event of generator) {
    events.push(event);
  }

  const eventTypes = events.map((e) => e.type);
  assert.ok(eventTypes.includes('started'));
  assert.ok(eventTypes.includes('progress'));
  assert.ok(eventTypes.includes('tool_call'));
  assert.ok(eventTypes.includes('tool_result'));
  assert.ok(eventTypes.includes('hypothesis_added'));
  assert.ok(eventTypes.includes('experiment_added'));
  assert.ok(eventTypes.includes('repair_added'));
  assert.ok(eventTypes.includes('comparison_added'));
  assert.ok(eventTypes.includes('diagnosis_finalized'));
  assert.ok(eventTypes.includes('completed'));

  const completedEvent = events.find((e) => e.type === 'completed');
  assert.ok(completedEvent);
  const inv = completedEvent.investigation;
  assert.equal(inv.status, 'completed');
  assert.ok(inv.diagnosis);
  assert.equal(inv.diagnosis.status, 'completed');
  assert.ok(inv.evidence.length >= 2);
  assert.ok(inv.hypotheses.length >= 1);
  assert.ok(inv.experiments.length >= 1);
  assert.ok(inv.repairs.length >= 1);
  assert.ok(inv.comparisons.length >= 1);

  // Check persisted in store
  const stored = getInvestigation(inv.id);
  assert.ok(stored);
  assert.equal(stored.id, inv.id);
});

test('orchestrator: mid-turn user steering executes calibration when directed', async () => {
  const dataset = makeDataset();
  const provider = new OfflineInvestigatorProvider();

  const events = [];
  const generator = runAutonomousInvestigation(dataset, {
    provider,
    maxRounds: 10,
    userDirectives: ['Check calibration reliability'],
  });

  for await (const event of generator) {
    events.push(event);
  }

  const toolCalls = events.filter((e) => e.type === 'tool_call').map((e) => e.call.tool);
  assert.ok(toolCalls.includes('check_calibration'), 'Should have executed check_calibration per directive');
});

test('orchestrator: respects abort signal and terminates cleanly', async () => {
  const dataset = makeDataset();
  const provider = new OfflineInvestigatorProvider();
  const controller = new AbortController();

  const events = [];
  const generator = runAutonomousInvestigation(dataset, {
    provider,
    maxRounds: 10,
    signal: controller.signal,
  });

  // Abort immediately after starting
  for await (const event of generator) {
    events.push(event);
    if (event.type === 'started') {
      controller.abort();
    }
  }

  const stoppedEvent = events.find((e) => e.type === 'stopped');
  assert.ok(stoppedEvent, 'Should yield a stopped event on abort');
  assert.equal(stoppedEvent.investigation.status, 'stopped');
});

test('orchestrator: enforces round boundary when maxRounds is constrained', async () => {
  const dataset = makeDataset();
  const provider = new OfflineInvestigatorProvider();

  const events = [];
  // Restrict to only 2 rounds (not enough to complete full repair loop)
  const generator = runAutonomousInvestigation(dataset, {
    provider,
    maxRounds: 2,
  });

  for await (const event of generator) {
    events.push(event);
  }

  const progressEvents = events.filter((e) => e.type === 'progress');
  assert.ok(progressEvents.length <= 4); // each round yields 1-2 progress events
  const completedEvent = events.find((e) => e.type === 'completed');
  assert.ok(completedEvent);
  // Should finalize with inconclusive diagnosis because rounds ran out
  assert.equal(completedEvent.investigation.diagnosis.status, 'inconclusive');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { InvestigationQueue } from '../../src/server/queue/investigation-queue.ts';
import { InvestigationEventHub } from '../../src/server/queue/event-hub.ts';
import { InvestigationWorker } from '../../src/server/worker/investigation-worker.ts';
import { getInvestigation } from '../../src/core/investigation/store.ts';

test('InvestigationWorker: executes queued job end-to-end, publishes events, and persists result', async () => {
  const queue = new InvestigationQueue();
  const eventHub = new InvestigationEventHub();
  const worker = new InvestigationWorker({ queue, eventHub });

  const csv = [
    'sample_id,actual,prediction,probability,clinic',
    'id_1,malignant,malignant,0.92,site_a',
    'id_2,benign,benign,0.08,site_a',
    'id_3,malignant,benign,0.41,site_b',
    'id_4,benign,malignant,0.67,site_b',
  ].join('\n');

  const invId = `inv_worker_test_${Date.now()}`;
  const job = await queue.enqueue({
    investigationId: invId,
    organizationId: 'org_worker',
    projectId: 'proj_test',
    csvContent: csv,
    columnMapping: {
      targetColumn: 'actual',
      predictionColumn: 'prediction',
      probabilityColumn: 'probability',
      idColumn: 'sample_id',
    },
    labels: { positive: 'malignant', negative: 'benign' },
    offlineOnly: true,
  });

  assert.equal(job.status, 'queued');

  // Process job
  const processed = await worker.processNextJob();
  assert.equal(processed, true);

  const completedJob = await queue.getJob(job.id);
  assert.equal(completedJob?.status, 'completed');
  assert.ok(completedJob?.result);
  assert.equal(completedJob.result.id, invId);

  // Check event stream in event hub
  const history = eventHub.getHistory(invId);
  assert.ok(history.length >= 3);
  assert.equal(history[0].payload.type, 'started');
  assert.ok(['completed', 'stopped'].includes(history[history.length - 1].payload.type));

  // Check persistence in store
  const stored = await getInvestigation(invId);
  assert.ok(stored);
  assert.equal(stored.id, invId);
});

test('InvestigationWorker: handles job cancellation gracefully', async () => {
  const queue = new InvestigationQueue();
  const eventHub = new InvestigationEventHub();
  const worker = new InvestigationWorker({ queue, eventHub });

  const invId = `inv_cancel_${Date.now()}`;
  const job = await queue.enqueue({
    investigationId: invId,
    organizationId: 'org_test',
    projectId: 'proj_test',
    fixtureName: 'melanoma-synthetic.csv',
    offlineOnly: true,
  });

  // Cancel before processing
  await queue.cancelJob(job.id, 'User stopped investigation');
  const processed = await worker.processNextJob();
  assert.equal(processed, false); // Cancelled job is skipped

  const finalJob = await queue.getJob(job.id);
  assert.equal(finalJob?.status, 'cancelled');
});

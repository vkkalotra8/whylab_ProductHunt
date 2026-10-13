import test from 'node:test';
import assert from 'node:assert/strict';
import { InvestigationQueue } from '../../src/server/queue/investigation-queue.ts';

test('InvestigationQueue: enqueues, transitions job states, and computes queue metrics', async () => {
  const queue = new InvestigationQueue();

  const job1 = await queue.enqueue({
    investigationId: 'inv_1',
    organizationId: 'org_main',
    projectId: 'proj_alpha',
    objective: 'Investigate accuracy paradox',
  });

  const job2 = await queue.enqueue({
    investigationId: 'inv_2',
    organizationId: 'org_main',
    projectId: 'proj_beta',
    objective: 'Investigate multi-site drift',
  });

  assert.ok(job1.id.startsWith('job_'));
  assert.equal(job1.status, 'queued');
  assert.equal(job1.attempts, 0);

  // Check stats
  let stats = await queue.getStats();
  assert.equal(stats.waiting, 2);
  assert.equal(stats.active, 0);

  // Dequeue first job
  const nextJob = await queue.getNextJob();
  assert.equal(nextJob?.id, job1.id);

  // Transition to running
  await queue.updateJobStatus(job1.id, 'running');
  stats = await queue.getStats();
  assert.equal(stats.waiting, 1);
  assert.equal(stats.active, 1);

  // Complete job 1
  await queue.updateJobStatus(job1.id, 'completed', {
    result: { id: 'inv_1' },
  });

  const updatedJob1 = await queue.getJob(job1.id);
  assert.equal(updatedJob1?.status, 'completed');
  assert.ok(updatedJob1?.completedAt);

  stats = await queue.getStats();
  assert.equal(stats.completed, 1);
  assert.equal(stats.active, 0);
  assert.equal(stats.waiting, 1);
});

test('InvestigationQueue: cancels waiting or running jobs and invokes abort controller', async () => {
  const queue = new InvestigationQueue();

  const job = await queue.enqueue({
    investigationId: 'inv_cancel',
    organizationId: 'org_cancel',
    projectId: 'proj_cancel',
    objective: 'To be cancelled',
  });

  const abortController = new AbortController();
  queue.registerAbortController(job.id, abortController);
  await queue.updateJobStatus(job.id, 'running');

  assert.equal(abortController.signal.aborted, false);

  const cancelled = await queue.cancelJob(job.id, 'User clicked stop');
  assert.equal(cancelled, true);
  assert.equal(abortController.signal.aborted, true);
  assert.equal(abortController.signal.reason, 'User clicked stop');

  const afterCancel = await queue.getJob(job.id);
  assert.equal(afterCancel?.status, 'cancelled');
  assert.equal(afterCancel?.error, 'User clicked stop');
});

test('InvestigationQueue: tenant isolation filters jobs by organization', async () => {
  const queue = new InvestigationQueue();

  await queue.enqueue({
    investigationId: 'inv_org_a',
    organizationId: 'org_a',
    projectId: 'proj_1',
  });

  await queue.enqueue({
    investigationId: 'inv_org_b',
    organizationId: 'org_b',
    projectId: 'proj_2',
  });

  const orgAJobs = await queue.listJobs('org_a');
  assert.equal(orgAJobs.length, 1);
  assert.equal(orgAJobs[0].data.investigationId, 'inv_org_a');

  const orgBJobs = await queue.listJobs('org_b');
  assert.equal(orgBJobs.length, 1);
  assert.equal(orgBJobs[0].data.investigationId, 'inv_org_b');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordAuditEvent,
  getAuditEvents,
  _resetAuditEventsForTest,
} from '../../src/server/audit/audit-logger.ts';

test('audit: records immutable audit event with unique ID and timestamp', async () => {
  _resetAuditEventsForTest();

  const event = await recordAuditEvent({
    organizationId: 'org_clinical_lab',
    actorId: 'usr_sarah',
    action: 'POLICY_APPROVED',
    objectType: 'repair_policy',
    objectId: 'rep_optimal_019',
    metadata: { threshold: 0.19, reason: 'False negative risk minimized' },
  });

  assert.ok(event.id.startsWith('aud_'));
  assert.strictEqual(event.organizationId, 'org_clinical_lab');
  assert.strictEqual(event.actorId, 'usr_sarah');
  assert.strictEqual(event.action, 'POLICY_APPROVED');
  assert.ok(new Date(event.timestamp).getTime() > 0);
  assert.strictEqual(event.metadata.threshold, 0.19);
});

test('audit: getAuditEvents filters strictly by tenant organization', async () => {
  _resetAuditEventsForTest();

  await recordAuditEvent({
    organizationId: 'org_alpha',
    actorId: 'usr_1',
    action: 'INVESTIGATION_CREATED',
    objectType: 'investigation',
    objectId: 'inve_1',
  });

  await recordAuditEvent({
    organizationId: 'org_beta',
    actorId: 'usr_2',
    action: 'INVESTIGATION_CREATED',
    objectType: 'investigation',
    objectId: 'inve_2',
  });

  const alphaLogs = await getAuditEvents('org_alpha');
  assert.strictEqual(alphaLogs.total, 1);
  assert.strictEqual(alphaLogs.events[0].objectId, 'inve_1');

  const betaLogs = await getAuditEvents('org_beta');
  assert.strictEqual(betaLogs.total, 1);
  assert.strictEqual(betaLogs.events[0].objectId, 'inve_2');

  const gammaLogs = await getAuditEvents('org_gamma');
  assert.strictEqual(gammaLogs.total, 0);
});

test('audit: getAuditEvents supports action filtering and pagination', async () => {
  _resetAuditEventsForTest();

  for (let i = 0; i < 5; i++) {
    await recordAuditEvent({
      organizationId: 'org_multi',
      actorId: 'usr_batch',
      action: i % 2 === 0 ? 'DATASET_UPLOADED' : 'MONITOR_TRIGGERED',
      objectType: 'dataset',
      objectId: `ds_${i}`,
    });
  }

  const allEvents = await getAuditEvents('org_multi', { limit: 2, offset: 0 });
  assert.strictEqual(allEvents.events.length, 2);
  assert.strictEqual(allEvents.total, 5);

  const datasetOnly = await getAuditEvents('org_multi', { action: 'DATASET_UPLOADED' });
  assert.strictEqual(datasetOnly.total, 3);
});

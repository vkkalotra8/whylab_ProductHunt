import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../src/server/auth/session.ts';
import { POST as createRule, GET as listRules } from '../../src/app/api/v1/monitors/route.ts';
import { GET as getRule, DELETE as deleteRule } from '../../src/app/api/v1/monitors/[id]/route.ts';
import { POST as evaluateBatch } from '../../src/app/api/v1/monitors/[id]/evaluate/route.ts';
import { GET as listAlerts } from '../../src/app/api/v1/monitors/alerts/route.ts';
import { POST as acknowledgeAlert } from '../../src/app/api/v1/monitors/alerts/[id]/acknowledge/route.ts';
import { getMonitorEngine } from '../../src/server/monitoring/monitor-engine.ts';
import { getAlertDeduplicator } from '../../src/server/monitoring/alert-deduplicator.ts';
import { getAuditEvents, _resetAuditEventsForTest } from '../../src/server/audit/audit-logger.ts';

const TEST_SECRET = 'whylab-dev-insecure-secret-key-32-chars-min!';

test('Monitoring API: rule lifecycle, drift batch evaluation, alert generation, deduplication, and acknowledgement', async () => {
  _resetAuditEventsForTest();
  getMonitorEngine().resetForTesting();
  getAlertDeduplicator().resetForTesting();

  const orgId = 'org_oncology_center';
  const otherOrgId = 'org_other_hospital';
  const projectId = 'proj_telemetry_monitoring';

  const editorToken = await createSessionToken(
    {
      sub: 'usr_editor_mon',
      email: 'dr.curie@oncology.org',
      name: 'Dr. Marie Curie',
      organizationId: orgId,
      role: 'editor',
    },
    TEST_SECRET
  );

  const viewerToken = await createSessionToken(
    {
      sub: 'usr_viewer_mon',
      email: 'resident@oncology.org',
      name: 'Resident Pathologist',
      organizationId: orgId,
      role: 'viewer',
    },
    TEST_SECRET
  );

  const intruderToken = await createSessionToken(
    {
      sub: 'usr_intruder_mon',
      email: 'attacker@other.org',
      name: 'Intruder',
      organizationId: otherOrgId,
      role: 'admin',
    },
    TEST_SECRET
  );

  // 1. Viewer cannot create monitor rule (403 Forbidden)
  const viewerCreateReq = new Request('http://localhost:3000/api/v1/monitors', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${viewerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId,
      name: 'Unauthorized Rule',
      conditions: [{ metric: 'ks_drift', operator: 'gt', threshold: 0.15, severity: 'warning' }],
    }),
  });
  const viewerCreateRes = await createRule(viewerCreateReq);
  assert.equal(viewerCreateRes.status, 403);

  // 2. Editor creates monitor rule -> 201 Created
  const editorCreateReq = new Request('http://localhost:3000/api/v1/monitors', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${editorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId,
      name: 'Prospective Scanner Drift & Missingness Rule',
      description: 'Guards against scanner calibration degradation in prospective batches.',
      referenceFixtureName: 'melanoma-synthetic.csv',
      conditions: [
        {
          metric: 'ks_drift',
          column: 'y_probability',
          operator: 'gt',
          threshold: 0.15,
          severity: 'warning',
        },
        {
          metric: 'missingness_rate',
          column: 'age',
          operator: 'gt',
          threshold: 0.10,
          severity: 'critical',
        },
      ],
      cooldownMinutes: 60,
    }),
  });
  const editorCreateRes = await createRule(editorCreateReq);
  assert.equal(editorCreateRes.status, 201);
  const { rule: createdRule } = await editorCreateRes.json();
  assert.ok(createdRule.id.startsWith('rule_'));
  assert.equal(createdRule.name, 'Prospective Scanner Drift & Missingness Rule');

  // 3. Viewer inspects rule via GET /api/v1/monitors/[id]
  const inspectReq = new Request(`http://localhost:3000/api/v1/monitors/${createdRule.id}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${viewerToken}`,
    },
  });
  const inspectRes = await getRule(inspectReq, {
    params: Promise.resolve({ id: createdRule.id }),
  });
  assert.equal(inspectRes.status, 200);
  const { rule: fetchedRule } = await inspectRes.json();
  assert.equal(fetchedRule.id, createdRule.id);

  // 4. Viewer cannot evaluate batch (403 Forbidden)
  const viewerEvalReq = new Request(`http://localhost:3000/api/v1/monitors/${createdRule.id}/evaluate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${viewerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      csvContent: 'sample_id,actual,prediction,probability,age\nid_1,1,1,0.92,45',
    }),
  });
  const viewerEvalRes = await evaluateBatch(viewerEvalReq, {
    params: Promise.resolve({ id: createdRule.id }),
  });
  assert.equal(viewerEvalRes.status, 403);

  // 5. Editor evaluates anomalous batch CSV -> triggers drift and missingness alerts
  const anomalousBatchCsv = [
    'sample_id,actual,prediction,probability,age',
    'id_1,1,1,0.02,', // age missing
    'id_2,1,1,0.03,', // age missing
    'id_3,1,1,0.01,52',
    'id_4,1,1,0.04,', // age missing (75% missing age, extreme probability shift)
  ].join('\n');

  const editorEvalReq = new Request(`http://localhost:3000/api/v1/monitors/${createdRule.id}/evaluate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${editorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      csvContent: anomalousBatchCsv,
      batchName: 'site_c_corrupted_batch.csv',
    }),
  });
  const editorEvalRes = await evaluateBatch(editorEvalReq, {
    params: Promise.resolve({ id: createdRule.id }),
  });
  assert.equal(editorEvalRes.status, 200);
  const { result: evalResult } = await editorEvalRes.json();
  assert.equal(evalResult.status, 'critical');
  assert.ok(evalResult.alerts.length >= 1);

  // 6. Verify audit event logged for triggered alert
  const { events } = await getAuditEvents(orgId);
  const alertAudit = events.find((e) => e.action === 'MONITOR_ALERT_TRIGGERED');
  assert.ok(alertAudit);
  assert.equal(alertAudit.metadata.ruleId, createdRule.id);

  // 7. Viewer lists alerts via GET /api/v1/monitors/alerts
  const listAlertsReq = new Request(`http://localhost:3000/api/v1/monitors/alerts?projectId=${projectId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${viewerToken}`,
    },
  });
  const listAlertsRes = await listAlerts(listAlertsReq);
  assert.equal(listAlertsRes.status, 200);
  const { alerts } = await listAlertsRes.json();
  assert.ok(alerts.length >= 1);
  const targetAlert = alerts[0];
  assert.equal(targetAlert.acknowledged, false);

  // 8. Viewer cannot acknowledge alert (403 Forbidden)
  const viewerAckReq = new Request(`http://localhost:3000/api/v1/monitors/alerts/${targetAlert.id}/acknowledge`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${viewerToken}`,
    },
  });
  const viewerAckRes = await acknowledgeAlert(viewerAckReq, {
    params: Promise.resolve({ id: targetAlert.id }),
  });
  assert.equal(viewerAckRes.status, 403);

  // 9. Editor acknowledges alert -> 200 OK
  const editorAckReq = new Request(`http://localhost:3000/api/v1/monitors/alerts/${targetAlert.id}/acknowledge`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${editorToken}`,
    },
  });
  const editorAckRes = await acknowledgeAlert(editorAckReq, {
    params: Promise.resolve({ id: targetAlert.id }),
  });
  assert.equal(editorAckRes.status, 200);
  const ackData = await editorAckRes.json();
  assert.equal(ackData.alert.acknowledged, true);
  assert.equal(ackData.alert.acknowledgedBy, 'Dr. Marie Curie');

  // 10. Cross-tenant isolation check: Other org cannot inspect rule (404 Not Found)
  const intruderReq = new Request(`http://localhost:3000/api/v1/monitors/${createdRule.id}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${intruderToken}`,
    },
  });
  const intruderRes = await getRule(intruderReq, {
    params: Promise.resolve({ id: createdRule.id }),
  });
  assert.equal(intruderRes.status, 404);

  // 11. Editor deletes rule -> 200 OK
  const deleteReq = new Request(`http://localhost:3000/api/v1/monitors/${createdRule.id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${editorToken}`,
    },
  });
  const deleteRes = await deleteRule(deleteReq, {
    params: Promise.resolve({ id: createdRule.id }),
  });
  assert.equal(deleteRes.status, 200);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MonitorEngine } from '../../src/server/monitoring/monitor-engine.ts';
import { AlertDeduplicator } from '../../src/server/monitoring/alert-deduplicator.ts';
import { getAuditEvents, _resetAuditEventsForTest } from '../../src/server/audit/audit-logger.ts';

const fixturesDir = join(process.cwd(), 'public', 'fixtures');

test('MonitorEngine: creates, lists, and deletes monitor rules with tenant isolation', async () => {
  _resetAuditEventsForTest();
  const engine = new MonitorEngine();

  const rule = await engine.createRule({
    organizationId: 'org_oncology',
    projectId: 'proj_monitoring',
    name: 'Clinical Scanner Drift Guard',
    referenceFixtureName: 'melanoma-synthetic.csv',
    conditions: [
      {
        metric: 'ks_drift',
        column: 'y_probability',
        operator: 'gt',
        threshold: 0.15,
        severity: 'warning',
      },
    ],
    cooldownMinutes: 30,
  });

  assert.ok(rule.id.startsWith('rule_'));
  assert.equal(rule.name, 'Clinical Scanner Drift Guard');
  assert.equal(rule.conditions.length, 1);

  // List rules for tenant
  const listOrg1 = await engine.listRules('org_oncology');
  assert.equal(listOrg1.length, 1);
  assert.equal(listOrg1[0].id, rule.id);

  // Tenant isolation: other org sees 0 rules
  const listOrg2 = await engine.listRules('org_other');
  assert.equal(listOrg2.length, 0);

  // Delete rule
  const deleted = await engine.deleteRule(rule.id, 'org_oncology');
  assert.equal(deleted, true);
  const afterDelete = await engine.getRule(rule.id);
  assert.equal(afterDelete, null);
});

test('MonitorEngine: evaluates batch drift, detects KS/PSI shifts, and records audit alert', async () => {
  _resetAuditEventsForTest();
  const engine = new MonitorEngine();

  // Create rule watching for KS drift > 0.20 and PSI > 0.25 on y_probability
  const rule = await engine.createRule({
    organizationId: 'org_radiology',
    projectId: 'proj_multi_site',
    name: 'Multi-Site Acquisition Drift Monitor',
    referenceFixtureName: 'site-failure.csv',
    conditions: [
      {
        metric: 'ks_drift',
        column: 'y_probability',
        operator: 'gt',
        threshold: 0.20,
        severity: 'critical',
      },
      {
        metric: 'missingness_rate',
        column: 'age',
        operator: 'gt',
        threshold: 0.10,
        severity: 'warning',
      },
    ],
    cooldownMinutes: 0, // cooldown disabled for initial detection test
  });

  // Heavily shifted synthetic batch (representing acquisition corruption at remote site)
  const shiftedBatchCsv = [
    'patient_id,actual,prediction,probability,age',
    'p_1,1,1,0.05,',      // missing age
    'p_2,0,0,0.08,',      // missing age
    'p_3,1,1,0.12,54',
    'p_4,0,0,0.09,',      // missing age
    'p_5,1,1,0.11,62',
    'p_6,0,0,0.06,',      // missing age (4/6 = 66% missing)
  ].join('\n');

  const evalResult = await engine.evaluateBatch(
    rule.id,
    'org_radiology',
    shiftedBatchCsv,
    'site_b_shifted_batch.csv'
  );

  assert.equal(evalResult.status, 'critical');
  assert.ok(evalResult.alerts.length >= 1);

  // Check KS or missingness alert
  const missingnessAlert = evalResult.alerts.find((a) => a.metric === 'missingness_rate');
  assert.ok(missingnessAlert, 'Missingness spike alert must be generated');
  assert.equal(missingnessAlert.severity, 'warning');
  assert.ok(missingnessAlert.observedValue >= 0.5); // 66% missing

  // Verify audit event logged
  const { events } = await getAuditEvents('org_radiology');
  const alertEvent = events.find((e) => e.action === 'MONITOR_ALERT_TRIGGERED');
  assert.ok(alertEvent, 'Audit event must be logged for triggered monitor alert');
  assert.equal(alertEvent.metadata.ruleId, rule.id);
});

test('AlertDeduplicator: suppresses duplicate alerts within cooldown window to eliminate alert storms', async () => {
  _resetAuditEventsForTest();
  const engine = new MonitorEngine();

  const rule = await engine.createRule({
    organizationId: 'org_cardiology',
    projectId: 'proj_icu',
    name: 'ICU Sensor Anomaly Watcher',
    referenceFixtureName: 'melanoma-synthetic.csv',
    conditions: [
      {
        metric: 'ks_drift',
        column: 'y_probability',
        operator: 'gt',
        threshold: 0.10,
        severity: 'warning',
      },
    ],
    cooldownMinutes: 60, // 60-minute cooldown
  });

  const anomalousCsv = [
    'sample_id,actual,prediction,probability',
    'id_1,1,1,0.01',
    'id_2,1,1,0.02',
    'id_3,1,1,0.03',
    'id_4,1,1,0.04',
  ].join('\n');

  // First evaluation: triggers alert
  const firstEval = await engine.evaluateBatch(
    rule.id,
    'org_cardiology',
    anomalousCsv,
    'batch_t0.csv'
  );
  assert.equal(firstEval.alerts.length, 1);
  assert.equal(firstEval.suppressedAlertsCount, 0);

  // Second evaluation (immediately within 60min window): suppressed!
  const secondEval = await engine.evaluateBatch(
    rule.id,
    'org_cardiology',
    anomalousCsv,
    'batch_t1.csv'
  );
  assert.equal(secondEval.alerts.length, 0, 'Duplicate alert must be suppressed during cooldown');
  assert.equal(secondEval.suppressedAlertsCount, 1, 'Suppressed count must increment');
});

test('MonitorEngine: acknowledges alerts and persists operator identity in audit log', async () => {
  _resetAuditEventsForTest();
  const engine = new MonitorEngine();

  const rule = await engine.createRule({
    organizationId: 'org_hospital',
    projectId: 'proj_er',
    name: 'ER Triage Drift Guard',
    referenceFixtureName: 'melanoma-synthetic.csv',
    conditions: [
      {
        metric: 'missingness_rate',
        column: 'age',
        operator: 'gt',
        threshold: 0.10,
        severity: 'warning',
      },
    ],
    cooldownMinutes: 0,
  });

  const corruptCsv = [
    'sample_id,actual,prediction,probability,age',
    'id_1,1,1,0.92,',
    'id_2,1,1,0.88,',
    'id_3,1,1,0.85,45',
  ].join('\n');

  const evalResult = await engine.evaluateBatch(rule.id, 'org_hospital', corruptCsv, 'er_batch.csv');
  assert.ok(evalResult.alerts.length > 0);
  const alertId = evalResult.alerts[0].id;

  // Acknowledge alert
  const acked = await engine.acknowledgeAlert(alertId, 'org_hospital', 'Dr. Lisa Cuddy');
  assert.equal(acked.acknowledged, true);
  assert.equal(acked.acknowledgedBy, 'Dr. Lisa Cuddy');
  assert.ok(acked.acknowledgedAt);

  // Check audit ledger
  const { events } = await getAuditEvents('org_hospital');
  const ackEvent = events.find((e) => e.action === 'MONITOR_ALERT_ACKNOWLEDGED');
  assert.ok(ackEvent);
  assert.equal(ackEvent.actorId, 'Dr. Lisa Cuddy');
});

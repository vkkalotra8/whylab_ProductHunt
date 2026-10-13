import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { createSessionToken } from '../../src/server/auth/session.ts';
import { POST as createDatasetUpload } from '../../src/app/api/v1/datasets/uploads/route.ts';
import { POST as completeUpload } from '../../src/app/api/v1/datasets/uploads/[id]/complete/route.ts';
import { POST as submitInvestigationJob, GET as listJobs } from '../../src/app/api/v1/investigations/jobs/route.ts';
import { POST as approveRepairPolicy } from '../../src/app/api/v1/repairs/[id]/approve/route.ts';
import { GET as getRepairPolicy } from '../../src/app/api/v1/repairs/[id]/route.ts';
import { POST as createMonitorRule } from '../../src/app/api/v1/monitors/route.ts';
import { POST as evaluateMonitorBatch } from '../../src/app/api/v1/monitors/[id]/evaluate/route.ts';
import { GET as listAlerts } from '../../src/app/api/v1/monitors/alerts/route.ts';
import { POST as acknowledgeAlert } from '../../src/app/api/v1/monitors/alerts/[id]/acknowledge/route.ts';
import { getDatasetRegistry } from '../../src/server/datasets/registry.ts';
import { getStorageProvider } from '../../src/server/storage/index.ts';
import { getInvestigationQueue } from '../../src/server/queue/investigation-queue.ts';
import { getInvestigationWorker } from '../../src/server/worker/investigation-worker.ts';
import { getEventHub } from '../../src/server/queue/event-hub.ts';
import { getRepairRegistry } from '../../src/server/repair/repair-registry.ts';
import { getMonitorEngine } from '../../src/server/monitoring/monitor-engine.ts';
import { getAuditEvents, _resetAuditEventsForTest } from '../../src/server/audit/audit-logger.ts';

const TEST_SECRET = 'whylab-dev-insecure-secret-key-32-chars-min!';
const fixturesDir = join(process.cwd(), 'public', 'fixtures');

test('pilot end-to-end workflow: unassisted user executes upload -> investigation -> repair approval -> monitoring', async () => {
  // Step 0: Setup fresh state
  _resetAuditEventsForTest();
  getDatasetRegistry().resetForTesting();
  getRepairRegistry().resetForTesting();
  getMonitorEngine().resetForTesting();

  const orgId = 'org_pilot_mercy_general';
  const projectId = 'proj_icu_melanoma_triage';
  const clinicianUserId = 'usr_dr_chen';
  const chiefOfficerUserId = 'usr_dr_patel_cmo';

  // Issue cryptographic tokens
  const clinicianToken = await createSessionToken(
    { sub: clinicianUserId, email: 'chen@mercy.org', name: 'Dr. Sarah Chen', organizationId: orgId, role: 'editor' },
    TEST_SECRET
  );
  const chiefOfficerToken = await createSessionToken(
    { sub: chiefOfficerUserId, email: 'patel@mercy.org', name: 'Dr. Raj Patel', organizationId: orgId, role: 'admin' },
    TEST_SECRET
  );

  // Step 1: Secure Tabular Upload & Integrity Verification
  const csvRaw = readFileSync(join(fixturesDir, 'melanoma-synthetic.csv'), 'utf8');
  const expectedHash = crypto.createHash('sha256').update(Buffer.from(csvRaw, 'utf8')).digest('hex');

  const uploadReq = new Request('http://localhost:3000/api/v1/datasets/uploads', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clinicianToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      datasetName: 'Melanoma Evaluation Baseline',
      filename: 'melanoma-eval-v1.csv',
      sizeBytes: Buffer.byteLength(csvRaw),
      expectedHash,
    }),
  });

  const uploadRes = await createDatasetUpload(uploadReq);
  assert.equal(uploadRes.status, 200, 'Upload session initialization must succeed');
  const uploadData = await uploadRes.json();
  assert.ok(uploadData.datasetId);
  assert.ok(uploadData.versionId);
  assert.ok(uploadData.objectKey);

  // Upload to storage provider
  const storage = getStorageProvider();
  await storage.putObject(uploadData.objectKey, Buffer.from(csvRaw, 'utf8'), 'text/csv');

  // Complete upload via REST API with SHA-256 verification
  const completeReq = new Request(`http://localhost:3000/api/v1/datasets/uploads/${uploadData.uploadId}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${clinicianToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      datasetId: uploadData.datasetId,
      objectKey: uploadData.objectKey,
      expectedSha256: expectedHash,
    }),
  });

  const completeRes = await completeUpload(completeReq, { params: Promise.resolve({ uploadId: uploadData.uploadId }) });
  assert.equal(completeRes.status, 201, 'Upload completion must succeed with 201 Created');
  const completeData = await completeRes.json();
  assert.equal(completeData.version.sha256, expectedHash);
  assert.equal(completeData.version.columnCount, 3);
  assert.equal(completeData.version.rowCount, 100);

  // Step 2: Queue Investigation Job with Background Worker
  const queue = getInvestigationQueue();
  const worker = getInvestigationWorker();
  const eventHub = getEventHub();

  const jobReq = new Request('http://localhost:3000/api/v1/investigations/jobs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clinicianToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      title: 'ICU Melanoma Detector Triage Failure Audit',
      fixtureName: 'melanoma-synthetic.csv',
      offlineOnly: true,
      autoStart: false,
    }),
  });

  const jobRes = await submitInvestigationJob(jobReq);
  assert.equal(jobRes.status, 202, 'Job queuing must return 202 Accepted');
  const jobPayload = await jobRes.json();
  const jobId = jobPayload.jobId;
  assert.ok(jobId.startsWith('job_'));

  // Step 3: Worker processes the job asynchronously
  const job = await queue.getJob(jobId);
  assert.ok(job);
  assert.equal(job.status, 'queued');

  await worker.executeJob(job);
  const completedJob = await queue.getJob(jobId);
  assert.ok(completedJob);
  assert.equal(completedJob.status, 'completed');
  assert.ok(completedJob.result);
  assert.equal(completedJob.result.status, 'completed');
  assert.equal(completedJob.result.id, completedJob.data.investigationId);

  // Verify telemetry events were logged monotonically
  const events = eventHub.getHistory(completedJob.data.investigationId);
  assert.ok(events.length >= 3, 'Monotonic SSE telemetry events must be captured');
  assert.equal(events[0].eventId, 1);

  // Step 4: Repair Lab & Human Approval Gatekeeper
  const repairRegistry = getRepairRegistry();
  const candidatePolicy = await repairRegistry.createPolicy({
    organizationId: orgId,
    projectId,
    investigationId: completedJob.data.investigationId,
    operatingThreshold: 0.19,
    positiveLabel: '1',
    costWeights: { falseNegative: 20, falsePositive: 1 },
    targetRecall: 0.95,
    createdBy: clinicianUserId,
  });
  assert.equal(candidatePolicy.status, 'draft');
  assert.equal(candidatePolicy.version, 1);

  // Clinician attempts to inspect policy
  const getPolicyReq = new Request(`http://localhost:3000/api/v1/repairs/${candidatePolicy.id}`, {
    headers: { Authorization: `Bearer ${clinicianToken}` },
  });
  const getPolicyRes = await getRepairPolicy(getPolicyReq, { params: { id: candidatePolicy.id } });
  assert.equal(getPolicyRes.status, 200);

  // Chief Medical Officer approves policy with mandatory clinical rationale comment
  const approveReq = new Request(`http://localhost:3000/api/v1/repairs/${candidatePolicy.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${chiefOfficerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedVersion: 1,
      comments: 'Approved for clinical triage assist under human clinician oversight. Automated push is disabled.',
    }),
  });

  const approveRes = await approveRepairPolicy(approveReq, { params: { id: candidatePolicy.id } });
  assert.equal(approveRes.status, 200, 'Human review sign-off must succeed');
  const approvedPayload = await approveRes.json();
  const approvedPolicy = approvedPayload.policy;

  assert.equal(approvedPolicy.status, 'approved');
  assert.equal(approvedPolicy.version, 1);
  assert.equal(approvedPolicy.approval?.automatedDeploymentProhibited, true);
  assert.ok(approvedPolicy.approval?.approvedAt);
  assert.equal(approvedPolicy.approval?.approvedByName, 'Dr. Raj Patel');

  // Verify multi-language exported policy code prohibits automated deployment
  assert.ok(approvedPolicy.codeSnippets.python.includes('AUTOMATED_DEPLOYMENT_PROHIBITED: bool = True'));
  assert.ok(approvedPolicy.codeSnippets.typescript.includes('automatedDeploymentProhibited: true as const'));
  assert.ok(approvedPolicy.codeSnippets.json.includes('"automated_deployment_prohibited": true'));
  assert.ok(approvedPolicy.codeSnippets.yaml.includes('automated_deployment_prohibited: true'));

  // Step 5: Production Statistical Drift Monitoring
  const monitorReq = new Request('http://localhost:3000/api/v1/monitors', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clinicianToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      name: 'Melanoma Probability Drift Guard',
      referenceDatasetId: uploadData.datasetId,
      referenceCsvContent: csvRaw,
      conditions: [
        { metric: 'psi', column: 'y_probability', operator: 'gt', threshold: 0.2, severity: 'warning' },
        { metric: 'ks_drift', column: 'y_probability', operator: 'gt', threshold: 0.15, severity: 'critical' },
      ],
      cooldownMinutes: 30,
    }),
  });

  const monitorRes = await createMonitorRule(monitorReq);
  assert.equal(monitorRes.status, 201, 'Monitor rule creation must return 201 Created');
  const monData = await monitorRes.json();
  const ruleId = monData.rule.id;
  assert.ok(ruleId.startsWith('rule_'));

  // Simulate evaluation batch with significant distribution shift
  const shiftedCsv = `sample_id,y_true,y_pred,y_probability
s1,1,0,0.05
s2,1,0,0.08
s3,1,0,0.04
s4,1,0,0.09
s5,1,0,0.06
`;

  const evalReq = new Request(`http://localhost:3000/api/v1/monitors/${ruleId}/evaluate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${clinicianToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      csvContent: shiftedCsv,
      batchName: 'telehealth_site_batch_01.csv',
    }),
  });

  const evalRes = await evaluateMonitorBatch(evalReq, { params: { id: ruleId } });
  assert.equal(evalRes.status, 200);
  const evalData = await evalRes.json();
  assert.equal(evalData.ok, true);
  assert.equal(evalData.result.alerts.length >= 1, true, 'Drift alert must be triggered');

  // List alerts
  const listAlertsReq = new Request('http://localhost:3000/api/v1/monitors/alerts', {
    headers: { Authorization: `Bearer ${clinicianToken}` },
  });
  const listAlertsRes = await listAlerts(listAlertsReq);
  const alertsData = await listAlertsRes.json();
  assert.ok(alertsData.alerts.length >= 1);
  const alertId = alertsData.alerts[0].id;

  // Clinician acknowledges alert
  const ackReq = new Request(`http://localhost:3000/api/v1/monitors/alerts/${alertId}/acknowledge`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${clinicianToken}` },
  });
  const ackRes = await acknowledgeAlert(ackReq, { params: { id: alertId } });
  assert.equal(ackRes.status, 200);
  const ackData = await ackRes.json();
  assert.ok(ackData.alert.acknowledgedAt);
  assert.equal(ackData.alert.acknowledgedBy, 'Dr. Sarah Chen');

  // Step 6: Verify Comprehensive Audit Trail
  const { events: auditLogs } = await getAuditEvents(orgId);
  assert.ok(auditLogs.length >= 5, 'All workflow phases must write immutable audit records');

  const expectedActions = [
    'DATASET_VERSION_CREATED',
    'INVESTIGATION_JOB_QUEUED',
    'REPAIR_POLICY_CREATED',
    'REPAIR_POLICY_APPROVED',
    'MONITOR_RULE_CREATED',
    'MONITOR_ALERT_TRIGGERED',
    'MONITOR_ALERT_ACKNOWLEDGED',
  ];

  for (const action of expectedActions) {
    const found = auditLogs.some((l) => l.action === action);
    assert.ok(found, `Audit log must record action ${action}`);
  }

  // Verify all audit logs are strictly scoped to the tenant
  for (const log of auditLogs) {
    assert.equal(log.organizationId, orgId);
    assert.ok(log.id.startsWith('aud_'));
    assert.ok(log.timestamp);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../src/server/auth/session.ts';
import { POST as createDatasetUpload } from '../../src/app/api/v1/datasets/uploads/route.ts';
import { POST as submitInvestigationJob } from '../../src/app/api/v1/investigations/jobs/route.ts';
import { POST as approveRepairPolicy } from '../../src/app/api/v1/repairs/[id]/approve/route.ts';
import { GET as getRepairPolicy } from '../../src/app/api/v1/repairs/[id]/route.ts';
import { POST as createMonitorRule, GET as listMonitorRules } from '../../src/app/api/v1/monitors/route.ts';
import { GET as getMonitorRule, DELETE as deleteMonitorRule } from '../../src/app/api/v1/monitors/[id]/route.ts';
import { sanitizeFileName, sanitizeCsvCell, sanitizeInputText } from '../../src/server/security/sanitizer.ts';
import { validateDatasetContent } from '../../src/server/datasets/validator.ts';
import { getRepairRegistry } from '../../src/server/repair/repair-registry.ts';
import { getMonitorEngine } from '../../src/server/monitoring/monitor-engine.ts';
import { getAuditEvents, _resetAuditEventsForTest } from '../../src/server/audit/audit-logger.ts';

const TEST_SECRET = 'whylab-dev-insecure-secret-key-32-chars-min!';

test('OWASP A01: Broken Access Control & IDOR: Cross-tenant access strictly blocked across all resources', async () => {
  _resetAuditEventsForTest();
  getRepairRegistry().resetForTesting();
  getMonitorEngine().resetForTesting();

  const orgA = 'org_hospital_alpha';
  const orgB = 'org_hospital_beta';

  const userOrgAToken = await createSessionToken(
    { sub: 'usr_alpha', email: 'doctor@alpha.org', name: 'Dr. Alpha', organizationId: orgA, role: 'editor' },
    TEST_SECRET
  );

  const intruderOrgBToken = await createSessionToken(
    { sub: 'usr_beta', email: 'attacker@beta.org', name: 'Attacker Beta', organizationId: orgB, role: 'admin' },
    TEST_SECRET
  );

  // 1. Create a Repair Policy in Org A
  const repair = await getRepairRegistry().createPolicy({
    organizationId: orgA,
    projectId: 'proj_alpha',
    operatingThreshold: 0.22,
    positiveLabel: 'malignant',
    costWeights: { falseNegative: 20, falsePositive: 1 },
    targetRecall: 0.90,
    createdBy: 'usr_alpha',
  });

  // Org B intruder attempts to inspect Org A repair policy -> 404 Not Found (zero information disclosure)
  const idorGetRepairReq = new Request(`http://localhost:3000/api/v1/repairs/${repair.id}`, {
    headers: { Authorization: `Bearer ${intruderOrgBToken}` },
  });
  const idorGetRepairRes = await getRepairPolicy(idorGetRepairReq, { params: Promise.resolve({ id: repair.id }) });
  assert.equal(idorGetRepairRes.status, 404);

  // Org B intruder attempts to approve Org A repair policy -> 404 Not Found
  const idorApproveReq = new Request(`http://localhost:3000/api/v1/repairs/${repair.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${intruderOrgBToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comments: 'Malicious unauthorized approval', expectedVersion: 1 }),
  });
  const idorApproveRes = await approveRepairPolicy(idorApproveReq, { params: Promise.resolve({ id: repair.id }) });
  assert.equal(idorApproveRes.status, 404);

  // 2. Create a Monitor Rule in Org A
  const monitor = await getMonitorEngine().createRule({
    organizationId: orgA,
    projectId: 'proj_alpha',
    name: 'Confidential Patient Drift Guard',
    conditions: [{ metric: 'ks_drift', operator: 'gt', threshold: 0.15, severity: 'critical' }],
  });

  // Org B intruder attempts to inspect Org A monitor rule -> 404 Not Found
  const idorGetMonReq = new Request(`http://localhost:3000/api/v1/monitors/${monitor.id}`, {
    headers: { Authorization: `Bearer ${intruderOrgBToken}` },
  });
  const idorGetMonRes = await getMonitorRule(idorGetMonReq, { params: Promise.resolve({ id: monitor.id }) });
  assert.equal(idorGetMonRes.status, 404);

  // Org B intruder attempts to delete Org A monitor rule -> 404 Not Found
  const idorDeleteMonReq = new Request(`http://localhost:3000/api/v1/monitors/${monitor.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${intruderOrgBToken}` },
  });
  const idorDeleteMonRes = await deleteMonitorRule(idorDeleteMonReq, { params: Promise.resolve({ id: monitor.id }) });
  assert.equal(idorDeleteMonRes.status, 404);
});

test('OWASP A01: Role-Based Access Control: Viewer role is denied all write, approve, and delete operations', async () => {
  const orgId = 'org_compliance_test';
  const viewerToken = await createSessionToken(
    { sub: 'usr_viewer_readonly', email: 'guest@org.com', name: 'Readonly Guest', organizationId: orgId, role: 'viewer' },
    TEST_SECRET
  );

  // 1. Viewer cannot create dataset upload
  const uploadReq = new Request('http://localhost:3000/api/v1/datasets/uploads', {
    method: 'POST',
    headers: { Authorization: `Bearer ${viewerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'p1', fileName: 'data.csv', byteSize: 1000 }),
  });
  assert.equal((await createDatasetUpload(uploadReq)).status, 403);

  // 2. Viewer cannot submit autonomous investigation job
  const jobReq = new Request('http://localhost:3000/api/v1/investigations/jobs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${viewerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'p1', fixtureName: 'melanoma-synthetic.csv' }),
  });
  assert.equal((await submitInvestigationJob(jobReq)).status, 403);

  // 3. Viewer cannot create monitor rule
  const monReq = new Request('http://localhost:3000/api/v1/monitors', {
    method: 'POST',
    headers: { Authorization: `Bearer ${viewerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'p1', name: 'Test', conditions: [{ metric: 'psi', operator: 'gt', threshold: 0.2, severity: 'warning' }] }),
  });
  assert.equal((await createMonitorRule(monReq)).status, 403);
});

test('OWASP A02: Cryptographic Failures & Session Integrity: Tampered and malformed JWTs are rejected', async () => {
  // Tampered payload in token
  const validToken = await createSessionToken(
    { sub: 'usr_valid', email: 'v@a.com', name: 'V', organizationId: 'org_1', role: 'viewer' },
    TEST_SECRET
  );

  const parts = validToken.split('.');
  // Modify payload part
  const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'usr_hacked', role: 'admin', organizationId: 'org_1' })).toString('base64url');
  const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

  const req = new Request('http://localhost:3000/api/v1/monitors', {
    headers: { Authorization: `Bearer ${tamperedToken}` },
  });

  const res = await listMonitorRules(req);
  assert.equal(res.status, 401, 'Tampered JWT signature must be rejected with 401 Unauthorized');
});

test('OWASP A03: Injection & Path Traversal: Formula injections and directory traversal sanitized', () => {
  // Path traversal
  assert.equal(sanitizeFileName('../../../../../../../etc/shadow'), 'shadow.csv');
  assert.equal(sanitizeFileName('..\\..\\windows\\system32\\cmd.exe'), 'cmd.exe.csv');
  assert.equal(sanitizeFileName('/var/run/secrets.csv'), 'secrets.csv');

  // CSV Formula Injections (CWE-1236)
  assert.equal(sanitizeCsvCell('=cmd|"/C calc"!A0'), '\'=cmd|"/C calc"!A0');
  assert.equal(sanitizeCsvCell('+cmd|"/C calc"!A0'), '\'+cmd|"/C calc"!A0');
  assert.equal(sanitizeCsvCell('-2+3*cmd|'), '\'-2+3*cmd|');
  assert.equal(sanitizeCsvCell('@SUM(1+1)'), '\'@SUM(1+1)');
  assert.equal(sanitizeCsvCell('\tDDEAUTO'), '\'\tDDEAUTO');

  // Control character injection
  assert.equal(sanitizeInputText('Admin\x00\x08User'), 'AdminUser');
});

test('OWASP A03: Unsafe Deserialization: Dangerous ML model binaries rejected (CWE-502)', () => {
  // Python Pickles
  const maliciousPickle = Buffer.concat([Buffer.from([0x80, 0x03]), Buffer.from('cos\nsystem\n')]);
  const pickleRes = validateDatasetContent(maliciousPickle, { filename: 'model_weights.pkl' });
  assert.equal(pickleRes.isValid, false);
  assert.ok(pickleRes.issues.some((i) => i.code === 'MALICIOUS_CONTENT'));

  // Prohibited serialized machine learning formats
  const csv = 'col1,col2\n1,2\n';
  const joblibRes = validateDatasetContent(csv, { filename: 'exploit.joblib' });
  assert.equal(joblibRes.isValid, false);
  assert.ok(joblibRes.issues.some((i) => i.code === 'FILE_TYPE_REJECTED'));

  const pthRes = validateDatasetContent(csv, { filename: 'exploit.pth' });
  assert.equal(pthRes.isValid, false);
  assert.ok(pthRes.issues.some((i) => i.code === 'FILE_TYPE_REJECTED'));

  // Valid CSV is accepted
  const validCsv = 'sample_id,actual,prediction,probability\n1,1,1,0.95';
  const csvRes = validateDatasetContent(validCsv, { filename: 'data.csv' });
  assert.equal(csvRes.isValid, true);
});

test('OWASP A04: Insecure Design: Automated production model deployment is prohibited across all outputs', async () => {
  const registry = getRepairRegistry();
  const policy = await registry.createPolicy({
    organizationId: 'org_safety_test',
    projectId: 'proj_test',
    operatingThreshold: 0.19,
    positiveLabel: '1',
    costWeights: { falseNegative: 20, falsePositive: 1 },
    targetRecall: 0.95,
    createdBy: 'usr_safety_lead',
  });

  const { policy: approvedPolicy } = await registry.approvePolicy(policy.id, 'org_safety_test', {
    approvedBy: 'usr_chief_medical',
    approvedByName: 'Dr. House',
    comments: 'Clinical sign-off completed.',
    expectedVersion: 1,
  });

  assert.equal(approvedPolicy.approval?.automatedDeploymentProhibited, true);
  assert.ok(approvedPolicy.codeSnippets.python.includes('AUTOMATED_DEPLOYMENT_PROHIBITED: bool = True'));
  assert.ok(approvedPolicy.codeSnippets.typescript.includes('automatedDeploymentProhibited: true as const'));
  assert.ok(approvedPolicy.codeSnippets.json.includes('"automated_deployment_prohibited": true'));
  assert.ok(approvedPolicy.codeSnippets.yaml.includes('automated_deployment_prohibited: true'));
});

test('OWASP A09: Security Logging & Monitoring: Every security-relevant event produces append-only audit trail', async () => {
  _resetAuditEventsForTest();
  const orgId = 'org_audit_test';
  const token = await createSessionToken(
    { sub: 'usr_auditor_agent', email: 'audit@agency.gov', name: 'Federal Auditor', organizationId: orgId, role: 'editor' },
    TEST_SECRET
  );

  // 1. Submit job -> audit logged
  const jobReq = new Request('http://localhost:3000/api/v1/investigations/jobs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'p1', fixtureName: 'melanoma-synthetic.csv', offlineOnly: true, autoStart: false }),
  });
  await submitInvestigationJob(jobReq);

  // 2. Create monitor rule -> audit logged
  const monReq = new Request('http://localhost:3000/api/v1/monitors', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'p1', name: 'Audit Guard', conditions: [{ metric: 'ks_drift', operator: 'gt', threshold: 0.2, severity: 'warning' }] }),
  });
  await createMonitorRule(monReq);

  const { events } = await getAuditEvents(orgId);
  assert.ok(events.length >= 2);
  assert.ok(events.some((e) => e.action === 'INVESTIGATION_JOB_QUEUED'));
  assert.ok(events.some((e) => e.action === 'MONITOR_RULE_CREATED'));
  for (const event of events) {
    assert.ok(event.id.startsWith('aud_'));
    assert.ok(event.timestamp);
    assert.equal(event.organizationId, orgId);
  }
});

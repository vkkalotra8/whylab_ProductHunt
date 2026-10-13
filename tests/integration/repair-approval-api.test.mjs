import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../src/server/auth/session.ts';
import { POST as createPolicy, GET as listPolicies } from '../../src/app/api/v1/repairs/route.ts';
import { GET as getPolicy } from '../../src/app/api/v1/repairs/[id]/route.ts';
import { POST as approvePolicy } from '../../src/app/api/v1/repairs/[id]/approve/route.ts';
import { POST as rejectPolicy } from '../../src/app/api/v1/repairs/[id]/reject/route.ts';
import { GET as exportPolicy } from '../../src/app/api/v1/repairs/[id]/export/route.ts';
import { getRepairRegistry } from '../../src/server/repair/repair-registry.ts';
import { getAuditEvents, _resetAuditEventsForTest } from '../../src/server/audit/audit-logger.ts';

const TEST_SECRET = 'whylab-dev-insecure-secret-key-32-chars-min!';

test('Repair Policy Human Approval Workflow: RBAC, optimistic locking, audit logging, and export attestation', async () => {
  _resetAuditEventsForTest();
  getRepairRegistry().resetForTesting();

  const orgId = 'org_oncology_center';
  const otherOrgId = 'org_other_hospital';
  const projectId = 'proj_skin_cancer';

  const editorToken = await createSessionToken(
    {
      sub: 'usr_editor_oncology',
      email: 'dr.curie@oncology.org',
      name: 'Dr. Marie Curie',
      organizationId: orgId,
      role: 'editor',
    },
    TEST_SECRET
  );

  const viewerToken = await createSessionToken(
    {
      sub: 'usr_viewer_oncology',
      email: 'resident@oncology.org',
      name: 'Resident Pathologist',
      organizationId: orgId,
      role: 'viewer',
    },
    TEST_SECRET
  );

  const crossTenantToken = await createSessionToken(
    {
      sub: 'usr_intruder',
      email: 'attacker@other.org',
      name: 'Intruder',
      organizationId: otherOrgId,
      role: 'admin',
    },
    TEST_SECRET
  );

  // 1. Viewer cannot create repair policy (403 Forbidden)
  const viewerCreateReq = new Request('http://localhost:3000/api/v1/repairs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${viewerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId,
      operatingThreshold: 0.19,
      positiveLabel: '1',
    }),
  });
  const viewerCreateRes = await createPolicy(viewerCreateReq);
  assert.equal(viewerCreateRes.status, 403);

  // 2. Editor creates repair policy -> 201 Created
  const editorCreateReq = new Request('http://localhost:3000/api/v1/repairs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${editorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId,
      operatingThreshold: 0.19,
      positiveLabel: '1',
      costWeights: { falseNegative: 20, falsePositive: 1 },
      targetRecall: 0.95,
      validationMode: 'independent_holdout_validated',
      datasetName: 'melanoma-prospective.csv',
      totalSamples: 20000,
    }),
  });
  const editorCreateRes = await createPolicy(editorCreateReq);
  assert.equal(editorCreateRes.status, 201);
  const { policy: createdPolicy } = await editorCreateRes.json();
  assert.ok(createdPolicy.id.startsWith('repair_'));
  assert.equal(createdPolicy.status, 'draft');
  assert.equal(createdPolicy.version, 1);

  // 3. Viewer inspects policy via GET /api/v1/repairs/[id]
  const inspectReq = new Request(`http://localhost:3000/api/v1/repairs/${createdPolicy.id}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${viewerToken}`,
    },
  });
  const inspectRes = await getPolicy(inspectReq, {
    params: Promise.resolve({ id: createdPolicy.id }),
  });
  assert.equal(inspectRes.status, 200);
  const { policy: fetchedPolicy } = await inspectRes.json();
  assert.equal(fetchedPolicy.id, createdPolicy.id);
  assert.equal(fetchedPolicy.status, 'draft');

  // 4. Viewer cannot approve repair policy (403 Forbidden)
  const viewerApproveReq = new Request(`http://localhost:3000/api/v1/repairs/${createdPolicy.id}/approve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${viewerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      comments: 'Attempting unauthorized approval',
      expectedVersion: 1,
    }),
  });
  const viewerApproveRes = await approvePolicy(viewerApproveReq, {
    params: Promise.resolve({ id: createdPolicy.id }),
  });
  assert.equal(viewerApproveRes.status, 403);

  // 5. Editor attempts approval with short comments -> 400 Bad Request
  const shortCommentReq = new Request(`http://localhost:3000/api/v1/repairs/${createdPolicy.id}/approve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${editorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      comments: 'ok',
      expectedVersion: 1,
    }),
  });
  const shortCommentRes = await approvePolicy(shortCommentReq, {
    params: Promise.resolve({ id: createdPolicy.id }),
  });
  assert.equal(shortCommentRes.status, 400);

  // 6. Editor attempts approval with mismatched version -> 409 Conflict
  const versionConflictReq = new Request(`http://localhost:3000/api/v1/repairs/${createdPolicy.id}/approve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${editorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      comments: 'Audited and verified clinical operating parameters.',
      expectedVersion: 99,
    }),
  });
  const versionConflictRes = await approvePolicy(versionConflictReq, {
    params: Promise.resolve({ id: createdPolicy.id }),
  });
  assert.equal(versionConflictRes.status, 409);

  // 7. Editor approves policy successfully -> 200 OK
  const validApproveReq = new Request(`http://localhost:3000/api/v1/repairs/${createdPolicy.id}/approve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${editorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      comments: 'Audited 101-point threshold sweep against prospective holdout. Shift to 0.19 recovers minority sensitivity while maintaining bounded false positive rate.',
      expectedVersion: 1,
      signature: 'sig_curie_nobel',
    }),
  });
  const validApproveRes = await approvePolicy(validApproveReq, {
    params: Promise.resolve({ id: createdPolicy.id }),
  });
  assert.equal(validApproveRes.status, 200);
  const approveData = await validApproveRes.json();
  assert.equal(approveData.ok, true);
  assert.equal(approveData.policy.status, 'approved');
  assert.equal(approveData.policy.approval.approvedByName, 'Dr. Marie Curie');
  assert.equal(approveData.policy.approval.automatedDeploymentProhibited, true);

  // 8. Verify audit event logged in audit_events table
  const { events } = await getAuditEvents(orgId);
  const approvalAudit = events.find((e) => e.action === 'REPAIR_POLICY_APPROVED');
  assert.ok(approvalAudit);
  assert.equal(approvalAudit.objectId, createdPolicy.id);
  assert.equal(approvalAudit.metadata.automatedDeploymentProhibited, true);
  assert.equal(approvalAudit.metadata.approvedByName, 'Dr. Marie Curie');

  // 9. Export endpoint returns certified code snippets embedding human approval
  const exportReq = new Request(`http://localhost:3000/api/v1/repairs/${createdPolicy.id}/export?format=python`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${viewerToken}`,
    },
  });
  const exportRes = await exportPolicy(exportReq, {
    params: Promise.resolve({ id: createdPolicy.id }),
  });
  assert.equal(exportRes.status, 200);
  const exportData = await exportRes.json();
  assert.equal(exportData.isApproved, true);
  assert.equal(exportData.automatedDeploymentProhibited, true);
  assert.ok(typeof exportData.snippet === 'string');
  assert.ok(exportData.snippet.includes('ATTESTATION: Human Clinical/Production Sign-Off Confirmed'));
  assert.ok(exportData.snippet.includes('Dr. Marie Curie'));
  assert.ok(exportData.snippet.includes('Automated deployment is PROHIBITED'));

  // 10. Cross-tenant access isolation: User from other org cannot inspect or approve
  const crossTenantReq = new Request(`http://localhost:3000/api/v1/repairs/${createdPolicy.id}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${crossTenantToken}`,
    },
  });
  const crossTenantRes = await getPolicy(crossTenantReq, {
    params: Promise.resolve({ id: createdPolicy.id }),
  });
  assert.equal(crossTenantRes.status, 404);
});

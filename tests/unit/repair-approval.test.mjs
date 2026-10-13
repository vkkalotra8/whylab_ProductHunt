import test from 'node:test';
import assert from 'node:assert/strict';
import { RepairRegistry } from '../../src/server/repair/repair-registry.ts';
import { generatePolicyCodeSnippets } from '../../src/server/repair/code-generator.ts';
import { getAuditEvents, _resetAuditEventsForTest } from '../../src/server/audit/audit-logger.ts';

test('RepairRegistry: creates a draft repair policy with unapproved snippets', async () => {
  _resetAuditEventsForTest();
  const registry = new RepairRegistry();

  const policy = await registry.createPolicy({
    organizationId: 'org_clinic_1',
    projectId: 'proj_melanoma',
    operatingThreshold: 0.19,
    positiveLabel: '1',
    costWeights: { falseNegative: 20, falsePositive: 1 },
    targetRecall: 0.95,
    datasetName: 'melanoma-holdout.csv',
    totalSamples: 2500,
    validationMode: 'independent_holdout_validated',
    createdBy: 'usr_lead_ml',
  });

  assert.ok(policy.id.startsWith('repair_'));
  assert.equal(policy.status, 'draft');
  assert.equal(policy.version, 1);
  assert.equal(policy.operatingThreshold, 0.19);
  assert.equal(policy.validationMode, 'independent_holdout_validated');
  assert.equal(policy.approval, undefined);

  // Check draft snippets
  assert.ok(policy.codeSnippets.python.includes('WARNING: DRAFT POLICY - NOT APPROVED FOR PRODUCTION SERVING'));
  assert.ok(policy.codeSnippets.typescript.includes('status: \'unapproved_draft\''));
  assert.ok(policy.codeSnippets.json.includes('"status": "unapproved_draft"'));
  assert.ok(policy.codeSnippets.yaml.includes('approval: null'));

  // Check audit event
  const { events } = await getAuditEvents('org_clinic_1');
  const createdEvent = events.find((e) => e.action === 'REPAIR_POLICY_CREATED');
  assert.ok(createdEvent);
  assert.equal(createdEvent.objectId, policy.id);
});

test('RepairRegistry: approves policy with human review, optimistic lock, and records audit trail', async () => {
  _resetAuditEventsForTest();
  const registry = new RepairRegistry();

  const policy = await registry.createPolicy({
    organizationId: 'org_clinic_1',
    projectId: 'proj_melanoma',
    operatingThreshold: 0.19,
    positiveLabel: '1',
    costWeights: { falseNegative: 20, falsePositive: 1 },
    targetRecall: 0.95,
    createdBy: 'usr_lead_ml',
  });

  const { policy: approvedPolicy, auditEventId } = await registry.approvePolicy(
    policy.id,
    'org_clinic_1',
    {
      approvedBy: 'usr_chief_medical',
      approvedByName: 'Dr. Gregory House',
      comments: 'Audited 101-point threshold sweep against prospective holdout. False negative reduction outweighs biopsy overhead.',
      expectedVersion: 1,
      signature: 'sig_house_md',
    }
  );

  assert.equal(approvedPolicy.status, 'approved');
  assert.ok(approvedPolicy.approval);
  assert.equal(approvedPolicy.approval.approvedByName, 'Dr. Gregory House');
  assert.equal(approvedPolicy.approval.automatedDeploymentProhibited, true);
  assert.ok(auditEventId);

  // Snippets now contain certified attestation
  assert.ok(approvedPolicy.codeSnippets.python.includes('ATTESTATION: Human Clinical/Production Sign-Off Confirmed'));
  assert.ok(approvedPolicy.codeSnippets.python.includes('Dr. Gregory House'));
  assert.ok(approvedPolicy.codeSnippets.python.includes('Automated deployment is PROHIBITED'));
  assert.ok(approvedPolicy.codeSnippets.typescript.includes('status: \'approved\''));
  assert.ok(approvedPolicy.codeSnippets.json.includes('"status": "approved"'));

  // Check audit log
  const { events } = await getAuditEvents('org_clinic_1');
  const approvalEvent = events.find((e) => e.action === 'REPAIR_POLICY_APPROVED');
  assert.ok(approvalEvent);
  assert.equal(approvalEvent.actorId, 'usr_chief_medical');
  assert.equal(approvalEvent.metadata.automatedDeploymentProhibited, true);
});

test('RepairRegistry: enforces validation rules and rejects invalid approvals', async () => {
  _resetAuditEventsForTest();
  const registry = new RepairRegistry();

  const policy = await registry.createPolicy({
    organizationId: 'org_clinic_1',
    projectId: 'proj_melanoma',
    operatingThreshold: 0.19,
    positiveLabel: '1',
    costWeights: { falseNegative: 20, falsePositive: 1 },
    targetRecall: 0.95,
    createdBy: 'usr_lead_ml',
  });

  // 1. Missing / short comments
  await assert.rejects(
    async () => {
      await registry.approvePolicy(policy.id, 'org_clinic_1', {
        approvedBy: 'usr_1',
        approvedByName: 'Reviewer',
        comments: 'ok', // too short (< 8 chars)
        expectedVersion: 1,
      });
    },
    { message: /at least 8 characters/ }
  );

  // 2. Optimistic version conflict
  await assert.rejects(
    async () => {
      await registry.approvePolicy(policy.id, 'org_clinic_1', {
        approvedBy: 'usr_1',
        approvedByName: 'Reviewer',
        comments: 'Valid comment with enough rationale',
        expectedVersion: 999, // Mismatch
      });
    },
    { message: /Optimistic lock failure/ }
  );

  // 3. Approve successfully
  await registry.approvePolicy(policy.id, 'org_clinic_1', {
    approvedBy: 'usr_1',
    approvedByName: 'Reviewer',
    comments: 'Valid rationale comment for production',
    expectedVersion: 1,
  });

  // 4. Double approval rejected
  await assert.rejects(
    async () => {
      await registry.approvePolicy(policy.id, 'org_clinic_1', {
        approvedBy: 'usr_2',
        approvedByName: 'Second Reviewer',
        comments: 'Attempting to approve again',
        expectedVersion: 1,
      });
    },
    { message: /already approved/ }
  );
});

test('RepairRegistry: supports policy rejection and logs audit record', async () => {
  _resetAuditEventsForTest();
  const registry = new RepairRegistry();

  const policy = await registry.createPolicy({
    organizationId: 'org_clinic_1',
    projectId: 'proj_melanoma',
    operatingThreshold: 0.19,
    positiveLabel: '1',
    costWeights: { falseNegative: 20, falsePositive: 1 },
    targetRecall: 0.95,
    createdBy: 'usr_lead_ml',
  });

  const rejected = await registry.rejectPolicy(policy.id, 'org_clinic_1', {
    rejectedBy: 'usr_auditor',
    rejectedByName: 'Compliance Auditor',
    reason: 'False alarm burden exceeds clinical capacity at Site B.',
    expectedVersion: 1,
  });

  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.rejection?.reason, 'False alarm burden exceeds clinical capacity at Site B.');

  const { events } = await getAuditEvents('org_clinic_1');
  const rejectedEvent = events.find((e) => e.action === 'REPAIR_POLICY_REJECTED');
  assert.ok(rejectedEvent);
});

test('CodeGenerator: strictly embeds automated deployment prohibition invariant across all formats', () => {
  const snippets = generatePolicyCodeSnippets({
    policyId: 'pol_test',
    version: 1,
    operatingThreshold: 0.25,
    positiveLabel: 'malignant',
    falseNegativeCost: 25,
    falsePositiveCost: 1,
    datasetName: 'validation.csv',
    totalSamples: 5000,
    validationMode: 'independent_holdout_validated',
    approval: {
      approvedBy: 'usr_approver',
      approvedByName: 'Dr. Curie',
      approvedAt: '2026-10-11T20:00:00.000Z',
      comments: 'Clinically verified operating threshold.',
      expectedVersion: 1,
      automatedDeploymentProhibited: true,
    },
  });

  // Verify across all 4 formats
  assert.ok(snippets.python.includes('AUTOMATED_DEPLOYMENT_PROHIBITED: bool = True'));
  assert.ok(snippets.typescript.includes('automatedDeploymentProhibited: true as const'));
  assert.ok(snippets.json.includes('"automated_deployment_prohibited": true'));
  assert.ok(snippets.yaml.includes('automated_deployment_prohibited: true'));
});

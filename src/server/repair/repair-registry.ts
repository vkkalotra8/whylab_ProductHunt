import { createId } from '../../core/domain/primitives.ts';
import { generatePolicyCodeSnippets } from './code-generator.ts';
import { recordAuditEvent } from '../audit/audit-logger.ts';
import { badRequest, conflict, notFound } from '../api/errors.ts';
import type {
  RepairPolicy,
  CreateRepairPolicyParams,
  ApproveRepairPolicyParams,
  RejectRepairPolicyParams,
} from './types.ts';

export class RepairRegistry {
  private readonly policies = new Map<string, RepairPolicy>();

  async createPolicy(params: CreateRepairPolicyParams): Promise<RepairPolicy> {
    const id = createId('repair');
    const now = new Date().toISOString();
    const version = 1;
    const validationMode = params.validationMode ?? 'single_cohort_optimization';
    const datasetName = params.datasetName ?? 'evaluation-dataset.csv';
    const totalSamples = params.totalSamples ?? 1000;
    const modality = params.modality ?? 'tabular';

    const codeSnippets = generatePolicyCodeSnippets({
      policyId: id,
      version,
      modality,
      operatingThreshold: params.operatingThreshold,
      positiveLabel: params.positiveLabel,
      falseNegativeCost: params.costWeights.falseNegative,
      falsePositiveCost: params.costWeights.falsePositive,
      datasetName,
      totalSamples,
      validationMode,
      llmConfig: params.llmConfig,
      visionConfig: params.visionConfig,
    });

    const policy: RepairPolicy = {
      id,
      organizationId: params.organizationId,
      projectId: params.projectId,
      investigationId: params.investigationId,
      modality,
      version,
      status: 'draft',
      operatingThreshold: params.operatingThreshold,
      positiveLabel: params.positiveLabel,
      costWeights: params.costWeights,
      targetRecall: params.targetRecall,
      validationMode,
      datasetName,
      totalSamples,
      llmConfig: params.llmConfig,
      visionConfig: params.visionConfig,
      baselineMetrics: params.baselineMetrics,
      projectedMetrics: params.projectedMetrics,
      codeSnippets,
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    this.policies.set(id, policy);

    await recordAuditEvent({
      organizationId: params.organizationId,
      actorId: params.createdBy,
      action: 'REPAIR_POLICY_CREATED',
      objectType: 'repair_policy',
      objectId: id,
      metadata: {
        version,
        operatingThreshold: params.operatingThreshold,
        positiveLabel: params.positiveLabel,
        validationMode,
        targetRecall: params.targetRecall,
      },
    });

    return policy;
  }

  async getPolicy(id: string): Promise<RepairPolicy | null> {
    return this.policies.get(id) ?? null;
  }

  async listPolicies(organizationId: string, projectId?: string): Promise<RepairPolicy[]> {
    const results: RepairPolicy[] = [];
    for (const p of this.policies.values()) {
      if (p.organizationId !== organizationId) continue;
      if (projectId && p.projectId !== projectId) continue;
      results.push(p);
    }
    return results.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async approvePolicy(
    id: string,
    organizationId: string,
    params: ApproveRepairPolicyParams
  ): Promise<{ policy: RepairPolicy; auditEventId: string }> {
    const policy = this.policies.get(id);
    if (!policy || policy.organizationId !== organizationId) {
      throw notFound(`Repair policy '${id}' not found`, 'REPAIR_POLICY_NOT_FOUND');
    }

    if (!params.comments || params.comments.trim().length < 8) {
      throw badRequest(
        'Human rationale comment of at least 8 characters is required for policy approval',
        'APPROVAL_COMMENT_REQUIRED'
      );
    }

    if (policy.version !== params.expectedVersion) {
      throw conflict(
        `Optimistic lock failure: expected version ${params.expectedVersion}, but current version is ${policy.version}`,
        'VERSION_CONFLICT'
      );
    }

    if (policy.status === 'approved') {
      throw conflict(`Policy '${id}' is already approved`, 'POLICY_ALREADY_APPROVED');
    }

    if (policy.status === 'archived') {
      throw badRequest(`Cannot approve an archived policy`, 'POLICY_ARCHIVED');
    }

    const now = new Date().toISOString();
    const approval = {
      approvedBy: params.approvedBy,
      approvedByName: params.approvedByName,
      approvedAt: now,
      comments: params.comments.trim(),
      expectedVersion: params.expectedVersion,
      automatedDeploymentProhibited: true as const,
      signature: params.signature,
    };

    policy.status = 'approved';
    policy.approval = approval;
    policy.updatedAt = now;

    // Regenerate certified code snippets with approval attestation header
    policy.codeSnippets = generatePolicyCodeSnippets({
      policyId: policy.id,
      version: policy.version,
      operatingThreshold: policy.operatingThreshold,
      positiveLabel: policy.positiveLabel,
      falseNegativeCost: policy.costWeights.falseNegative,
      falsePositiveCost: policy.costWeights.falsePositive,
      datasetName: policy.datasetName,
      totalSamples: policy.totalSamples,
      validationMode: policy.validationMode,
      approval,
    });

    this.policies.set(id, policy);

    const auditEvent = await recordAuditEvent({
      organizationId,
      actorId: params.approvedBy,
      action: 'REPAIR_POLICY_APPROVED',
      objectType: 'repair_policy',
      objectId: id,
      metadata: {
        version: policy.version,
        operatingThreshold: policy.operatingThreshold,
        positiveLabel: policy.positiveLabel,
        validationMode: policy.validationMode,
        approvedByName: params.approvedByName,
        comments: approval.comments,
        automatedDeploymentProhibited: true,
      },
    });

    return { policy, auditEventId: auditEvent.id };
  }

  async rejectPolicy(
    id: string,
    organizationId: string,
    params: RejectRepairPolicyParams
  ): Promise<RepairPolicy> {
    const policy = this.policies.get(id);
    if (!policy || policy.organizationId !== organizationId) {
      throw notFound(`Repair policy '${id}' not found`, 'REPAIR_POLICY_NOT_FOUND');
    }

    if (params.expectedVersion && policy.version !== params.expectedVersion) {
      throw conflict(
        `Version conflict: expected ${params.expectedVersion}, found ${policy.version}`,
        'VERSION_CONFLICT'
      );
    }

    if (policy.status === 'approved') {
      throw badRequest('Cannot reject a policy that is already approved. Archive it instead.', 'POLICY_ALREADY_APPROVED');
    }

    const now = new Date().toISOString();
    policy.status = 'rejected';
    policy.rejection = {
      rejectedBy: params.rejectedBy,
      rejectedByName: params.rejectedByName,
      rejectedAt: now,
      reason: params.reason || 'Rejected during review',
    };
    policy.updatedAt = now;

    this.policies.set(id, policy);

    await recordAuditEvent({
      organizationId,
      actorId: params.rejectedBy,
      action: 'REPAIR_POLICY_REJECTED',
      objectType: 'repair_policy',
      objectId: id,
      metadata: {
        version: policy.version,
        reason: policy.rejection.reason,
      },
    });

    return policy;
  }

  resetForTesting(): void {
    this.policies.clear();
  }
}

// Global Singleton Registry
let globalRepairRegistry: RepairRegistry | null = null;

export function getRepairRegistry(): RepairRegistry {
  if (!globalRepairRegistry) {
    globalRepairRegistry = new RepairRegistry();
  }
  return globalRepairRegistry;
}

export function setRepairRegistryForTest(registry: RepairRegistry | null): void {
  globalRepairRegistry = registry;
}

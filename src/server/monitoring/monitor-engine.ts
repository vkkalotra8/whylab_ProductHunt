import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createId } from '../../core/domain/primitives.ts';
import { ingestEvaluationCsv } from '../../core/diagnostics/evaluation-ingestion.ts';
import { evaluateMonitorRule } from './drift-evaluator.ts';
import { recordAuditEvent } from '../audit/audit-logger.ts';
import { notFound, badRequest } from '../api/errors.ts';
import type {
  MonitorRule,
  CreateMonitorRuleParams,
  MonitorAlert,
  MonitorEvaluationResult,
} from './types.ts';

export class MonitorEngine {
  private readonly rules = new Map<string, MonitorRule>();
  private readonly alerts = new Map<string, MonitorAlert>();

  async createRule(params: CreateMonitorRuleParams): Promise<MonitorRule> {
    const id = createId('rule');
    const now = new Date().toISOString();

    if (!params.name || params.name.trim().length === 0) {
      throw badRequest('Rule name is required', 'MISSING_RULE_NAME');
    }

    if (!params.conditions || params.conditions.length === 0) {
      throw badRequest('At least one monitor condition is required', 'MISSING_CONDITIONS');
    }

    const rule: MonitorRule = {
      id,
      organizationId: params.organizationId,
      projectId: params.projectId,
      name: params.name.trim(),
      description: params.description,
      enabled: true,
      referenceDatasetId: params.referenceDatasetId,
      referenceFixtureName: params.referenceFixtureName ?? 'melanoma-synthetic.csv',
      referenceCsvContent: params.referenceCsvContent,
      columnMapping: params.columnMapping,
      labels: params.labels,
      conditions: params.conditions,
      cooldownMinutes: params.cooldownMinutes ?? 60,
      createdAt: now,
      updatedAt: now,
    };

    this.rules.set(id, rule);

    await recordAuditEvent({
      organizationId: params.organizationId,
      actorId: 'system',
      action: 'MONITOR_RULE_CREATED',
      objectType: 'monitor_rule',
      objectId: id,
      metadata: {
        name: rule.name,
        projectId: rule.projectId,
        conditionCount: rule.conditions.length,
        cooldownMinutes: rule.cooldownMinutes,
      },
    });

    return rule;
  }

  async getRule(id: string): Promise<MonitorRule | null> {
    return this.rules.get(id) ?? null;
  }

  async listRules(organizationId: string, projectId?: string): Promise<MonitorRule[]> {
    const results: MonitorRule[] = [];
    for (const r of this.rules.values()) {
      if (r.organizationId !== organizationId) continue;
      if (projectId && r.projectId !== projectId) continue;
      results.push(r);
    }
    return results.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async deleteRule(id: string, organizationId: string): Promise<boolean> {
    const rule = this.rules.get(id);
    if (!rule || rule.organizationId !== organizationId) {
      return false;
    }
    this.rules.delete(id);
    return true;
  }

  /**
   * Resolves reference CSV content either from inline content or public/fixtures
   */
  private resolveReferenceCsv(rule: MonitorRule): string {
    if (rule.referenceCsvContent) {
      return rule.referenceCsvContent;
    }

    const fixtureName = rule.referenceFixtureName ?? 'melanoma-synthetic.csv';
    const fixturePath = join(process.cwd(), 'public', 'fixtures', fixtureName);
    if (existsSync(fixturePath)) {
      return readFileSync(fixturePath, 'utf8');
    }

    // Default inline fallback if fixture missing
    return [
      'sample_id,actual,prediction,probability',
      'id_1,1,1,0.92',
      'id_2,0,0,0.08',
      'id_3,1,0,0.41',
      'id_4,0,1,0.67',
    ].join('\n');
  }

  async evaluateBatch(
    ruleId: string,
    organizationId: string,
    batchCsvContent: string,
    batchName: string = 'production_batch.csv'
  ): Promise<MonitorEvaluationResult> {
    const rule = this.rules.get(ruleId);
    if (!rule || rule.organizationId !== organizationId) {
      throw notFound(`Monitor rule '${ruleId}' not found`, 'RULE_NOT_FOUND');
    }

    const refCsv = this.resolveReferenceCsv(rule);
    const referenceDataset = ingestEvaluationCsv(refCsv, rule.referenceFixtureName ?? 'reference.csv', {
      columnMapping: rule.columnMapping,
      labels: rule.labels,
    });

    const batchDataset = ingestEvaluationCsv(batchCsvContent, batchName, {
      columnMapping: rule.columnMapping,
      labels: rule.labels,
    });

    const output = evaluateMonitorRule({
      batchName,
      referenceDataset,
      batchDataset,
      rule,
    });

    // Save generated alerts into ledger & record audit events
    for (const alert of output.alerts) {
      this.alerts.set(alert.id, alert);

      await recordAuditEvent({
        organizationId,
        actorId: 'monitor_worker',
        action: 'MONITOR_ALERT_TRIGGERED',
        objectType: 'monitor_alert',
        objectId: alert.id,
        metadata: {
          ruleId: rule.id,
          ruleName: rule.name,
          metric: alert.metric,
          column: alert.column,
          observedValue: alert.observedValue,
          threshold: alert.threshold,
          severity: alert.severity,
          batchName,
        },
      });
    }

    const hasCritical = output.alerts.some((a) => a.severity === 'critical');
    const hasWarning = output.alerts.some((a) => a.severity === 'warning');
    const status = hasCritical ? 'critical' : hasWarning ? 'warning' : 'healthy';

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      batchName,
      timestamp: new Date().toISOString(),
      batchSamples: batchDataset.rows.length,
      referenceSamples: referenceDataset.rows.length,
      metricsEvaluated: output.metrics,
      alerts: output.alerts,
      suppressedAlertsCount: output.suppressedCount,
      status,
    };
  }

  async listAlerts(
    organizationId: string,
    options: { projectId?: string; severity?: string; acknowledged?: boolean } = {}
  ): Promise<MonitorAlert[]> {
    const results: MonitorAlert[] = [];
    for (const a of this.alerts.values()) {
      if (a.organizationId !== organizationId) continue;
      if (options.projectId && a.projectId !== options.projectId) continue;
      if (options.severity && a.severity !== options.severity) continue;
      if (options.acknowledged !== undefined && a.acknowledged !== options.acknowledged) continue;
      results.push(a);
    }
    return results.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  }

  async acknowledgeAlert(
    alertId: string,
    organizationId: string,
    acknowledgedBy: string
  ): Promise<MonitorAlert> {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.organizationId !== organizationId) {
      throw notFound(`Alert '${alertId}' not found`, 'ALERT_NOT_FOUND');
    }

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date().toISOString();
    this.alerts.set(alertId, alert);

    await recordAuditEvent({
      organizationId,
      actorId: acknowledgedBy,
      action: 'MONITOR_ALERT_ACKNOWLEDGED',
      objectType: 'monitor_alert',
      objectId: alertId,
      metadata: {
        ruleId: alert.ruleId,
        ruleName: alert.ruleName,
        metric: alert.metric,
        acknowledgedAt: alert.acknowledgedAt,
      },
    });

    return alert;
  }

  resetForTesting(): void {
    this.rules.clear();
    this.alerts.clear();
  }
}

// Global Singleton Monitor Engine
let globalMonitorEngine: MonitorEngine | null = null;

export function getMonitorEngine(): MonitorEngine {
  if (!globalMonitorEngine) {
    globalMonitorEngine = new MonitorEngine();
  }
  return globalMonitorEngine;
}

export function setMonitorEngineForTest(engine: MonitorEngine | null): void {
  globalMonitorEngine = engine;
}

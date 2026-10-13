import type { ColumnMapping } from '../../core/diagnostics/evaluation-ingestion.ts';

export type MetricType =
  | 'ks_drift'
  | 'psi'
  | 'wasserstein'
  | 'missingness_rate'
  | 'accuracy_drop'
  | 'recall_drop';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface MonitorCondition {
  metric: MetricType;
  column?: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte';
  threshold: number;
  severity: AlertSeverity;
}

export interface MonitorRule {
  id: string;
  organizationId: string;
  projectId: string;
  name: string;
  description?: string;
  enabled: boolean;
  referenceDatasetId?: string;
  referenceFixtureName?: string;
  referenceCsvContent?: string;
  columnMapping?: ColumnMapping;
  labels?: { positive: string; negative: string };
  conditions: MonitorCondition[];
  cooldownMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMonitorRuleParams {
  organizationId: string;
  projectId: string;
  name: string;
  description?: string;
  referenceDatasetId?: string;
  referenceFixtureName?: string;
  referenceCsvContent?: string;
  columnMapping?: ColumnMapping;
  labels?: { positive: string; negative: string };
  conditions: MonitorCondition[];
  cooldownMinutes?: number;
}

export interface MonitorAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  organizationId: string;
  projectId: string;
  severity: AlertSeverity;
  metric: MetricType;
  column?: string;
  observedValue: number;
  threshold: number;
  batchName: string;
  batchSamples: number;
  details: string;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export interface MonitorEvaluationResult {
  ruleId: string;
  ruleName: string;
  batchName: string;
  timestamp: string;
  batchSamples: number;
  referenceSamples: number;
  metricsEvaluated: Record<string, number>;
  alerts: MonitorAlert[];
  suppressedAlertsCount: number;
  status: 'healthy' | 'warning' | 'critical';
}

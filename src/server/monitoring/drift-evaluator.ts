import type { EvaluationDataset } from '../../core/diagnostics/evaluation-ingestion.ts';
import type { MonitorRule, MonitorCondition, MonitorAlert, MetricType } from './types.ts';
import { createId } from '../../core/domain/primitives.ts';
import { getAlertDeduplicator } from './alert-deduplicator.ts';

export interface EvaluatorOptions {
  batchName: string;
  referenceDataset: EvaluationDataset;
  batchDataset: EvaluationDataset;
  rule: MonitorRule;
}

export interface EvaluationOutput {
  metrics: Record<string, number>;
  alerts: MonitorAlert[];
  suppressedCount: number;
}

/** Extracts column cells as array of string or null */
function extractColumnCells(dataset: EvaluationDataset, column: string): (string | null)[] {
  if (column === 'y_true') return dataset.rows.map((r) => r.actual);
  if (column === 'y_pred') return dataset.rows.map((r) => r.predicted);
  if (column === 'y_probability') return dataset.rows.map((r) => (r.positiveProbability !== null ? String(r.positiveProbability) : null));
  return dataset.rows.map((r) => r.attributes[column] ?? null);
}

/** Computes KS two-sample statistic and Wasserstein-1 distance between two numeric arrays */
function computeContinuousStats(a: number[], b: number[]): { ks: number; wasserstein: number } {
  if (a.length === 0 || b.length === 0) return { ks: 0, wasserstein: 0 };

  const x = [...a].sort((i, j) => i - j);
  const y = [...b].sort((i, j) => i - j);

  let i = 0;
  let j = 0;
  let previous = Math.min(x[0], y[0]);
  let distance = 0;
  let maximum = 0;

  while (i < x.length || j < y.length) {
    const next = Math.min(i < x.length ? x[i] : Infinity, j < y.length ? y[j] : Infinity);
    const gap = Math.abs(i / x.length - j / y.length);
    if (gap) distance += next * gap - previous * gap;
    while (i < x.length && x[i] === next) i++;
    while (j < y.length && y[j] === next) j++;
    maximum = Math.max(maximum, Math.abs(i / x.length - j / y.length));
    previous = next;
  }

  return {
    ks: maximum,
    wasserstein: distance,
  };
}

/** Computes Population Stability Index (PSI) with 10 bins and pseudocount smoothing */
function computePsi(a: number[], b: number[], bins: number = 10): number {
  if (a.length === 0 || b.length === 0) return 0;
  const min = Math.min(...a);
  const max = Math.max(...a);
  if (min === max) return 0;

  const cuts: number[] = [];
  for (let i = 1; i < bins; i++) {
    const t = i / bins;
    const cut = min * (1 - t) + max * t;
    if (cut > min && cut < max) cuts.push(cut);
  }

  const ac = Array(cuts.length + 1).fill(0);
  const bc = Array(cuts.length + 1).fill(0);

  const getBin = (val: number) => {
    let idx = 0;
    while (idx < cuts.length && val >= cuts[idx]) idx++;
    return idx;
  };

  for (const v of a) ac[getBin(v)]++;
  for (const v of b) bc[getBin(v)]++;

  const k = ac.length;
  let psi = 0;
  for (let idx = 0; idx < k; idx++) {
    const p = (ac[idx] + 0.5) / (a.length + 0.5 * k);
    const q = (bc[idx] + 0.5) / (b.length + 0.5 * k);
    psi += (p - q) * Math.log(p / q);
  }

  return Math.max(0, psi);
}

/** Evaluates condition boolean operator */
function isConditionTriggered(observed: number, operator: MonitorCondition['operator'], threshold: number): boolean {
  switch (operator) {
    case 'gt':
      return observed > threshold;
    case 'gte':
      return observed >= threshold;
    case 'lt':
      return observed < threshold;
    case 'lte':
      return observed <= threshold;
    default:
      return false;
  }
}

export function evaluateMonitorRule(options: EvaluatorOptions): EvaluationOutput {
  const { batchName, referenceDataset, batchDataset, rule } = options;
  const metrics: Record<string, number> = {};
  const alerts: MonitorAlert[] = [];
  let suppressedCount = 0;

  const deduplicator = getAlertDeduplicator();
  const now = new Date().toISOString();

  // Evaluate conditions
  for (const cond of rule.conditions) {
    const col = cond.column ?? 'y_probability';
    const metricKey = `${cond.metric}:${col}`;

    let observedValue = 0;

    if (cond.metric === 'ks_drift' || cond.metric === 'wasserstein' || cond.metric === 'psi') {
      const refCells = extractColumnCells(referenceDataset, col)
        .filter((c): c is string => c !== null && c.trim() !== '')
        .map(Number)
        .filter((n) => !Number.isNaN(n));

      const batchCells = extractColumnCells(batchDataset, col)
        .filter((c): c is string => c !== null && c.trim() !== '')
        .map(Number)
        .filter((n) => !Number.isNaN(n));

      if (cond.metric === 'ks_drift') {
        const stats = computeContinuousStats(refCells, batchCells);
        observedValue = stats.ks;
      } else if (cond.metric === 'wasserstein') {
        const stats = computeContinuousStats(refCells, batchCells);
        observedValue = stats.wasserstein;
      } else if (cond.metric === 'psi') {
        observedValue = computePsi(refCells, batchCells);
      }
    } else if (cond.metric === 'missingness_rate') {
      // Fraction of missing / null / empty cells in batch for specified column
      const total = batchDataset.rows.length;
      if (total > 0) {
        const missingCount = extractColumnCells(batchDataset, col).filter(
          (c) => c === null || c.trim() === ''
        ).length;
        observedValue = missingCount / total;
      }
    } else if (cond.metric === 'accuracy_drop') {
      // Computes reference accuracy minus batch accuracy (if batch contains actuals)
      const hasLabels = batchDataset.rows.every((r) => r.actual !== null);
      if (hasLabels) {
        const refAcc =
          referenceDataset.rows.filter((r) => r.actual === r.predicted).length /
          referenceDataset.rows.length;
        const batchAcc =
          batchDataset.rows.filter((r) => r.actual === r.predicted).length /
          batchDataset.rows.length;
        observedValue = Math.max(0, refAcc - batchAcc);
      }
    } else if (cond.metric === 'recall_drop') {
      const posLabel = referenceDataset.labels.positive;
      const refPositives = referenceDataset.rows.filter((r) => r.actual === posLabel);
      const batchPositives = batchDataset.rows.filter((r) => r.actual === posLabel);

      if (refPositives.length > 0 && batchPositives.length > 0) {
        const refRecall =
          refPositives.filter((r) => r.predicted === posLabel).length / refPositives.length;
        const batchRecall =
          batchPositives.filter((r) => r.predicted === posLabel).length / batchPositives.length;
        observedValue = Math.max(0, refRecall - batchRecall);
      }
    }

    metrics[metricKey] = Number(observedValue.toFixed(4));

    // Check if condition threshold is breached
    if (isConditionTriggered(observedValue, cond.operator, cond.threshold)) {
      // Check deduplicator cooldown
      const isSuppressed = deduplicator.shouldSuppress(
        rule.organizationId,
        rule.id,
        cond.metric,
        cond.column,
        rule.cooldownMinutes
      );

      if (isSuppressed) {
        suppressedCount++;
      } else {
        // Record alert
        deduplicator.recordAlert(rule.organizationId, rule.id, cond.metric, cond.column);

        const alert: MonitorAlert = {
          id: createId('alert'),
          ruleId: rule.id,
          ruleName: rule.name,
          organizationId: rule.organizationId,
          projectId: rule.projectId,
          severity: cond.severity,
          metric: cond.metric,
          column: cond.column,
          observedValue: Number(observedValue.toFixed(4)),
          threshold: cond.threshold,
          batchName,
          batchSamples: batchDataset.rows.length,
          details: `Monitor Rule '${rule.name}' triggered: ${cond.metric} on column '${col}' observed ${observedValue.toFixed(4)} (${cond.operator} threshold ${cond.threshold}).`,
          timestamp: now,
          acknowledged: false,
        };

        alerts.push(alert);
      }
    }
  }

  return {
    metrics,
    alerts,
    suppressedCount,
  };
}

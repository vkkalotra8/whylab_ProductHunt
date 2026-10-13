/**
 * WhyLab 3.0 — Comprehensive Data Quality & Unsupervised Dataset Profiler.
 * Evaluates completeness, uniqueness, distribution validity, class balance,
 * and feature-target statistical association without requiring model predictions.
 */

import type { EvaluationDataset } from './evaluation-ingestion.ts';

export interface ColumnMissingStats {
  column: string;
  missingCount: number;
  missingRate: number;
}

export interface NumericDistributionStats {
  name: string;
  min: number;
  max: number;
  mean: number;
  std: number;
  iqr: number;
  q1: number;
  q3: number;
  outliersIqrCount: number;
  outliersZCount: number;
}

export interface CategoricalDistributionStats {
  name: string;
  distinctCount: number;
  isHighCardinality: boolean;
  topValues: Array<{ value: string; count: number; percentage: number }>;
}

export interface FeatureAssociation {
  feature: string;
  method: 'cramers_v' | 'correlation_ratio' | 'contingency';
  score: number;
  potentialLeakage: boolean;
  notes: string;
}

export interface DataQualityAuditResult {
  datasetId: string;
  sourceName: string;
  rowCount: number;
  columnCount: number;
  completeness: {
    overallMissingRate: number;
    columnMissing: ColumnMissingStats[];
    emptyColumns: string[];
    highMissingColumns: string[];
  };
  uniqueness: {
    duplicateRowCount: number;
    duplicatePercentage: number;
    hasDuplicates: boolean;
    candidateKeyColumns: string[];
  };
  distributions: {
    numericColumns: NumericDistributionStats[];
    categoricalColumns: CategoricalDistributionStats[];
    constantColumns: string[];
  };
  classBalance: {
    targetColumn: string | null;
    classes: Array<{ label: string; count: number; prevalence: number }>;
    imbalanceRatio: number;
    isSevereImbalance: boolean;
  } | null;
  associations: FeatureAssociation[];
  readiness: {
    score: number; // 0 - 100
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    findings: string[];
    recommendations: string[];
  };
}

/**
 * Computes deterministic data quality audit across any tabular evaluation dataset.
 */
export function auditDataQuality(dataset: EvaluationDataset): DataQualityAuditResult {
  const rowCount = dataset.rows.length;
  const columns = dataset.metadata.columns;
  const targetCol = dataset.metadata.targetColumn;
  const predCol = dataset.metadata.predictionColumn;
  const probCol = dataset.metadata.probabilityColumn;

  // 1. Completeness Analysis
  let totalCells = 0;
  let totalMissingCells = 0;
  const columnMissing: ColumnMissingStats[] = [];
  const emptyColumns: string[] = [];
  const highMissingColumns: string[] = [];

  for (const col of columns) {
    let colMissing = 0;
    for (const r of dataset.rows) {
      totalCells++;
      let val: string | null = null;
      if (col === targetCol) val = r.actual;
      else if (col === predCol) val = r.predicted;
      else if (col === probCol) val = r.positiveProbability !== null ? String(r.positiveProbability) : null;
      else val = r.attributes[col] ?? null;

      if (val === null || val === '' || val === 'N/A' || val === 'null' || val === 'NaN') {
        colMissing++;
        totalMissingCells++;
      }
    }

    const missingRate = rowCount > 0 ? colMissing / rowCount : 0;
    columnMissing.push({ column: col, missingCount: colMissing, missingRate });

    if (colMissing === rowCount && rowCount > 0) {
      emptyColumns.push(col);
    } else if (missingRate >= 0.4) {
      highMissingColumns.push(col);
    }
  }

  const overallMissingRate = totalCells > 0 ? totalMissingCells / totalCells : 0;

  // 2. Uniqueness Analysis
  const rowFingerprints = new Map<string, number>();
  for (const r of dataset.rows) {
    const parts = columns.map((col) => {
      if (col === targetCol) return r.actual ?? '';
      if (col === predCol) return r.predicted ?? '';
      if (col === probCol) return r.positiveProbability ?? '';
      return r.attributes[col] ?? '';
    });
    const fp = parts.join('\x1F');
    rowFingerprints.set(fp, (rowFingerprints.get(fp) ?? 0) + 1);
  }

  let duplicateRowCount = 0;
  for (const count of rowFingerprints.values()) {
    if (count > 1) {
      duplicateRowCount += count - 1;
    }
  }
  const duplicatePercentage = rowCount > 0 ? duplicateRowCount / rowCount : 0;
  const hasDuplicates = duplicateRowCount > 0;

  const candidateKeyColumns: string[] = [];
  for (const col of columns) {
    const vals = new Set<string>();
    let allNonNull = true;
    for (const r of dataset.rows) {
      const v = col === targetCol ? r.actual : col === predCol ? r.predicted : r.attributes[col];
      if (v === null || v === '') {
        allNonNull = false;
        break;
      }
      vals.add(v);
    }
    if (allNonNull && vals.size === rowCount && rowCount > 1) {
      candidateKeyColumns.push(col);
    }
  }

  // 3. Distribution & Type Analysis
  const numericColumns: NumericDistributionStats[] = [];
  const categoricalColumns: CategoricalDistributionStats[] = [];
  const constantColumns: string[] = [];

  for (const col of columns) {
    if (col === predCol || col === probCol) continue;

    const rawVals: string[] = [];
    for (const r of dataset.rows) {
      const v = col === targetCol ? r.actual : r.attributes[col];
      if (v !== null && v !== '' && v !== 'N/A' && v !== 'null') {
        rawVals.push(v);
      }
    }

    if (rawVals.length === 0) continue;

    const distinctCount = new Set(rawVals).size;
    if (distinctCount === 1) {
      constantColumns.push(col);
    }

    const isNumeric = rawVals.every((v) => !isNaN(Number(v)));
    if (isNumeric && rawVals.length >= 4) {
      const nums = rawVals.map(Number).sort((a, b) => a - b);
      const min = nums[0];
      const max = nums[nums.length - 1];
      const sum = nums.reduce((a, b) => a + b, 0);
      const mean = sum / nums.length;
      const variance = nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (nums.length - 1 || 1);
      const std = Math.sqrt(variance);

      // Quantiles
      const q1Index = Math.floor(nums.length * 0.25);
      const q3Index = Math.floor(nums.length * 0.75);
      const q1 = nums[q1Index];
      const q3 = nums[q3Index];
      const iqr = q3 - q1;
      const lowerFence = q1 - 1.5 * iqr;
      const upperFence = q3 + 1.5 * iqr;

      let outliersIqrCount = 0;
      let outliersZCount = 0;
      for (const val of nums) {
        if (val < lowerFence || val > upperFence) outliersIqrCount++;
        if (std > 0 && Math.abs((val - mean) / std) > 3.0) outliersZCount++;
      }

      numericColumns.push({
        name: col,
        min,
        max,
        mean: Math.round(mean * 1000) / 1000,
        std: Math.round(std * 1000) / 1000,
        q1,
        q3,
        iqr,
        outliersIqrCount,
        outliersZCount,
      });
    } else {
      const freq = new Map<string, number>();
      for (const v of rawVals) {
        freq.set(v, (freq.get(v) ?? 0) + 1);
      }
      const sorted = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([val, cnt]) => ({
          value: val,
          count: cnt,
          percentage: Math.round((cnt / rawVals.length) * 1000) / 10,
        }));

      categoricalColumns.push({
        name: col,
        distinctCount,
        isHighCardinality: distinctCount > 50 && distinctCount > rawVals.length * 0.4,
        topValues: sorted,
      });
    }
  }

  // 4. Class Balance Analysis
  let classBalance: DataQualityAuditResult['classBalance'] = null;
  if (targetCol) {
    const targetCounts = new Map<string, number>();
    let validTargets = 0;
    for (const r of dataset.rows) {
      if (r.actual !== null && r.actual !== '') {
        targetCounts.set(r.actual, (targetCounts.get(r.actual) ?? 0) + 1);
        validTargets++;
      }
    }

    if (validTargets > 0) {
      const classes = Array.from(targetCounts.entries()).map(([label, cnt]) => ({
        label,
        count: cnt,
        prevalence: Math.round((cnt / validTargets) * 1000) / 1000,
      }));

      classes.sort((a, b) => b.count - a.count);
      const majorityCount = classes[0]?.count ?? 1;
      const minorityCount = classes[classes.length - 1]?.count ?? 1;
      const imbalanceRatio = Math.round((majorityCount / minorityCount) * 10) / 10;
      const minPrev = classes[classes.length - 1]?.prevalence ?? 0.5;

      classBalance = {
        targetColumn: targetCol,
        classes,
        imbalanceRatio,
        isSevereImbalance: imbalanceRatio > 9.0 || minPrev < 0.1,
      };
    }
  }

  // 5. Feature-Target Association Screening
  const associations: FeatureAssociation[] = [];
  if (targetCol && dataset.rows.length >= 10) {
    const candidateFeatures = columns.filter(
      (c) => c !== targetCol && c !== predCol && c !== probCol && c !== 'id'
    );

    for (const feat of candidateFeatures) {
      const pairs = dataset.rows
        .map((r) => ({ feat: r.attributes[feat] ?? null, target: r.actual }))
        .filter((p): p is { feat: string; target: string } => p.feat !== null && p.target !== null);

      if (pairs.length < 10) continue;

      // Contingency & Cramer's V calculation
      const featLevels = Array.from(new Set(pairs.map((p) => p.feat)));
      const targetLevels = Array.from(new Set(pairs.map((p) => p.target)));

      if (featLevels.length < 2 || targetLevels.length < 2) continue;

      const matrix: Record<string, Record<string, number>> = {};
      const rowTotals: Record<string, number> = {};
      const colTotals: Record<string, number> = {};

      for (const p of pairs) {
        matrix[p.feat] = matrix[p.feat] ?? {};
        matrix[p.feat][p.target] = (matrix[p.feat][p.target] ?? 0) + 1;
        rowTotals[p.feat] = (rowTotals[p.feat] ?? 0) + 1;
        colTotals[p.target] = (colTotals[p.target] ?? 0) + 1;
      }

      let chiSq = 0;
      const n = pairs.length;
      for (const f of featLevels) {
        for (const t of targetLevels) {
          const observed = matrix[f]?.[t] ?? 0;
          const expected = (rowTotals[f] * colTotals[t]) / n;
          if (expected > 0) {
            chiSq += (observed - expected) ** 2 / expected;
          }
        }
      }

      const minDim = Math.min(featLevels.length - 1, targetLevels.length - 1);
      const cramersV = minDim > 0 ? Math.sqrt(chiSq / (n * minDim)) : 0;
      const boundedV = Math.min(1.0, Math.max(0.0, cramersV));
      const potentialLeakage = boundedV >= 0.98;

      associations.push({
        feature: feat,
        method: 'cramers_v',
        score: Math.round(boundedV * 1000) / 1000,
        potentialLeakage,
        notes: potentialLeakage
          ? `Near-perfect association (${boundedV.toFixed(3)}) with target "${targetCol}". Audit feature provenance for target proxy leakage.`
          : `Cramer's V association = ${boundedV.toFixed(3)}. Statistical correlation without causal assumption.`,
      });
    }

    associations.sort((a, b) => b.score - a.score);
  }

  // 6. Data Readiness Score & Findings Synthesis
  let score = 100;
  const findings: string[] = [];
  const recommendations: string[] = [];

  if (overallMissingRate > 0) {
    const penalty = Math.min(30, Math.round(overallMissingRate * 60));
    score -= penalty;
    findings.push(
      `Dataset has ${(overallMissingRate * 100).toFixed(1)}% overall missing values across columns.`
    );
  }

  if (emptyColumns.length > 0) {
    score -= emptyColumns.length * 10;
    findings.push(`Contains ${emptyColumns.length} completely empty column(s): [${emptyColumns.join(', ')}].`);
    recommendations.push(`Remove or drop unpopulated empty columns: [${emptyColumns.join(', ')}].`);
  }

  if (highMissingColumns.length > 0) {
    findings.push(
      `Contains ${highMissingColumns.length} column(s) with > 40% missingness: [${highMissingColumns.join(', ')}].`
    );
    recommendations.push(
      `Apply targeted imputation or consider excluding sparse columns [${highMissingColumns.join(', ')}].`
    );
  }

  if (duplicateRowCount > 0) {
    const dupPenalty = Math.min(20, Math.round(duplicatePercentage * 50));
    score -= Math.max(5, dupPenalty);
    findings.push(
      `Detected ${duplicateRowCount} identical duplicate record(s) (${(duplicatePercentage * 100).toFixed(1)}% of rows).`
    );
    recommendations.push(`Deduplicate the ${duplicateRowCount} repeated rows to prevent observation weight distortion.`);
  }

  if (constantColumns.length > 0) {
    score -= constantColumns.length * 5;
    findings.push(`Contains ${constantColumns.length} zero-variance constant column(s): [${constantColumns.join(', ')}].`);
    recommendations.push(`Exclude zero-variance constant features [${constantColumns.join(', ')}] before modeling.`);
  }

  if (classBalance && classBalance.isSevereImbalance) {
    score -= 10;
    const minCls = classBalance.classes[classBalance.classes.length - 1];
    findings.push(
      `Severe class imbalance: minority class "${minCls?.label}" has only ${(minCls?.prevalence ? minCls.prevalence * 100 : 0).toFixed(1)}% prevalence (imbalance ratio ${classBalance.imbalanceRatio}:1).`
    );
    recommendations.push(
      `Prepare class reweighting, focal loss, or stratified sampling to protect minority class detection under severe imbalance.`
    );
  }

  const leakageSignals = associations.filter((a) => a.potentialLeakage);
  if (leakageSignals.length > 0) {
    score -= 15;
    findings.push(
      `Potential data leakage / proxy target detected in feature(s): [${leakageSignals.map((l) => l.feature).join(', ')}].`
    );
    recommendations.push(
      `Conduct an engineering audit on [${leakageSignals.map((l) => l.feature).join(', ')}] to confirm values are known at prediction time.`
    );
  }

  // Model predictions status
  if (!predCol) {
    findings.push('Dataset contains no model predictions (y_pred absent).');
    recommendations.push(
      'Export and upload model inference predictions or probability scores to unlock classification reliability metrics, calibration curves, and Repair Lab policy tuning.'
    );
  }

  score = Math.max(10, Math.min(100, score));
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

  return {
    datasetId: dataset.metadata.id,
    sourceName: dataset.metadata.name,
    rowCount,
    columnCount: columns.length,
    completeness: {
      overallMissingRate,
      columnMissing,
      emptyColumns,
      highMissingColumns,
    },
    uniqueness: {
      duplicateRowCount,
      duplicatePercentage,
      hasDuplicates,
      candidateKeyColumns,
    },
    distributions: {
      numericColumns,
      categoricalColumns,
      constantColumns,
    },
    classBalance,
    associations,
    readiness: {
      score,
      grade,
      findings,
      recommendations,
    },
  };
}

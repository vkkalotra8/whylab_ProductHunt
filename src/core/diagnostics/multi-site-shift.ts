import type { EvaluationDataset, EvaluationRow } from './evaluation-ingestion.ts';
import { runDriftTests } from './drift-tests.ts';
import { computeClassificationMetrics } from './classification-metrics.ts';
import { createId, type Id } from '../domain/primitives.ts';

export interface MultiSiteShiftOptions {
  /** Metadata column to partition by (defaults to detecting 'site', 'environment', 'device', or 'group') */
  column?: string;
  /** Minimum sample size per site to avoid high variance warning (default: 30) */
  sampleSizeFloor?: number;
  /** Number of bins to use for PSI drift calculation (default: 10) */
  bins?: number;
  /** Designation of reference/baseline site (defaults to largest sample size site) */
  referenceSite?: string;
}

export interface SiteSummary {
  site: string;
  sampleSize: number;
  sampleSizeProtected: boolean;
  accuracy: number | null;
  recall: number | null;
  precision: number | null;
  specificity: number | null;
  brierScore: number | null;
  balancedAccuracy: number | null;
}

export interface SitePairDrift {
  siteA: string;
  siteB: string;
  feature: string;
  ksStatistic: number | null;
  psiStatistic: number | null;
  wassersteinDistance: number | null;
  driftLevel: 'none' | 'moderate' | 'severe';
  sampleSizeProtected: boolean;
  sampleSizeA: number;
  sampleSizeB: number;
  limitations: string[];
}

export interface SiteDisparity {
  metric: string;
  baselineSite: string;
  comparisonSite: string;
  baselineValue: number | null;
  comparisonValue: number | null;
  disparityPp: number | null;
  alertLevel: 'nominal' | 'warning' | 'critical';
  sampleSizeProtected: boolean;
  caveat?: string;
}

export interface MultiSiteShiftReport {
  column: string;
  sampleSizeFloor: number;
  referenceSite: string;
  sites: SiteSummary[];
  pairwiseDrift: SitePairDrift[];
  disparities: SiteDisparity[];
  floorViolations: Array<{ site: string; sampleSize: number; floor: number }>;
  summary: string;
}

function detectPartitionColumn(data: EvaluationDataset, requested?: string): string | null {
  if (requested && data.metadata.columns.includes(requested)) {
    return requested;
  }
  const preferred = ['site', 'environment', 'device', 'group'];
  for (const candidate of preferred) {
    if (data.metadata.columns.includes(candidate)) {
      return candidate;
    }
  }
  // Check any attribute column with 2 to 20 distinct values
  for (const col of data.metadata.columns) {
    if (['y_true', 'y_pred', 'y_probability'].includes(col)) continue;
    const values = new Set<string>();
    for (const r of data.rows) {
      const val = r.attributes[col];
      if (val !== null && val !== undefined) values.add(val);
      if (values.size > 20) break;
    }
    if (values.size >= 2 && values.size <= 20) {
      return col;
    }
  }
  return null;
}

function createPartitionDataset(
  parent: EvaluationDataset,
  partitionName: string,
  rows: EvaluationRow[]
): EvaluationDataset {
  const partitionId: Id<'dataset'> = createId('dataset');
  const sourceId: Id<'source'> = createId('source');

  return {
    schemaVersion: 1,
    metadata: {
      id: partitionId,
      sourceId,
      name: `${parent.metadata.name} [${partitionName}]`,
      rowCount: rows.length,
      columns: [...parent.metadata.columns],
      role: parent.metadata.role,
      task: parent.metadata.task,
      targetColumn: parent.metadata.targetColumn,
      predictionColumn: parent.metadata.predictionColumn,
      probabilityColumn: parent.metadata.probabilityColumn,
      positiveLabel: parent.metadata.positiveLabel,
    },
    source: {
      id: sourceId,
      kind: 'fixture',
      name: `${parent.source.name} [${partitionName}]`,
      capturedAt: parent.source.capturedAt,
      contentDigest: null,
    },
    labels: { ...parent.labels },
    rows: rows.map((r, idx) => ({
      ...r,
      sourceRow: idx + 1,
    })),
    warnings: [...parent.warnings],
  };
}

/**
 * Deterministically analyzes multi-site / multi-environment performance disparities
 * and distribution shift (KS, PSI, Wasserstein) with explicit sample size protection floors.
 */
export function analyzeMultiSiteShift(
  data: EvaluationDataset,
  options: MultiSiteShiftOptions = {}
): MultiSiteShiftReport {
  const column = detectPartitionColumn(data, options.column);
  const floor = options.sampleSizeFloor ?? 30;
  const psiBins = options.bins ?? 10;

  if (!column) {
    return {
      column: options.column ?? 'none',
      sampleSizeFloor: floor,
      referenceSite: 'overall',
      sites: [],
      pairwiseDrift: [],
      disparities: [],
      floorViolations: [],
      summary: 'No valid partitioning metadata column (site, environment, device, group) found.',
    };
  }

  // Group rows by partition column
  const groups = new Map<string, EvaluationRow[]>();
  for (const row of data.rows) {
    const raw = row.attributes[column];
    if (raw === null || raw === undefined || !raw.trim()) continue;
    const group = groups.get(raw) ?? [];
    group.push(row);
    groups.set(raw, group);
  }

  const siteNames = [...groups.keys()].sort();
  if (siteNames.length === 0) {
    return {
      column,
      sampleSizeFloor: floor,
      referenceSite: 'none',
      sites: [],
      pairwiseDrift: [],
      disparities: [],
      floorViolations: [],
      summary: `Column "${column}" contains no populated values across ${data.rows.length} rows.`,
    };
  }

  // 1. Calculate per-site summaries
  const sites: SiteSummary[] = [];
  const floorViolations: Array<{ site: string; sampleSize: number; floor: number }> = [];

  for (const siteName of siteNames) {
    const rows = groups.get(siteName)!;
    const isProtected = rows.length < floor;
    if (isProtected) {
      floorViolations.push({ site: siteName, sampleSize: rows.length, floor });
    }

    const metricsReport = computeClassificationMetrics({ labels: data.labels, rows });
    const getMetric = (name: string): number | null => {
      const m = metricsReport.output.metrics.find((x) => x.name === name);
      return m && m.status === 'measured' ? m.value : null;
    };

    sites.push({
      site: siteName,
      sampleSize: rows.length,
      sampleSizeProtected: isProtected,
      accuracy: getMetric('accuracy'),
      recall: getMetric('recall'),
      precision: getMetric('precision'),
      specificity: getMetric('specificity'),
      brierScore: getMetric('brier_score'),
      balancedAccuracy: getMetric('balanced_accuracy'),
    });
  }

  // 2. Select reference site (specified or largest sample size)
  let refSiteName = options.referenceSite;
  if (!refSiteName || !groups.has(refSiteName)) {
    const sortedBySize = [...sites].sort((a, b) => b.sampleSize - a.sampleSize);
    refSiteName = sortedBySize[0]?.site ?? siteNames[0];
  }
  const refSummary = sites.find((s) => s.site === refSiteName) ?? sites[0];

  // 3. Calculate performance disparities vs reference site
  const disparities: SiteDisparity[] = [];
  for (const site of sites) {
    if (site.site === refSiteName) continue;

    const isProtected = site.sampleSizeProtected || refSummary.sampleSizeProtected;
    const caveat = isProtected
      ? `Sample size protection floor active: ${site.site} (N=${site.sampleSize}) or ${refSiteName} (N=${refSummary.sampleSize}) is below floor ${floor}.`
      : undefined;

    const diffMetric = (
      name: string,
      valA: number | null,
      valB: number | null
    ) => {
      if (valA === null || valB === null) return;
      const diffPp = (valB - valA) * 100;
      const absDiff = Math.abs(diffPp);

      let alertLevel: SiteDisparity['alertLevel'] = 'nominal';
      if (name === 'accuracy' || name === 'recall') {
        if (absDiff >= 15) alertLevel = 'critical';
        else if (absDiff >= 5) alertLevel = 'warning';
      } else {
        if (absDiff >= 20) alertLevel = 'critical';
        else if (absDiff >= 10) alertLevel = 'warning';
      }

      disparities.push({
        metric: name,
        baselineSite: refSiteName,
        comparisonSite: site.site,
        baselineValue: valA,
        comparisonValue: valB,
        disparityPp: Number(diffPp.toFixed(2)),
        alertLevel,
        sampleSizeProtected: isProtected,
        caveat,
      });
    };

    diffMetric('accuracy', refSummary.accuracy, site.accuracy);
    diffMetric('recall', refSummary.recall, site.recall);
    diffMetric('precision', refSummary.precision, site.precision);
    diffMetric('specificity', refSummary.specificity, site.specificity);
  }

  // 4. Pairwise distribution drift tests (KS, PSI, Wasserstein)
  const pairwiseDrift: SitePairDrift[] = [];
  const partitionDatasets = new Map<string, EvaluationDataset>();
  for (const siteName of siteNames) {
    partitionDatasets.set(
      siteName,
      createPartitionDataset(data, siteName, groups.get(siteName)!)
    );
  }

  // Test y_probability and numeric columns
  const numericFeatures = ['y_probability'];

  for (let i = 0; i < siteNames.length; i++) {
    for (let j = i + 1; j < siteNames.length; j++) {
      const siteA = siteNames[i];
      const siteB = siteNames[j];
      const dsA = partitionDatasets.get(siteA)!;
      const dsB = partitionDatasets.get(siteB)!;
      const isProtected = dsA.rows.length < floor || dsB.rows.length < floor;

      for (const feature of numericFeatures) {
        let ksValue: number | null = null;
        let psiValue: number | null = null;
        let wassersteinValue: number | null = null;
        const limits: string[] = [];

        // KS Test
        try {
          const ksReport = runDriftTests(dsA, dsB, {
            referenceDatasetId: dsA.metadata.id,
            comparisonDatasetId: dsB.metadata.id,
            columns: [feature],
            method: 'ks',
            bins: null,
          });
          const ksStat = ksReport.output.comparisons[0]?.statistic;
          if (ksStat && ksStat.status === 'measured') {
            ksValue = ksStat.value;
          }
          if (ksReport.output.comparisons[0]?.limitations) {
            limits.push(...ksReport.output.comparisons[0].limitations);
          }
        } catch {
          // Handled gracefully
        }

        // PSI Test
        try {
          const psiReport = runDriftTests(dsA, dsB, {
            referenceDatasetId: dsA.metadata.id,
            comparisonDatasetId: dsB.metadata.id,
            columns: [feature],
            method: 'psi',
            bins: psiBins,
          });
          const psiStat = psiReport.output.comparisons[0]?.statistic;
          if (psiStat && psiStat.status === 'measured') {
            psiValue = psiStat.value;
          }
        } catch {
          // Handled gracefully
        }

        // Wasserstein Test
        try {
          const wReport = runDriftTests(dsA, dsB, {
            referenceDatasetId: dsA.metadata.id,
            comparisonDatasetId: dsB.metadata.id,
            columns: [feature],
            method: 'wasserstein',
            bins: null,
          });
          const wStat = wReport.output.comparisons[0]?.statistic;
          if (wStat && wStat.status === 'measured') {
            wassersteinValue = wStat.value;
          }
        } catch {
          // Handled gracefully
        }

        // Drift level classification
        let driftLevel: SitePairDrift['driftLevel'] = 'none';
        if ((ksValue !== null && ksValue >= 0.25) || (psiValue !== null && psiValue >= 0.25)) {
          driftLevel = 'severe';
        } else if ((ksValue !== null && ksValue >= 0.10) || (psiValue !== null && psiValue >= 0.10)) {
          driftLevel = 'moderate';
        }

        pairwiseDrift.push({
          siteA,
          siteB,
          feature,
          ksStatistic: ksValue !== null ? Number(ksValue.toFixed(4)) : null,
          psiStatistic: psiValue !== null ? Number(psiValue.toFixed(4)) : null,
          wassersteinDistance: wassersteinValue !== null ? Number(wassersteinValue.toFixed(4)) : null,
          driftLevel,
          sampleSizeProtected: isProtected,
          sampleSizeA: dsA.rows.length,
          sampleSizeB: dsB.rows.length,
          limitations: Array.from(new Set(limits)),
        });
      }
    }
  }

  // Summary message
  const criticalCount = disparities.filter((d) => d.alertLevel === 'critical').length;
  const severeDriftCount = pairwiseDrift.filter((d) => d.driftLevel === 'severe').length;
  let summary = `Analyzed ${sites.length} cohorts along "${column}". Baseline cohort is "${refSiteName}".`;
  if (criticalCount > 0) {
    summary += ` Detected ${criticalCount} critical performance disparity alerts (disparity >= 15 pp).`;
  }
  if (severeDriftCount > 0) {
    summary += ` Observed ${severeDriftCount} severe distribution drift measurements (KS/PSI >= 0.25).`;
  }
  if (floorViolations.length > 0) {
    summary += ` ${floorViolations.length} cohort(s) triggered sample size protection floor (N < ${floor}).`;
  }

  return {
    column,
    sampleSizeFloor: floor,
    referenceSite: refSiteName,
    sites,
    pairwiseDrift,
    disparities,
    floorViolations,
    summary,
  };
}

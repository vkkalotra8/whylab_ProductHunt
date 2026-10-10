import type { EvaluationDataset } from './evaluation-ingestion.ts';
import { profileEvaluationDataset } from './dataset-profiler.ts';
import { summarizeColumn } from './column-profile.ts';
import { toolSchemas, type ToolInput, type ToolOutput } from '../domain/tool-contracts.ts';
import { fail } from '../domain/schema.ts';

export type DriftReport = {
  output: ToolOutput<'run_drift_tests'>;
  psiConfiguration: {
    feature: string;
    kind: 'numeric' | 'categorical';
    cutPoints: number[];
    categories: string[];
    pseudocount: number;
  }[];
};

function cells(data: EvaluationDataset, name: string): (string | null)[] {
  return data.rows.map((r) =>
    name === 'y_true'
      ? r.actual
      : name === 'y_pred'
      ? r.predicted
      : name === 'y_probability'
      ? String(r.positiveProbability)
      : r.attributes[name]
  );
}

/** Empirical distribution measurements; no p-values or automatic drift/causality verdict. */
export function runDriftTests(
  reference: EvaluationDataset,
  comparison: EvaluationDataset,
  input: ToolInput<'run_drift_tests'>
): DriftReport {
  const request = toolSchemas.run_drift_tests.input.parse(input);

  if (
    request.referenceDatasetId === request.comparisonDatasetId ||
    request.referenceDatasetId !== reference.metadata.id ||
    request.comparisonDatasetId !== comparison.metadata.id
  ) {
    fail('$.datasetIds', 'provide distinct datasets matching the reference and comparison IDs');
  }

  profileEvaluationDataset(reference);
  profileEvaluationDataset(comparison);

  if (
    request.columns.some(
      (c) => !reference.metadata.columns.includes(c) || !comparison.metadata.columns.includes(c)
    )
  ) {
    fail('$.columns', 'selected columns must exist in both datasets');
  }

  if (
    request.columns.includes('y_probability') &&
    (reference.labels.positive !== comparison.labels.positive ||
      reference.labels.negative !== comparison.labels.negative)
  ) {
    fail('$.columns', 'probability comparisons require identical positive and negative class mappings');
  }

  if (request.method === 'psi' && request.bins === null) {
    fail('$.bins', 'PSI requires an explicit bin count');
  }

  const comparisons: ToolOutput<'run_drift_tests'>['comparisons'] = [];
  const psiConfiguration: DriftReport['psiConfiguration'] = [];

  for (const feature of request.columns) {
    const ar = cells(reference, feature),
      br = cells(comparison, feature);
    const a = ar.filter((v): v is string => v !== null),
      b = br.filter((v): v is string => v !== null);
    const numeric =
      !['y_true', 'y_pred'].includes(feature) &&
      summarizeColumn(a).numeric &&
      summarizeColumn(b).numeric;

    const limits = [
      `${ar.length - a.length} reference and ${br.length - b.length} comparison values are missing and excluded from this feature's measurement.`,
      'Reference and comparison must use compatible feature units and preprocessing; this is not verified automatically.',
      'Descriptive distribution difference only. No p-value, significance threshold, or causal verdict is produced.',
    ];
    if (a.length < 30 || b.length < 30) {
      limits.push(
        'At least one sample has fewer than 30 observations; small-sample estimates can be unstable (heuristic warning).'
      );
    }

    let value: number | null = null,
      reason = '';
    const unit =
      request.method === 'wasserstein'
        ? 'feature_units'
        : request.method === 'ks'
        ? 'ratio'
        : 'unitless';

    if (!a.length || !b.length) {
      reason = 'Both datasets need nonmissing observations for this feature.';
    } else if (request.method !== 'psi') {
      if (!numeric) {
        reason =
          'KS and Wasserstein require finite numeric values; categorical/mixed columns and class labels are unsupported.';
      } else {
        const x = a.map(Number).sort((a, b) => a - b),
          y = b.map(Number).sort((a, b) => a - b);
        let i = 0,
          j = 0,
          previous = Math.min(x[0], y[0]),
          distance = 0,
          maximum = 0;

        while (i < x.length || j < y.length) {
          const next = Math.min(i < x.length ? x[i] : Infinity, j < y.length ? y[j] : Infinity);
          const gap = Math.abs(i / x.length - j / y.length);
          if (gap) distance += next * gap - previous * gap;
          while (i < x.length && x[i] === next) i++;
          while (j < y.length && y[j] === next) j++;
          maximum = Math.max(maximum, Math.abs(i / x.length - j / y.length));
          previous = next;
        }
        value = request.method === 'ks' ? maximum : distance;
        limits.push(
          request.method === 'ks'
            ? 'KS statistic is the maximum absolute difference between empirical CDFs, with equal-valued observations advanced together.'
            : 'Wasserstein-1 is the integral of the absolute empirical CDF difference, in the original numeric feature units.'
        );
      }
    } else {
      const cuts: number[] = [],
        categories: string[] = [];
      let ac: number[] = [],
        bc: number[] = [];

      if (numeric) {
        const x = a.map(Number),
          y = b.map(Number),
          min = Math.min(...x),
          max = Math.max(...x);
        if (min === max) {
          reason =
            'Numeric PSI is undefined here because the reference range is constant; use KS or Wasserstein.';
        } else {
          for (let i = 1; i < request.bins!; i++) {
            const t = i / request.bins!,
              cut = min * (1 - t) + max * t;
            if (cut > min && cut < max && cut !== cuts.at(-1)) cuts.push(cut);
          }
          ac = Array(cuts.length + 1).fill(0);
          bc = Array(cuts.length + 1).fill(0);
          const index = (n: number) => {
            let i = 0;
            while (i < cuts.length && n >= cuts[i]) i++;
            return i;
          };
          for (const n of x) ac[index(n)]++;
          for (const n of y) bc[index(n)]++;
        }
      } else {
        categories.push(...[...new Set([...a, ...b])].sort());
        if (categories.length > 100) {
          reason = 'Categorical PSI supports at most 100 combined categories; provide coarser categories.';
        } else {
          const index = new Map(categories.map((c, i) => [c, i]));
          ac = Array(categories.length).fill(0);
          bc = Array(categories.length).fill(0);
          for (const c of a) ac[index.get(c)!]++;
          for (const c of b) bc[index.get(c)!]++;
        }
      }

      if (!reason) {
        const k = ac.length;
        value = 0;
        for (let i = 0; i < k; i++) {
          const p = (ac[i] + 0.5) / (a.length + 0.5 * k),
            q = (bc[i] + 0.5) / (b.length + 0.5 * k);
          value += (q - p) * Math.log(q / p);
        }
        psiConfiguration.push({
          feature,
          kind: numeric ? 'numeric' : 'categorical',
          cutPoints: cuts,
          categories,
          pseudocount: 0.5,
        });
        limits.push(
          'PSI uses natural logarithms and adds 0.5 to every bin count before normalization. Smoothing makes results sample-size dependent. No universal PSI cutoff is applied.'
        );
        limits.push(
          numeric
            ? 'Numeric PSI uses reference-range equal-width interior cuts; outer bins include all out-of-range comparison values. Interior boundaries belong to the upper bin.'
            : 'Categorical PSI uses the combined category set so unseen categories remain represented.'
        );
      }
    }

    if (value !== null && !Number.isFinite(value)) {
      value = null;
      reason = 'The statistic exceeds finite numeric range; rescale the feature units.';
    }

    comparisons.push({
      feature,
      method: request.method,
      referenceSize: a.length,
      comparisonSize: b.length,
      statistic:
        value === null
          ? { name: request.method, status: 'undefined', reason, unit, sampleSize: a.length + b.length }
          : {
              name: request.method,
              status: 'measured',
              value: Math.max(0, value),
              unit,
              sampleSize: a.length + b.length,
            },
      limitations: limits,
    });
  }

  return {
    output: toolSchemas.run_drift_tests.output.parse({ comparisons }),
    psiConfiguration,
  };
}

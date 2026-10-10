import { profileEvaluationDataset } from './dataset-profiler.ts';
import { summarizeColumn } from './column-profile.ts';
import { toolSchemas, type ToolInput, type ToolOutput } from '../domain/tool-contracts.ts';
import { evidenceSchema, type Evidence } from '../domain/types.ts';
import type { EvaluationDataset } from './evaluation-ingestion.ts';
import type { Measurement } from '../domain/primitives.ts';
import { fail } from '../domain/schema.ts';

export type LeakageReport = { output: ToolOutput<'scan_feature_leakage'>; limitations: string[] };

const measured = (
  name: string,
  value: number,
  unit: 'count' | 'ratio',
  sampleSize: number
): Measurement => ({ name, status: 'measured', value, unit, sampleSize });

function utc(value: string | null): number | null {
  if (value === null) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/);
  if (!match) return null;
  const canonical = match[1] + '.' + (match[2] ?? '').padEnd(3, '0') + 'Z';
  const time = Date.parse(canonical);
  return Number.isFinite(time) && new Date(time).toISOString() === canonical ? time : null;
}

/** Screening signals only. No CSV relationship independently confirms leakage. */
export function scanFeatureLeakage(
  data: EvaluationDataset,
  input: ToolInput<'scan_feature_leakage'>,
  assumptions: readonly Evidence[] = []
): LeakageReport {
  const request = toolSchemas.scan_feature_leakage.input.parse(input);
  profileEvaluationDataset(data, { datasetId: request.datasetId, targetColumn: request.targetColumn });

  if (request.targetColumn !== 'y_true') {
    fail('$.targetColumn', 'this binary evaluation scanner requires y_true as the target');
  }
  for (const name of request.featureColumns) {
    if (['y_true', 'y_pred', 'y_probability'].includes(name)) {
      fail('$.featureColumns', 'target and model output columns cannot be scanned as input features');
    }
    if (!data.metadata.columns.includes(name)) {
      fail('$.featureColumns', `unknown feature column: ${name}`);
    }
  }
  for (const name of [request.predictionTimeColumn, request.outcomeTimeColumn]) {
    if (
      name !== null &&
      (!data.metadata.columns.includes(name) || ['y_true', 'y_pred', 'y_probability'].includes(name))
    ) {
      fail('$.timeColumns', 'time columns must name optional metadata columns');
    }
  }
  if ((request.predictionTimeColumn === null) !== (request.outcomeTimeColumn === null)) {
    fail('$.timeColumns', 'supply both prediction and outcome time columns, or neither');
  }
  if (request.predictionTimeColumn !== null && request.predictionTimeColumn === request.outcomeTimeColumn) {
    fail('$.timeColumns', 'prediction and outcome time columns must differ');
  }

  for (const id of request.assumptionEvidenceIds) {
    const matches = assumptions.filter((e) => e.id === id);
    if (matches.length !== 1 || evidenceSchema.parse(matches[0]).kind !== 'assumption') {
      fail('$.assumptionEvidenceIds', 'provide each referenced user assumption exactly once');
    }
  }

  const observations: ToolOutput<'scan_feature_leakage'>['observations'] = [];
  const limitations = [
    'Screening rules identify review signals, not causality or confirmed leakage. No feature is removed and no model is retrained.',
    'Feature/target associations are descriptive in-sample measurements. Feature availability and intended prediction horizon require a provenance audit.',
    'No triggered rule does not establish that a dataset is leakage-free.',
  ];

  const add = (
    feature: string,
    classification: 'observation' | 'suspicion',
    method: string,
    description: string,
    measurements: Measurement[]
  ) =>
    observations.push({
      feature,
      classification,
      method,
      description,
      evidenceIds: [],
      measurements,
    });

  if (request.assumptionEvidenceIds.length) {
    limitations.push(
      'Referenced user assumptions were validated as context only; they are not independent confirmation and were not used to promote findings.'
    );
  }

  for (const feature of request.featureColumns) {
    const pairs = data.rows.flatMap((r) =>
      r.attributes[feature] === null ? [] : [{ value: r.attributes[feature]!, target: r.actual }]
    );
    const n = pairs.length;
    const summary = summarizeColumn(pairs.map((p) => p.value));
    const positive = pairs.filter((p) => p.target === data.labels.positive).length,
      negative = n - positive;
    const common = [
      measured('complete_pairs', n, 'count', data.rows.length),
      measured('missing_feature_rows', data.rows.length - n, 'count', data.rows.length),
    ];

    if (!n) {
      add(
        feature,
        'observation',
        'no_complete_pairs',
        'Feature is entirely missing; relationship checks could not run.',
        common
      );
      continue;
    }

    const copies = pairs.filter((p) => p.value === p.target).length;
    if (n >= 3 && copies === n) {
      add(
        feature,
        'observation',
        'exact_target_copy',
        `Feature equals y_true in all ${n} complete pairs; ${data.rows.length - n} feature values are missing.`,
        [...common, measured('target_match_fraction', 1, 'ratio', n)]
      );
      if (positive && negative) {
        add(
          feature,
          'suspicion',
          'target_copy_review',
          'An exact target copy across both classes warrants an availability audit. Confirm whether it existed before prediction.',
          common
        );
      }
    } else if (n >= 20 && positive >= 5 && negative >= 5 && copies * 100 >= 95 * n) {
      add(
        feature,
        'suspicion',
        'near_target_copy',
        'At least 95% exact target agreement across at least 20 complete pairs with at least five examples per class. This heuristic warrants verification.',
        [...common, measured('target_match_fraction', copies / n, 'ratio', n)]
      );
    }

    if (summary.counts.size === n && n >= 3 && /(^|_)id$|uuid|identifier/i.test(feature)) {
      add(
        feature,
        'suspicion',
        'unique_identifier',
        'An ID-like column is unique among complete observations. Audit entity-aware splits and whether it should be a model feature.',
        [...common, measured('distinct_values', summary.counts.size, 'count', n)]
      );
    }

    if (
      /(^|_)(post_outcome|after_outcome|future|final_diagnosis|outcome_result)(_|$)/i.test(feature)
    ) {
      add(
        feature,
        'suspicion',
        'post_outcome_name',
        'The column name suggests possible post-outcome information. A name alone cannot establish timing or leakage.',
        common
      );
    }

    if (
      n >= 20 &&
      positive >= 5 &&
      negative >= 5 &&
      summary.counts.size >= 2 &&
      summary.counts.size <= 20 &&
      [...summary.counts.values()].every((count) => count >= 2)
    ) {
      const groups = new Map<string, { positive: number; negative: number }>();
      for (const p of pairs) {
        const group = groups.get(p.value) ?? { positive: 0, negative: 0 };
        if (p.target === data.labels.positive) group.positive++;
        else group.negative++;
        groups.set(p.value, group);
      }
      const correctlyMapped = [...groups.values()].reduce(
        (sum, g) => sum + Math.max(g.positive, g.negative),
        0
      );
      const purity = correctlyMapped / n,
        baseline = Math.max(positive, negative) / n;
      if (correctlyMapped * 100 >= 95 * n && (correctlyMapped - Math.max(positive, negative)) * 10 >= n) {
        add(
          feature,
          'suspicion',
          'categorical_target_proxy',
          'An in-sample category-to-majority-label mapping reaches at least 95% agreement and improves at least 10 percentage points over the majority baseline. This may be legitimate predictive information; verify on independent data.',
          [
            ...common,
            measured('in_sample_mapping_accuracy', purity, 'ratio', n),
            measured('majority_baseline', baseline, 'ratio', n),
          ]
        );
      }
    }

    if (n < 20 || positive < 5 || negative < 5) {
      limitations.push(
        `${feature}: near-copy and category-proxy rules need at least 20 complete pairs and five examples per class; these are conservative heuristic gates.`
      );
    }
  }

  if (request.predictionTimeColumn !== null && request.outcomeTimeColumn !== null) {
    let valid = 0,
      missing = 0,
      invalid = 0,
      alreadyObserved = 0;
    for (const r of data.rows) {
      const a = r.attributes[request.predictionTimeColumn],
        b = r.attributes[request.outcomeTimeColumn];
      if (a === null || b === null) {
        missing++;
        continue;
      }
      const prediction = utc(a),
        outcome = utc(b);
      if (prediction === null || outcome === null) {
        invalid++;
        continue;
      }
      valid++;
      if (outcome <= prediction) alreadyObserved++;
    }
    const counts = [
      measured('valid_time_pairs', valid, 'count', data.rows.length),
      measured('missing_time_pairs', missing, 'count', data.rows.length),
      measured('invalid_time_pairs', invalid, 'count', data.rows.length),
      measured('outcome_at_or_before_prediction', alreadyObserved, 'count', valid),
    ];
    add(
      request.predictionTimeColumn,
      'observation',
      'temporal_order',
      `${alreadyObserved} of ${valid} valid pairs place the outcome at or before prediction. Missing and unparseable pairs were counted separately.`,
      counts
    );
    if (alreadyObserved) {
      add(
        request.predictionTimeColumn,
        'suspicion',
        'prediction_horizon_review',
        'Review whether prediction was intended to precede the outcome. Retrospective tasks may legitimately have this ordering; feature availability is not established.',
        counts
      );
    }
    limitations.push(
      'Temporal checks accept explicit UTC ISO timestamps with seconds and optional 1-3 fractional digits. Other formats/offsets are counted as invalid rather than guessed.'
    );
  }

  return {
    output: toolSchemas.scan_feature_leakage.output.parse({ observations }),
    limitations,
  };
}

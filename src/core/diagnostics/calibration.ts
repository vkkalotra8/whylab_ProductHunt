import { fail } from '../domain/schema.ts';
import { toolSchemas, type ToolInput, type ToolOutput } from '../domain/tool-contracts.ts';
import type { EvaluationDataset } from './evaluation-ingestion.ts';
import type { Measurement } from '../domain/primitives.ts';

export type CalibrationReport = {
  status: 'completed' | 'insufficient_data';
  output: ToolOutput<'check_calibration'> | null;
  requestedBins: number;
  strategy: ToolInput<'check_calibration'>['strategy'];
  limitations: string[];
};

/** Binary positive-class calibration. No recalibration or model fitting is performed. */
export function checkCalibration(
  data: EvaluationDataset,
  input: ToolInput<'check_calibration'>
): CalibrationReport {
  const request = toolSchemas.check_calibration.input.parse(input);

  if (data.metadata.task !== 'binary_classification') {
    fail('$.metadata.task', 'calibration currently supports binary classification only');
  }
  if (
    request.datasetId !== data.metadata.id ||
    request.positiveLabel !== data.labels.positive ||
    data.metadata.positiveLabel !== data.labels.positive
  ) {
    fail('$.input', 'dataset or positive probability mapping differs from ingestion');
  }
  if (!data.labels.positive || !data.labels.negative || data.labels.positive === data.labels.negative) {
    fail('$.labels', 'two distinct labels are required');
  }
  if (!Array.isArray(data.rows) || data.rows.length > 10000 || data.rows.length !== data.metadata.rowCount) {
    fail('$.rows', 'expected at most 10,000 rows matching metadata');
  }

  const reportBase = { requestedBins: request.bins, strategy: request.strategy };
  if (!data.rows.length) {
    return {
      ...reportBase,
      status: 'insufficient_data',
      output: null,
      limitations: ['No evaluation rows: calibration statistics are undefined.'],
    };
  }

  let missing = false;
  const records = Array.from(data.rows, (r, i) => {
    if (!r || r.actual === null || ![data.labels.positive, data.labels.negative].includes(r.actual)) {
      fail(`$.rows[${i}].actual`, 'invalid true class');
    }
    const score = r.positiveProbability;
    if (score === undefined || score === null) {
      missing = true;
      return { score: 0, actual: 0 };
    }
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
      fail(`$.rows[${i}].positiveProbability`, 'probabilities must be finite values in [0,1]');
    }
    return { score, actual: r.actual === data.labels.positive ? 1 : 0 };
  });

  if (missing) {
    return {
      ...reportBase,
      status: 'insufficient_data',
      output: null,
      limitations: [
        'At least one probability is missing. No rows were discarded and no calibration measurements were produced.',
      ],
    };
  }

  records.sort((a, b) => a.score - b.score || a.actual - b.actual);
  const n = records.length;
  const edges = [0];

  if (request.strategy === 'equal_width') {
    for (let i = 1; i < request.bins; i++) edges.push(i / request.bins);
  } else {
    for (let i = 1; i < request.bins; i++) {
      const at = Math.ceil((n * i) / request.bins) - 1;
      const left = records[at]?.score,
        right = records[at + 1]?.score;
      if (left === undefined || right === undefined || left === right) continue;
      const middle = left + (right - left) / 2;
      if (middle > left && middle < right && middle > edges[edges.length - 1]) edges.push(middle);
    }
  }
  edges.push(1);

  const bins = edges.slice(0, -1).map((lower, i) => ({
    lower,
    upper: edges[i + 1],
    sampleSize: 0,
    meanProbability: null as number | null,
    observedFrequency: null as number | null,
  }));
  const sums = bins.map(() => ({ probability: 0, positive: 0 }));
  let bin = 0,
    squaredError = 0;

  for (const r of records) {
    while (bin < bins.length - 1 && r.score >= bins[bin].upper) bin++;
    bins[bin].sampleSize++;
    sums[bin].probability += r.score;
    sums[bin].positive += r.actual;
    squaredError += (r.score - r.actual) ** 2;
  }

  let ece = 0;
  bins.forEach((b, i) => {
    if (!b.sampleSize) return;
    b.meanProbability = Math.max(b.lower, Math.min(b.upper, sums[i].probability / b.sampleSize));
    b.observedFrequency = sums[i].positive / b.sampleSize;
    ece += (b.sampleSize / n) * Math.abs(b.meanProbability - b.observedFrequency);
  });

  const metrics: Measurement[] = [
    { name: 'brier_score', status: 'measured', value: squaredError / n, unit: 'ratio', sampleSize: n },
    { name: 'expected_calibration_error', status: 'measured', value: Math.min(1, ece), unit: 'ratio', sampleSize: n },
  ];

  const output = toolSchemas.check_calibration.output.parse({ metrics, bins });
  const limitations = [
    'Binary Brier score is mean (positive_probability - positive_label_indicator)^2, without a multiclass factor of two.',
    'ECE is the sample-weighted absolute difference between mean probability and positive frequency within bins; it depends on binning and is not proof of calibration.',
    'Bins use [lower, upper), except the final bin includes 1. Empty bins have null summaries.',
    'Descriptive estimates only; no confidence intervals or recalibration are provided.',
  ];
  if (n < 30) {
    limitations.push('Fewer than 30 observations: calibration estimates may be unstable (heuristic warning).');
  }
  if (bins.some((b) => b.sampleSize > 0 && b.sampleSize < 5)) {
    limitations.push(
      'Some populated bins contain fewer than five observations; their frequencies are especially uncertain (heuristic warning).'
    );
  }
  if (records.every((r) => r.actual === records[0].actual)) {
    limitations.push(
      'Only one true class is observed. Brier score and ECE are defined on these rows, but do not establish calibration across both classes.'
    );
  }
  if (request.strategy === 'equal_frequency') {
    limitations.push(
      'Equal-frequency bins use approximate quantile cuts; ties and unrepresentable interior boundaries are not split. Actual bin count can be lower than requested.'
    );
  }

  return { ...reportBase, status: 'completed', output, limitations };
}

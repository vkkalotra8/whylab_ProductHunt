import {
  array,
  boolean,
  count,
  enumeration,
  fail,
  literal,
  nullable,
  number,
  object,
  ratio,
  refine,
  schema,
  text,
  timestamp,
  union,
  unique,
  type Infer,
} from './schema.ts';
import {
  costPolicySchema,
  criterionSchema,
  datasetIds,
  evidenceIds,
  id,
  measurementSchema,
  policySchema,
} from './primitives.ts';

const columnNames = refine(array(text, 1, 100), unique);
const metricList = refine(array(measurementSchema), (values, p) =>
  unique(values.map((v) => v.name), p)
);
const evaluationInput = { datasetId: id('dataset'), positiveLabel: text };

function validateProfileSummary(o: Infer<typeof baseProfileOutput>, path: string) {
  unique(o.columns.map((c) => c.name), path);
  unique(o.classes.map((c) => c.label), path);
  unique(o.sliceColumns, path);
  for (const c of o.columns) {
    if (c.missingCount > o.rowCount || c.distinctCount > o.rowCount - c.missingCount) {
      fail(path, 'column counts exceed observed rows');
    }
    const range = [c.minimum, c.mean, c.maximum];
    if (range.some((n) => n !== null) && range.some((n) => n === null)) {
      fail(path, 'numeric summaries must be all present or all null');
    }
    if (
      c.minimum !== null &&
      c.maximum !== null &&
      c.mean !== null &&
      (c.minimum > c.mean || c.mean > c.maximum)
    ) {
      fail(path, 'invalid numeric range');
    }
  }
  if (o.sliceColumns.some((n) => !o.columns.some((c) => c.name === n))) {
    fail(path, 'slice column absent from profile');
  }
  const total = o.classes.reduce((sum, c) => sum + c.count, 0);
  if (total > o.rowCount) {
    fail(path, 'class counts exceed row count');
  }
  for (const c of o.classes) {
    if (!total || Math.abs(c.prevalence - c.count / total) > 1e-10) {
      fail(path, 'prevalence must match nonmissing class counts');
    }
  }
}

const baseProfileOutput = object({
  rowCount: count,
  columns: array(
    object({
      name: text,
      role: enumeration(['target', 'prediction', 'probability', 'feature', 'metadata', 'unknown']),
      type: enumeration(['numeric', 'categorical', 'timestamp', 'empty']),
      missingCount: count,
      distinctCount: count,
      minimum: nullable(number()),
      maximum: nullable(number()),
      mean: nullable(number()),
    }),
    1,
    100
  ),
  classes: array(object({ label: text, count, prevalence: ratio })),
  sliceColumns: array(text),
});

export const profileOutput = refine(baseProfileOutput, validateProfileSummary);
const confusion = object({
  truePositive: count,
  falsePositive: count,
  trueNegative: count,
  falseNegative: count,
});
const metricsOutput = object({
  positiveLabel: text,
  negativeLabel: nullable(text),
  sampleSize: count,
  confusion,
  metrics: metricList,
});
const thresholdPoint = object({ threshold: ratio, confusion, metrics: metricList });
const leakageObservation = object({
  feature: text,
  classification: enumeration(['observation', 'suspicion', 'confirmed_evidence']),
  method: text,
  description: text,
  evidenceIds,
  measurements: metricList,
});

export const toolSchemas = {
  profile_dataset: {
    input: object({ datasetId: id('dataset'), targetColumn: nullable(text) }),
    output: profileOutput,
  },
  compute_classification_metrics: {
    input: object(evaluationInput),
    output: metricsOutput,
  },
  threshold_sweep: {
    input: object({
      ...evaluationInput,
      thresholds: refine(array(ratio, 1, 1001), (v, p) => {
        if (new Set(v).size !== v.length) fail(p, 'duplicate thresholds');
      }),
      costs: nullable(costPolicySchema),
    }),
    output: object({
      points: array(thresholdPoint, 1, 1001),
      selectedThreshold: nullable(ratio),
    }),
  },
  check_calibration: {
    input: object({
      ...evaluationInput,
      bins: number(2, 100, true),
      strategy: enumeration(['equal_width', 'equal_frequency']),
    }),
    output: object({
      metrics: metricList,
      bins: array(
        object({
          lower: ratio,
          upper: ratio,
          sampleSize: count,
          meanProbability: nullable(ratio),
          observedFrequency: nullable(ratio),
        }),
        1,
        100
      ),
    }),
  },
  scan_feature_leakage: {
    input: object({
      datasetId: id('dataset'),
      targetColumn: text,
      featureColumns: columnNames,
      predictionTimeColumn: nullable(text),
      outcomeTimeColumn: nullable(text),
      assumptionEvidenceIds: evidenceIds,
    }),
    output: object({ observations: array(leakageObservation) }),
  },
  slice_evaluation: {
    input: object({
      ...evaluationInput,
      columns: columnNames,
      minimumSampleSize: number(1, 1000000, true),
    }),
    output: object({
      overall: metricsOutput,
      slices: array(
        object({
          column: text,
          value: text,
          sampleSize: count,
          metrics: metricList,
          limitations: array(text),
        })
      ),
    }),
  },
  run_drift_tests: {
    input: object({
      referenceDatasetId: id('dataset'),
      comparisonDatasetId: id('dataset'),
      columns: columnNames,
      method: enumeration(['ks', 'psi', 'wasserstein']),
      bins: nullable(number(2, 100, true)),
    }),
    output: object({
      comparisons: array(
        object({
          feature: text,
          method: enumeration(['ks', 'psi', 'wasserstein']),
          referenceSize: count,
          comparisonSize: count,
          statistic: measurementSchema,
          limitations: array(text),
        })
      ),
    }),
  },
  run_counterfactual_test: {
    input: object({
      ...evaluationInput,
      hypothesisId: id('hypothesis'),
      method: literal('accuracy_paradox'),
      seed: count,
      criterion: criterionSchema,
    }),
    output: object({
      hypothesisId: id('hypothesis'),
      outcome: enumeration(['supports', 'weakens', 'rejects', 'inconclusive']),
      baseline: metricList,
      comparison: metricList,
      evidenceIds,
      rationale: text,
    }),
  },
  generate_repair_candidate: {
    input: object({
      ...evaluationInput,
      hypothesisId: id('hypothesis'),
      targetMetric: enumeration(['recall', 'balanced_accuracy', 'cost']),
      targetValue: nullable(number()),
      costs: nullable(costPolicySchema),
      criterion: criterionSchema,
    }),
    output: object({
      hypothesisId: id('hypothesis'),
      datasetId: id('dataset'),
      selectedThreshold: ratio,
      policy: policySchema,
      projectedConfusion: confusion,
      projectedMetrics: metricList,
      rationale: text,
      limitations: array(text),
    }),
  },
  re_evaluate_repair: {
    input: object({
      ...evaluationInput,
      repairId: id('repair'),
      baselineThreshold: ratio,
      repairedThreshold: ratio,
      criterion: criterionSchema,
      baselineEvidenceIds: evidenceIds,
    }),
    output: object({
      repairId: id('repair'),
      datasetId: id('dataset'),
      status: enumeration(['passed', 'failed', 'inconclusive']),
      baselineMetrics: metricList,
      repairedMetrics: metricList,
      confusionDelta: object({
        truePositive: number(),
        falsePositive: number(),
        trueNegative: number(),
        falseNegative: number(),
      }),
      criterionMet: boolean,
      rationale: text,
      limitations: array(text),
    }),
  },
} as const;

export type ToolName = keyof typeof toolSchemas;
export type ToolInput<N extends ToolName> = Infer<(typeof toolSchemas)[N]['input']>;
export type ToolOutput<N extends ToolName> = Infer<(typeof toolSchemas)[N]['output']>;
export const toolNames = Object.keys(toolSchemas) as ToolName[];
const toolName = enumeration(toolNames);
const callBase = {
  id: id('call'),
  investigationId: id('investigation'),
  tool: toolName,
  toolVersion: literal(1),
  requestedAt: timestamp,
};

export type DiagnosticToolCall = {
  [N in ToolName]: { [K in keyof typeof callBase]: Infer<(typeof callBase)[K]> } & {
    tool: N;
    input: ToolInput<N>;
  };
}[ToolName];

export const diagnosticToolCallSchema = schema<DiagnosticToolCall>((value, path) => {
  if (!value || typeof value !== 'object' || !('tool' in value)) return fail(path, 'tool is required');
  const name = toolName.parse((value as Record<string, unknown>).tool, `${path}.tool`);
  const parsed = object({ ...callBase, input: toolSchemas[name].input }).parse(value, path);
  if (parsed.tool === 'run_drift_tests') {
    const input = parsed.input as ToolInput<'run_drift_tests'>;
    if (input.referenceDatasetId === input.comparisonDatasetId) {
      fail(path, 'drift requires distinct dataset references');
    }
    if (input.method === 'psi' && input.bins === null) {
      fail(path, 'PSI requires an explicit bin count');
    }
  }
  return parsed as DiagnosticToolCall;
});

const resultBase = {
  id: id('result'),
  callId: id('call'),
  tool: toolName,
  toolVersion: literal(1),
  completedAt: timestamp,
  datasetIds,
  evidenceIds,
  limitations: array(text),
};

type ResultBase = {
  id: import('./primitives.ts').Id<'result'>;
  callId: import('./primitives.ts').Id<'call'>;
  toolVersion: 1;
  completedAt: string;
  datasetIds: import('./primitives.ts').Id<'dataset'>[];
  evidenceIds: import('./primitives.ts').Id<'evidence'>[];
  limitations: string[];
};

export type DiagnosticToolResult = {
  [N in ToolName]: ResultBase & {
    tool: N;
  } & (
      | {
          status: 'completed';
          output: ToolOutput<N>;
        }
      | {
          status: 'error' | 'unsupported' | 'insufficient_data';
          error: {
            code: string;
            message: string;
            retryable: boolean;
          };
        }
    );
}[ToolName];

function validateOutput(result: DiagnosticToolResult, path: string) {
  if (result.status !== 'completed') return;
  const metrics = (values: Infer<typeof metricList>, size: number) => {
    for (const m of values) {
      if (m.sampleSize > size) fail(path, 'metric sample size exceeds population');
    }
  };
  const classification = (v: Infer<typeof metricsOutput>) => {
    if (v.positiveLabel === v.negativeLabel) fail(path, 'class labels must differ');
    if (Object.values(v.confusion).reduce((sum, n) => sum + n, 0) !== v.sampleSize) {
      fail(path, 'confusion counts must sum to sample size');
    }
    metrics(v.metrics, v.sampleSize);
  };
  switch (result.tool) {
    case 'compute_classification_metrics':
      classification(result.output);
      break;
    case 'profile_dataset':
      break;
    case 'threshold_sweep': {
      const points = result.output.points;
      if (new Set(points.map((p) => p.threshold)).size !== points.length) {
        fail(path, 'duplicate threshold results');
      }
      if (
        result.output.selectedThreshold !== null &&
        !points.some((p) => p.threshold === result.output.selectedThreshold)
      ) {
        fail(path, 'selected threshold absent from sweep');
      }
      const total = (c: Infer<typeof confusion>) => Object.values(c).reduce((a, b) => a + b, 0);
      for (const p of points) {
        if (total(p.confusion) !== total(points[0].confusion)) {
          fail(path, 'sweep population changed');
        }
        metrics(p.metrics, total(p.confusion));
      }
      break;
    }
    case 'check_calibration': {
      result.output.bins.forEach((b, i, bins) => {
        if (b.lower >= b.upper || (i > 0 && b.lower < bins[i - 1].upper)) {
          fail(path, 'calibration bins must be ordered and nonoverlapping');
        }
        if (
          b.sampleSize === 0
            ? b.meanProbability !== null || b.observedFrequency !== null
            : b.meanProbability === null || b.observedFrequency === null
        ) {
          fail(path, 'empty bins require null summaries; populated bins require values');
        }
        if (b.meanProbability !== null && (b.meanProbability < b.lower || b.meanProbability > b.upper)) {
          fail(path, 'mean probability outside bin');
        }
      });
      metrics(
        result.output.metrics,
        result.output.bins.reduce((sum, b) => sum + b.sampleSize, 0)
      );
      break;
    }
    case 'slice_evaluation':
      classification(result.output.overall);
      for (const s of result.output.slices) {
        if (s.sampleSize > result.output.overall.sampleSize) {
          fail(path, 'slice exceeds population');
        }
        metrics(s.metrics, s.sampleSize);
      }
      unique(
        result.output.slices.map((s) => JSON.stringify([s.column, s.value])),
        path
      );
      break;
    case 'scan_feature_leakage':
      for (const o of result.output.observations) {
        if (o.classification === 'confirmed_evidence' && !o.evidenceIds.length) {
          fail(path, 'confirmed observation requires referenced evidence');
        }
      }
      break;
    case 'run_drift_tests':
      for (const c of result.output.comparisons) {
        if (
          c.statistic.status === 'measured' &&
          (c.statistic.value < 0 || (c.method === 'ks' && c.statistic.value > 1))
        ) {
          fail(path, 'invalid drift statistic range');
        }
      }
      break;
    case 'run_counterfactual_test':
      break;
  }
}

export const diagnosticToolResultSchema = schema<DiagnosticToolResult>((value, path) => {
  if (!value || typeof value !== 'object' || !('tool' in value)) return fail(path, 'tool is required');
  const name = toolName.parse((value as Record<string, unknown>).tool, `${path}.tool`);
  const parsed = union(
    object({ ...resultBase, status: literal('completed'), output: toolSchemas[name].output }),
    object({
      ...resultBase,
      status: enumeration(['error', 'unsupported', 'insufficient_data']),
      error: object({ code: text, message: text, retryable: boolean }),
    })
  ).parse(value, path) as DiagnosticToolResult;
  validateOutput(parsed, path);
  return parsed;
});

export const repairPolicySchema = policySchema;

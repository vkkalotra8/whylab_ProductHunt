import {
  array,
  count,
  enumeration,
  fail,
  literal,
  nullable,
  object,
  refine,
  text,
  timestamp,
  union,
  unique,
  type Infer,
} from './schema.ts';
import {
  confidenceSchema,
  criterionSchema,
  evidenceIds,
  experimentCriterionSchema,
  id,
  measurementSchema,
  policySchema,
} from './primitives.ts';
import { diagnosticToolCallSchema, diagnosticToolResultSchema } from './tool-contracts.ts';

export const sourceSchema = object({
  id: id('source'),
  kind: enumeration(['uploaded_file', 'pasted_logs', 'user_assumption', 'fixture']),
  name: text,
  capturedAt: timestamp,
  contentDigest: nullable(
    refine(text, (v, p) => {
      if (!/^sha256:[a-f0-9]{64}$/.test(v)) fail(p, 'expected sha256 digest');
    })
  ),
});

export const datasetMetadataSchema = refine(
  object({
    id: id('dataset'),
    sourceId: id('source'),
    name: text,
    rowCount: count,
    columns: refine(array(text, 1, 100), unique),
    role: enumeration(['training', 'validation', 'production', 'evaluation', 'reference']),
    task: enumeration(['binary_classification', 'multiclass_classification', 'regression', 'unknown']),
    targetColumn: nullable(text),
    predictionColumn: nullable(text),
    probabilityColumn: nullable(text),
    positiveLabel: nullable(text),
  }),
  (v, p) => {
    for (const key of ['targetColumn', 'predictionColumn', 'probabilityColumn'] as const) {
      if (v[key] !== null && !v.columns.includes(v[key])) {
        fail(`${p}.${key}`, 'column is absent from dataset');
      }
    }
    unique(
      [v.targetColumn, v.predictionColumn, v.probabilityColumn].filter((v): v is string => v !== null),
      p
    );
  }
);

export const evidenceSchema = object({
  id: id('evidence'),
  kind: enumeration(['observation', 'measurement', 'assumption']),
  description: text,
  measurements: array(measurementSchema),
  provenance: union(
    object({
      kind: literal('source'),
      sourceId: id('source'),
      datasetId: nullable(id('dataset')),
      rows: nullable(object({ first: count, last: count })),
      columns: array(text),
    }),
    object({
      kind: literal('tool_result'),
      resultId: id('result'),
    }),
    object({
      kind: literal('experiment'),
      experimentId: id('experiment'),
    })
  ),
});

export const hypothesisSchema = object({
  id: id('hypothesis'),
  statement: text,
  status: enumeration(['proposed', 'supported', 'weakened', 'rejected', 'confirmed']),
  confidence: confidenceSchema,
  evidence: array(
    object({
      evidenceId: id('evidence'),
      relationship: enumeration(['supports', 'weakens', 'rejects']),
      rationale: text,
    })
  ),
  unresolvedQuestions: array(text),
});

export const verificationExperimentSchema = object({
  id: id('experiment'),
  hypothesisId: id('hypothesis'),
  prediction: text,
  method: text,
  seed: nullable(count),
  callIds: refine(array(id('call')), unique),
  criterion: experimentCriterionSchema,
  status: enumeration(['planned', 'completed', 'failed']),
  outcome: nullable(enumeration(['supports', 'weakens', 'rejects', 'inconclusive'])),
  evidenceIds,
  limitations: array(text),
});

const repairBase = {
  id: id('repair'),
  hypothesisId: id('hypothesis'),
  rationale: text,
  evidenceIds,
};

export const repairCandidateSchema = union(
  object({
    ...repairBase,
    kind: literal('operating_policy'),
    verification: literal('evaluation_data'),
    datasetId: id('dataset'),
    policy: policySchema,
    criterion: criterionSchema,
  }),
  object({
    ...repairBase,
    kind: literal('training_recommendation'),
    verification: literal('requires_external_experiment'),
    recommendation: text,
  })
);

export const beforeAfterComparisonSchema = object({
  id: id('comparison'),
  repairId: id('repair'),
  datasetId: id('dataset'),
  baselinePolicy: policySchema,
  afterPolicy: policySchema,
  baselineEvidenceIds: refine(evidenceIds, (v, p) => {
    if (!v.length) fail(p, 'baseline evidence required');
  }),
  afterEvidenceIds: refine(evidenceIds, (v, p) => {
    if (!v.length) fail(p, 'after evidence required');
  }),
  criterion: criterionSchema,
  status: enumeration(['passed', 'failed', 'inconclusive']),
  limitations: array(text),
});

export const investigationEventSchema = object({
  id: id('event'),
  sequence: count,
  at: timestamp,
  kind: enumeration([
    'dataset_registered',
    'tool_requested',
    'tool_completed',
    'tool_failed',
    'hypothesis_updated',
    'experiment_completed',
    'repair_proposed',
    'comparison_completed',
    'investigation_completed',
    'investigation_failed',
  ]),
  entityId: union(
    id('dataset'),
    id('call'),
    id('result'),
    id('hypothesis'),
    id('experiment'),
    id('repair'),
    id('comparison'),
    id('investigation')
  ),
  message: text,
});

export const diagnosisSchema = object({
  id: id('diagnosis'),
  investigationId: id('investigation'),
  status: enumeration(['completed', 'inconclusive', 'failed']),
  summary: text,
  evidenceIds,
  hypothesisIds: refine(array(id('hypothesis')), unique),
  primaryHypothesisId: nullable(id('hypothesis')),
  confidence: confidenceSchema,
  experimentIds: refine(array(id('experiment')), unique),
  repairIds: refine(array(id('repair')), unique),
  comparisonIds: refine(array(id('comparison')), unique),
  unresolvedQuestions: array(text),
  limitations: array(text),
});

export const investigationSchema = object({
  schemaVersion: literal(2),
  id: id('investigation'),
  objective: text,
  status: enumeration(['draft', 'running', 'completed', 'failed', 'stopped']),
  stopReason: nullable(text),
  createdAt: timestamp,
  updatedAt: timestamp,
  sources: array(sourceSchema),
  datasets: array(datasetMetadataSchema),
  evidence: array(evidenceSchema),
  toolCalls: array(diagnosticToolCallSchema),
  toolResults: array(diagnosticToolResultSchema),
  hypotheses: array(hypothesisSchema),
  experiments: array(verificationExperimentSchema),
  repairs: array(repairCandidateSchema),
  comparisons: array(beforeAfterComparisonSchema),
  events: array(investigationEventSchema),
  diagnosis: nullable(diagnosisSchema),
});

export type Investigation = Infer<typeof investigationSchema>;
export type DatasetMetadata = Infer<typeof datasetMetadataSchema>;
export type Evidence = Infer<typeof evidenceSchema>;
export type Hypothesis = Infer<typeof hypothesisSchema>;
export type VerificationExperiment = Infer<typeof verificationExperimentSchema>;
export type RepairCandidate = Infer<typeof repairCandidateSchema>;
export type BeforeAfterComparison = Infer<typeof beforeAfterComparisonSchema>;
export type InvestigationEvent = Infer<typeof investigationEventSchema>;
export type Diagnosis = Infer<typeof diagnosisSchema>;
export type Source = Infer<typeof sourceSchema>;

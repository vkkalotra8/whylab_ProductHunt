import {
  array,
  count,
  enumeration,
  fail,
  literal,
  nullable,
  number,
  object,
  ratio,
  refine,
  text,
  union,
  unique,
  type Infer,
} from './schema.ts';

export const idKinds = [
  'investigation',
  'dataset',
  'source',
  'artifact',
  'evidence',
  'call',
  'result',
  'hypothesis',
  'experiment',
  'repair',
  'comparison',
  'event',
  'diagnosis',
  'model',
  'model_version',
  'prediction',
  'audit',
] as const;

export type IdKind = (typeof idKinds)[number];
export type Id<K extends IdKind> = `${K}_${string}`;

export function id<K extends IdKind>(kind: K) {
  return refine(text, (v, p) => {
    if (!new RegExp(`^${kind}_[A-Za-z0-9][A-Za-z0-9_-]{0,99}$`).test(v)) {
      fail(p, `expected ${kind}_ identifier`);
    }
  }) as import('./schema.ts').Schema<Id<K>>;
}

export function createId<K extends IdKind>(kind: K): Id<K> {
  if (!idKinds.includes(kind)) throw new Error('Unknown entity kind');
  return `${kind}_${globalThis.crypto.randomUUID()}`;
}

export const evidenceIds = refine(array(id('evidence')), unique);
export const datasetIds = refine(array(id('dataset'), 1), unique);
export const unit = enumeration([
  'ratio',
  'count',
  'percentage_points',
  'loss',
  'cost',
  'feature_units',
  'unitless',
]);

export const measurementSchema = refine(
  union(
    object({
      name: text,
      status: literal('measured'),
      value: number(),
      unit,
      sampleSize: count,
    }),
    object({
      name: text,
      status: literal('undefined'),
      reason: text,
      unit,
      sampleSize: count,
    })
  ),
  (m, p) => {
    if (m.status !== 'measured') return;
    if (m.unit === 'ratio') ratio.parse(m.value, `${p}.value`);
    if (m.unit === 'count') count.parse(m.value, `${p}.value`);
    if (m.unit === 'cost' || m.unit === 'loss') number(0).parse(m.value, `${p}.value`);
  }
);

export type Measurement = Infer<typeof measurementSchema>;

export const confidenceSchema = object({
  kind: literal('evidence_strength'),
  level: enumeration(['unassessed', 'limited', 'moderate', 'strong']),
  rationale: text,
});

export type Confidence = Infer<typeof confidenceSchema>;

export const criterionSchema = object({
  metric: text,
  operator: enumeration(['at_least', 'at_most']),
  value: number(),
  unit,
});

export const compositeCriterionSchema = object({
  kind: literal('all_of'),
  criteria: refine(array(criterionSchema, 2, 4), (v, p) =>
    unique(v.map((c) => `${c.metric} ${c.unit}`), p)
  ),
});

export const experimentCriterionSchema = union(criterionSchema, compositeCriterionSchema);

export const costPolicySchema = object({
  falseNegativeCost: number(0),
  falsePositiveCost: number(0),
  assumptionEvidenceId: id('evidence'),
});

export const policySchema = object({
  threshold: ratio,
  positiveLabel: text,
  comparison: literal('greater_than_or_equal'),
  costs: nullable(costPolicySchema),
});

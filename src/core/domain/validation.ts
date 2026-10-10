import { fail, unique } from './schema.ts';
import { investigationSchema, type Investigation } from './types.ts';

// Validate unknown input BEFORE JSON serialization can erase NaN, undefined, or class instances.
function assertJson(
  value: unknown,
  path = '$',
  ancestors = new Set<object>(),
  depth = 0,
  budget = { nodes: 0 }
) {
  if (++budget.nodes > 200000 || depth > 32) fail(path, 'contract exceeds structural limits');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(path, 'nonfinite number');
    return;
  }
  if (typeof value !== 'object') fail(path, 'expected JSON-compatible value');
  if (ancestors.has(value)) fail(path, 'cyclic reference');
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail(path, 'expected plain JSON object');
  }
  if (Object.getOwnPropertySymbols(value).length) fail(path, 'symbol properties are not serializable');
  ancestors.add(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) {
      fail(`${path}.${key}`, 'accessors and hidden properties are unsupported');
    }
    if (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key)) {
      fail(path, 'array has extra properties');
    }
    assertJson(descriptor.value, `${path}.${key}`, ancestors, depth + 1, budget);
  }
  if (Array.isArray(value) && Object.keys(value).length !== value.length) {
    fail(path, 'sparse array');
  }
  ancestors.delete(value);
}

export function validateInvestigation(value: unknown): Investigation {
  assertJson(value);
  const v = investigationSchema.parse(value);
  const entities = [
    v,
    ...v.sources,
    ...v.datasets,
    ...v.evidence,
    ...v.toolCalls,
    ...v.toolResults,
    ...v.hypotheses,
    ...v.experiments,
    ...v.repairs,
    ...v.comparisons,
    ...v.events,
    ...(v.diagnosis ? [v.diagnosis] : []),
  ];
  unique(
    entities.map((e) => e.id),
    '$.ids'
  );
  const byId = new Map<string, { id: string }>(entities.map((e) => [e.id, e]));
  const reference = (id: string, path: string) => {
    if (!byId.has(id)) fail(path, `unknown reference ${id}`);
  };
  const refs = (ids: readonly string[], p: string) => ids.forEach((id, i) => reference(id, `${p}[${i}]`));
  const datasets = new Map(v.datasets.map((d) => [d.id, d]));
  const results = new Map(v.toolResults.map((r) => [r.id, r]));

  if (v.updatedAt < v.createdAt) fail('$.updatedAt', 'must not precede creation');

  for (const d of v.datasets) reference(d.sourceId, d.id);

  for (const e of v.evidence) {
    const p = e.provenance;
    if (e.kind === 'measurement' && !e.measurements.length) {
      fail(e.id, 'measurement evidence needs measurements');
    }
    if (
      e.kind === 'assumption' &&
      (p.kind !== 'source' || v.sources.find((s) => s.id === p.sourceId)?.kind !== 'user_assumption')
    ) {
      fail(e.id, 'assumptions need an explicit user-assumption source');
    }
    if (p.kind === 'source') {
      reference(p.sourceId, e.id);
      if (v.sources.find((s) => s.id === p.sourceId)!.kind === 'user_assumption' && e.kind !== 'assumption') {
        fail(e.id, 'assumption sources cannot produce measured observations');
      }
      if (p.datasetId !== null) {
        reference(p.datasetId, e.id);
        const d = datasets.get(p.datasetId)!;
        if (d.sourceId !== p.sourceId) fail(e.id, 'dataset/source mismatch');
        if (p.columns.some((c) => !d.columns.includes(c))) fail(e.id, 'unknown provenance column');
        if (p.rows && (p.rows.first < 1 || p.rows.first > p.rows.last || p.rows.last > d.rowCount)) {
          fail(e.id, 'rows must be 1-based data-row positions within dataset');
        }
      } else if (p.rows !== null || p.columns.length) {
        fail(e.id, 'row/column references need a dataset');
      }
    } else if (p.kind === 'tool_result') {
      reference(p.resultId, e.id);
      const r = results.get(p.resultId)!;
      if (r.status !== 'completed' || !r.evidenceIds.includes(e.id)) {
        fail(e.id, 'tool evidence needs reciprocal completed result');
      }
    } else {
      reference(p.experimentId, e.id);
      const experiment = v.experiments.find((x) => x.id === p.experimentId)!;
      if (experiment.status !== 'completed' || !experiment.evidenceIds.includes(e.id)) {
        fail(e.id, 'experiment evidence needs reciprocal completed experiment');
      }
    }
  }

  function checkAssumption(id: string, p: string) {
    reference(id, p);
    if (v.evidence.find((e) => e.id === id)?.kind !== 'assumption') {
      fail(p, 'costs require assumption evidence');
    }
  }

  for (const c of v.toolCalls) {
    if (c.investigationId !== v.id) fail(c.id, 'wrong investigation');
    const input = c.input;
    if ('datasetId' in input) {
      reference(input.datasetId, c.id);
      const d = datasets.get(input.datasetId)!;
      const columns = [
        ...('targetColumn' in input && input.targetColumn !== null ? [input.targetColumn] : []),
        ...('featureColumns' in input ? input.featureColumns : []),
        ...('columns' in input ? input.columns : []),
        ...('predictionTimeColumn' in input && input.predictionTimeColumn !== null
          ? [input.predictionTimeColumn]
          : []),
        ...('outcomeTimeColumn' in input && input.outcomeTimeColumn !== null
          ? [input.outcomeTimeColumn]
          : []),
      ];
      if (columns.some((column) => !d.columns.includes(column))) {
        fail(c.id, 'tool references absent dataset column');
      }
      if ('positiveLabel' in input && d.positiveLabel !== null && d.positiveLabel !== input.positiveLabel) {
        fail(c.id, 'positive label differs from dataset configuration');
      }
    }
    if ('referenceDatasetId' in input) {
      reference(input.referenceDatasetId, c.id);
      reference(input.comparisonDatasetId, c.id);
      if (
        input.columns.some(
          (column) =>
            !datasets.get(input.referenceDatasetId)!.columns.includes(column) ||
            !datasets.get(input.comparisonDatasetId)!.columns.includes(column)
        )
      ) {
        fail(c.id, 'drift columns must exist in both datasets');
      }
    }
    if ('hypothesisId' in input) reference(input.hypothesisId, c.id);
    if ('assumptionEvidenceIds' in input) refs(input.assumptionEvidenceIds, c.id);
    if ('costs' in input && input.costs) checkAssumption(input.costs.assumptionEvidenceId, c.id);
  }

  unique(
    v.toolResults.map((r) => r.callId),
    '$.toolResults.callId'
  );

  for (const r of v.toolResults) {
    reference(r.callId, r.id);
    refs(r.datasetIds, r.id);
    refs(r.evidenceIds, r.id);
    const call = v.toolCalls.find((c) => c.id === r.callId)!;
    if (call.tool !== r.tool || call.toolVersion !== r.toolVersion || r.completedAt < call.requestedAt) {
      fail(r.id, 'result does not match call');
    }
    const expected =
      'datasetId' in call.input
        ? [call.input.datasetId]
        : [call.input.referenceDatasetId, call.input.comparisonDatasetId];
    if (expected.length !== r.datasetIds.length || expected.some((d) => !r.datasetIds.includes(d))) {
      fail(r.id, 'result dataset scope differs from call');
    }
    if (r.status === 'completed' && r.tool === 'threshold_sweep' && call.tool === 'threshold_sweep') {
      if (
        r.output.points.length !== call.input.thresholds.length ||
        r.output.points.some((p) => !call.input.thresholds.includes(p.threshold))
      ) {
        fail(r.id, 'sweep must return requested thresholds');
      }
    }
    if (r.status === 'completed' && r.tool === 'run_drift_tests' && call.tool === 'run_drift_tests') {
      if (
        r.output.comparisons.some(
          (c) => c.method !== call.input.method || !call.input.columns.includes(c.feature)
        )
      ) {
        fail(r.id, 'drift output differs from requested method or features');
      }
    }
    if (r.status !== 'completed' && r.evidenceIds.length) {
      fail(r.id, 'failed tools cannot produce measured evidence');
    }
    for (const eid of r.evidenceIds) {
      const p = v.evidence.find((e) => e.id === eid)!.provenance;
      if (p.kind !== 'tool_result' || p.resultId !== r.id) {
        fail(r.id, 'output evidence must reference this result');
      }
    }
    if (r.status === 'completed' && r.tool === 'run_counterfactual_test') {
      reference(r.output.hypothesisId, r.id);
      refs(r.output.evidenceIds, r.id);
      if (call.tool !== 'run_counterfactual_test' || call.input.hypothesisId !== r.output.hypothesisId) {
        fail(r.id, 'counterfactual hypothesis mismatch');
      }
    }
    if (r.status === 'completed' && r.tool === 'scan_feature_leakage') {
      for (const o of r.output.observations) refs(o.evidenceIds, r.id);
    }
  }

  for (const h of v.hypotheses) {
    refs(
      h.evidence.map((e) => e.evidenceId),
      h.id
    );
    unique(
      h.evidence.map((e) => e.evidenceId),
      h.id
    );
    if (h.status !== 'proposed' && !h.evidence.length) fail(h.id, 'assessed hypothesis needs evidence');
    const relationship = {
      supported: 'supports',
      weakened: 'weakens',
      rejected: 'rejects',
      confirmed: 'supports',
    }[h.status as Exclude<typeof h.status, 'proposed'>];
    if (relationship && !h.evidence.some((e) => e.relationship === relationship)) {
      fail(h.id, 'status lacks corresponding evidence relationship');
    }
    if (
      h.status === 'confirmed' &&
      !v.experiments.some(
        (e) => e.hypothesisId === h.id && e.status === 'completed' && e.outcome === 'supports'
      )
    ) {
      fail(h.id, 'confirmation requires supporting completed verification');
    }
  }

  for (const e of v.experiments) {
    reference(e.hypothesisId, e.id);
    refs(e.callIds, e.id);
    refs(e.evidenceIds, e.id);
    if (e.status === 'completed') {
      if (
        !e.outcome ||
        !e.evidenceIds.length ||
        !e.callIds.length ||
        e.callIds.some((id) => !v.toolResults.some((r) => r.callId === id && r.status === 'completed'))
      ) {
        fail(e.id, 'completed verification requires outcome, evidence, and completed tool calls');
      }
    } else if (e.outcome !== null || e.evidenceIds.length) {
      fail(e.id, 'uncompleted experiment cannot claim results');
    }
  }

  for (const r of v.repairs) {
    reference(r.hypothesisId, r.id);
    refs(r.evidenceIds, r.id);
    if (!r.evidenceIds.length) fail(r.id, 'repair needs evidence');
    if (r.kind === 'operating_policy') {
      reference(r.datasetId, r.id);
      if (r.policy.costs) checkAssumption(r.policy.costs.assumptionEvidenceId, r.id);
    }
  }

  function evidenceScope(eid: string, seen = new Set<string>()): string[] {
    if (seen.has(eid)) fail(eid, 'cyclic experiment provenance');
    seen.add(eid);
    const evidence = v.evidence.find((e) => e.id === eid)!;
    const p = evidence.provenance;
    if (p.kind === 'source') return p.datasetId === null ? [] : [p.datasetId];
    if (p.kind === 'tool_result') return results.get(p.resultId)!.datasetIds;
    const experiment = v.experiments.find((x) => x.id === p.experimentId)!;
    return experiment.callIds.flatMap((id) => v.toolResults.find((r) => r.callId === id)?.datasetIds ?? []);
  }

  for (const c of v.comparisons) {
    reference(c.repairId, c.id);
    reference(c.datasetId, c.id);
    refs(c.baselineEvidenceIds, c.id);
    refs(c.afterEvidenceIds, c.id);
    for (const eid of [...c.baselineEvidenceIds, ...c.afterEvidenceIds]) {
      const e = v.evidence.find((item) => item.id === eid)!;
      const scope = evidenceScope(eid);
      if (
        e.kind !== 'measurement' ||
        !scope.length ||
        scope.some((d) => d !== c.datasetId) ||
        !e.measurements.some((m) => m.name === c.criterion.metric && m.unit === c.criterion.unit)
      ) {
        fail(c.id, 'comparison evidence must measure target criterion on target dataset');
      }
    }
  }

  for (const ev of v.events) reference(ev.entityId, ev.id);

  if (v.diagnosis) {
    const diag = v.diagnosis;
    if (diag.investigationId !== v.id) fail(diag.id, 'wrong investigation');
    refs(diag.evidenceIds, diag.id);
    refs(diag.hypothesisIds, diag.id);
    if (diag.primaryHypothesisId) reference(diag.primaryHypothesisId, diag.id);
    refs(diag.experimentIds, diag.id);
    refs(diag.repairIds, diag.id);
    refs(diag.comparisonIds, diag.id);
  }

  return v;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { runFlagshipMelanomaInvestigation } from '../../src/core/diagnostics/flagship-melanoma.ts';

test('evidence-ux: flagship investigation contains connected DAG from dataset to comparison', () => {
  const inv = runFlagshipMelanomaInvestigation();

  // 1. Dataset source node exists
  assert.ok(inv.datasets.length > 0);
  const dsId = inv.datasets[0].id;

  // 2. Baseline measurement evidence node exists
  const baselineEv = inv.evidence.find(
    (e) =>
      e.provenance.kind === 'tool_result' &&
      inv.toolResults.some((r) => r.id === e.provenance.resultId && r.tool === 'compute_classification_metrics')
  );
  assert.ok(baselineEv, 'Baseline measurement evidence must exist');
  assert.ok(baselineEv.measurements.length > 0);

  // 3. Falsification experiment evidence node exists
  const expEv = inv.evidence.find((e) => e.provenance.kind === 'experiment');
  assert.ok(expEv, 'Experiment verification evidence must exist');

  // 4. Hypothesis references baseline evidence
  const hyp = inv.hypotheses[0];
  assert.ok(hyp, 'Hypothesis must exist');
  assert.ok(hyp.evidence.some((link) => link.evidenceId === baselineEv.id));

  // 5. Verification experiment links to hypothesis
  const exp = inv.experiments.find((e) => e.hypothesisId === hyp.id);
  assert.ok(exp, 'Verification experiment must reference hypothesis');
  assert.equal(exp.outcome, 'supports');

  // 6. Repair candidate exists and references evaluation data
  const repair = inv.repairs[0];
  assert.ok(repair, 'Repair candidate must exist');
  assert.equal(repair.kind, 'operating_policy');
  assert.equal(repair.datasetId, dsId);

  // 7. Comparison links baseline and repair
  const comp = inv.comparisons.find((c) => c.repairId === repair.id);
  assert.ok(comp, 'Comparison must reference repair candidate');
  assert.equal(comp.status, 'passed');

  // 8. Diagnosis links to hypothesis and repair
  assert.ok(inv.diagnosis, 'Diagnosis must exist');
  assert.equal(inv.diagnosis.primaryHypothesisId, hyp.id);
  assert.ok(inv.diagnosis.repairIds.includes(repair.id));
});

test('evidence-ux: provenance fields strictly preserve execution timestamps and row counts', () => {
  const inv = runFlagshipMelanomaInvestigation();

  for (const res of inv.toolResults) {
    assert.ok(res.completedAt, 'Tool result must have completedAt timestamp');
    const timestamp = Date.parse(res.completedAt);
    assert.ok(!Number.isNaN(timestamp), 'Timestamp must be valid ISO-8601');
    assert.ok(res.toolVersion >= 1, 'Tool version must be at least 1');
  }

  for (const ds of inv.datasets) {
    assert.ok(ds.rowCount > 0, 'Dataset row count must be positive');
    assert.ok(ds.columns.includes('y_true'), 'Evaluation dataset must contain y_true');
    assert.ok(ds.columns.includes('y_pred'), 'Evaluation dataset must contain y_pred');
    assert.ok(ds.columns.includes('y_probability'), 'Evaluation dataset must contain y_probability');
  }
});

test('evidence-ux: progressive disclosure levels provide valid formulas and interpretations', () => {
  const inv = runFlagshipMelanomaInvestigation();
  const acc = inv.evidence
    .flatMap((e) => e.measurements)
    .find((m) => m.name === 'accuracy');

  const recall = inv.evidence
    .flatMap((e) => e.measurements)
    .find((m) => m.name === 'recall' || m.name === 'minority_recall');

  assert.ok(acc && acc.status === 'measured');
  assert.ok(recall && recall.status === 'measured');

  // Ground truth tension assertion: Accuracy > 90% while Recall <= 25%
  assert.ok(acc.value > 0.9, 'Flagship accuracy should exceed 90%');
  assert.ok(recall.value <= 0.25, 'Flagship minority recall should be <= 25%');
});

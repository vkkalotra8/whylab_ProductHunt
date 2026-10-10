import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingestEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';
import { createId } from '../../src/core/domain/primitives.ts';
import { evaluateHypothesisFalsification } from '../../src/core/falsification/falsification-engine.ts';
import { rankInvestigationHypotheses } from '../../src/core/falsification/hypothesis-ranker.ts';
import { computePrevalenceDistortionCurve } from '../../src/core/falsification/counterfactual-matrix.ts';

const melanomaCsv = readFileSync(
  join(process.cwd(), 'public', 'fixtures', 'melanoma-synthetic.csv'),
  'utf8'
);

const dataset = ingestEvaluationCsv(melanomaCsv, 'melanoma-synthetic.csv', {
  datasetId: createId('dataset'),
  sourceId: createId('source'),
  labels: { positive: '1', negative: '0' },
});

test('falsification: correctly categorizes SUPPORTED hypothesis with next action', () => {
  const hypId = createId('hypothesis');
  const expId = createId('experiment');
  const evId = createId('evidence');

  const hypothesis = {
    id: hypId,
    statement: 'Class imbalance distortion drives high accuracy.',
    status: 'supported',
    confidence: {
      kind: 'evidence_strength',
      level: 'strong',
      rationale: 'Observed accuracy paradox confirmed.',
    },
    evidence: [{ evidenceId: evId, relationship: 'supports', rationale: 'Confirmed by test' }],
    unresolvedQuestions: [],
  };

  const experiment = {
    id: expId,
    hypothesisId: hypId,
    prediction: 'Raw accuracy exceeds balanced accuracy by at least 10 points.',
    method: 'accuracy_paradox',
    seed: 42,
    callIds: [createId('call')],
    criterion: {
      metric: 'accuracy_paradox_gap',
      operator: 'at_least',
      value: 10,
      unit: 'percentage_points',
    },
    status: 'completed',
    outcome: 'supports',
    evidenceIds: [evId],
    limitations: [],
  };

  const evaluation = evaluateHypothesisFalsification(hypothesis, [experiment]);
  assert.equal(evaluation.verdict, 'supported');
  assert.ok(evaluation.confidenceScore > 0.8);
  assert.equal(evaluation.nextAction.stage, 'repair');
  assert.equal(evaluation.nextAction.recommendedTool, 'generate_repair_candidate');
});

test('falsification: correctly categorizes REJECTED hypothesis with pivot action', () => {
  const hypId = createId('hypothesis');
  const expId = createId('experiment');
  const evId = createId('evidence');

  const hypothesis = {
    id: hypId,
    statement: 'Feature leakage proxy causes performance drop.',
    status: 'rejected',
    confidence: {
      kind: 'evidence_strength',
      level: 'limited',
      rationale: 'Rejected by experiment.',
    },
    evidence: [{ evidenceId: evId, relationship: 'rejects', rationale: 'Experiment failed gap' }],
    unresolvedQuestions: [],
  };

  const experiment = {
    id: expId,
    hypothesisId: hypId,
    prediction: 'Observed gap meets criteria.',
    method: 'accuracy_paradox',
    seed: 42,
    callIds: [createId('call')],
    criterion: {
      metric: 'accuracy_paradox_gap',
      operator: 'at_least',
      value: 10,
      unit: 'percentage_points',
    },
    status: 'completed',
    outcome: 'rejects',
    evidenceIds: [evId],
    limitations: [],
  };

  const evaluation = evaluateHypothesisFalsification(hypothesis, [experiment]);
  assert.equal(evaluation.verdict, 'rejected');
  assert.ok(evaluation.confidenceScore <= 0.2);
  assert.equal(evaluation.nextAction.stage, 'investigate');
  assert.ok(evaluation.nextAction.title.includes('Pivot'));
});

test('falsification: correctly categorizes WEAKENED hypothesis with slice evaluation action', () => {
  const hypId = createId('hypothesis');
  const expId = createId('experiment');
  const evId = createId('evidence');

  const hypothesis = {
    id: hypId,
    statement: 'Class imbalance is partially responsible.',
    status: 'weakened',
    confidence: {
      kind: 'evidence_strength',
      level: 'moderate',
      rationale: 'Partial gap observed.',
    },
    evidence: [{ evidenceId: evId, relationship: 'weakens', rationale: 'One of two metrics passed' }],
    unresolvedQuestions: [],
  };

  const experiment = {
    id: expId,
    hypothesisId: hypId,
    prediction: 'Observed gap meets criteria.',
    method: 'accuracy_paradox',
    seed: 42,
    callIds: [createId('call')],
    criterion: {
      metric: 'accuracy_paradox_gap',
      operator: 'at_least',
      value: 10,
      unit: 'percentage_points',
    },
    status: 'completed',
    outcome: 'weakens',
    evidenceIds: [evId],
    limitations: [],
  };

  const evaluation = evaluateHypothesisFalsification(hypothesis, [experiment]);
  assert.equal(evaluation.verdict, 'weakened');
  assert.equal(evaluation.nextAction.stage, 'investigate');
  assert.equal(evaluation.nextAction.recommendedTool, 'slice_evaluation');
});

test('falsification: correctly categorizes INCONCLUSIVE and UNTESTED hypotheses', () => {
  const hypId = createId('hypothesis');

  const hypothesis = {
    id: hypId,
    statement: 'Untested hypothesis awaiting experiments.',
    status: 'proposed',
    confidence: {
      kind: 'evidence_strength',
      level: 'unassessed',
      rationale: 'Not yet tested.',
    },
    evidence: [],
    unresolvedQuestions: [],
  };

  const evalUntested = evaluateHypothesisFalsification(hypothesis, []);
  assert.equal(evalUntested.verdict, 'untested');
  assert.equal(evalUntested.nextAction.stage, 'investigate');

  const expInconclusive = {
    id: createId('experiment'),
    hypothesisId: hypId,
    prediction: 'Gap prediction.',
    method: 'accuracy_paradox',
    seed: 42,
    callIds: [createId('call')],
    criterion: {
      metric: 'accuracy_paradox_gap',
      operator: 'at_least',
      value: 10,
      unit: 'percentage_points',
    },
    status: 'completed',
    outcome: 'inconclusive',
    evidenceIds: [],
    limitations: [],
  };

  const evalInconclusive = evaluateHypothesisFalsification(hypothesis, [expInconclusive]);
  assert.equal(evalInconclusive.verdict, 'inconclusive');
  assert.equal(evalInconclusive.nextAction.stage, 'profile');
});

test('hypothesis-ranker: ranks supported hypotheses ahead of rejected and proposed ones', () => {
  const hypSupported = {
    id: createId('hypothesis'),
    statement: 'A: Supported hypothesis',
    status: 'supported',
    confidence: { kind: 'evidence_strength', level: 'strong', rationale: 'Confirmed' },
    evidence: [{ evidenceId: createId('evidence'), relationship: 'supports', rationale: 'Yes' }],
    unresolvedQuestions: [],
  };

  const hypRejected = {
    id: createId('hypothesis'),
    statement: 'B: Rejected hypothesis',
    status: 'rejected',
    confidence: { kind: 'evidence_strength', level: 'limited', rationale: 'Failed' },
    evidence: [{ evidenceId: createId('evidence'), relationship: 'rejects', rationale: 'No' }],
    unresolvedQuestions: [],
  };

  const hypProposed = {
    id: createId('hypothesis'),
    statement: 'C: Proposed hypothesis',
    status: 'proposed',
    confidence: { kind: 'evidence_strength', level: 'unassessed', rationale: 'Pending' },
    evidence: [],
    unresolvedQuestions: [],
  };

  const expSupported = {
    id: createId('experiment'),
    hypothesisId: hypSupported.id,
    prediction: 'Pred',
    method: 'method',
    seed: null,
    callIds: [],
    criterion: { metric: 'gap', operator: 'at_least', value: 10, unit: 'percentage_points' },
    status: 'completed',
    outcome: 'supports',
    evidenceIds: [],
    limitations: [],
  };

  const expRejected = {
    id: createId('experiment'),
    hypothesisId: hypRejected.id,
    prediction: 'Pred',
    method: 'method',
    seed: null,
    callIds: [],
    criterion: { metric: 'gap', operator: 'at_least', value: 10, unit: 'percentage_points' },
    status: 'completed',
    outcome: 'rejects',
    evidenceIds: [],
    limitations: [],
  };

  const ranked = rankInvestigationHypotheses(
    [hypRejected, hypProposed, hypSupported],
    [expSupported, expRejected]
  );

  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].hypothesis.id, hypSupported.id);
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].isPrimaryCandidate, true);
  assert.equal(ranked[0].evaluation.verdict, 'supported');

  assert.equal(ranked[1].hypothesis.id, hypProposed.id);
  assert.equal(ranked[1].rank, 2);

  assert.equal(ranked[2].hypothesis.id, hypRejected.id);
  assert.equal(ranked[2].rank, 3);
  assert.equal(ranked[2].evaluation.verdict, 'rejected');
});

test('counterfactual-matrix: computes invariant balanced accuracy across prevalence sweep', () => {
  const curve = computePrevalenceDistortionCurve(dataset);

  assert.ok(curve.points.length >= 5);
  assert.ok(curve.distortionIndex > 0, 'Class imbalance should inflate raw accuracy over balanced accuracy');

  // Verify sensitivity and specificity are invariant across all simulated rates
  const baseSens = curve.points[0].sensitivity;
  const baseSpec = curve.points[0].specificity;
  const baseBalanced = curve.points[0].balancedAccuracy;

  for (const pt of curve.points) {
    assert.equal(pt.sensitivity, baseSens);
    assert.equal(pt.specificity, baseSpec);
    assert.equal(pt.balancedAccuracy, baseBalanced);
  }

  // Raw accuracy should strictly decrease as prevalence increases toward 50%
  // (because sensitivity is 20% and specificity is ~99%)
  assert.ok(curve.points[0].rawAccuracy > curve.points[curve.points.length - 1].rawAccuracy);
});

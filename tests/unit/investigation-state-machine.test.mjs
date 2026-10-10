import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDraftInvestigation,
  deriveInvestigationStage,
  addSourceAndDataset,
  recordToolCall,
  recordToolResult,
  recordHypothesis,
  recordExperiment,
  recordRepairCandidate,
  recordComparison,
  finalizeInvestigationWithDiagnosis,
  failInvestigation,
  InvalidStateTransitionError,
  InvestigationInvariantError,
} from '../../src/core/investigation/state-machine.ts';
import {
  getInvestigation,
  saveInvestigation,
  createInvestigation,
  listInvestigations,
  deleteInvestigation,
  resetInvestigationStore,
} from '../../src/core/investigation/store.ts';
import { createId } from '../../src/core/domain/primitives.ts';

test('createDraftInvestigation: initializes a valid empty draft', () => {
  const inv = createDraftInvestigation('Test investigation objective');
  assert.equal(inv.status, 'draft');
  assert.equal(inv.objective, 'Test investigation objective');
  assert.equal(inv.sources.length, 0);
  assert.equal(inv.datasets.length, 0);
  assert.equal(inv.evidence.length, 0);
  assert.equal(inv.toolCalls.length, 0);
  assert.equal(inv.events.length, 0);
  assert.equal(deriveInvestigationStage(inv), 'ingest');
});

test('deriveInvestigationStage: advances cleanly through all 6 stages', () => {
  let inv = createDraftInvestigation('Stage progression test');
  assert.equal(deriveInvestigationStage(inv), 'ingest');

  const srcId = createId('source');
  const dsId = createId('dataset');

  // Stage 01 -> 02: Add dataset
  inv = addSourceAndDataset(
    inv,
    { id: srcId, kind: 'uploaded_file', name: 'eval.csv', capturedAt: new Date().toISOString(), contentDigest: null },
    {
      id: dsId,
      sourceId: srcId,
      name: 'eval.csv',
      rowCount: 100,
      columns: ['y_true', 'y_pred', 'y_probability'],
      role: 'evaluation',
      task: 'binary_classification',
      targetColumn: 'y_true',
      predictionColumn: 'y_pred',
      probabilityColumn: 'y_probability',
      positiveLabel: '1',
    }
  );
  assert.equal(deriveInvestigationStage(inv), 'profile');

  // Stage 02 -> 03: Record baseline classification metrics
  const callId = createId('call');
  const resId = createId('result');
  const evId = createId('evidence');
  inv = recordToolCall(inv, {
    id: callId,
    investigationId: inv.id,
    tool: 'compute_classification_metrics',
    toolVersion: 1,
    requestedAt: new Date().toISOString(),
    input: { datasetId: dsId, positiveLabel: '1' },
  });
  inv = recordToolResult(
    inv,
    {
      id: resId,
      callId,
      tool: 'compute_classification_metrics',
      toolVersion: 1,
      completedAt: new Date().toISOString(),
      datasetIds: [dsId],
      evidenceIds: [evId],
      status: 'completed',
      output: {
        positiveLabel: '1',
        negativeLabel: '0',
        sampleSize: 100,
        confusion: { truePositive: 20, falsePositive: 5, trueNegative: 70, falseNegative: 5 },
        metrics: [],
      },
      limitations: [],
    },
    [
      {
        id: evId,
        kind: 'measurement',
        description: 'Baseline classification metrics',
        measurements: [
          {
            name: 'accuracy',
            status: 'measured',
            value: 0.9,
            unit: 'ratio',
            sampleSize: 100,
          },
          {
            name: 'recall',
            status: 'measured',
            value: 0.8,
            unit: 'ratio',
            sampleSize: 100,
          },
        ],
        provenance: { kind: 'tool_result', resultId: resId },
      },
    ]
  );
  assert.equal(deriveInvestigationStage(inv), 'investigate');

  // Stage 03 -> 04: Record hypothesis
  const hypId = createId('hypothesis');
  inv = recordHypothesis(inv, {
    id: hypId,
    statement: 'Accuracy paradox hides minority detection failure',
    status: 'proposed',
    confidence: { kind: 'evidence_strength', level: 'limited', rationale: 'Large raw accuracy disparity' },
    evidence: [{ evidenceId: evId, relationship: 'supports', rationale: 'Observed disparity' }],
    unresolvedQuestions: [],
  });
  assert.equal(deriveInvestigationStage(inv), 'verify');

  // Stage 04 -> 05: Record verification experiment
  const expId = createId('experiment');
  inv = recordExperiment(inv, {
    id: expId,
    hypothesisId: hypId,
    prediction: 'Reweighted balanced evaluation will reveal accuracy gap',
    method: 'accuracy_paradox_v1',
    seed: null,
    callIds: [callId],
    criterion: { metric: 'accuracy_paradox_gap', operator: 'at_least', value: 10, unit: 'percentage_points' },
    status: 'completed',
    outcome: 'supports',
    evidenceIds: [evId],
    limitations: [],
  });
  assert.equal(deriveInvestigationStage(inv), 'repair');

  // Stage 05 -> 06: Record before-vs-after comparison
  const repId = createId('repair');
  const compId = createId('comparison');
  inv = recordRepairCandidate(inv, {
    id: repId,
    hypothesisId: hypId,
    rationale: 'Adjust threshold from 0.50 to 0.25 to recover minority class recall.',
    evidenceIds: [evId],
    kind: 'operating_policy',
    verification: 'evaluation_data',
    datasetId: dsId,
    policy: { threshold: 0.25, positiveLabel: '1', comparison: 'greater_than_or_equal', costs: null },
    criterion: { metric: 'recall', operator: 'at_least', value: 0.8, unit: 'ratio' },
  });
  inv = recordComparison(inv, {
    id: compId,
    repairId: repId,
    datasetId: dsId,
    baselinePolicy: { threshold: 0.5, positiveLabel: '1', comparison: 'greater_than_or_equal', costs: null },
    afterPolicy: { threshold: 0.25, positiveLabel: '1', comparison: 'greater_than_or_equal', costs: null },
    baselineEvidenceIds: [evId],
    afterEvidenceIds: [evId],
    criterion: { metric: 'recall', operator: 'at_least', value: 0.8, unit: 'ratio' },
    status: 'passed',
    limitations: [],
  });
  assert.equal(deriveInvestigationStage(inv), 'report');

  // Stage 06: Finalize with Diagnosis
  const diagId = createId('diagnosis');
  inv = finalizeInvestigationWithDiagnosis(inv, {
    id: diagId,
    investigationId: inv.id,
    status: 'completed',
    summary: 'Accuracy paradox confirmed by stratified counterfactual experiment; resolved via cost-sensitive threshold 0.25.',
    evidenceIds: [evId],
    hypothesisIds: [hypId],
    primaryHypothesisId: hypId,
    confidence: { kind: 'evidence_strength', level: 'limited', rationale: 'Verified across counterfactual test' },
    experimentIds: [expId],
    repairIds: [repId],
    comparisonIds: [compId],
    unresolvedQuestions: [],
    limitations: [],
  });
  assert.equal(inv.status, 'completed');
  assert.ok(inv.diagnosis);

  // Test saving completed investigation to store
  saveInvestigation(inv);
  assert.equal(getInvestigation(inv.id)?.status, 'completed');
});

test('state-machine: validates invariants and rejects invalid transitions', () => {
  let inv = createDraftInvestigation('Invariant checks');
  const fakeCallId = createId('call');
  const resId = createId('result');

  // Cannot record tool result with unknown call ID
  assert.throws(
    () =>
      recordToolResult(inv, {
        id: resId,
        callId: fakeCallId,
        tool: 'check_calibration',
        toolVersion: 1,
        completedAt: new Date().toISOString(),
        datasetIds: [],
        evidenceIds: [],
        status: 'completed',
        output: { brierScore: 0.05, reliabilityCurve: [] },
        limitations: [],
      }),
    InvestigationInvariantError
  );

  // Mark investigation failed
  inv = failInvestigation(inv, 'Dataset contains zero rows');
  assert.equal(inv.status, 'failed');
  assert.equal(inv.stopReason, 'Dataset contains zero rows');

  // Cannot dispatch tools once failed
  assert.throws(
    () =>
      recordToolCall(inv, {
        id: createId('call'),
        investigationId: inv.id,
        tool: 'compute_classification_metrics',
        toolVersion: 1,
        requestedAt: new Date().toISOString(),
        input: { datasetId: createId('dataset'), positiveLabel: '1' },
      }),
    InvalidStateTransitionError
  );
});

test('investigation store: saves, lists, retrieves, and deletes investigations', () => {
  resetInvestigationStore();

  // Flagship should be automatically initialized
  const initialList = listInvestigations();
  assert.ok(initialList.length >= 1, 'Store should contain flagship investigation');

  const flagship = getInvestigation('investigation_flagship_melanoma');
  assert.ok(flagship, 'Flagship investigation should be accessible by alias ID');
  assert.equal(flagship.status, 'completed');

  // Create new investigation
  const created = createInvestigation('Store test session');
  assert.ok(created.id.startsWith('investigation_'));
  assert.equal(getInvestigation(created.id)?.objective, 'Store test session');

  // List should now include created investigation
  const updatedList = listInvestigations();
  assert.ok(updatedList.some((s) => s.id === created.id));

  // Delete
  assert.equal(deleteInvestigation(created.id), true);
  assert.equal(getInvestigation(created.id), undefined);
});

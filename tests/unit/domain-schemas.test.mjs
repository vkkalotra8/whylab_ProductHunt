import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ContractError,
  count,
  enumeration,
  ratio,
  text,
} from '../../src/core/domain/schema.ts';
import {
  createId,
  id,
  measurementSchema,
} from '../../src/core/domain/primitives.ts';
import {
  toolSchemas,
} from '../../src/core/domain/tool-contracts.ts';
import {
  validateInvestigation,
} from '../../src/core/domain/validation.ts';

test('schema primitives: text, count, ratio, enumeration', () => {
  assert.equal(text.parse('hello world'), 'hello world');
  assert.throws(() => text.parse(''), ContractError);
  assert.throws(() => text.parse('   '), ContractError);

  assert.equal(count.parse(42), 42);
  assert.throws(() => count.parse(-1), ContractError);
  assert.throws(() => count.parse(3.14), ContractError);

  assert.equal(ratio.parse(0.75), 0.75);
  assert.throws(() => ratio.parse(-0.01), ContractError);
  assert.throws(() => ratio.parse(1.01), ContractError);

  const statusEnum = enumeration(['draft', 'running', 'completed']);
  assert.equal(statusEnum.parse('running'), 'running');
  assert.throws(() => statusEnum.parse('unknown'), ContractError);
});

test('branded IDs: creation and format validation', () => {
  const invId = createId('investigation');
  assert.ok(invId.startsWith('investigation_'));
  assert.equal(id('investigation').parse(invId), invId);

  const evId = createId('evidence');
  assert.ok(evId.startsWith('evidence_'));
  assert.equal(id('evidence').parse(evId), evId);

  assert.throws(() => id('investigation').parse(evId), ContractError);
  assert.throws(() => id('investigation').parse('invalid_id!'), ContractError);
});

test('measurements schema: measured vs undefined handling', () => {
  const measured = measurementSchema.parse({
    name: 'accuracy',
    status: 'measured',
    value: 0.942,
    unit: 'ratio',
    sampleSize: 1000,
  });
  assert.equal(measured.status, 'measured');
  if (measured.status === 'measured') {
    assert.equal(measured.value, 0.942);
  }

  const undef = measurementSchema.parse({
    name: 'pr_auc',
    status: 'undefined',
    reason: 'Probability column is missing',
    unit: 'ratio',
    sampleSize: 1000,
  });
  assert.equal(undef.status, 'undefined');
  if (undef.status === 'undefined') {
    assert.ok(undef.reason.includes('missing'));
  }
});

test('tool-contracts: tool schemas registered for all 10 tools', () => {
  const tools = [
    'profile_dataset',
    'compute_classification_metrics',
    'threshold_sweep',
    'check_calibration',
    'scan_feature_leakage',
    'slice_evaluation',
    'run_drift_tests',
    'run_counterfactual_test',
    'generate_repair_candidate',
    're_evaluate_repair',
  ];
  for (const name of tools) {
    assert.ok(name in toolSchemas, `Tool ${name} should have schema defined`);
  }
  assert.equal(tools.length, 10, 'All 10 diagnostic tools must be verified');
});

test('investigation aggregate: validates valid complete investigation', () => {
  const now = '2026-10-07T12:00:00.000Z';
  const invId = 'investigation_test_1';
  const srcId = 'source_test_1';
  const dsId = 'dataset_test_1';
  const callId = 'call_test_1';
  const resId = 'result_test_1';
  const evId = 'evidence_test_1';
  const hypId = 'hypothesis_test_1';

  const validInv = {
    schemaVersion: 2,
    id: invId,
    objective: 'Test investigation validation invariants',
    status: 'completed',
    stopReason: null,
    createdAt: now,
    updatedAt: now,
    sources: [
      {
        id: srcId,
        kind: 'uploaded_file',
        name: 'eval.csv',
        capturedAt: now,
        contentDigest: null,
      },
    ],
    datasets: [
      {
        id: dsId,
        sourceId: srcId,
        name: 'Evaluation Set',
        rowCount: 100,
        columns: ['y_true', 'y_pred', 'y_probability'],
        role: 'evaluation',
        task: 'binary_classification',
        targetColumn: 'y_true',
        predictionColumn: 'y_pred',
        probabilityColumn: 'y_probability',
        positiveLabel: '1',
      },
    ],
    evidence: [
      {
        id: evId,
        kind: 'measurement',
        description: 'Measured baseline classification metrics',
        measurements: [
          {
            name: 'accuracy',
            status: 'measured',
            value: 0.9,
            unit: 'ratio',
            sampleSize: 100,
          },
        ],
        provenance: {
          kind: 'tool_result',
          resultId: resId,
        },
      },
    ],
    toolCalls: [
      {
        id: callId,
        investigationId: invId,
        tool: 'compute_classification_metrics',
        toolVersion: 1,
        requestedAt: now,
        input: {
          datasetId: dsId,
          positiveLabel: '1',
        },
      },
    ],
    toolResults: [
      {
        id: resId,
        callId: callId,
        tool: 'compute_classification_metrics',
        toolVersion: 1,
        completedAt: now,
        datasetIds: [dsId],
        evidenceIds: [evId],
        status: 'completed',
        limitations: [],
        output: {
          positiveLabel: '1',
          negativeLabel: '0',
          sampleSize: 100,
          confusion: {
            truePositive: 45,
            falsePositive: 5,
            trueNegative: 45,
            falseNegative: 5,
          },
          metrics: [
            {
              name: 'accuracy',
              status: 'measured',
              value: 0.9,
              unit: 'ratio',
              sampleSize: 100,
            },
          ],
        },
      },
    ],
    hypotheses: [
      {
        id: hypId,
        statement: 'Balanced accuracy is degraded by threshold misalignment',
        status: 'supported',
        confidence: {
          kind: 'evidence_strength',
          level: 'moderate',
          rationale: 'Metrics reveal disparity',
        },
        evidence: [
          {
            evidenceId: evId,
            relationship: 'supports',
            rationale: 'Accuracy is 90% but recall on minority is lower',
          },
        ],
        unresolvedQuestions: [],
      },
    ],
    experiments: [],
    repairs: [],
    comparisons: [],
    events: [
      {
        id: 'event_test_1',
        sequence: 0,
        at: now,
        kind: 'investigation_completed',
        entityId: invId,
        message: 'Investigation completed successfully',
      },
    ],
    diagnosis: null,
  };

  const parsed = validateInvestigation(validInv);
  assert.equal(parsed.id, invId);
  assert.equal(parsed.evidence.length, 1);
});

test('investigation validator rejects missing references', () => {
  const now = '2026-10-07T12:00:00.000Z';
  const invalidInv = {
    schemaVersion: 2,
    id: 'investigation_invalid',
    objective: 'Test invalid reference detection',
    status: 'completed',
    stopReason: null,
    createdAt: now,
    updatedAt: now,
    sources: [],
    datasets: [
      {
        id: 'dataset_orphan',
        sourceId: 'source_does_not_exist', // Broken reference
        name: 'Broken Set',
        rowCount: 10,
        columns: ['y_true'],
        role: 'evaluation',
        task: 'binary_classification',
        targetColumn: 'y_true',
        predictionColumn: null,
        probabilityColumn: null,
        positiveLabel: '1',
      },
    ],
    evidence: [],
    toolCalls: [],
    toolResults: [],
    hypotheses: [],
    experiments: [],
    repairs: [],
    comparisons: [],
    events: [],
    diagnosis: null,
  };

  assert.throws(() => validateInvestigation(invalidInv), ContractError);
});

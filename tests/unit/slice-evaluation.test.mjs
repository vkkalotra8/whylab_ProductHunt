import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSlices } from '../../src/core/diagnostics/slice-evaluation.ts';
import { createId } from '../../src/core/domain/primitives.ts';

function createMockDatasetWithSlices(rows, attributes = {}) {
  const dsId = createId('dataset');
  const srcId = createId('source');
  return {
    schemaVersion: 1,
    metadata: {
      id: dsId,
      sourceId: srcId,
      name: 'test.csv',
      rowCount: rows.length,
      columns: ['y_true', 'y_pred', 'y_probability', ...Object.keys(attributes)],
      role: 'evaluation',
      task: 'binary_classification',
      targetColumn: 'y_true',
      predictionColumn: 'y_pred',
      probabilityColumn: 'y_probability',
      positiveLabel: '1',
    },
    source: {
      id: srcId,
      kind: 'uploaded_file',
      name: 'test.csv',
      capturedAt: '2026-10-07T12:00:00.000Z',
      contentDigest: null,
    },
    labels: { positive: '1', negative: '0' },
    rows: rows.map((r, i) => ({
      sourceRow: i + 1,
      actual: r.actual,
      predicted: r.predicted,
      positiveProbability: r.positiveProbability,
      attributes: Object.fromEntries(
        Object.entries(attributes).map(([k, vals]) => [k, vals[i]])
      ),
    })),
    warnings: [],
  };
}

test('evaluateSlices: separates performance metrics by slice column', () => {
  // Site A: 2 rows, perfect predictions
  // Site B: 2 rows, both false negatives
  const rows = [
    { actual: '1', predicted: '1', positiveProbability: 0.9 },
    { actual: '0', predicted: '0', positiveProbability: 0.1 },
    { actual: '1', predicted: '0', positiveProbability: 0.4 },
    { actual: '1', predicted: '0', positiveProbability: 0.3 },
  ];
  const attributes = {
    site: ['Site_A', 'Site_A', 'Site_B', 'Site_B'],
  };

  const dataset = createMockDatasetWithSlices(rows, attributes);

  const report = evaluateSlices(dataset, {
    datasetId: dataset.metadata.id,
    positiveLabel: '1',
    columns: ['site'],
    minimumSampleSize: 2,
  });

  assert.equal(report.output.slices.length, 2);

  const sliceA = report.output.slices.find((s) => s.value === 'Site_A');
  const sliceB = report.output.slices.find((s) => s.value === 'Site_B');

  assert.ok(sliceA !== undefined);
  assert.ok(sliceB !== undefined);

  const accA = sliceA.metrics.find((m) => m.name === 'accuracy')?.value;
  const accB = sliceB.metrics.find((m) => m.name === 'accuracy')?.value;

  assert.equal(accA, 1.0, 'Site A accuracy should be 1.0');
  assert.equal(accB, 0.0, 'Site B accuracy should be 0.0');
});

test('evaluateSlices: respects minimum sample size floor', () => {
  const rows = [
    { actual: '1', predicted: '1', positiveProbability: 0.9 },
    { actual: '0', predicted: '0', positiveProbability: 0.1 },
    { actual: '1', predicted: '1', positiveProbability: 0.8 },
  ];
  // Site C has only 1 row
  const attributes = {
    site: ['Site_A', 'Site_A', 'Site_C'],
  };

  const dataset = createMockDatasetWithSlices(rows, attributes);

  const report = evaluateSlices(dataset, {
    datasetId: dataset.metadata.id,
    positiveLabel: '1',
    columns: ['site'],
    minimumSampleSize: 2,
  });

  // Site C has sample size 1 (< minimumSampleSize 2), flagged with limitation
  assert.equal(report.output.slices.length, 2);
  const sliceC = report.output.slices.find((s) => s.value === 'Site_C');
  assert.ok(sliceC !== undefined);
  assert.ok(sliceC.limitations.some((l) => l.includes('Insufficient sample size')));
});

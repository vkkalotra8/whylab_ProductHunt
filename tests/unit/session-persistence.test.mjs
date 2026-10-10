import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveInvestigation,
  getInvestigation,
  listInvestigations,
  deleteInvestigation,
  saveInvestigationCsv,
  getInvestigationCsv,
  resetInvestigationStore,
} from '../../src/core/investigation/store.ts';
import { createDraftInvestigation } from '../../src/core/investigation/state-machine.ts';
import { createId } from '../../src/core/domain/primitives.ts';

test('session persistence: saves and retrieves investigation across memory and filesystem', () => {
  resetInvestigationStore();

  const inv = createDraftInvestigation('Test Session Persistence');
  inv.datasets = [
    {
      id: createId('dataset'),
      sourceId: createId('source'),
      name: 'customer-churn.csv',
      rowCount: 1500,
      columns: ['y_true', 'y_pred', 'y_probability'],
      role: 'evaluation',
      task: 'binary_classification',
      targetColumn: 'y_true',
      predictionColumn: 'y_pred',
      probabilityColumn: 'y_probability',
      positiveLabel: '1',
    },
  ];

  const rawCsv = 'y_true,y_pred,y_probability\n1,1,0.95\n0,0,0.10';

  saveInvestigation(inv, rawCsv);

  // Retrieve from store
  const retrieved = getInvestigation(inv.id);
  assert.ok(retrieved);
  assert.equal(retrieved.id, inv.id);
  assert.equal(retrieved.objective, 'Test Session Persistence');
  assert.equal(retrieved.datasets[0].name, 'customer-churn.csv');

  // Retrieve raw CSV
  const retrievedCsv = getInvestigationCsv(inv.id);
  assert.equal(retrievedCsv, rawCsv);

  // Verify listInvestigations includes this session with stage and metadata
  const list = listInvestigations();
  const summary = list.find((s) => s.id === inv.id);
  assert.ok(summary);
  assert.equal(summary.datasetName, 'customer-churn.csv');
  assert.equal(summary.rowCount, 1500);
  assert.equal(summary.sourceKind, 'uploaded_file');
  assert.ok(['ingest', 'profile', 'investigate', 'verify', 'repair', 'report'].includes(summary.stage));

  // Clean up
  assert.equal(deleteInvestigation(inv.id), true);
  assert.equal(getInvestigation(inv.id), undefined);
  assert.equal(getInvestigationCsv(inv.id), undefined);
});

test('session persistence: retrieves fixture CSV fallback when investigation references a fixture', () => {
  resetInvestigationStore();

  const inv = createDraftInvestigation('Flagship Reference');
  inv.datasets = [
    {
      id: createId('dataset'),
      sourceId: createId('source'),
      name: 'melanoma-synthetic.csv',
      rowCount: 20000,
      columns: ['y_true', 'y_pred', 'y_probability'],
      role: 'evaluation',
      task: 'binary_classification',
      targetColumn: 'y_true',
      predictionColumn: 'y_pred',
      probabilityColumn: 'y_probability',
      positiveLabel: '1',
    },
  ];

  saveInvestigation(inv);

  const fixtureCsv = getInvestigationCsv(inv.id);
  assert.ok(fixtureCsv);
  deleteInvestigation(inv.id);
});

test('session persistence: saves, retrieves, and lists multi-artifact sets', () => {
  resetInvestigationStore();

  const inv = createDraftInvestigation('Multi Artifact Reliability Session');
  saveInvestigation(inv);

  const mockArtifacts = [
    {
      id: createId('artifact'),
      name: 'train.tsv',
      role: 'training',
      format: 'tsv',
      sizeBytes: 1024,
      contentDigest: null,
      validationStatus: 'valid',
      validationIssues: [],
    },
    {
      id: createId('artifact'),
      name: 'val.tsv',
      role: 'validation',
      format: 'tsv',
      sizeBytes: 512,
      contentDigest: null,
      validationStatus: 'valid',
      validationIssues: [],
    },
    {
      id: createId('artifact'),
      name: 'train.log',
      role: 'training_log',
      format: 'text_log',
      sizeBytes: 2048,
      contentDigest: null,
      validationStatus: 'valid',
      validationIssues: [],
    },
  ];

  import('../../src/core/investigation/store.ts').then(({ saveInvestigationArtifacts, getInvestigationArtifacts }) => {
    saveInvestigationArtifacts(inv.id, mockArtifacts);

    const retrieved = getInvestigationArtifacts(inv.id);
    assert.equal(retrieved.length, 3);
    assert.equal(retrieved[0].name, 'train.tsv');
    assert.equal(retrieved[2].role, 'training_log');

    const list = listInvestigations();
    const summary = list.find((s) => s.id === inv.id);
    assert.ok(summary);
    assert.equal(summary.artifactCount, 3);

    deleteInvestigation(inv.id);
    assert.equal(getInvestigationArtifacts(inv.id).length, 0);
  });
});


import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestMultipleArtifacts } from '../../src/core/diagnostics/multi-artifact-ingestion.ts';
import { evaluateCapabilities, evaluateMultiArtifactCapabilities } from '../../src/core/diagnostics/capability.ts';
import { ingestEvaluationCsv, previewEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';
import { runAutonomousInvestigation } from '../../src/server/orchestrator/investigator.ts';
import { OfflineInvestigatorProvider } from '../../src/server/orchestrator/provider-offline.ts';
import {
  saveInvestigation,
  saveInvestigationArtifacts,
  getInvestigationArtifacts,
  listInvestigations,
  deleteInvestigation,
  resetInvestigationStore,
} from '../../src/core/investigation/store.ts';
import { generateIncidentReport } from '../../src/server/export/incident-report.ts';
import { buildIncidentReportPdf } from '../../src/server/export/pdf-generator.ts';

const TRAIN_CSV = `feature_a,feature_b,label
1.0,2.0,0
1.5,2.5,1
2.0,3.0,0
2.5,3.5,1
3.0,4.0,0`;

const TEST_CSV = `feature_a,feature_b,label,prediction,score
1.1,2.1,0,0,0.12
1.6,2.6,1,1,0.89
2.1,3.1,0,0,0.08
2.6,3.6,1,0,0.44
3.1,4.1,0,0,0.05`;

const TRAINING_LOG = `
Epoch 1: train_loss=0.693, val_loss=0.650, val_f1=0.60
Epoch 2: train_loss=0.520, val_loss=0.510, val_f1=0.75
Epoch 3: train_loss=0.380, val_loss=0.450, val_f1=0.80
Early stopping detected at epoch 3.
`;

test('Milestone 10: Complete Multi-Artifact Investigation Lifecycle E2E', async () => {
  resetInvestigationStore();

  // 1. Ingest multiple artifacts (Training, Evaluation, Training Log)
  const { artifacts, validation } = ingestMultipleArtifacts([
    { name: 'train.csv', content: TRAIN_CSV },
    { name: 'test.csv', content: TEST_CSV },
    { name: 'training.log', content: TRAINING_LOG },
  ]);

  assert.equal(artifacts.length, 3);
  assert.equal(artifacts[0].role, 'training');
  assert.equal(artifacts[1].role, 'evaluation');
  assert.equal(artifacts[2].role, 'training_log');
  assert.equal(validation.valid, true);

  // 2. Evaluate capabilities for primary evaluation dataset + multi-artifacts
  const preview = previewEvaluationCsv(TEST_CSV, 'test.csv');
  const baseCaps = evaluateCapabilities(preview.columns, preview.inferredMapping);
  const combinedCaps = evaluateMultiArtifactCapabilities(artifacts, baseCaps);

  assert.equal(combinedCaps.isSupportedForInvestigation, true);
  const trainDiagCap = combinedCaps.items.find((i) => i.id === 'training_diagnostics');
  assert.ok(trainDiagCap);
  assert.equal(trainDiagCap.status, 'available');

  const splitContamCap = combinedCaps.items.find((i) => i.id === 'split_contamination');
  assert.ok(splitContamCap);
  assert.equal(splitContamCap.status, 'available');

  // 3. Run autonomous investigation with Astra offline provider
  const evalDataset = ingestEvaluationCsv(TEST_CSV, 'test.csv', {
    columnMapping: preview.inferredMapping,
    labels: preview.detectedLabels ?? { positive: '1', negative: '0' },
  });

  const provider = new OfflineInvestigatorProvider(evalDataset);
  const generator = runAutonomousInvestigation(evalDataset, { provider });
  let completedInv = null;

  for await (const event of generator) {
    if (event.type === 'completed') {
      completedInv = event.investigation;
    }
  }

  assert.ok(completedInv, 'Autonomous investigation must complete');
  assert.equal(completedInv.status, 'completed');
  assert.ok(completedInv.evidence.length >= 1, 'Evidence collected');
  assert.ok(completedInv.hypotheses.length >= 1, 'Hypothesis generated');

  // 4. Persist investigation and multi-artifacts
  saveInvestigation(completedInv, TEST_CSV);
  saveInvestigationArtifacts(completedInv.id, artifacts);

  const storedArts = getInvestigationArtifacts(completedInv.id);
  assert.equal(storedArts.length, 3);

  const list = listInvestigations();
  const summary = list.find((s) => s.id === completedInv.id);
  assert.ok(summary);
  assert.equal(summary.datasetName, 'test.csv');
  assert.equal(summary.artifactCount, 3);

  // 5. Generate Incident Report with Artifacts Inventory
  const report = generateIncidentReport(completedInv);
  assert.ok(report.artifacts);
  assert.equal(report.artifacts.length, 3);
  assert.equal(report.artifacts[0].name, 'train.csv');
  assert.equal(report.artifacts[2].name, 'training.log');

  // 6. Generate Direct-Download PDF
  const pdfBytes = buildIncidentReportPdf(report);
  assert.ok(pdfBytes instanceof Uint8Array);
  assert.ok(pdfBytes.length > 2000, 'PDF size should be substantial');

  const pdfStr = Buffer.from(pdfBytes).toString('binary');
  assert.ok(pdfStr.startsWith('%PDF-1.4'));
  assert.ok(pdfStr.includes('Multi-Artifact Evidence Inventory'));
  assert.ok(pdfStr.includes('train.csv'));
  assert.ok(pdfStr.includes('training.log'));
  assert.ok(pdfStr.includes(completedInv.id));

  // 7. Cleanup
  deleteInvestigation(completedInv.id);
  assert.equal(getInvestigationArtifacts(completedInv.id).length, 0);
});

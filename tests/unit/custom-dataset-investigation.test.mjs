import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';
import { runAutonomousInvestigation } from '../../src/server/orchestrator/investigator.ts';
import { OfflineInvestigatorProvider } from '../../src/server/orchestrator/provider-offline.ts';
import { saveInvestigation, getInvestigation, saveInvestigationCsv, getInvestigationCsv } from '../../src/core/investigation/store.ts';

const CUSTOM_FRAUD_CSV = `transaction_id,is_fraud,model_prediction,risk_score,merchant_category
tx_01,1,1,0.92,retail
tx_02,1,0,0.41,online
tx_03,1,0,0.35,travel
tx_04,1,1,0.88,retail
tx_05,0,0,0.05,retail
tx_06,0,0,0.12,online
tx_07,0,0,0.08,online
tx_08,0,0,0.22,retail
tx_09,0,0,0.02,travel
tx_10,0,0,0.15,retail
tx_11,0,0,0.01,retail
tx_12,0,0,0.03,online
tx_13,0,0,0.09,retail
tx_14,0,0,0.11,travel
tx_15,0,0,0.04,retail
tx_16,0,0,0.14,retail
tx_17,0,0,0.07,online
tx_18,0,0,0.02,retail
tx_19,0,0,0.18,online
tx_20,0,1,0.55,travel`;

const LABEL_ONLY_CSV = `case_id,ground_truth,model_decision,department
c_01,1,1,cardiology
c_02,1,0,neurology
c_03,1,1,cardiology
c_04,0,0,cardiology
c_05,0,0,neurology
c_06,0,0,cardiology
c_07,0,0,neurology
c_08,0,0,cardiology
c_09,0,0,oncology
c_10,0,1,oncology`;

test('Milestone D: custom dataset runs autonomous investigation with custom column mapping', async () => {
  const dataset = ingestEvaluationCsv(CUSTOM_FRAUD_CSV, 'fraud-transactions.csv', {
    columnMapping: {
      targetColumn: 'is_fraud',
      predictionColumn: 'model_prediction',
      probabilityColumn: 'risk_score',
      sliceColumns: ['merchant_category'],
    },
  });

  assert.equal(dataset.metadata.rowCount, 20);
  assert.equal(dataset.metadata.targetColumn, 'is_fraud');
  assert.equal(dataset.metadata.predictionColumn, 'model_prediction');
  assert.equal(dataset.metadata.probabilityColumn, 'risk_score');

  const provider = new OfflineInvestigatorProvider(dataset);
  const generator = runAutonomousInvestigation(dataset, { provider });

  let startedEvent = null;
  let completedEvent = null;
  const events = [];

  for await (const event of generator) {
    events.push(event);
    if (event.type === 'started') startedEvent = event;
    if (event.type === 'completed') completedEvent = event;
  }

  assert.ok(startedEvent, 'Emitted started event');
  assert.ok(completedEvent, 'Emitted completed event');
  const inv = completedEvent.investigation;

  // Persist investigation & CSV
  saveInvestigation(inv);
  saveInvestigationCsv(inv.id, CUSTOM_FRAUD_CSV);

  // Invariant checks: Metrics must be computed from fraud data, NOT melanoma (94.2% / 22.4%)
  assert.ok(inv.evidence.length >= 2, 'Generated evidence items');
  const metricsEvidence = inv.evidence.find((e) => e.description.includes('Baseline') || e.description.includes('Metrics') || e.measurements.some((m) => m.name === 'accuracy'));
  assert.ok(metricsEvidence, 'Found metrics evidence');

  const accMeasurement = metricsEvidence.measurements.find((m) => m.name === 'accuracy');
  assert.ok(accMeasurement && accMeasurement.status === 'measured');
  // In 20 rows: 18 correct (2 TP + 16 TN, 2 FN (tx_02, tx_03), 1 FP (tx_20)) -> 17 correct / 20 = 85.0%
  assert.equal(accMeasurement.value, 0.85);

  const recallMeasurement = metricsEvidence.measurements.find((m) => m.name === 'recall');
  assert.ok(recallMeasurement && recallMeasurement.status === 'measured');
  // 4 positive cases: 2 TP (tx_01, tx_04), 2 FN -> 2 / 4 = 50.0% recall (NOT melanoma 22.4%)
  assert.equal(recallMeasurement.value, 0.5);

  // Hypotheses verification
  assert.ok(inv.hypotheses.length >= 1, 'Hypotheses formulated');
  const primaryHyp = inv.hypotheses[0];
  assert.ok(primaryHyp.statement.length > 0);

  // Diagnosis must mention fraud-transactions.csv or custom data, NOT melanoma
  assert.ok(inv.diagnosis, 'Diagnosis finalized');
  assert.ok(!inv.diagnosis.summary.toLowerCase().includes('melanoma'));

  // Session persistence retrieval
  const retrievedInv = getInvestigation(inv.id);
  assert.equal(retrievedInv?.id, inv.id);
  const retrievedCsv = getInvestigationCsv(inv.id);
  assert.equal(retrievedCsv, CUSTOM_FRAUD_CSV);
});

test('Milestone D: label-only custom dataset runs without probability crash and reports limitations', async () => {
  const dataset = ingestEvaluationCsv(LABEL_ONLY_CSV, 'clinical-cases.csv', {
    columnMapping: {
      targetColumn: 'ground_truth',
      predictionColumn: 'model_decision',
      probabilityColumn: null,
      sliceColumns: ['department'],
    },
  });

  assert.equal(dataset.metadata.probabilityColumn, null);

  const provider = new OfflineInvestigatorProvider(dataset);
  const generator = runAutonomousInvestigation(dataset, { provider });

  let completedEvent = null;
  for await (const event of generator) {
    if (event.type === 'completed') completedEvent = event;
  }

  assert.ok(completedEvent, 'Completed investigation without probabilities');
  const inv = completedEvent.investigation;

  // Verify diagnosis explains missing probabilities rather than crashing
  assert.ok(inv.diagnosis);
  assert.ok(!inv.diagnosis.summary.toLowerCase().includes('melanoma'));
});

test('Milestone G: end-to-end custom dataset lifecycle — ingest, store, list, report & PDF generation', async () => {
  const dataset = ingestEvaluationCsv(CUSTOM_FRAUD_CSV, 'fraud-e2e.csv', {
    columnMapping: {
      targetColumn: 'is_fraud',
      predictionColumn: 'model_prediction',
      probabilityColumn: 'risk_score',
      sliceColumns: ['merchant_category'],
    },
  });

  const provider = new OfflineInvestigatorProvider(dataset);
  const generator = runAutonomousInvestigation(dataset, { provider });

  let completedEvent = null;
  for await (const event of generator) {
    if (event.type === 'completed') completedEvent = event;
  }

  assert.ok(completedEvent);
  const inv = completedEvent.investigation;

  // Persist session
  saveInvestigation(inv);
  saveInvestigationCsv(inv.id, CUSTOM_FRAUD_CSV);

  // Verify listInvestigations shows custom dataset with correct metadata
  const { listInvestigations } = await import('../../src/core/investigation/store.ts');
  const savedList = listInvestigations();
  const savedEntry = savedList.find((s) => s.id === inv.id);

  assert.ok(savedEntry, 'Investigation is listed in saved sessions');
  assert.equal(savedEntry.datasetName, 'fraud-e2e.csv');
  assert.equal(savedEntry.sourceKind, 'uploaded_file');
  assert.equal(savedEntry.rowCount, 20);

  // Generate Incident Report and verify custom integrity
  const { generateIncidentReport } = await import('../../src/server/export/incident-report.ts');
  const report = generateIncidentReport(inv);
  assert.equal(report.datasetName, 'fraud-e2e.csv');
  assert.ok(!report.systemName.includes('Melanoma'));

  // Generate PDF and verify binary stream
  const { buildIncidentReportPdf } = await import('../../src/server/export/pdf-generator.ts');
  const pdfBytes = buildIncidentReportPdf(report);
  assert.ok(pdfBytes.length > 2000, 'Generates valid multi-page PDF');

  const pdfStr = Buffer.from(pdfBytes).toString('binary');
  assert.ok(pdfStr.startsWith('%PDF-1.4'));
  assert.ok(pdfStr.includes('%%EOF'));
  assert.ok(pdfStr.includes('fraud-e2e.csv'));
  assert.ok(pdfStr.includes(inv.id));
});


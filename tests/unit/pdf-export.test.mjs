import test from 'node:test';
import assert from 'node:assert/strict';
import { runFlagshipMelanomaInvestigation } from '../../src/core/diagnostics/flagship-melanoma.ts';
import { generateIncidentReport } from '../../src/server/export/incident-report.ts';
import { buildIncidentReportPdf } from '../../src/server/export/pdf-generator.ts';
import { ingestEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';
import { runAutonomousInvestigation } from '../../src/server/orchestrator/investigator.ts';
import { OfflineInvestigatorProvider } from '../../src/server/orchestrator/provider-offline.ts';

const CUSTOM_FRAUD_CSV = `transaction_id,is_fraud,model_prediction,risk_score
tx_01,1,1,0.92
tx_02,1,0,0.41
tx_03,1,0,0.35
tx_04,1,1,0.88
tx_05,0,0,0.05
tx_06,0,0,0.12
tx_07,0,0,0.08
tx_08,0,0,0.22
tx_09,0,0,0.02
tx_10,0,0,0.15`;

test('Milestone F: buildIncidentReportPdf generates valid PDF 1.4 binary stream for flagship investigation', () => {
  const inv = runFlagshipMelanomaInvestigation();
  const report = generateIncidentReport(inv);
  const pdfBytes = buildIncidentReportPdf(report);

  assert.ok(pdfBytes instanceof Uint8Array, 'Returns Uint8Array');
  assert.ok(pdfBytes.length > 1000, `PDF size is reasonable (${pdfBytes.length} bytes)`);

  const pdfStr = Buffer.from(pdfBytes).toString('binary');
  assert.ok(pdfStr.startsWith('%PDF-1.4'), 'Starts with %PDF-1.4 header');
  assert.ok(pdfStr.includes('%%EOF'), 'Ends with %%EOF marker');
  assert.ok(pdfStr.includes('/Type /Catalog'), 'Contains PDF Catalog');
  assert.ok(pdfStr.includes('/Type /Pages'), 'Contains Pages tree');
  assert.ok(pdfStr.includes('WhyLab 2.0'), 'Contains WhyLab 2.0 brand title');
  assert.ok(pdfStr.includes(inv.id), 'Contains exact investigation ID');
  assert.ok(pdfStr.includes(report.reportId), 'Contains report ID');
});

test('Milestone F: buildIncidentReportPdf generates valid PDF for custom dataset with custom metrics', async () => {
  const dataset = ingestEvaluationCsv(CUSTOM_FRAUD_CSV, 'fraud-transactions.csv', {
    columnMapping: {
      targetColumn: 'is_fraud',
      predictionColumn: 'model_prediction',
      probabilityColumn: 'risk_score',
    },
  });

  const provider = new OfflineInvestigatorProvider(dataset);
  const generator = runAutonomousInvestigation(dataset, { provider });
  let customInv = null;
  for await (const event of generator) {
    if (event.type === 'completed') customInv = event.investigation;
  }

  assert.ok(customInv, 'Completed custom investigation');
  const report = generateIncidentReport(customInv);
  assert.equal(report.datasetName, 'fraud-transactions.csv');

  const pdfBytes = buildIncidentReportPdf(report);
  assert.ok(pdfBytes.length > 1000);

  const pdfStr = Buffer.from(pdfBytes).toString('binary');
  assert.ok(pdfStr.startsWith('%PDF-1.4'));
  assert.ok(!pdfStr.includes('Dermatology Melanoma AI Diagnostic Classifier'), 'Does not include melanoma classifier name');
});

test('Milestone 9: buildIncidentReportPdf embeds multi-artifact inventory table', () => {
  const inv = runFlagshipMelanomaInvestigation();
  const report = generateIncidentReport(inv);
  report.artifacts = [
    { name: 'train.csv', role: 'training', format: 'csv', status: 'valid' },
    { name: 'test.csv', role: 'evaluation', format: 'csv', status: 'valid' },
    { name: 'training.log', role: 'training_log', format: 'text_log', status: 'valid' },
  ];

  const pdfBytes = buildIncidentReportPdf(report);
  const pdfStr = Buffer.from(pdfBytes).toString('binary');
  assert.ok(pdfStr.includes('Multi-Artifact Evidence Inventory'), 'Contains multi-artifact section header');
  assert.ok(pdfStr.includes('train.csv'), 'Contains train.csv artifact');
  assert.ok(pdfStr.includes('training.log'), 'Contains training.log artifact');
});


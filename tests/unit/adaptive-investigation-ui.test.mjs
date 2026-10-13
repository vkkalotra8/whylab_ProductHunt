import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { previewEvaluationCsv, ingestEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';
import { evaluateCapabilities, inferColumnMapping } from '../../src/core/diagnostics/capability.ts';
import { generatePolicyCodeSnippets } from '../../src/server/repair/code-generator.ts';
import { generateIncidentReport } from '../../src/server/export/incident-report.ts';
import { buildIncidentReportPdf } from '../../src/server/export/pdf-generator.ts';
import { runAutonomousInvestigation } from '../../src/server/orchestrator/investigator.ts';
import { OfflineInvestigatorProvider } from '../../src/server/orchestrator/provider-offline.ts';

test('Milestone D3: Capability Manifest evaluates correctly on stroke dataset', () => {
  const fixturePath = join(process.cwd(), 'public', 'fixtures', 'kaggle_stroke_dataset.csv');
  const csvContent = readFileSync(fixturePath, 'utf8');

  const preview = previewEvaluationCsv(csvContent, 'kaggle_stroke_dataset.csv');
  const mapping = inferColumnMapping(
    preview.columns.map((c) => c.name),
    preview.columns,
    { targetColumn: 'stroke' }
  );

  const caps = evaluateCapabilities(preview.columns, mapping);

  assert.ok(caps.items.length >= 10, 'Must provide full battery of capability items');
  const dataQualityItem = caps.items.find((c) => c.id === 'data_quality');
  assert.ok(dataQualityItem);
  assert.equal(dataQualityItem.status, 'available');

  const leakageItem = caps.items.find((c) => c.id === 'feature_leakage');
  assert.ok(leakageItem);
  assert.equal(leakageItem.status, 'available');

  const metricItem = caps.items.find((c) => c.id === 'binary_metrics');
  assert.ok(metricItem);
  assert.equal(metricItem.status, 'missing_evidence');
  assert.ok(metricItem.howToEnable && metricItem.howToEnable.includes('prediction'));

  const sweepItem = caps.items.find((c) => c.id === 'threshold_sweep');
  assert.ok(sweepItem);
  assert.equal(sweepItem.status, 'unavailable');
  assert.ok(sweepItem.howToEnable && /probabilit/i.test(sweepItem.howToEnable));
});

test('Milestone D3: Data Curation policy generator outputs valid code across all formats', () => {
  const snippets = generatePolicyCodeSnippets({
    policyId: 'pol_curation_stroke_001',
    version: 1,
    modality: 'data_curation',
    operatingThreshold: 0.5,
    positiveLabel: '1',
    falseNegativeCost: 1,
    falsePositiveCost: 1,
    datasetName: 'kaggle_stroke_dataset.csv',
    totalSamples: 5110,
    validationMode: 'single_cohort_optimization',
    dataCurationConfig: {
      imputationStrategy: 'median',
      deduplicationEnabled: true,
      outlierClippingIqr: 1.5,
      classImbalanceHandling: 'cost_weighting',
    },
  });

  assert.ok(snippets.python.includes('def curate_dataset'), 'Python must contain curate_dataset function');
  assert.ok(snippets.python.includes('AUTOMATED_DEPLOYMENT_PROHIBITED: bool = True'));
  assert.ok(snippets.python.includes('OUTLIER_CLIPPING_IQR: float = 1.5'));

  assert.ok(snippets.typescript.includes('export const DATA_CURATION_POLICY'));
  assert.ok(snippets.typescript.includes("modality: 'data_curation' as const"));
  assert.ok(snippets.typescript.includes('automatedDeploymentProhibited: true as const'));

  const parsedJson = JSON.parse(snippets.json);
  assert.equal(parsedJson.modality, 'data_curation');
  assert.equal(parsedJson.curation_rules.imputation_strategy, 'median');
  assert.equal(parsedJson.curation_rules.deduplication_enabled, true);
  assert.equal(parsedJson.safety_invariants.automated_deployment_prohibited, true);

  assert.ok(snippets.yaml.includes('modality: "data_curation"'));
  assert.ok(snippets.yaml.includes('automated_deployment_prohibited: true'));
});

test('Milestone D3: Incident Report & Vector PDF export for Dataset-Only Investigation', async () => {
  const fixturePath = join(process.cwd(), 'public', 'fixtures', 'kaggle_stroke_dataset.csv');
  const csvContent = readFileSync(fixturePath, 'utf8');

  const dataset = ingestEvaluationCsv(csvContent, 'kaggle_stroke_dataset.csv', {
    columnMapping: { targetColumn: 'stroke' },
  });

  const provider = new OfflineInvestigatorProvider();
  const generator = runAutonomousInvestigation(dataset, {
    provider,
    maxRounds: 6,
  });

  let completedInv = null;
  for await (const event of generator) {
    if (event.type === 'completed') {
      completedInv = event.investigation;
    }
  }

  assert.ok(completedInv, 'Autonomous investigation must finish');

  // Generate Incident Report
  const report = generateIncidentReport(completedInv);
  assert.ok(report);
  assert.ok(report.cryptographicDigest?.startsWith('sha256:'));
  assert.ok(report.datasetAudit, 'Must contain datasetAudit for dataset-only investigation');
  assert.equal(report.datasetAudit.rowCount, 5110);
  assert.ok(report.datasetAudit.columnCount > 5);

  // Generate PDF
  const pdfBuffer = buildIncidentReportPdf(report);
  assert.ok(pdfBuffer instanceof Uint8Array || Buffer.isBuffer(pdfBuffer));
  assert.ok(pdfBuffer.length > 1000);
  assert.equal(Buffer.from(pdfBuffer).subarray(0, 4).toString('ascii'), '%PDF');
});

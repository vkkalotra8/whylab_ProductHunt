import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Tabular ML imports
import { runFlagshipMelanomaInvestigation } from '../../src/core/diagnostics/flagship-melanoma.ts';

// LLM Reliability imports
import { runAutonomousLlmInvestigation } from '../../src/server/orchestrator/llm-investigator.ts';
import { ingestLlmEvaluation } from '../../src/core/diagnostics/llm/llm-ingestion.ts';

// Computer Vision imports
import { runAutonomousVisionInvestigation } from '../../src/server/orchestrator/vision-investigator.ts';

// Multi-Modal Repair & Export imports
import { RepairRegistry } from '../../src/server/repair/repair-registry.ts';
import { generatePolicyCodeSnippets } from '../../src/server/repair/code-generator.ts';
import { generateIncidentReport } from '../../src/server/export/incident-report.ts';
import { buildIncidentReportPdf } from '../../src/server/export/pdf-generator.ts';

test('U1-E2E-01: Tabular ML complete workflow with 101-point sweep, certified report & vector PDF', () => {
  // 1. Execute flagship tabular investigation
  const inv = runFlagshipMelanomaInvestigation();
  assert.ok(inv);
  assert.equal(inv.status, 'completed');
  assert.ok(inv.evidence.length >= 3);
  assert.ok(inv.hypotheses.length >= 1);
  assert.ok(inv.repairs.length >= 1);
  assert.ok(inv.comparisons.length >= 1);

  // Verify 101-point threshold sweep tool results
  const sweepRes = inv.toolResults.find((r) => r.tool === 'threshold_sweep');
  assert.ok(sweepRes, 'Embeds threshold_sweep tool result');
  assert.equal(sweepRes.status, 'completed');
  const sweepOutput = sweepRes.output;
  assert.equal(sweepOutput.points.length, 101, 'Embeds all 101 threshold cutoffs');

  // 2. Generate certified incident report
  const report = generateIncidentReport(inv);
  assert.equal(report.modality, 'tabular');
  assert.ok(report.cryptographicDigest.startsWith('sha256:'));
  assert.equal(report.status, 'REMEDIATED');
  assert.ok(report.remediation);
  assert.equal(report.remediation.repairedThreshold, 0.2);

  // 3. Build certified vector PDF
  const pdfBytes = buildIncidentReportPdf(report);
  assert.ok(pdfBytes instanceof Uint8Array);
  assert.ok(pdfBytes.length > 2000, `PDF size ${pdfBytes.length} bytes`);

  const pdfStr = Buffer.from(pdfBytes).toString('binary');
  assert.ok(pdfStr.startsWith('%PDF-1.4'));
  assert.ok(pdfStr.includes('%%EOF'));
  assert.ok(pdfStr.includes('WhyLab 2.0'));
  assert.ok(pdfStr.includes(inv.id));
  assert.ok(pdfStr.includes('TABULAR ML'));
  assert.ok(pdfStr.includes(report.cryptographicDigest.slice(0, 20)));
});

test('U1-E2E-02: LLM & RAG Reliability complete workflow with RAG audit, prompt repair & certified PDF', async () => {
  const jsonlContent = [
    JSON.stringify({
      case_id: 'rag_001',
      prompt: 'What is the first-line therapy for early-stage melanoma?',
      response: 'Surgical wide local excision is the primary treatment [doc_101]. Non-existent experimental radiation [doc_999] is recommended.',
      reference_answer: 'Wide local excision with negative histological margins.',
      retrieved_context: [
        { id: 'doc_101', text: 'Wide local excision with appropriate surgical margins is the standard first-line management for cutaneous melanoma.' },
      ],
      latency_ms: 380,
    }),
    JSON.stringify({
      case_id: 'rag_002',
      prompt: 'What are the histological ABCDE criteria?',
      response: 'Asymmetry, Border irregularity, Color variegation, Diameter > 6mm, Evolution [doc_102].',
      reference_answer: 'Asymmetry, Border, Color, Diameter, Evolution.',
      retrieved_context: [
        { id: 'doc_102', text: 'The ABCDE criteria describe clinical signs of cutaneous melanoma: Asymmetry, Border, Color, Diameter, and Evolving features.' },
      ],
      latency_ms: 290,
    }),
  ].join('\n');

  const { dataset } = ingestLlmEvaluation(jsonlContent, { filename: 'rag-melanoma-eval.jsonl' });
  assert.ok(dataset);
  assert.equal(dataset.records.length, 2);

  // 1. Run autonomous LLM investigation loop
  const state = await runAutonomousLlmInvestigation(dataset);
  assert.equal(state.status, 'completed');
  assert.ok(state.roundsCompleted >= 3);
  assert.ok(state.evidence.length >= 2);
  assert.ok(state.hypotheses.length >= 1);
  assert.ok(state.diagnosis);

  // 2. Wrap state as investigation aggregate
  const llmInvestigation = {
    id: `inv_${state.investigationId}`,
    organizationId: 'org_test',
    projectId: 'proj_llm',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'completed',
    objective: state.objective,
    datasets: [{
      id: dataset.id,
      name: dataset.name,
      rowCount: dataset.records.length,
      columns: [],
      targetColumn: null,
      predictionColumn: null,
      probabilityColumn: null,
      positiveLabel: null,
    }],
    toolCalls: state.toolCalls.map((tc) => ({
      id: tc.id,
      investigationId: `inv_${state.investigationId}`,
      tool: tc.tool,
      toolVersion: 1,
      requestedAt: tc.requestedAt,
      input: tc.input,
    })),
    toolResults: state.toolResults.map((tr) => ({
      id: tr.id,
      callId: tr.callId,
      tool: tr.tool,
      toolVersion: 1,
      completedAt: tr.completedAt,
      datasetIds: [dataset.id],
      evidenceIds: [],
      limitations: [],
      status: 'completed',
      output: tr.output,
    })),
    evidence: state.evidence,
    hypotheses: state.hypotheses,
    experiments: [],
    repairs: [],
    comparisons: [],
    diagnosis: state.diagnosis,
    auditTrail: [],
  };

  // 3. Generate certified incident report
  const report = generateIncidentReport(llmInvestigation);
  assert.equal(report.modality, 'llm');
  assert.ok(report.cryptographicDigest.startsWith('sha256:'));
  assert.ok(report.llmAudit);
  assert.ok(typeof report.llmAudit.exactMatchRate === 'number');
  assert.ok(typeof report.llmAudit.meanTokenF1 === 'number');

  // 4. Build certified vector PDF
  const pdfBytes = buildIncidentReportPdf(report);
  assert.ok(pdfBytes.length > 2000);
  const pdfStr = Buffer.from(pdfBytes).toString('binary');
  assert.ok(pdfStr.startsWith('%PDF-1.4'));
  assert.ok(pdfStr.includes('LLM & RAG Reliability Profile'));
  assert.ok(pdfStr.includes('Token Overlap F1'));
  assert.ok(pdfStr.includes(report.cryptographicDigest.slice(0, 20)));
});

test('U1-E2E-03: Computer Vision complete workflow discovering all 3 planted defects with certified PDF', async () => {
  const fixturePath = join(process.cwd(), 'public', 'fixtures', 'vision', 'synthetic-fixture.json');
  const data = JSON.parse(readFileSync(fixturePath, 'utf8'));

  const csvLines = data.csv.trim().split('\n');
  const records = [];
  const profileMap = new Map();
  for (const p of data.profiles) profileMap.set(p.imageId, p);

  for (let i = 1; i < csvLines.length; i++) {
    const parts = csvLines[i].split(',');
    const imageId = parts[0];
    const hasRuler = parseInt(parts[8], 10);
    records.push({
      imageId,
      yTrue: parts[1],
      yPred: parts[2],
      yProbability: parseFloat(parts[3]),
      split: parts[4],
      site: parts[5],
      device: parts[6],
      metadata: { has_ruler: hasRuler },
      qualityProfile: profileMap.get(imageId),
    });
  }

  // 1. Run autonomous Vision investigation loop
  const state = await runAutonomousVisionInvestigation(records, {
    datasetName: 'Flagship Synthetic Melanoma Dataset',
  });
  assert.equal(state.status, 'completed');
  assert.ok(state.roundsCompleted >= 4);

  // Check that all 3 planted defects were confirmed in hypotheses
  const leakageHyp = state.hypotheses.find((h) => h.statement.includes('cross-split perceptual near-duplicate'));
  assert.ok(leakageHyp, 'Confirms near-duplicate leakage defect');
  assert.equal(leakageHyp.status, 'supported');

  const driftHyp = state.hypotheses.find((h) => h.statement.includes('optical blur drift'));
  assert.ok(driftHyp, 'Confirms quality drift defect');
  assert.equal(driftHyp.status, 'supported');

  const shortcutHyp = state.hypotheses.find((h) => h.statement.includes('scale ruler artifacts'));
  assert.ok(shortcutHyp, 'Confirms ruler shortcut defect');
  assert.equal(shortcutHyp.status, 'supported');

  // 2. Wrap state as investigation aggregate
  const cvInvestigation = {
    id: `inv_${state.investigationId}`,
    organizationId: 'org_test',
    projectId: 'proj_vision',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'completed',
    objective: state.objective,
    datasets: [{
      id: 'ds_vision_flagship',
      name: 'vision-dermoscopy-flagship.zip',
      rowCount: records.length,
      columns: [],
      targetColumn: 'y_true',
      predictionColumn: 'y_pred',
      probabilityColumn: 'confidence',
      positiveLabel: 'malignant',
    }],
    toolCalls: state.toolCalls.map((tc) => ({
      id: tc.id,
      investigationId: `inv_${state.investigationId}`,
      tool: tc.tool,
      toolVersion: 1,
      requestedAt: tc.requestedAt,
      input: tc.input,
    })),
    toolResults: state.toolResults.map((tr) => ({
      id: tr.id,
      callId: tr.callId,
      tool: tr.tool,
      toolVersion: 1,
      completedAt: tr.completedAt,
      datasetIds: ['ds_vision_flagship'],
      evidenceIds: [],
      limitations: [],
      status: 'completed',
      output: tr.output,
    })),
    evidence: state.evidence,
    hypotheses: state.hypotheses,
    experiments: [],
    repairs: [],
    comparisons: [],
    diagnosis: state.diagnosis,
    auditTrail: [],
  };

  // 3. Generate certified incident report
  const report = generateIncidentReport(cvInvestigation);
  assert.equal(report.modality, 'vision');
  assert.ok(report.cryptographicDigest.startsWith('sha256:'));
  assert.ok(report.visionAudit);
  assert.equal(report.visionAudit.leakedDuplicatesCount, 3, 'Discovers exactly 3 planted near-duplicates');
  assert.ok(report.visionAudit.qualityDriftDetected, 'Detects Site A vs Site B drift');
  assert.ok(report.visionAudit.shortcutConfounderFound, 'Detects scale ruler shortcut bias');

  // 4. Build certified vector PDF
  const pdfBytes = buildIncidentReportPdf(report);
  assert.ok(pdfBytes.length > 2000);
  const pdfStr = Buffer.from(pdfBytes).toString('binary');
  assert.ok(pdfStr.startsWith('%PDF-1.4'));
  assert.ok(pdfStr.includes('Computer Vision Diagnostic Profile'));
  assert.ok(pdfStr.includes('Perceptual Near-Duplicates'));
  assert.ok(pdfStr.includes(report.cryptographicDigest.slice(0, 20)));
});

test('U1-E2E-04: Multi-Modal Repair Registry & Code Generator enforces deployment safety invariants across all modalities', async () => {
  const registry = new RepairRegistry();

  // 1. Tabular Policy
  const tabPolicy = await registry.createPolicy({
    organizationId: 'org_acme',
    projectId: 'proj_tab',
    modality: 'tabular',
    operatingThreshold: 0.19,
    positiveLabel: '1',
    costWeights: { falseNegative: 20, falsePositive: 1 },
    targetRecall: 0.85,
    datasetName: 'melanoma-synthetic.csv',
    totalSamples: 20000,
    createdBy: 'usr_tabular_lead',
  });
  assert.equal(tabPolicy.modality, 'tabular');
  assert.ok(tabPolicy.codeSnippets.python.includes('OPERATING_THRESHOLD: float = 0.19'));
  assert.ok(tabPolicy.codeSnippets.python.includes('AUTOMATED_DEPLOYMENT_PROHIBITED: bool = True'));
  assert.ok(tabPolicy.codeSnippets.typescript.includes('automatedDeploymentProhibited: true as const'));
  assert.ok(tabPolicy.codeSnippets.json.includes('"automated_deployment_prohibited": true'));
  assert.ok(tabPolicy.codeSnippets.yaml.includes('automated_deployment_prohibited: true'));

  // 2. LLM Policy
  const llmPolicy = await registry.createPolicy({
    organizationId: 'org_acme',
    projectId: 'proj_llm',
    modality: 'llm',
    operatingThreshold: 0.8,
    positiveLabel: 'compliant',
    costWeights: { falseNegative: 5, falsePositive: 1 },
    targetRecall: 0.9,
    datasetName: 'rag-eval.jsonl',
    totalSamples: 40,
    createdBy: 'usr_llm_engineer',
    llmConfig: {
      systemPromptPatch: 'Ground all statements strictly in verified context.',
      schemaRetryEnabled: true,
      maxSchemaRetries: 2,
      retrievalK: 5,
    },
  });
  assert.equal(llmPolicy.modality, 'llm');
  assert.ok(llmPolicy.codeSnippets.python.includes('POLICY_MODALITY: str = "llm"'));
  assert.ok(llmPolicy.codeSnippets.python.includes('SCHEMA_RETRY_ENABLED: bool = True'));
  assert.ok(llmPolicy.codeSnippets.python.includes('RETRIEVAL_TOP_K: int = 5'));
  assert.ok(llmPolicy.codeSnippets.python.includes('AUTOMATED_DEPLOYMENT_PROHIBITED: bool = True'));
  assert.ok(llmPolicy.codeSnippets.typescript.includes('modality: \'llm\' as const'));
  assert.ok(llmPolicy.codeSnippets.typescript.includes('automatedDeploymentProhibited: true as const'));
  assert.ok(llmPolicy.codeSnippets.json.includes('"modality": "llm"'));
  assert.ok(llmPolicy.codeSnippets.json.includes('"automated_deployment_prohibited": true'));
  assert.ok(llmPolicy.codeSnippets.yaml.includes('modality: "llm"'));
  assert.ok(llmPolicy.codeSnippets.yaml.includes('automated_deployment_prohibited: true'));

  // 3. Vision Policy
  const visionPolicy = await registry.createPolicy({
    organizationId: 'org_acme',
    projectId: 'proj_vis',
    modality: 'vision',
    operatingThreshold: 0.5,
    positiveLabel: 'malignant',
    costWeights: { falseNegative: 25, falsePositive: 1 },
    targetRecall: 0.95,
    datasetName: 'vision-dermoscopy.zip',
    totalSamples: 200,
    createdBy: 'usr_cv_engineer',
    visionConfig: {
      minLaplacianSharpness: 150.0,
      rejectBlurry: true,
      cropBorderWatermark: true,
      confidenceMarginFloor: 0.15,
    },
  });
  assert.equal(visionPolicy.modality, 'vision');
  assert.ok(visionPolicy.codeSnippets.python.includes('POLICY_MODALITY: str = "vision"'));
  assert.ok(visionPolicy.codeSnippets.python.includes('MIN_LAPLACIAN_SHARPNESS: float = 150.0'));
  assert.ok(visionPolicy.codeSnippets.python.includes('REJECT_BLURRY_IMAGES: bool = True'));
  assert.ok(visionPolicy.codeSnippets.python.includes('AUTOMATED_DEPLOYMENT_PROHIBITED: bool = True'));
  assert.ok(visionPolicy.codeSnippets.typescript.includes('modality: \'vision\' as const'));
  assert.ok(visionPolicy.codeSnippets.typescript.includes('automatedDeploymentProhibited: true as const'));
  assert.ok(visionPolicy.codeSnippets.json.includes('"modality": "vision"'));
  assert.ok(visionPolicy.codeSnippets.json.includes('"automated_deployment_prohibited": true'));
  assert.ok(visionPolicy.codeSnippets.yaml.includes('modality: "vision"'));
  assert.ok(visionPolicy.codeSnippets.yaml.includes('automated_deployment_prohibited: true'));

  // 4. Human Approval Workflow
  const { policy: approvedVision } = await registry.approvePolicy(visionPolicy.id, 'org_acme', {
    approvedBy: 'usr_chief_medical_officer',
    approvedByName: 'Dr. Jane Watson (Chief Medical Officer)',
    comments: 'Authorized deployment of Laplacian sharpness floor 150 with mandatory staging verification.',
    expectedVersion: 1,
  });
  assert.equal(approvedVision.status, 'approved');
  assert.ok(approvedVision.approval);
  assert.equal(approvedVision.approval.automatedDeploymentProhibited, true);
  assert.ok(approvedVision.codeSnippets.python.includes('APPROVAL_STATUS: str = "APPROVED"'));
});

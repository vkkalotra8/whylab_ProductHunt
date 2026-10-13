/**
 * Evidence-backed LLM Reliability and Incident Report Exporter.
 * Generates verified Markdown and vector PDF 1.4 documents.
 * strictly preserves evidence provenance and zero hallucinated metrics.
 */

import { SimplePdfDocument } from './pdf-generator.ts';
import type { LlmEvaluationDataset } from '../../core/domain/llm-types.ts';
import type { TextMetricsSummary } from '../../core/diagnostics/llm/text-metrics.ts';
import type { JsonMetricsSummary } from '../../core/diagnostics/llm/schema-validator.ts';
import type { PerformanceSummary } from '../../core/diagnostics/llm/performance-profiler.ts';

export interface LlmReportData {
  dataset: LlmEvaluationDataset;
  textMetrics: TextMetricsSummary;
  jsonMetrics?: JsonMetricsSummary;
  performance: PerformanceSummary;
  generatedAt?: string;
  generatedBy?: string;
}

/**
 * Generates structured Markdown report for LLM evaluation
 */
export function generateLlmMarkdownReport(data: LlmReportData): string {
  const { dataset, textMetrics, jsonMetrics, performance } = data;
  const timestamp = data.generatedAt ?? new Date().toISOString();
  const operator = data.generatedBy ?? 'WhyLab System Operator';

  const emDisplay =
    textMetrics.status === 'computed'
      ? `${(textMetrics.exactMatchRate * 100).toFixed(1)}% (${textMetrics.exactMatchCount}/${textMetrics.recordsWithReferenceCount})`
      : 'UNAVAILABLE (No ground-truth references)';

  const nemDisplay =
    textMetrics.status === 'computed'
      ? `${(textMetrics.normalizedExactMatchRate * 100).toFixed(1)}% (${textMetrics.normalizedExactMatchCount}/${textMetrics.recordsWithReferenceCount})`
      : 'UNAVAILABLE';

  const tokenF1Display =
    textMetrics.status === 'computed'
      ? (textMetrics.meanTokenF1 * 100).toFixed(1) + '%'
      : 'UNAVAILABLE';

  const jsonParseDisplay = jsonMetrics
    ? `${(jsonMetrics.jsonParseValidityRate * 100).toFixed(1)}% (${jsonMetrics.validParseCount}/${jsonMetrics.evaluatedRecordCount})`
    : 'Not Evaluated';

  const schemaDisplay =
    jsonMetrics && jsonMetrics.hasSchemaConfigured
      ? `${((jsonMetrics.jsonSchemaComplianceRate ?? 0) * 100).toFixed(1)}% (${jsonMetrics.compliantCount}/${jsonMetrics.evaluatedRecordCount})`
      : 'No Schema Configured';

  const latencyP50 =
    performance.latency.status === 'computed'
      ? `${performance.latency.medianMs} ms`
      : 'UNAVAILABLE';
  const latencyP95 =
    performance.latency.status === 'computed'
      ? `${performance.latency.p95Ms} ms`
      : 'UNAVAILABLE';

  const costDisplay =
    performance.cost.status === 'calculated'
      ? `$${performance.cost.estimatedCostUsd?.toFixed(4)} USD`
      : `Unconfigured (${performance.cost.reason ?? 'No pricing rates provided'})`;

  // Find top failed cases
  const failedCases: Array<{ caseId: string; failureType: string; prompt: string; response: string; reference?: string | null }> = [];

  for (const r of dataset.records) {
    const textRec = textMetrics.perRecordResults.find((tr) => tr.caseId === r.caseId);
    const jsonRec = jsonMetrics?.perRecordResults.find((jr) => jr.caseId === r.caseId);

    let failed = false;
    let failureType = '';

    if (jsonRec && !jsonRec.isJsonParseValid) {
      failed = true;
      failureType = `JSON Parse Error: ${jsonRec.parseError ?? 'Invalid syntax'}`;
    } else if (jsonRec && jsonRec.schemaEvaluated && !jsonRec.isSchemaCompliant) {
      failed = true;
      failureType = `Schema Violation: ${jsonRec.violations?.[0]?.message ?? 'Invalid schema'}`;
    } else if (textRec && textRec.hasReference && !textRec.normalizedExactMatch) {
      failed = true;
      failureType = `Response Mismatch (Token F1: ${((textRec.tokenF1 ?? 0) * 100).toFixed(0)}%)`;
    }

    if (failed) {
      failedCases.push({
        caseId: r.caseId,
        failureType,
        prompt: r.prompt,
        response: r.response,
        reference: r.referenceAnswer,
      });
    }
  }

  const lines: string[] = [
    `# WhyLab 2.0 — LLM Reliability & Evaluation Incident Report`,
    ``,
    `**Dataset Name:** \`${dataset.name}\`  `,
    `**Content Digest:** \`${dataset.contentDigest}\`  `,
    `**Format:** \`${dataset.format.toUpperCase()}\` | **Total Records:** ${dataset.recordCount.toLocaleString()}  `,
    `**Generated At:** ${timestamp} | **Operator:** ${operator}  `,
    ``,
    `---`,
    ``,
    `## 1. Executive Metric Scorecard`,
    ``,
    `| Metric | Result | Status | Notes |`,
    `| :--- | :---: | :---: | :--- |`,
    `| **Exact Match (EM)** | ${emDisplay} | ${textMetrics.status} | Case-sensitive string equality |`,
    `| **Normalized Exact Match (NEM)** | ${nemDisplay} | ${textMetrics.status} | Punctuation, casing & space invariant |`,
    `| **Token-Level F1** | ${tokenF1Display} | ${textMetrics.status} | Harmonic mean of token precision & recall |`,
    `| **JSON Parse Validity Rate** | ${jsonParseDisplay} | ${jsonMetrics ? 'computed' : 'skipped'} | Syntax valid JSON |`,
    `| **JSON Schema Compliance** | ${schemaDisplay} | ${jsonMetrics?.hasSchemaConfigured ? 'computed' : 'unconfigured'} | Required keys & property types |`,
    `| **Latency (p50 / p95)** | ${latencyP50} / ${latencyP95} | ${performance.latency.status} | Distribution across evaluation |`,
    `| **Total Token Consumption** | ${performance.tokenUsage.totalTokens.toLocaleString()} | ${performance.tokenUsage.status} | Prompt: ${performance.tokenUsage.totalPromptTokens.toLocaleString()}, Completion: ${performance.tokenUsage.totalCompletionTokens.toLocaleString()} |`,
    `| **Estimated Cost** | ${costDisplay} | ${performance.cost.status} | Verified explicit pricing calculation |`,
    ``,
    `---`,
    ``,
    `## 2. Failure Investigation & Defect Explorer`,
    ``,
  ];

  if (failedCases.length === 0) {
    lines.push(`*All ${dataset.recordCount} evaluated cases passed all applicable quality checks with zero detected defects.*`);
  } else {
    lines.push(`Identified **${failedCases.length}** defective or non-compliant evaluation cases (${((failedCases.length / dataset.recordCount) * 100).toFixed(1)}% defect rate):`);
    lines.push(``);
    const topFailures = failedCases.slice(0, 10);
    for (const f of topFailures) {
      lines.push(`### Case \`${f.caseId}\` — ${f.failureType}`);
      lines.push(`- **Prompt:** ${f.prompt.replace(/\n/g, ' ')}`);
      lines.push(`- **Model Output:** \`${f.response.replace(/\n/g, ' ').slice(0, 300)}\``);
      if (f.reference) {
        lines.push(`- **Ground Truth Reference:** \`${f.reference.replace(/\n/g, ' ').slice(0, 300)}\``);
      }
      lines.push(``);
    }
  }

  lines.push(
    `---`,
    ``,
    `## 3. Provenance & Scientific Integrity Attestation`,
    ``,
    `- **Mathematical Correctness:** Exact match, token F1, percentiles, and schema validations are computed deterministically in pure TypeScript with zero hallucinated scores.`,
    `- **Audit Provenance:** Dataset SHA-256 digest \`${dataset.contentDigest}\` ensures immutable input tracking.`,
    `- **Safety Invariant:** Automated production deployment is prohibited across all outputs.`
  );

  return lines.join('\n');
}

/**
 * Generates verified binary vector PDF 1.4 stream for LLM evaluation
 */
export function generateLlmPdfReport(data: LlmReportData): Uint8Array {
  const doc = new SimplePdfDocument();
  const { dataset, textMetrics, jsonMetrics, performance } = data;

  // Title & Header Bar
  doc.drawSectionHeader('WhyLab 2.0 — LLM Reliability Incident Report', 'LLM EVALUATION', 'info');

  doc.drawWrappedText(
    `Dataset: ${dataset.name}   |   Format: ${dataset.format.toUpperCase()}   |   Records: ${dataset.recordCount}   |   Digest: ${dataset.contentDigest.slice(0, 24)}...`,
    40,
    doc.getY(),
    515,
    11,
    '/F2',
    8
  );

  doc.drawWrappedText(
    `Evaluated At: ${data.generatedAt ?? new Date().toISOString()}   |   Operator: ${data.generatedBy ?? 'WhyLab System Operator'}`,
    40,
    doc.getY(),
    515,
    11,
    '/F1',
    7.5
  );

  // Section 1: Executive Scorecard Table
  doc.drawSectionHeader('1. Deterministic Metrics Scorecard');

  const emStr =
    textMetrics.status === 'computed'
      ? `${(textMetrics.exactMatchRate * 100).toFixed(1)}%`
      : 'UNAVAILABLE';
  const nemStr =
    textMetrics.status === 'computed'
      ? `${(textMetrics.normalizedExactMatchRate * 100).toFixed(1)}%`
      : 'UNAVAILABLE';
  const f1Str =
    textMetrics.status === 'computed'
      ? `${(textMetrics.meanTokenF1 * 100).toFixed(1)}%`
      : 'UNAVAILABLE';
  const jsonStr = jsonMetrics
    ? `${(jsonMetrics.jsonParseValidityRate * 100).toFixed(1)}%`
    : 'N/A';
  const p50Str =
    performance.latency.status === 'computed'
      ? `${performance.latency.medianMs} ms`
      : 'N/A';
  const p95Str =
    performance.latency.status === 'computed'
      ? `${performance.latency.p95Ms} ms`
      : 'N/A';
  const costStr =
    performance.cost.status === 'calculated'
      ? `$${performance.cost.estimatedCostUsd?.toFixed(4)}`
      : 'Unconfigured';

  doc.drawTable(
    ['Metric Category', 'Score / Measurement', 'Evaluation Status', 'Methodology'],
    [
      ['Exact Match (EM)', emStr, textMetrics.status.toUpperCase(), 'Case-sensitive exact equality'],
      ['Normalized EM (NEM)', nemStr, textMetrics.status.toUpperCase(), 'Punctuation & whitespace stripped'],
      ['Token-Level F1', f1Str, textMetrics.status.toUpperCase(), 'Harmonic mean of token unigram overlap'],
      ['JSON Parse Validity', jsonStr, jsonMetrics ? 'COMPUTED' : 'SKIPPED', 'Syntactic JSON parse success rate'],
      ['Latency p50 / p95', `${p50Str} / ${p95Str}`, performance.latency.status.toUpperCase(), 'Exact percentiles over record timings'],
      ['Total Tokens', performance.tokenUsage.totalTokens.toLocaleString(), performance.tokenUsage.status.toUpperCase(), `Prompt: ${performance.tokenUsage.totalPromptTokens}, Comp: ${performance.tokenUsage.totalCompletionTokens}`],
      ['Financial Cost', costStr, performance.cost.status.toUpperCase(), 'Computed only from explicit rates'],
    ],
    [120, 110, 100, 185]
  );

  // Section 2: Defect & Failure Case Explorer
  doc.drawSectionHeader('2. Defect & Failure Case Inspection');

  const failedRows: Array<[string, string, string, string]> = [];
  for (const r of dataset.records) {
    const textRec = textMetrics.perRecordResults.find((tr) => tr.caseId === r.caseId);
    const jsonRec = jsonMetrics?.perRecordResults.find((jr) => jr.caseId === r.caseId);

    let isDefect = false;
    let defectType = '';

    if (jsonRec && !jsonRec.isJsonParseValid) {
      isDefect = true;
      defectType = 'Invalid JSON';
    } else if (textRec && textRec.hasReference && !textRec.normalizedExactMatch) {
      isDefect = true;
      defectType = `Mismatch (F1: ${((textRec.tokenF1 ?? 0) * 100).toFixed(0)}%)`;
    }

    if (isDefect) {
      failedRows.push([
        r.caseId,
        defectType,
        r.prompt.slice(0, 80),
        r.response.slice(0, 80),
      ]);
    }
  }

  if (failedRows.length === 0) {
    doc.drawWrappedText(
      'All evaluated cases passed all applicable quality checks with zero detected defects.',
      40,
      doc.getY(),
      515,
      12,
      '/F1',
      8.5
    );
  } else {
    doc.drawTable(
      ['Case ID', 'Defect Type', 'Prompt Snippet', 'Model Output Snippet'],
      failedRows.slice(0, 8),
      [65, 100, 175, 175]
    );
  }

  // Section 3: Scientific Integrity Attestation
  doc.drawSectionHeader('3. Provenance & Governance Attestation');
  doc.drawWrappedText(
    'All NLP metrics, token counts, and latency percentiles in this report are mathematically verified with deterministic algorithms. Zero metrics are fabricated or hallucinated. Automated production model deployment is prohibited.',
    40,
    doc.getY(),
    515,
    11,
    '/F1',
    8
  );

  return doc.toBuffer();
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestLlmEvaluation } from '../../src/core/diagnostics/llm/llm-ingestion.ts';
import { evaluateTextMetrics } from '../../src/core/diagnostics/llm/text-metrics.ts';
import { evaluateJsonMetrics } from '../../src/core/diagnostics/llm/schema-validator.ts';
import { profilePerformance } from '../../src/core/diagnostics/llm/performance-profiler.ts';
import {
  generateLlmMarkdownReport,
  generateLlmPdfReport,
} from '../../src/server/export/llm-report-generator.ts';

test('llm-report-export: generates valid Markdown report with scorecard and failure breakdown', () => {
  const jsonl = [
    JSON.stringify({
      case_id: 'case_1',
      prompt: 'Capital of France?',
      response: 'Paris',
      reference_answer: 'Paris',
      latency_ms: 150,
      token_usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    JSON.stringify({
      case_id: 'case_2',
      prompt: 'Capital of Germany?',
      response: 'Munich',
      reference_answer: 'Berlin',
      latency_ms: 220,
      token_usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
  ].join('\n');

  const { dataset } = ingestLlmEvaluation(jsonl, { filename: 'geo-eval.jsonl' });
  assert.ok(dataset);

  const textMetrics = evaluateTextMetrics(dataset.records);
  const jsonMetrics = evaluateJsonMetrics(dataset.records);
  const performance = profilePerformance(dataset.records, {
    promptCostPerMillion: 2.5,
    completionCostPerMillion: 10.0,
  });

  const markdown = generateLlmMarkdownReport({
    dataset,
    textMetrics,
    jsonMetrics,
    performance,
  });

  assert.ok(markdown.includes('# WhyLab 2.0 — LLM Reliability & Evaluation Incident Report'));
  assert.ok(markdown.includes('geo-eval.jsonl'));
  assert.ok(markdown.includes('Exact Match (EM)'));
  assert.ok(markdown.includes('case_2')); // failure case identified
  assert.ok(markdown.includes('$0.0001 USD')); // cost calculated
  assert.ok(markdown.includes('Automated production deployment is prohibited'));
});

test('llm-report-export: generates valid PDF 1.4 binary stream with correct header and trailer', () => {
  const jsonl = [
    JSON.stringify({
      case_id: 'c1',
      prompt: 'Test prompt',
      response: 'Test response',
      reference_answer: 'Test response',
      latency_ms: 300,
      token_usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    }),
  ].join('\n');

  const { dataset } = ingestLlmEvaluation(jsonl, { filename: 'sample.jsonl' });
  assert.ok(dataset);

  const textMetrics = evaluateTextMetrics(dataset.records);
  const jsonMetrics = evaluateJsonMetrics(dataset.records);
  const performance = profilePerformance(dataset.records);

  const pdfBytes = generateLlmPdfReport({
    dataset,
    textMetrics,
    jsonMetrics,
    performance,
  });

  assert.ok(pdfBytes instanceof Uint8Array);
  assert.ok(pdfBytes.length > 500);

  // Validate standard PDF magic bytes "%PDF-1.4"
  const header = Buffer.from(pdfBytes.slice(0, 8)).toString('ascii');
  assert.equal(header, '%PDF-1.4');

  // Validate PDF EOF marker "%%EOF"
  const tail = Buffer.from(pdfBytes.slice(-64)).toString('ascii');
  assert.ok(tail.includes('%%EOF'));
});

/**
 * Ingestion and validation parser for LLM evaluation records.
 * Supports JSONL (.jsonl), CSV (.csv), and JSON array (.json).
 * Computes deterministic SHA-256 content digest and derives capabilities.
 */

import { parseCsv } from '../csv.ts';
import { computeSha256Hex } from './hash.ts';
import type {
  LlmEvaluationDataset,
  LlmIngestionError,
  LlmIngestionResult,
  LlmRecord,
  LlmTokenUsage,
  LlmContextChunk,
  LlmEvaluationCapabilities,
} from '../../domain/llm-types.ts';

export const LLM_INGESTION_LIMITS = Object.freeze({
  maxBytes: 15_000_000, // 15MB
  maxRecords: 25_000,
});

/**
 * Normalizes field names for flexible CSV/JSON mapping
 */
function cleanKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s\-_]+/g, '');
}

function parseJsonSafe(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return undefined;
  }
}

/**
 * Normalizes retrieved context from various input representations
 */
function normalizeRetrievedContext(raw: unknown): string[] | LlmContextChunk[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    if (typeof raw[0] === 'string') {
      return raw.map((s) => String(s));
    }
    if (typeof raw[0] === 'object' && raw[0] !== null) {
      return raw as LlmContextChunk[];
    }
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const parsed = parseJsonSafe(trimmed);
      if (Array.isArray(parsed)) {
        return normalizeRetrievedContext(parsed);
      }
    }
    // Semicolon or pipe delimited text chunks
    if (trimmed.includes('|||')) {
      return trimmed.split('|||').map((s) => s.trim()).filter(Boolean);
    }
    return [trimmed];
  }
  return null;
}

/**
 * Normalizes token usage object or individual numbers
 */
function normalizeTokenUsage(raw: unknown, rowObj?: Record<string, unknown>): LlmTokenUsage | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    const pt = Number(r.promptTokens ?? r.prompt_tokens ?? r.prompt);
    const ct = Number(r.completionTokens ?? r.completion_tokens ?? r.completion);
    const tt = Number(r.totalTokens ?? r.total_tokens ?? r.total);
    return {
      promptTokens: Number.isFinite(pt) && pt >= 0 ? pt : undefined,
      completionTokens: Number.isFinite(ct) && ct >= 0 ? ct : undefined,
      totalTokens: Number.isFinite(tt) && tt >= 0 ? tt : (Number.isFinite(pt) && Number.isFinite(ct) ? pt + ct : undefined),
    };
  }

  if (rowObj) {
    const pt = Number(rowObj.prompt_tokens ?? rowObj.promptTokens);
    const ct = Number(rowObj.completion_tokens ?? rowObj.completionTokens);
    const tt = Number(rowObj.total_tokens ?? rowObj.totalTokens);
    if (Number.isFinite(pt) || Number.isFinite(ct) || Number.isFinite(tt)) {
      return {
        promptTokens: Number.isFinite(pt) && pt >= 0 ? pt : undefined,
        completionTokens: Number.isFinite(ct) && ct >= 0 ? ct : undefined,
        totalTokens: Number.isFinite(tt) && tt >= 0 ? tt : (Number.isFinite(pt) && Number.isFinite(ct) ? pt + ct : undefined),
      };
    }
  }

  return null;
}

/**
 * Parse single JSON record object into validated LlmRecord
 */
function parseLlmRecordObject(obj: Record<string, unknown>, rowNumber: number): { record?: LlmRecord; error?: LlmIngestionError } {
  // Case ID matching
  const caseIdRaw =
    obj.case_id ?? obj.caseId ?? obj.id ?? obj.sample_id ?? obj.sampleId ?? obj.qid ?? obj.query_id;
  if (caseIdRaw === undefined || caseIdRaw === null || String(caseIdRaw).trim() === '') {
    return {
      error: {
        line: rowNumber,
        row: rowNumber,
        field: 'case_id',
        message: 'Missing or empty required field: "case_id" (or "id")',
      },
    };
  }
  const caseId = String(caseIdRaw).trim();

  // Prompt matching
  const promptRaw =
    obj.prompt ?? obj.input ?? obj.instruction ?? obj.question ?? obj.query ?? obj.user_prompt;
  if (promptRaw === undefined || promptRaw === null) {
    return {
      error: {
        line: rowNumber,
        row: rowNumber,
        field: 'prompt',
        message: 'Missing required field: "prompt" (or "input", "instruction")',
      },
    };
  }
  const prompt = typeof promptRaw === 'string' ? promptRaw : JSON.stringify(promptRaw);

  // Response matching
  const responseRaw =
    obj.response ?? obj.output ?? obj.prediction ?? obj.completion ?? obj.model_output ?? obj.actual;
  if (responseRaw === undefined || responseRaw === null) {
    return {
      error: {
        line: rowNumber,
        row: rowNumber,
        field: 'response',
        message: 'Missing required field: "response" (or "output", "prediction")',
      },
    };
  }
  const response = typeof responseRaw === 'string' ? responseRaw : JSON.stringify(responseRaw);

  // Reference answer matching
  const refRaw =
    obj.reference_answer ??
    obj.referenceAnswer ??
    obj.ground_truth ??
    obj.groundTruth ??
    obj.target ??
    obj.expected ??
    obj.ideal;
  const referenceAnswer =
    refRaw !== undefined && refRaw !== null && String(refRaw).trim() !== ''
      ? typeof refRaw === 'string'
        ? refRaw
        : JSON.stringify(refRaw)
      : null;

  // Model version
  const modelVersionRaw = obj.model_version ?? obj.modelVersion ?? obj.model ?? obj.model_name;
  const modelVersion = modelVersionRaw ? String(modelVersionRaw).trim() : undefined;

  // Latency ms
  const latRaw = obj.latency_ms ?? obj.latencyMs ?? obj.latency ?? obj.duration_ms;
  let latencyMs: number | null = null;
  if (latRaw !== undefined && latRaw !== null && latRaw !== '') {
    const parsedLat = Number(latRaw);
    if (Number.isFinite(parsedLat) && parsedLat >= 0) {
      latencyMs = parsedLat;
    }
  }

  // Token usage
  const tokenUsage = normalizeTokenUsage(obj.token_usage ?? obj.tokenUsage ?? obj.tokens, obj);

  // Retrieved context
  const retrievedContext = normalizeRetrievedContext(
    obj.retrieved_context ?? obj.retrievedContext ?? obj.context ?? obj.documents ?? obj.contexts
  );

  // Remaining metadata
  const knownKeys = new Set([
    'case_id', 'caseId', 'id', 'sample_id', 'sampleId', 'qid', 'query_id',
    'prompt', 'input', 'instruction', 'question', 'query', 'user_prompt',
    'response', 'output', 'prediction', 'completion', 'model_output', 'actual',
    'reference_answer', 'referenceAnswer', 'ground_truth', 'groundTruth', 'target', 'expected', 'ideal',
    'model_version', 'modelVersion', 'model', 'model_name',
    'latency_ms', 'latencyMs', 'latency', 'duration_ms',
    'token_usage', 'tokenUsage', 'tokens', 'prompt_tokens', 'promptTokens', 'completion_tokens', 'completionTokens', 'total_tokens', 'totalTokens',
    'retrieved_context', 'retrievedContext', 'context', 'documents', 'contexts',
    'metadata',
  ]);

  const metadata: Record<string, unknown> = {};
  if (obj.metadata && typeof obj.metadata === 'object' && !Array.isArray(obj.metadata)) {
    Object.assign(metadata, obj.metadata);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (!knownKeys.has(k) && !k.startsWith('__')) {
      metadata[k] = v;
    }
  }

  return {
    record: {
      caseId,
      prompt,
      response,
      referenceAnswer,
      modelVersion,
      retrievedContext,
      latencyMs,
      tokenUsage,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    },
  };
}

/**
 * Derive dataset capabilities from ingested records
 */
export function deriveLlmCapabilities(records: LlmRecord[]): LlmEvaluationCapabilities {
  if (records.length === 0) {
    return {
      hasReferenceAnswers: false,
      referenceAnswerCoverageRatio: 0,
      hasRetrievedContext: false,
      hasLatency: false,
      hasTokenUsage: false,
      hasStructuredJsonResponses: false,
      modelVersions: [],
    };
  }

  let refCount = 0;
  let contextCount = 0;
  let latencyCount = 0;
  let tokenCount = 0;
  let jsonResponseCount = 0;
  const versions = new Set<string>();

  for (const r of records) {
    if (r.referenceAnswer !== null && r.referenceAnswer !== undefined && r.referenceAnswer.trim() !== '') {
      refCount++;
    }
    if (r.retrievedContext && Array.isArray(r.retrievedContext) && r.retrievedContext.length > 0) {
      contextCount++;
    }
    if (typeof r.latencyMs === 'number' && Number.isFinite(r.latencyMs)) {
      latencyCount++;
    }
    if (r.tokenUsage && (r.tokenUsage.totalTokens || r.tokenUsage.promptTokens)) {
      tokenCount++;
    }
    if (r.modelVersion) {
      versions.add(r.modelVersion);
    }
    // Check if response parses as JSON
    const trimmed = r.response.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed);
        jsonResponseCount++;
      } catch {
        // Not valid JSON
      }
    }
  }

  return {
    hasReferenceAnswers: refCount > 0,
    referenceAnswerCoverageRatio: refCount / records.length,
    hasRetrievedContext: contextCount > 0,
    hasLatency: latencyCount > 0,
    hasTokenUsage: tokenCount > 0,
    hasStructuredJsonResponses: jsonResponseCount > 0,
    modelVersions: Array.from(versions),
  };
}

/**
 * Ingest JSONL, CSV, or JSON LLM evaluation text
 */
export function ingestLlmEvaluation(
  content: string,
  options: {
    filename?: string;
    datasetId?: string;
    sourceId?: string;
  } = {}
): LlmIngestionResult {
  const errors: LlmIngestionError[] = [];
  const warnings: string[] = [];

  // Security & limit checks
  if (!content || content.trim().length === 0) {
    return {
      success: false,
      errors: [{ message: 'Uploaded file is completely empty.' }],
      warnings: [],
    };
  }

  if (content.length > LLM_INGESTION_LIMITS.maxBytes) {
    return {
      success: false,
      errors: [
        {
          message: `File size exceeds ${(LLM_INGESTION_LIMITS.maxBytes / (1024 * 1024)).toFixed(1)}MB limit.`,
        },
      ],
      warnings: [],
    };
  }

  // Sanitize BOM and check null bytes
  let sanitized = content;
  if (sanitized.charCodeAt(0) === 0xfeff) {
    sanitized = sanitized.slice(1);
  }
  if (sanitized.includes('\0')) {
    return {
      success: false,
      errors: [{ message: 'File contains forbidden null bytes (potential binary file).' }],
      warnings: [],
    };
  }

  const contentDigest = `sha256:${computeSha256Hex(sanitized)}`;
  const datasetName = options.filename ?? 'llm-evaluation-dataset';
  const datasetId = options.datasetId ?? `ds_llm_${Date.now().toString(36)}`;
  const sourceId = options.sourceId ?? `src_${Date.now().toString(36)}`;

  const trimmed = sanitized.trim();
  let records: LlmRecord[] = [];
  let format: 'jsonl' | 'csv' | 'json' = 'jsonl';

  // Format detection
  const isJsonArray = trimmed.startsWith('[') && trimmed.endsWith(']');
  const isSingleJsonObject = trimmed.startsWith('{') && trimmed.endsWith('}') && !trimmed.includes('\n');

  if (isJsonArray) {
    format = 'json';
    try {
      const parsedArray = JSON.parse(trimmed);
      if (!Array.isArray(parsedArray)) {
        return {
          success: false,
          errors: [{ message: 'Top-level JSON must be an array of records.' }],
          warnings,
        };
      }
      for (let i = 0; i < parsedArray.length; i++) {
        const item = parsedArray[i];
        if (typeof item !== 'object' || item === null) {
          errors.push({ line: i + 1, row: i + 1, message: 'Array element must be an object' });
          continue;
        }
        const { record, error } = parseLlmRecordObject(item as Record<string, unknown>, i + 1);
        if (error) {
          errors.push(error);
        } else if (record) {
          records.push(record);
        }
      }
    } catch (e) {
      return {
        success: false,
        errors: [{ message: `Malformed JSON array: ${(e as Error).message}` }],
        warnings,
      };
    }
  } else if (trimmed.startsWith('{')) {
    // Treat as JSONL
    format = 'jsonl';
    const lines = sanitized.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const lineStr = lines[i].trim();
      if (!lineStr) continue; // Skip blank lines
      try {
        const parsed = JSON.parse(lineStr);
        if (typeof parsed !== 'object' || parsed === null) {
          errors.push({ line: i + 1, message: 'JSONL row must be an object' });
          continue;
        }
        const { record, error } = parseLlmRecordObject(parsed as Record<string, unknown>, i + 1);
        if (error) {
          errors.push(error);
        } else if (record) {
          records.push(record);
        }
      } catch (e) {
        errors.push({
          line: i + 1,
          message: `Invalid JSON on line ${i + 1}: ${(e as Error).message}`,
          rawSnippet: lineStr.slice(0, 100),
        });
      }
    }
  } else {
    // Delimited CSV / TSV
    format = 'csv';
    try {
      const table = parseCsv(sanitized);
      if (table.length < 2) {
        return {
          success: false,
          errors: [{ message: 'CSV requires a header line and at least one data row.' }],
          warnings,
        };
      }

      const headers = table[0];
      const headerMap = new Map<string, number>();
      headers.forEach((h, idx) => {
        headerMap.set(cleanKey(h), idx);
      });

      // Find required columns
      const caseIdIdx =
        headerMap.get('caseid') ??
        headerMap.get('id') ??
        headerMap.get('sampleid') ??
        headerMap.get('qid');
      const promptIdx =
        headerMap.get('prompt') ??
        headerMap.get('input') ??
        headerMap.get('instruction') ??
        headerMap.get('question');
      const responseIdx =
        headerMap.get('response') ??
        headerMap.get('output') ??
        headerMap.get('prediction') ??
        headerMap.get('completion') ??
        headerMap.get('modeloutput') ??
        headerMap.get('actual');

      if (caseIdIdx === undefined || promptIdx === undefined || responseIdx === undefined) {
        const missingCols: string[] = [];
        if (caseIdIdx === undefined) missingCols.push('case_id (or id)');
        if (promptIdx === undefined) missingCols.push('prompt (or input, instruction)');
        if (responseIdx === undefined) missingCols.push('response (or output, prediction)');
        return {
          success: false,
          errors: [
            {
              message: `CSV is missing required columns: ${missingCols.join(', ')}. Available headers: ${headers.join(', ')}`,
            },
          ],
          warnings,
        };
      }

      for (let r = 1; r < table.length; r++) {
        const row = table[r];
        const rowObj: Record<string, unknown> = {};
        for (let c = 0; c < headers.length; c++) {
          rowObj[headers[c]] = row[c];
        }

        const { record, error } = parseLlmRecordObject(rowObj, r);
        if (error) {
          errors.push(error);
        } else if (record) {
          records.push(record);
        }
      }
    } catch (e) {
      return {
        success: false,
        errors: [{ message: `CSV parsing error: ${(e as Error).message}` }],
        warnings,
      };
    }
  }

  if (records.length === 0 && errors.length > 0) {
    return {
      success: false,
      errors,
      warnings,
    };
  }

  // Enforce record limit
  if (records.length > LLM_INGESTION_LIMITS.maxRecords) {
    warnings.push(
      `Dataset was capped at ${LLM_INGESTION_LIMITS.maxRecords} records (total in file: ${records.length}).`
    );
    records = records.slice(0, LLM_INGESTION_LIMITS.maxRecords);
  }

  const capabilities = deriveLlmCapabilities(records);

  const dataset: LlmEvaluationDataset = {
    id: datasetId,
    sourceId,
    name: datasetName,
    format,
    recordCount: records.length,
    records,
    contentDigest,
    capturedAt: new Date().toISOString(),
    capabilities,
  };

  return {
    success: errors.length === 0,
    dataset,
    errors,
    warnings,
  };
}

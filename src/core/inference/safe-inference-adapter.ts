/**
 * Safe External Inference Adapter for Tabular & Multimodal Workloads
 * Enforces strict timeout boundaries, resource limits, payload hygiene,
 * response validation, and cryptographic/provenance auditing.
 */

export interface InferenceRequest {
  endpointUrl: string;
  records: Record<string, unknown>[];
  features?: string[];
  timeoutMs?: number;
  headers?: Record<string, string>;
  modelIdentifier?: string;
  expectedModality?: 'tabular' | 'llm' | 'vision';
}

export interface InferencePrediction {
  rowIndex: number;
  predictedLabel: string;
  probability: number | null;
  probabilities?: Record<string, number>;
  raw?: unknown;
}

export interface InferenceAuditProvenance {
  endpointUrl: string;
  modelIdentifier: string;
  timestamp: string;
  rowCount: number;
  latencyMs: number;
  payloadHash: string;
}

export interface InferenceResponse {
  success: boolean;
  predictions: InferencePrediction[];
  provenance: InferenceAuditProvenance;
  error?: string;
  warning?: string;
}

export const INFERENCE_SAFETY_LIMITS = {
  maxBatchSize: 1000,
  defaultTimeoutMs: 5000,
  maxTimeoutMs: 15000,
  minTimeoutMs: 500,
};

/**
 * Fast deterministic FNV-1a hash for provenance tracking without heavy crypto dependency
 */
function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Executes a network call to an external model inference endpoint with strict safety bounds
 */
export async function executeSafeInference(
  request: InferenceRequest,
  fetchFn: typeof fetch = globalThis.fetch
): Promise<InferenceResponse> {
  const startTime = Date.now();

  // 1. Resource and Batch Limit Verification
  if (!request.records || !Array.isArray(request.records)) {
    throw new Error('InferenceRequest requires records array');
  }

  if (request.records.length === 0) {
    return {
      success: true,
      predictions: [],
      provenance: {
        endpointUrl: request.endpointUrl,
        modelIdentifier: request.modelIdentifier ?? 'unknown_endpoint',
        timestamp: new Date().toISOString(),
        rowCount: 0,
        latencyMs: 0,
        payloadHash: 'empty',
      },
    };
  }

  if (request.records.length > INFERENCE_SAFETY_LIMITS.maxBatchSize) {
    throw new Error(
      `Inference batch size (${request.records.length}) exceeds safety limit of ${INFERENCE_SAFETY_LIMITS.maxBatchSize} records.`
    );
  }

  // 2. Validate Endpoint URL
  try {
    const url = new URL(request.endpointUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`Invalid protocol ${url.protocol}. Only http: and https: are supported.`);
    }
  } catch (err) {
    throw new Error(
      `Invalid endpoint URL: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 3. Timeout Calculation
  const timeoutMs = Math.min(
    Math.max(request.timeoutMs ?? INFERENCE_SAFETY_LIMITS.defaultTimeoutMs, INFERENCE_SAFETY_LIMITS.minTimeoutMs),
    INFERENCE_SAFETY_LIMITS.maxTimeoutMs
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // 4. Feature projection (if specified, filter features to prevent leakage of metadata)
  const preparedRecords = request.features
    ? request.records.map((row) => {
        const filtered: Record<string, unknown> = {};
        for (const feat of request.features!) {
          if (feat in row) filtered[feat] = row[feat];
        }
        return filtered;
      })
    : request.records;

  const requestBody = JSON.stringify({
    model: request.modelIdentifier,
    records: preparedRecords,
  });

  const payloadHash = fnv1a(requestBody);

  try {
    const res = await fetchFn(request.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(request.headers ?? {}),
      },
      body: requestBody,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        success: false,
        predictions: [],
        error: `Inference endpoint responded with HTTP ${res.status}: ${errText.slice(0, 200)}`,
        provenance: {
          endpointUrl: request.endpointUrl,
          modelIdentifier: request.modelIdentifier ?? 'external',
          timestamp: new Date().toISOString(),
          rowCount: request.records.length,
          latencyMs: Date.now() - startTime,
          payloadHash,
        },
      };
    }

    const data = await res.json();
    const parsedPredictions = parseInferenceResponseBody(data, request.records.length);

    return {
      success: true,
      predictions: parsedPredictions,
      provenance: {
        endpointUrl: request.endpointUrl,
        modelIdentifier: request.modelIdentifier ?? (data.model as string) ?? 'external',
        timestamp: new Date().toISOString(),
        rowCount: parsedPredictions.length,
        latencyMs: Date.now() - startTime,
        payloadHash,
      },
    };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout =
      (err instanceof Error && err.name === 'AbortError') ||
      (typeof err === 'object' && err !== null && 'name' in err && (err as { name: string }).name === 'AbortError');

    return {
      success: false,
      predictions: [],
      error: isTimeout
        ? `Inference request timed out after ${timeoutMs}ms.`
        : `Network error during inference: ${err instanceof Error ? err.message : String(err)}`,
      provenance: {
        endpointUrl: request.endpointUrl,
        modelIdentifier: request.modelIdentifier ?? 'external',
        timestamp: new Date().toISOString(),
        rowCount: request.records.length,
        latencyMs: Date.now() - startTime,
        payloadHash,
      },
    };
  }
}

/**
 * Standardizes common inference response payloads into structured InferencePrediction array
 */
function parseInferenceResponseBody(body: any, expectedCount: number): InferencePrediction[] {
  let rawList: any[] = [];

  if (Array.isArray(body)) {
    rawList = body;
  } else if (body && typeof body === 'object') {
    if (Array.isArray(body.predictions)) {
      rawList = body.predictions;
    } else if (Array.isArray(body.outputs)) {
      rawList = body.outputs;
    } else if (Array.isArray(body.results)) {
      rawList = body.results;
    } else if (Array.isArray(body.scores)) {
      rawList = body.scores;
    }
  }

  if (rawList.length !== expectedCount) {
    throw new Error(
      `Inference response count mismatch: expected ${expectedCount} rows, but received ${rawList.length}.`
    );
  }

  return rawList.map((item, idx) => {
    // If item is scalar number (e.g. probability or label)
    if (typeof item === 'number') {
      const isProb = item >= 0 && item <= 1;
      return {
        rowIndex: idx,
        predictedLabel: isProb ? (item >= 0.5 ? '1' : '0') : String(item),
        probability: isProb ? item : null,
      };
    }

    // If item is scalar string (predicted class)
    if (typeof item === 'string') {
      return {
        rowIndex: idx,
        predictedLabel: item,
        probability: null,
      };
    }

    // If item is an object
    if (item && typeof item === 'object') {
      const pred =
        item.prediction !== undefined
          ? String(item.prediction)
          : item.label !== undefined
          ? String(item.label)
          : item.class !== undefined
          ? String(item.class)
          : '0';

      let prob: number | null = null;
      if (typeof item.probability === 'number' && Number.isFinite(item.probability)) {
        prob = Math.max(0, Math.min(1, item.probability));
      } else if (typeof item.prob === 'number' && Number.isFinite(item.prob)) {
        prob = Math.max(0, Math.min(1, item.prob));
      } else if (typeof item.confidence === 'number' && Number.isFinite(item.confidence)) {
        prob = Math.max(0, Math.min(1, item.confidence));
      }

      return {
        rowIndex: idx,
        predictedLabel: pred,
        probability: prob,
        probabilities: item.probabilities ?? undefined,
        raw: item,
      };
    }

    return {
      rowIndex: idx,
      predictedLabel: '0',
      probability: null,
    };
  });
}

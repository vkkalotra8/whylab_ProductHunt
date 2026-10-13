/**
 * RAG Retrieval Evaluation Engine.
 * Computes deterministic IR metrics: Recall@k, Precision@k, Hit Rate@k, and Mean Reciprocal Rank (MRR).
 * Strictly reports metrics as UNAVAILABLE if ground-truth relevance labels are missing.
 */

export interface RetrievalQueryRecord {
  caseId: string;
  retrievedDocIds: string[];
  relevantDocIds?: string[] | null;
}

export interface RetrievalRecordResult {
  caseId: string;
  hasRelevanceGroundTruth: boolean;
  status: 'computed' | 'unavailable';
  reason?: string;
  retrievedCount: number;
  relevantCount: number;
  reciprocalRank?: number; // 1 / rank
  firstRelevantRank?: number | null; // 1-indexed, null if none
  recallAtK?: Record<number, number>;
  precisionAtK?: Record<number, number>;
  hitAtK?: Record<number, boolean>;
}

export interface RetrievalSummaryMetrics {
  evaluatedQueryCount: number;
  queriesWithGroundTruthCount: number;
  coverageRatio: number;
  status: 'computed' | 'unavailable';
  reason?: string;

  meanReciprocalRank: number; // MRR [0, 1]
  recallAtK: Record<number, number>; // e.g. { 1: 0.42, 3: 0.71, 5: 0.85, 10: 0.92 }
  precisionAtK: Record<number, number>;
  hitRateAtK: Record<number, number>; // [0, 1]

  perQueryResults: RetrievalRecordResult[];
}

const DEFAULT_K_LIST = [1, 3, 5, 10];

/**
 * Computes retrieval evaluation metrics for a single query record
 */
export function evaluateSingleRetrieval(
  record: RetrievalQueryRecord,
  kList: number[] = DEFAULT_K_LIST
): RetrievalRecordResult {
  const hasGroundTruth =
    record.relevantDocIds !== null &&
    record.relevantDocIds !== undefined &&
    Array.isArray(record.relevantDocIds) &&
    record.relevantDocIds.length > 0;

  if (!hasGroundTruth) {
    return {
      caseId: record.caseId,
      hasRelevanceGroundTruth: false,
      status: 'unavailable',
      reason: 'No ground-truth relevant document IDs provided for this query case.',
      retrievedCount: record.retrievedDocIds?.length ?? 0,
      relevantCount: 0,
    };
  }

  const retrieved = Array.isArray(record.retrievedDocIds) ? record.retrievedDocIds : [];
  const relevantSet = new Set(record.relevantDocIds as string[]);

  // Find rank of first relevant doc (1-indexed)
  let firstRelevantRank: number | null = null;
  for (let i = 0; i < retrieved.length; i++) {
    if (relevantSet.has(retrieved[i])) {
      firstRelevantRank = i + 1;
      break;
    }
  }

  const reciprocalRank = firstRelevantRank !== null ? 1 / firstRelevantRank : 0.0;

  const recallAtK: Record<number, number> = {};
  const precisionAtK: Record<number, number> = {};
  const hitAtK: Record<number, boolean> = {};

  for (const k of kList) {
    const topK = retrieved.slice(0, k);
    let hitCount = 0;
    for (const docId of topK) {
      if (relevantSet.has(docId)) {
        hitCount++;
      }
    }

    recallAtK[k] = Number((hitCount / relevantSet.size).toFixed(4));
    precisionAtK[k] = Number((k > 0 ? hitCount / k : 0).toFixed(4));
    hitAtK[k] = hitCount > 0;
  }

  return {
    caseId: record.caseId,
    hasRelevanceGroundTruth: true,
    status: 'computed',
    retrievedCount: retrieved.length,
    relevantCount: relevantSet.size,
    firstRelevantRank,
    reciprocalRank: Number(reciprocalRank.toFixed(4)),
    recallAtK,
    precisionAtK,
    hitAtK,
  };
}

/**
 * Evaluates an entire dataset of retrieval records
 */
export function evaluateRetrievalMetrics(
  records: RetrievalQueryRecord[],
  kList: number[] = DEFAULT_K_LIST
): RetrievalSummaryMetrics {
  const perQueryResults: RetrievalRecordResult[] = [];
  let evaluatedWithGroundTruth = 0;
  let sumRR = 0;
  const sumRecall: Record<number, number> = {};
  const sumPrecision: Record<number, number> = {};
  const sumHit: Record<number, number> = {};

  for (const k of kList) {
    sumRecall[k] = 0;
    sumPrecision[k] = 0;
    sumHit[k] = 0;
  }

  for (const rec of records) {
    const res = evaluateSingleRetrieval(rec, kList);
    perQueryResults.push(res);

    if (res.status === 'computed') {
      evaluatedWithGroundTruth++;
      sumRR += res.reciprocalRank ?? 0;

      for (const k of kList) {
        sumRecall[k] += res.recallAtK?.[k] ?? 0;
        sumPrecision[k] += res.precisionAtK?.[k] ?? 0;
        sumHit[k] += res.hitAtK?.[k] ? 1 : 0;
      }
    }
  }

  if (evaluatedWithGroundTruth === 0) {
    const emptyObj: Record<number, number> = {};
    for (const k of kList) emptyObj[k] = 0;

    return {
      evaluatedQueryCount: records.length,
      queriesWithGroundTruthCount: 0,
      coverageRatio: 0,
      status: 'unavailable',
      reason: 'No retrieval queries contain ground-truth relevance labels (relevant_doc_ids). Retrieval metrics are unavailable without relevance ground truth.',
      meanReciprocalRank: 0,
      recallAtK: emptyObj,
      precisionAtK: emptyObj,
      hitRateAtK: emptyObj,
      perQueryResults,
    };
  }

  const meanReciprocalRank = Number((sumRR / evaluatedWithGroundTruth).toFixed(4));
  const recallAtK: Record<number, number> = {};
  const precisionAtK: Record<number, number> = {};
  const hitRateAtK: Record<number, number> = {};

  for (const k of kList) {
    recallAtK[k] = Number((sumRecall[k] / evaluatedWithGroundTruth).toFixed(4));
    precisionAtK[k] = Number((sumPrecision[k] / evaluatedWithGroundTruth).toFixed(4));
    hitRateAtK[k] = Number((sumHit[k] / evaluatedWithGroundTruth).toFixed(4));
  }

  return {
    evaluatedQueryCount: records.length,
    queriesWithGroundTruthCount: evaluatedWithGroundTruth,
    coverageRatio: Number((evaluatedWithGroundTruth / records.length).toFixed(4)),
    status: 'computed',
    meanReciprocalRank,
    recallAtK,
    precisionAtK,
    hitRateAtK,
    perQueryResults,
  };
}

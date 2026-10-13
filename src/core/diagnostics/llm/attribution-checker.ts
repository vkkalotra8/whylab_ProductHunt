/**
 * Context Relevance, Attribution, and Unsupported-Claim / Hallucination Detection Engine.
 * Segments responses into claims, checks semantic content token attribution against retrieved context,
 * and detects phantom/hallucinated citation markers.
 */

import { normalizeText, tokenizeText } from './text-metrics.ts';

const COMMON_STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren',
  'arent', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but',
  'by', 'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'isn', 'isnt', 'it', 'its', 'itself', 'just', 'me', 'more',
  'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other',
  'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than',
  'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn', 'wasnt', 'we', 'were', 'weren',
  'werent', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'won', 'wont',
  'would', 'you', 'your', 'yours', 'yourself', 'yourselves',
]);

export interface ClaimAttribution {
  sentenceIndex: number;
  claimText: string;
  attributionScore: number; // 0.0 - 1.0 (content token overlap)
  classification: 'ATTRIBUTED' | 'PARTIAL_SUPPORT' | 'UNSUPPORTED_CLAIM';
  citedIds: string[];
  phantomCitations: string[];
}

export interface RecordAttributionResult {
  caseId: string;
  hasRetrievedContext: boolean;
  status: 'computed' | 'unavailable';
  reason?: string;
  overallAttributionScore: number; // 0.0 - 1.0
  totalClaimsCount: number;
  attributedClaimsCount: number;
  partialClaimsCount: number;
  unsupportedClaimsCount: number;
  phantomCitationsCount: number;
  claims: ClaimAttribution[];
}

export interface AttributionSummaryMetrics {
  evaluatedRecordCount: number;
  recordsWithContextCount: number;
  status: 'computed' | 'unavailable';
  reason?: string;

  meanAttributionScore: number; // 0.0 - 1.0
  totalClaimsEvaluated: number;
  totalUnsupportedClaims: number;
  unsupportedClaimRate: number; // [0, 1]
  totalPhantomCitations: number;

  perRecordResults: RecordAttributionResult[];
}

/**
 * Extracts content tokens (excluding high-frequency stopwords)
 */
function extractContentTokens(text: string): string[] {
  const tokens = tokenizeText(text);
  return tokens.filter((t) => t.length > 1 && !COMMON_STOP_WORDS.has(t));
}

/**
 * Splits text into constituent sentences/claims
 */
export function splitSentences(text: string): string[] {
  if (!text || text.trim().length === 0) return [];
  // Split on sentence terminators (. ! ? \n) while preserving words
  const raw = text.split(/(?<=[.!?\n])\s+/);
  return raw.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Extracts citation markers from a sentence (e.g. [1], [doc_1], [Source: XYZ])
 */
export function extractCitations(sentence: string): string[] {
  const citations: string[] = [];
  const regex = /\[([a-zA-Z0-9_\-]+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sentence)) !== null) {
    if (match[1]) {
      citations.push(match[1]);
    }
  }

  return citations;
}

/**
 * Evaluates attribution and citation grounding for a single record
 */
export function checkRecordAttribution(
  caseId: string,
  response: string,
  retrievedContext?: string[] | Array<{ id?: string; text: string }> | null
): RecordAttributionResult {
  if (!retrievedContext || (Array.isArray(retrievedContext) && retrievedContext.length === 0)) {
    return {
      caseId,
      hasRetrievedContext: false,
      status: 'unavailable',
      reason: 'No retrieved context passages provided for this case. Attribution cannot be verified.',
      overallAttributionScore: 0,
      totalClaimsCount: 0,
      attributedClaimsCount: 0,
      partialClaimsCount: 0,
      unsupportedClaimsCount: 0,
      phantomCitationsCount: 0,
      claims: [],
    };
  }

  // Collect all context text and context IDs
  const contextTexts: string[] = [];
  const validContextIds = new Set<string>();

  retrievedContext.forEach((chunk, index) => {
    // Standard 1-based index support: [1], [2], [doc_1], [chunk_1]
    const idxStr = String(index + 1);
    validContextIds.add(idxStr);
    validContextIds.add(`doc_${idxStr}`);
    validContextIds.add(`chunk_${idxStr}`);

    if (typeof chunk === 'string') {
      contextTexts.push(chunk);
    } else if (typeof chunk === 'object' && chunk !== null) {
      contextTexts.push(chunk.text);
      if (chunk.id) {
        validContextIds.add(String(chunk.id).toLowerCase());
        validContextIds.add(String(chunk.id));
      }
    }
  });

  const fullContextText = contextTexts.join(' ');
  const contextTokens = new Set(extractContentTokens(fullContextText));

  const sentences = splitSentences(response);
  const claims: ClaimAttribution[] = [];

  let sumScore = 0;
  let attributedCount = 0;
  let partialCount = 0;
  let unsupportedCount = 0;
  let phantomCount = 0;

  sentences.forEach((sentence, idx) => {
    const claimTokens = extractContentTokens(sentence);
    const citations = extractCitations(sentence);
    const phantomCitations: string[] = [];

    // Verify citation references
    for (const cite of citations) {
      const isDirect = validContextIds.has(cite) || validContextIds.has(cite.toLowerCase());
      const stripped = cite.replace(/^(doc|chunk|citation|source)[_\-:]?/i, '');
      const isStripped = validContextIds.has(stripped);

      if (!isDirect && !isStripped) {
        phantomCitations.push(cite);
        phantomCount++;
      }
    }

    if (claimTokens.length === 0) {
      // Empty or stopword-only sentence
      claims.push({
        sentenceIndex: idx + 1,
        claimText: sentence,
        attributionScore: 1.0,
        classification: 'ATTRIBUTED',
        citedIds: citations,
        phantomCitations,
      });
      sumScore += 1.0;
      attributedCount++;
      return;
    }

    let supportedTokens = 0;
    for (const t of claimTokens) {
      if (contextTokens.has(t)) {
        supportedTokens++;
      }
    }

    const score = Number((supportedTokens / claimTokens.length).toFixed(4));
    sumScore += score;

    let classification: ClaimAttribution['classification'] = 'ATTRIBUTED';
    if (score < 0.25) {
      classification = 'UNSUPPORTED_CLAIM';
      unsupportedCount++;
    } else if (score < 0.5) {
      classification = 'PARTIAL_SUPPORT';
      partialCount++;
    } else {
      classification = 'ATTRIBUTED';
      attributedCount++;
    }

    claims.push({
      sentenceIndex: idx + 1,
      claimText: sentence,
      attributionScore: score,
      classification,
      citedIds: citations,
      phantomCitations,
    });
  });

  const total = sentences.length;
  const overallAttributionScore = total > 0 ? Number((sumScore / total).toFixed(4)) : 0.0;

  return {
    caseId,
    hasRetrievedContext: true,
    status: 'computed',
    overallAttributionScore,
    totalClaimsCount: total,
    attributedClaimsCount: attributedCount,
    partialClaimsCount: partialCount,
    unsupportedClaimsCount: unsupportedCount,
    phantomCitationsCount: phantomCount,
    claims,
  };
}

/**
 * Checks attribution across an entire dataset of records
 */
export function evaluateDatasetAttribution(
  records: Array<{
    caseId: string;
    response: string;
    retrievedContext?: string[] | Array<{ id?: string; text: string }> | null;
  }>
): AttributionSummaryMetrics {
  const perRecordResults: RecordAttributionResult[] = [];
  let evaluatedWithContext = 0;
  let sumOverallScore = 0;
  let totalClaims = 0;
  let totalUnsupported = 0;
  let totalPhantoms = 0;

  for (const r of records) {
    const res = checkRecordAttribution(r.caseId, r.response, r.retrievedContext);
    perRecordResults.push(res);

    if (res.status === 'computed') {
      evaluatedWithContext++;
      sumOverallScore += res.overallAttributionScore;
      totalClaims += res.totalClaimsCount;
      totalUnsupported += res.unsupportedClaimsCount;
      totalPhantoms += res.phantomCitationsCount;
    }
  }

  if (evaluatedWithContext === 0) {
    return {
      evaluatedRecordCount: records.length,
      recordsWithContextCount: 0,
      status: 'unavailable',
      reason: 'No records contain retrieved context passages. Attribution and hallucination detection require context.',
      meanAttributionScore: 0,
      totalClaimsEvaluated: 0,
      totalUnsupportedClaims: 0,
      unsupportedClaimRate: 0,
      totalPhantomCitations: 0,
      perRecordResults,
    };
  }

  const meanAttributionScore = Number((sumOverallScore / evaluatedWithContext).toFixed(4));
  const unsupportedClaimRate = totalClaims > 0 ? Number((totalUnsupported / totalClaims).toFixed(4)) : 0;

  return {
    evaluatedRecordCount: records.length,
    recordsWithContextCount: evaluatedWithContext,
    status: 'computed',
    meanAttributionScore,
    totalClaimsEvaluated: totalClaims,
    totalUnsupportedClaims: totalUnsupported,
    unsupportedClaimRate,
    totalPhantomCitations: totalPhantoms,
    perRecordResults,
  };
}

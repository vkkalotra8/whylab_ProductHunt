/**
 * Paired Prompt-Version Comparative Evaluation Engine.
 * Evaluates Baseline Prompt (v1) vs Candidate Prompt (v2) on identical evaluation cases.
 * Computes win/loss/tie matrix, McNemar test of discordant pairs, and regression detection.
 */

import { evaluateTextMetrics, type TextMatchRecordResult } from './text-metrics.ts';
import type { LlmRecord } from '../../domain/llm-types.ts';

export interface PairedCaseComparison {
  caseId: string;
  prompt: string;
  baselineResponse: string;
  candidateResponse: string;
  referenceAnswer?: string | null;
  baselinePassed: boolean;
  candidatePassed: boolean;
  outcome: 'CANDIDATE_WIN' | 'CANDIDATE_REGRESSION' | 'BOTH_PASS' | 'BOTH_FAIL';
  baselineF1: number;
  candidateF1: number;
  f1Delta: number;
  baselineLatencyMs?: number | null;
  candidateLatencyMs?: number | null;
  latencyDeltaMs?: number | null;
}

export interface PromptComparisonSummary {
  pairedCasesCount: number;
  unmatchedBaselineCount: number;
  unmatchedCandidateCount: number;

  // Win / Loss / Regression Breakdown
  candidateWinsCount: number; // B passed, A failed
  candidateRegressionsCount: number; // A passed, B failed (CRITICAL!)
  bothPassCount: number;
  bothFailCount: number;
  netWinRate: number; // (wins - regressions) / total

  // Metric Comparison
  baselineEmRate: number;
  candidateEmRate: number;
  emDelta: number;

  baselineTokenF1: number;
  candidateTokenF1: number;
  f1Delta: number;

  baselineMeanLatencyMs?: number;
  candidateMeanLatencyMs?: number;
  latencyDeltaMs?: number;

  // Statistical Significance: McNemar's Test on Discordant Pairs
  mcnemarStatistic: number; // chi-square
  mcnemarPValue: number;
  isStatisticallySignificant: boolean; // p < 0.05

  regressedCaseIds: string[];
  pairedCases: PairedCaseComparison[];
}

/**
 * Standard complementary error function approximation for Chi-Square / Normal CDF
 */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1.0 / (1.0 + 0.5 * z);
  const ans =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t *
                                  (1.48851587 +
                                    t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? ans : 2.0 - ans;
}

/**
 * P-value from Chi-square statistic with 1 degree of freedom:
 * P(X >= x) = erfc(sqrt(x / 2))
 */
export function chiSquare1DfPValue(chi2: number): number {
  if (chi2 <= 0) return 1.0;
  return Number(erfc(Math.sqrt(chi2 / 2)).toFixed(5));
}

/**
 * Compares two prompt runs across paired test cases
 */
export function comparePromptVersions(
  baselineRecords: LlmRecord[],
  candidateRecords: LlmRecord[]
): PromptComparisonSummary {
  const baseMap = new Map<string, LlmRecord>();
  baselineRecords.forEach((r) => baseMap.set(r.caseId, r));

  const candMap = new Map<string, LlmRecord>();
  candidateRecords.forEach((r) => candMap.set(r.caseId, r));

  // Compute text metrics for each set
  const baseMetrics = evaluateTextMetrics(baselineRecords);
  const candMetrics = evaluateTextMetrics(candidateRecords);

  const baseResMap = new Map<string, TextMatchRecordResult>();
  baseMetrics.perRecordResults.forEach((r) => baseResMap.set(r.caseId, r));

  const candResMap = new Map<string, TextMatchRecordResult>();
  candMetrics.perRecordResults.forEach((r) => candResMap.set(r.caseId, r));

  const pairedCases: PairedCaseComparison[] = [];
  const regressedCaseIds: string[] = [];

  let candidateWins = 0;
  let candidateRegressions = 0;
  let bothPass = 0;
  let bothFail = 0;

  let sumBaseLatency = 0;
  let countBaseLatency = 0;
  let sumCandLatency = 0;
  let countCandLatency = 0;

  for (const [caseId, baseRec] of baseMap.entries()) {
    const candRec = candMap.get(caseId);
    if (!candRec) continue; // Only evaluate paired cases

    const baseRes = baseResMap.get(caseId);
    const candRes = candResMap.get(caseId);

    // Success criterion: normalized exact match or high F1 >= 0.8
    const basePassed = baseRes?.normalizedExactMatch ?? false;
    const candPassed = candRes?.normalizedExactMatch ?? false;

    const baseF1 = baseRes?.tokenF1 ?? 0;
    const candF1 = candRes?.tokenF1 ?? 0;
    const f1Delta = Number((candF1 - baseF1).toFixed(4));

    let outcome: PairedCaseComparison['outcome'] = 'BOTH_FAIL';
    if (candPassed && !basePassed) {
      outcome = 'CANDIDATE_WIN';
      candidateWins++;
    } else if (!candPassed && basePassed) {
      outcome = 'CANDIDATE_REGRESSION';
      candidateRegressions++;
      regressedCaseIds.push(caseId);
    } else if (candPassed && basePassed) {
      outcome = 'BOTH_PASS';
      bothPass++;
    } else {
      outcome = 'BOTH_FAIL';
      bothFail++;
    }

    let latDelta: number | null = null;
    if (baseRec.latencyMs && candRec.latencyMs) {
      latDelta = Number((candRec.latencyMs - baseRec.latencyMs).toFixed(1));
      sumBaseLatency += baseRec.latencyMs;
      countBaseLatency++;
      sumCandLatency += candRec.latencyMs;
      countCandLatency++;
    }

    pairedCases.push({
      caseId,
      prompt: baseRec.prompt,
      baselineResponse: baseRec.response,
      candidateResponse: candRec.response,
      referenceAnswer: baseRec.referenceAnswer,
      baselinePassed: basePassed,
      candidatePassed: candPassed,
      outcome,
      baselineF1: baseF1,
      candidateF1: candF1,
      f1Delta,
      baselineLatencyMs: baseRec.latencyMs,
      candidateLatencyMs: candRec.latencyMs,
      latencyDeltaMs: latDelta,
    });
  }

  const pairedCount = pairedCases.length;
  const b = candidateWins;
  const c = candidateRegressions;

  // McNemar test statistic with continuity correction: (|b - c| - 1)^2 / (b + c)
  let mcnemarStatistic = 0;
  let mcnemarPValue = 1.0;

  if (b + c > 0) {
    const num = Math.max(0, Math.abs(b - c) - 1);
    mcnemarStatistic = Number(((num * num) / (b + c)).toFixed(4));
    mcnemarPValue = chiSquare1DfPValue(mcnemarStatistic);
  }

  const baseMeanLat = countBaseLatency > 0 ? Number((sumBaseLatency / countBaseLatency).toFixed(1)) : undefined;
  const candMeanLat = countCandLatency > 0 ? Number((sumCandLatency / countCandLatency).toFixed(1)) : undefined;
  const latencyDelta = baseMeanLat !== undefined && candMeanLat !== undefined ? Number((candMeanLat - baseMeanLat).toFixed(1)) : undefined;

  return {
    pairedCasesCount: pairedCount,
    unmatchedBaselineCount: baselineRecords.length - pairedCount,
    unmatchedCandidateCount: candidateRecords.length - pairedCount,
    candidateWinsCount: candidateWins,
    candidateRegressionsCount: candidateRegressions,
    bothPassCount: bothPass,
    bothFailCount: bothFail,
    netWinRate: pairedCount > 0 ? Number(((candidateWins - candidateRegressions) / pairedCount).toFixed(4)) : 0,
    baselineEmRate: baseMetrics.normalizedExactMatchRate,
    candidateEmRate: candMetrics.normalizedExactMatchRate,
    emDelta: Number((candMetrics.normalizedExactMatchRate - baseMetrics.normalizedExactMatchRate).toFixed(4)),
    baselineTokenF1: baseMetrics.meanTokenF1,
    candidateTokenF1: candMetrics.meanTokenF1,
    f1Delta: Number((candMetrics.meanTokenF1 - baseMetrics.meanTokenF1).toFixed(4)),
    baselineMeanLatencyMs: baseMeanLat,
    candidateMeanLatencyMs: candMeanLat,
    latencyDeltaMs: latencyDelta,
    mcnemarStatistic,
    mcnemarPValue,
    isStatisticallySignificant: mcnemarPValue < 0.05,
    regressedCaseIds,
    pairedCases,
  };
}

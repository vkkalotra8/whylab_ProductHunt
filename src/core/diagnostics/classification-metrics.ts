import { fail } from '../domain/schema.ts';
import { toolSchemas, type ToolOutput } from '../domain/tool-contracts.ts';
import type { Measurement } from '../domain/primitives.ts';
import type { EvaluationDataset } from './evaluation-ingestion.ts';

export type ClassificationData = {
  labels: { positive: string; negative: string };
  rows: readonly { actual: string; predicted: string; positiveProbability?: number | null }[];
};

export type ClassificationReport = {
  output: ToolOutput<'compute_classification_metrics'>;
  limitations: string[];
};

export function computeClassificationMetrics(data: ClassificationData): ClassificationReport {
  const labels = data.labels;
  if (!labels || [labels.positive, labels.negative].some((l) => typeof l !== 'string' || !l.trim()) || labels.positive === labels.negative) {
    fail('$.labels', 'provide two distinct named classes');
  }
  if (!Array.isArray(data.rows) || data.rows.length > 10000) {
    fail('$.rows', 'expected at most 10,000 evaluation rows');
  }

  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0,
    missingProbability = false;
  const ranked: { positive: boolean; score: number }[] = [];

  Array.from(data.rows).forEach((row, i) => {
    if (!row || ![labels.positive, labels.negative].includes(row.actual) || ![labels.positive, labels.negative].includes(row.predicted)) {
      fail(`$.rows[${i}]`, 'labels must belong to the configured class pair');
    }
    const actual = row.actual === labels.positive,
      predicted = row.predicted === labels.positive;
    if (actual) {
      if (predicted) tp++;
      else fn++;
    } else {
      if (predicted) fp++;
      else tn++;
    }

    if (row.positiveProbability === undefined || row.positiveProbability === null) {
      missingProbability = true;
    } else {
      if (
        typeof row.positiveProbability !== 'number' ||
        !Number.isFinite(row.positiveProbability) ||
        row.positiveProbability < 0 ||
        row.positiveProbability > 1
      ) {
        fail(`$.rows[${i}].positiveProbability`, 'expected a finite probability in [0,1]');
      }
      ranked.push({ positive: actual, score: row.positiveProbability });
    }
  });

  const n = data.rows.length,
    positives = tp + fn,
    negatives = tn + fp;
  const metrics = metricsFromConfusion({
    truePositive: tp,
    falsePositive: fp,
    trueNegative: tn,
    falseNegative: fn,
  });

  const measured = (name: string, value: number) =>
    metrics.push({ name, status: 'measured', value, unit: 'ratio', sampleSize: n });
  const undefinedMetric = (name: string, reason: string) =>
    metrics.push({ name, status: 'undefined', reason, unit: 'ratio', sampleSize: n });

  const rankingReason =
    !positives || !negatives
      ? 'Both true classes must be present for the reported AUCs.'
      : missingProbability
      ? 'At least one probability is missing; AUCs were not computed on a filtered subset.'
      : null;

  if (rankingReason) {
    undefinedMetric('roc_auc', rankingReason);
    undefinedMetric('pr_auc_average_precision', rankingReason);
  } else {
    // Equal-score examples enter together, making the result independent of tie order.
    ranked.sort((a, b) => b.score - a.score);
    let seenPositive = 0,
      seenNegative = 0,
      previousRecall = 0,
      previousFpr = 0,
      previousTpr = 0,
      roc = 0,
      ap = 0;

    for (let i = 0; i < ranked.length; ) {
      const score = ranked[i].score;
      do {
        if (ranked[i].positive) seenPositive++;
        else seenNegative++;
        i++;
      } while (i < ranked.length && ranked[i].score === score);

      const recall = seenPositive / positives,
        fpr = seenNegative / negatives;
      roc += ((fpr - previousFpr) * (recall + previousTpr)) / 2;
      ap += ((recall - previousRecall) * seenPositive) / (seenPositive + seenNegative);
      previousFpr = fpr;
      previousTpr = recall;
      previousRecall = recall;
    }
    measured('roc_auc', Math.max(0, Math.min(1, roc)));
    measured('pr_auc_average_precision', Math.max(0, Math.min(1, ap)));
  }

  const output = toolSchemas.compute_classification_metrics.output.parse({
    positiveLabel: labels.positive,
    negativeLabel: labels.negative,
    sampleSize: n,
    confusion: { truePositive: tp, falsePositive: fp, trueNegative: tn, falseNegative: fn },
    metrics,
  });

  const limitations = [
    'Descriptive point estimates only; no confidence intervals or causal conclusions.',
    'PR-AUC uses non-interpolated average precision, not trapezoidal PR area.',
    'Prediction-based metrics use supplied predictions; no probability threshold is inferred.',
  ];
  if (n < 30) {
    limitations.push('Fewer than 30 observations: estimates may be unstable. This warning is a heuristic, not a statistical validity cutoff.');
  }
  if (positives && negatives && positives !== negatives) {
    limitations.push(`Minority recall refers to the ${positives < negatives ? 'positive' : 'negative'} class in this evaluation population.`);
  }
  if (rankingReason) limitations.push(rankingReason);

  return { output, limitations };
}

export function evaluateClassification(
  data: EvaluationDataset,
  input = { datasetId: data.metadata.id, positiveLabel: data.labels.positive }
): ClassificationReport {
  const request = toolSchemas.compute_classification_metrics.input.parse(input);
  if (
    request.datasetId !== data.metadata.id ||
    request.positiveLabel !== data.labels.positive ||
    data.metadata.positiveLabel !== data.labels.positive
  ) {
    fail('$.input', 'dataset or positive-label mapping differs from ingestion');
  }
  if (data.metadata.rowCount !== data.rows.length) {
    fail('$.rows', 'row count differs from dataset metadata');
  }
  const mappedRows = data.rows.map((r) => ({
    actual: r.actual ?? '',
    predicted: r.predicted ?? '',
    positiveProbability: r.positiveProbability,
  }));
  return computeClassificationMetrics({ labels: data.labels, rows: mappedRows });
}

export function metricsFromConfusion(
  confusion: ToolOutput<'compute_classification_metrics'>['confusion']
): Measurement[] {
  const counts = [
    confusion.truePositive,
    confusion.falsePositive,
    confusion.trueNegative,
    confusion.falseNegative,
  ];
  if (Object.keys(confusion).length !== 4 || counts.some((n) => !Number.isSafeInteger(n) || n < 0) || counts.reduce((a, b) => a + b, 0) > 10000) {
    fail('$.confusion', 'expected nonnegative counts for at most 10,000 rows');
  }
  const { truePositive: tp, falsePositive: fp, trueNegative: tn, falseNegative: fn } = confusion;
  const n = tp + fp + tn + fn,
    positives = tp + fn,
    negatives = tn + fp;
  const metrics: Measurement[] = [];
  const measured = (name: string, value: number, sampleSize = n) =>
    metrics.push({ name, status: 'measured', value, unit: 'ratio', sampleSize });
  const undefinedMetric = (name: string, reason: string) =>
    metrics.push({ name, status: 'undefined', reason, unit: 'ratio', sampleSize: n });

  const fraction = (name: string, numerator: number, denominator: number, reason: string) =>
    denominator ? measured(name, numerator / denominator) : undefinedMetric(name, reason);

  fraction('accuracy', tp + tn, n, 'No evaluation rows.');
  fraction('precision', tp, tp + fp, 'No predicted positive examples.');
  fraction('recall', tp, positives, 'No actual positive examples.');
  fraction('specificity', tn, negatives, 'No actual negative examples.');
  fraction('f1', 2 * tp, 2 * tp + fp + fn, 'No actual or predicted positive examples.');
  fraction('positive_prevalence', positives, n, 'No evaluation rows.');
  fraction('negative_prevalence', negatives, n, 'No evaluation rows.');

  if (positives && negatives) {
    measured('balanced_accuracy', (tp / positives + tn / negatives) / 2);
  } else {
    undefinedMetric('balanced_accuracy', 'Both true classes must be present.');
  }

  if (!positives || !negatives) {
    undefinedMetric('minority_recall', 'Both true classes must be present.');
  } else if (positives === negatives) {
    undefinedMetric('minority_recall', 'Equal class counts: there is no unique minority class.');
  } else {
    measured('minority_recall', positives < negatives ? tp / positives : tn / negatives);
  }

  return metrics;
}

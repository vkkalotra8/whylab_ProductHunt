import type { MetricHistoryPoint, TrainingLogExtraction } from '../domain/artifacts.ts';

/**
 * Parses training logs from PyTorch, TensorFlow/Keras, XGBoost, LightGBM, and Scikit-learn
 */
export function parseTrainingLog(rawLog: string): TrainingLogExtraction {
  if (typeof rawLog !== 'string' || !rawLog.trim()) {
    return {
      framework: 'generic',
      totalEpochs: 0,
      metricHistory: [],
      warnings: ['Log content is empty.'],
      unrecognizedLinesCount: 0,
    };
  }

  const lines = rawLog.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const metricHistory: MetricHistoryPoint[] = [];
  const warnings: string[] = [];
  let unrecognized = 0;
  let framework: TrainingLogExtraction['framework'] = 'generic';
  let earlyStoppingEpoch: number | null = null;
  let detectedDurationSeconds: number | null = null;

  // Track state across lines for multi-line loggers (e.g. Keras)
  let currentEpoch: number | null = null;
  let currentMetrics: Partial<MetricHistoryPoint> = {};

  const flushCurrentEpoch = () => {
    if (currentEpoch !== null && (currentMetrics.trainLoss !== undefined || currentMetrics.valLoss !== undefined || currentMetrics.accuracy !== undefined)) {
      metricHistory.push({
        epoch: currentEpoch,
        ...currentMetrics,
      });
      currentMetrics = {};
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Framework detection clues
    if (/tensorflow|keras/i.test(line)) framework = 'keras';
    else if (/pytorch|lightning|train_loss=/i.test(line)) framework = 'pytorch';
    else if (/xgboost|xgb/i.test(line)) framework = 'xgboost';
    else if (/lightgbm|lgb/i.test(line)) framework = 'lightgbm';
    else if (/scikit-learn|sklearn|ConvergenceWarning/i.test(line)) framework = 'sklearn';

    // Warnings and Early Stopping detection
    if (/early stopping|early_stopping|stopping\. best iteration/i.test(line)) {
      const match = line.match(/(?:iteration|epoch|is)[\s:]*\[?(\d+)\]?/i);
      earlyStoppingEpoch = match ? parseInt(match[1], 10) : (currentEpoch ?? metricHistory.length);
      warnings.push(`Early stopping detected at iteration/epoch ${earlyStoppingEpoch}.`);
    }

    if (/convergencewarning|userwarning|runtime warning|diverging|nan loss|loss is nan/i.test(line)) {
      warnings.push(`Log Alert: ${line.slice(0, 150)}`);
    }

    // Pattern 1: XGBoost format: [0] train-logloss:0.62143 val-logloss:0.63412 or [10]\ttrain-auc:0.8912\tval-auc:0.8541
    const xgbMatch = line.match(/^\[(\d+)\]\s+(.+)$/);
    if (xgbMatch) {
      if (framework === 'generic') framework = 'xgboost';
      const iter = parseInt(xgbMatch[1], 10);
      const metricsPart = xgbMatch[2];
      const point: MetricHistoryPoint = { epoch: iter };

      const metricPairs = metricsPart.matchAll(/([a-zA-Z0-9_'-]+)[:=]\s*([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/g);
      for (const m of metricPairs) {
        const key = m[1].toLowerCase();
        const val = parseFloat(m[2]);
        if (!isNaN(val)) {
          if (key.includes('train') && (key.includes('loss') || key.includes('error') || key.includes('rmse'))) {
            point.trainLoss = val;
          } else if ((key.includes('val') || key.includes('test') || key.includes('valid')) && (key.includes('loss') || key.includes('error') || key.includes('rmse'))) {
            point.valLoss = val;
          } else if (key.includes('auc')) {
            if (key.includes('val') || key.includes('valid')) point.valAccuracy = val;
            else point.accuracy = val;
          }
        }
      }
      metricHistory.push(point);
      continue;
    }

    // Pattern 2: Keras "Epoch 1/50" header followed by or combined with metrics
    const kerasEpochHeader = line.match(/^Epoch\s+(\d+)(?:\/(\d+))?/i);
    if (kerasEpochHeader) {
      if (framework === 'generic' && kerasEpochHeader[2]) framework = 'keras';
      flushCurrentEpoch();
      currentEpoch = parseInt(kerasEpochHeader[1], 10);
      // Check if metrics are on the same line
    }

    // Metric extraction patterns (e.g. loss: 0.4521 - val_loss: 0.5123 - acc: 0.82)
    // Matches: key: value or key=value
    const metricMatches = Array.from(
      line.matchAll(/\b(train_loss|loss|val_loss|val-loss|val_loss|val_accuracy|accuracy|val_acc|acc|precision|val_precision|recall|val_recall|f1|val_f1|lr|learning_rate)[:=]\s*([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi)
    );

    if (metricMatches.length > 0) {
      // Determine epoch if not yet identified from header
      if (currentEpoch === null) {
        const epMatch = line.match(/\b(?:epoch|iter|step)\s*[:=]?\s*(\d+)/i);
        if (epMatch) {
          currentEpoch = parseInt(epMatch[1], 10);
        } else {
          currentEpoch = metricHistory.length + 1;
        }
      }

      for (const match of metricMatches) {
        const rawKey = match[1].toLowerCase().replace(/[-_]/g, '');
        const val = parseFloat(match[2]);
        if (isNaN(val)) continue;

        if (rawKey === 'loss' || rawKey === 'trainloss') currentMetrics.trainLoss = val;
        else if (rawKey === 'valloss') currentMetrics.valLoss = val;
        else if (rawKey === 'accuracy' || rawKey === 'acc') currentMetrics.accuracy = val;
        else if (rawKey === 'valaccuracy' || rawKey === 'valacc') currentMetrics.valAccuracy = val;
        else if (rawKey === 'precision') currentMetrics.precision = val;
        else if (rawKey === 'valprecision') currentMetrics.valPrecision = val;
        else if (rawKey === 'recall') currentMetrics.recall = val;
        else if (rawKey === 'valrecall') currentMetrics.valRecall = val;
        else if (rawKey === 'f1') currentMetrics.f1 = val;
        else if (rawKey === 'valf1') currentMetrics.valF1 = val;
        else if (rawKey === 'lr' || rawKey === 'learningrate') currentMetrics.learningRate = val;
      }

      // If this line contained metrics, we can flush if not in multi-line keras mode or if val_loss is present
      if (currentMetrics.valLoss !== undefined || currentEpoch !== null) {
        flushCurrentEpoch();
        currentEpoch = null;
      }
      continue;
    }

    // Pattern 3: Scikit-learn iteration output: "iteration 1, loss = 0.482910"
    const sklearnMatch = line.match(/^iteration\s+(\d+),\s*loss\s*=\s*([+-]?\d+(?:\.\d+)?)/i);
    if (sklearnMatch) {
      framework = 'sklearn';
      metricHistory.push({
        epoch: parseInt(sklearnMatch[1], 10),
        trainLoss: parseFloat(sklearnMatch[2]),
      });
      continue;
    }

    // Check for duration (e.g. 2s 18ms/step or 45.2s total)
    const timeMatch = line.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)\b/i);
    if (timeMatch && !detectedDurationSeconds) {
      detectedDurationSeconds = parseFloat(timeMatch[1]);
    }

    unrecognized++;
  }

  // Final flush
  flushCurrentEpoch();

  // Deduplicate and sort by epoch
  const sortedHistory = metricHistory.sort((a, b) => a.epoch - b.epoch);

  if (sortedHistory.length === 0) {
    warnings.push('No parseable epoch loss or metric records were recognized in the provided log.');
  }

  const finalTrainLoss = sortedHistory.length > 0 ? sortedHistory[sortedHistory.length - 1].trainLoss : undefined;
  const finalValLoss = sortedHistory.length > 0 ? sortedHistory[sortedHistory.length - 1].valLoss : undefined;

  return {
    framework,
    totalEpochs: sortedHistory.length,
    metricHistory: sortedHistory,
    finalTrainLoss,
    finalValLoss,
    earlyStoppingEpoch,
    trainingDurationSeconds: detectedDurationSeconds,
    warnings,
    unrecognizedLinesCount: unrecognized,
  };
}

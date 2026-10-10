import type { MetricHistoryPoint, TrainingLogExtraction } from '../domain/artifacts.ts';

export interface TrainingDiagnosticsResult {
  totalEpochs: number;
  finalTrainLoss: number | null;
  finalValLoss: number | null;
  trainValLossGap: number | null;
  isOverfitting: boolean;
  isUnderfitting: boolean;
  isDiverging: boolean;
  isInstabilityDetected: boolean;
  minValLossEpoch: number | null;
  minValLoss: number | null;
  earlyStoppingAnalysis: {
    triggered: boolean;
    epoch: number | null;
    isOptimal: boolean;
    explanation: string;
  };
  diagnoses: string[];
  recommendations: string[];
}

/**
 * Analyzes training and validation loss curves from extracted log history
 */
export function analyzeTrainingDiagnostics(
  logExtraction: TrainingLogExtraction
): TrainingDiagnosticsResult {
  const history = logExtraction.metricHistory;
  const diagnoses: string[] = [];
  const recommendations: string[] = [];

  if (!history || history.length === 0) {
    return {
      totalEpochs: 0,
      finalTrainLoss: null,
      finalValLoss: null,
      trainValLossGap: null,
      isOverfitting: false,
      isUnderfitting: false,
      isDiverging: false,
      isInstabilityDetected: false,
      minValLossEpoch: null,
      minValLoss: null,
      earlyStoppingAnalysis: {
        triggered: false,
        epoch: null,
        isOptimal: false,
        explanation: 'No training history points available.',
      },
      diagnoses: ['No parseable epoch metrics found in training log.'],
      recommendations: ['Ensure training log outputs loss and validation loss per epoch.'],
    };
  }

  const validTrainLosses = history
    .filter((h) => typeof h.trainLoss === 'number' && Number.isFinite(h.trainLoss))
    .map((h) => ({ epoch: h.epoch, val: h.trainLoss! }));

  const validValLosses = history
    .filter((h) => typeof h.valLoss === 'number' && Number.isFinite(h.valLoss))
    .map((h) => ({ epoch: h.epoch, val: h.valLoss! }));

  const finalTrainLoss = validTrainLosses.length > 0 ? validTrainLosses[validTrainLosses.length - 1].val : null;
  const finalValLoss = validValLosses.length > 0 ? validValLosses[validValLosses.length - 1].val : null;

  let trainValLossGap: number | null = null;
  if (finalTrainLoss !== null && finalValLoss !== null) {
    trainValLossGap = finalValLoss - finalTrainLoss;
  }

  // Find minimum validation loss epoch
  let minValLossEpoch: number | null = null;
  let minValLoss: number | null = null;
  if (validValLosses.length > 0) {
    let best = validValLosses[0];
    for (const v of validValLosses) {
      if (v.val < best.val) best = v;
    }
    minValLossEpoch = best.epoch;
    minValLoss = best.val;
  }

  // Overfitting check: train loss drops significantly while val loss stays high or diverges
  let isOverfitting = false;
  let isDiverging = false;
  if (validValLosses.length >= 3 && validTrainLosses.length >= 3) {
    // Check if val loss has increased over the last 3 epochs while train loss decreased
    const last3Val = validValLosses.slice(-3);
    const last3Train = validTrainLosses.slice(-3);
    const valRising = last3Val[2].val > last3Val[1].val && last3Val[1].val > last3Val[0].val;
    const trainDropping = last3Train[2].val < last3Train[0].val;

    if (valRising && trainDropping) {
      isDiverging = true;
      diagnoses.push(
        `Diverging loss detected: Validation loss has risen consecutively across the last 3 epochs while training loss continues to decrease.`
      );
    }

    if (trainValLossGap !== null && finalTrainLoss !== null && finalTrainLoss > 0) {
      const relativeGap = trainValLossGap / finalTrainLoss;
      if (relativeGap > 0.4) {
        isOverfitting = true;
        diagnoses.push(
          `Substantial generalization gap: Validation loss (${finalValLoss?.toFixed(4)}) is ${(relativeGap * 100).toFixed(0)}% higher than training loss (${finalTrainLoss.toFixed(4)}).`
        );
        recommendations.push(
          'Apply L2 regularization (weight decay), increase dropout rate, or use data augmentation.'
        );
      }
    }
  }

  // Underfitting check: both train and val loss stay high and plateau without learning
  let isUnderfitting = false;
  if (validTrainLosses.length >= 5) {
    const firstLoss = validTrainLosses[0].val;
    const lastLoss = validTrainLosses[validTrainLosses.length - 1].val;
    const lossReduction = (firstLoss - lastLoss) / Math.max(Math.abs(firstLoss), 1e-6);

    if (lossReduction < 0.05) {
      isUnderfitting = true;
      diagnoses.push(
        `Underfitting / Stagnant training: Training loss decreased by less than 5% across ${validTrainLosses.length} epochs.`
      );
      recommendations.push(
        'Increase model capacity (layer depth/width), lower learning rate, or verify gradient propagation.'
      );
    }
  }

  // Training Instability check: high variance in epoch-to-epoch loss deltas
  let isInstabilityDetected = false;
  if (validTrainLosses.length >= 4) {
    const deltas: number[] = [];
    for (let i = 1; i < validTrainLosses.length; i++) {
      deltas.push(Math.abs(validTrainLosses[i].val - validTrainLosses[i - 1].val));
    }
    const meanDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;
    const maxDelta = Math.max(...deltas);
    if (maxDelta > 5 * meanDelta && maxDelta > 0.5) {
      isInstabilityDetected = true;
      diagnoses.push(`Training instability / loss spike detected (max delta: ${maxDelta.toFixed(3)}).`);
      recommendations.push(
        'Implement gradient clipping, warm-up learning rate schedules, or use a smaller batch size.'
      );
    }
  }

  // Early stopping analysis
  const esEpoch = logExtraction.earlyStoppingEpoch;
  const esTriggered = Boolean(esEpoch);
  let esOptimal = false;
  let esExplanation = 'Early stopping was not triggered.';

  if (esTriggered && esEpoch && minValLossEpoch) {
    if (Math.abs(esEpoch - minValLossEpoch) <= 2) {
      esOptimal = true;
      esExplanation = `Early stopping halted training near the optimal checkpoint (epoch ${esEpoch} vs best val loss at epoch ${minValLossEpoch}).`;
    } else {
      esOptimal = false;
      esExplanation = `Training stopped at epoch ${esEpoch}, but minimum validation loss was observed earlier at epoch ${minValLossEpoch}. Check patience setting.`;
    }
  } else if (!esTriggered && isDiverging) {
    recommendations.push(
      'Configure early stopping with patience=3 to prevent overtraining when validation loss begins to diverge.'
    );
  }

  return {
    totalEpochs: history.length,
    finalTrainLoss,
    finalValLoss,
    trainValLossGap,
    isOverfitting,
    isUnderfitting,
    isDiverging,
    isInstabilityDetected,
    minValLossEpoch,
    minValLoss,
    earlyStoppingAnalysis: {
      triggered: esTriggered,
      epoch: esEpoch ?? null,
      isOptimal: esOptimal,
      explanation: esExplanation,
    },
    diagnoses,
    recommendations,
  };
}

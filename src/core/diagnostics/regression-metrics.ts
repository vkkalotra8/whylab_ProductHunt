/**
 * Deterministic Regression Performance Diagnostics
 * Evaluates MAE, MSE, RMSE, R², residual distributions, and slice performance.
 */

export interface RegressionMetricsResult {
  sampleCount: number;
  mae: number;
  mse: number;
  rmse: number;
  r2: number | null;
  meanActual: number;
  meanPredicted: number;
  residualStats: {
    mean: number;
    std: number;
    min: number;
    max: number;
    p25: number;
    p50: number;
    p75: number;
  };
  sliceMetrics?: Record<
    string,
    {
      sampleCount: number;
      mae: number;
      rmse: number;
      meanResidual: number;
    }
  >;
  warnings: string[];
}

export function computeRegressionMetrics(
  actuals: number[],
  predictions: number[],
  slices?: (string | null | undefined)[]
): RegressionMetricsResult {
  const warnings: string[] = [];
  if (actuals.length !== predictions.length) {
    throw new Error(
      `Mismatched lengths: actuals has ${actuals.length} rows, predictions has ${predictions.length} rows.`
    );
  }

  // Filter out any NaN/infinite rows deterministically
  const validIndices: number[] = [];
  for (let i = 0; i < actuals.length; i++) {
    const a = actuals[i];
    const p = predictions[i];
    if (Number.isFinite(a) && Number.isFinite(p)) {
      validIndices.push(i);
    }
  }

  const n = validIndices.length;
  if (n === 0) {
    throw new Error('No valid finite numeric pairs found for regression evaluation.');
  }

  if (n < actuals.length) {
    warnings.push(
      `Excluded ${actuals.length - n} rows containing missing or non-finite values.`
    );
  }

  let sumA = 0;
  let sumP = 0;
  let sumAbsErr = 0;
  let sumSqErr = 0;
  const residuals: number[] = [];

  for (const idx of validIndices) {
    const a = actuals[idx];
    const p = predictions[idx];
    const diff = p - a; // residual: predicted - actual
    residuals.push(diff);
    sumA += a;
    sumP += p;
    sumAbsErr += Math.abs(diff);
    sumSqErr += diff * diff;
  }

  const meanActual = sumA / n;
  const meanPredicted = sumP / n;
  const mae = sumAbsErr / n;
  const mse = sumSqErr / n;
  const rmse = Math.sqrt(mse);

  // Compute R² = 1 - (SS_res / SS_tot)
  let ssTot = 0;
  for (const idx of validIndices) {
    const diff = actuals[idx] - meanActual;
    ssTot += diff * diff;
  }

  let r2: number | null = null;
  if (ssTot > 1e-12) {
    r2 = 1 - sumSqErr / ssTot;
  } else {
    warnings.push('Zero variance in actual values (all actuals identical); R² is undefined.');
  }

  // Residual distribution statistics
  residuals.sort((a, b) => a - b);
  const minResidual = residuals[0];
  const maxResidual = residuals[residuals.length - 1];
  const p25Residual = residuals[Math.floor(residuals.length * 0.25)];
  const p50Residual = residuals[Math.floor(residuals.length * 0.5)];
  const p75Residual = residuals[Math.floor(residuals.length * 0.75)];

  const meanRes = residuals.reduce((s, r) => s + r, 0) / n;
  const varRes = residuals.reduce((s, r) => s + Math.pow(r - meanRes, 2), 0) / n;
  const stdRes = Math.sqrt(varRes);

  // Slice-level regression metrics if slice column provided
  let sliceMetrics: RegressionMetricsResult['sliceMetrics'];
  if (slices && slices.length === actuals.length) {
    sliceMetrics = {};
    const sliceGroups = new Map<string, { actuals: number[]; predictions: number[] }>();

    for (const idx of validIndices) {
      const sliceVal = slices[idx];
      const sliceKey = sliceVal ? String(sliceVal).trim() : 'Unknown';
      if (!sliceGroups.has(sliceKey)) {
        sliceGroups.set(sliceKey, { actuals: [], predictions: [] });
      }
      sliceGroups.get(sliceKey)!.actuals.push(actuals[idx]);
      sliceGroups.get(sliceKey)!.predictions.push(predictions[idx]);
    }

    for (const [key, group] of sliceGroups.entries()) {
      if (group.actuals.length < 5) {
        warnings.push(`Slice "${key}" has only ${group.actuals.length} samples; uncertainty is high.`);
      }
      let subAbs = 0;
      let subSq = 0;
      let subDiff = 0;
      for (let i = 0; i < group.actuals.length; i++) {
        const d = group.predictions[i] - group.actuals[i];
        subDiff += d;
        subAbs += Math.abs(d);
        subSq += d * d;
      }
      const gn = group.actuals.length;
      sliceMetrics[key] = {
        sampleCount: gn,
        mae: gn > 0 ? subAbs / gn : 0,
        rmse: gn > 0 ? Math.sqrt(subSq / gn) : 0,
        meanResidual: gn > 0 ? subDiff / gn : 0,
      };
    }
  }

  return {
    sampleCount: n,
    mae,
    mse,
    rmse,
    r2,
    meanActual,
    meanPredicted,
    residualStats: {
      mean: meanRes,
      std: stdRes,
      min: minResidual,
      max: maxResidual,
      p25: p25Residual,
      p50: p50Residual,
      p75: p75Residual,
    },
    sliceMetrics,
    warnings,
  };
}

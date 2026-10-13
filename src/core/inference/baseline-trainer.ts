/**
 * Experimental Reference Baseline Trainer for Labeled Tabular Datasets
 *
 * INVARIANTS:
 * 1. Strict Opt-In: Requires explicit user consent; never executes silently.
 * 2. Data Hygiene: Preprocessors (imputers, standardizers) fit ONLY on train split.
 * 3. Holdout Isolation: Final benchmark metrics evaluated strictly on unseen test split.
 * 4. Deterministic Reproducibility: Seeded PRNG ensures bit-identical results.
 * 5. Transparent Provenance: Clearly labeled as an Experimental Reference Baseline.
 */

export interface BaselineTrainingRequest {
  datasetName: string;
  rows: Record<string, unknown>[];
  targetColumn: string;
  positiveLabel: string;
  negativeLabel?: string;
  featureColumns?: string[];
  seed?: number;
  trainRatio?: number;
  valRatio?: number;
  testRatio?: number;
  modelType?: 'logistic_regression' | 'decision_stump_ensemble';
  optInConfirmed: boolean;
  operatorNotes?: string;
}

export interface PreprocessingSummary {
  numericFeatures: string[];
  categoricalFeatures: string[];
  trainMedians: Record<string, number>;
  trainMeans: Record<string, number>;
  trainStds: Record<string, number>;
  categoryVocabularies: Record<string, string[]>;
}

export interface HoldoutPerformanceMetrics {
  sampleSize: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number | null;
  brierScore: number;
}

export interface BaselineTrainingResult {
  isExperimentalBaseline: true;
  modelType: string;
  seed: number;
  provenanceHash: string;
  createdAt: string;
  targetColumn: string;
  positiveLabel: string;
  negativeLabel: string;
  featureWeights: Record<string, number>;
  bias: number;
  splits: {
    trainCount: number;
    valCount: number;
    testCount: number;
    trainPositiveRatio: number;
    testPositiveRatio: number;
  };
  preprocessing: PreprocessingSummary;
  holdoutMetrics: HoldoutPerformanceMetrics;
  predictions: Array<{
    rowIndex: number;
    predicted: string;
    probability: number;
  }>;
  disclaimer: string;
  leakageAudit: {
    fitOnTrainOnly: true;
    holdoutIsolated: true;
    preprocessorLeakageFree: true;
  };
}

export const EXPERIMENTAL_BASELINE_DISCLAIMER =
  'EXPERIMENTAL REFERENCE BASELINE ONLY. This model is generated purely for diagnostic benchmarking ' +
  'and comparative exploration within WhyLab. It has NOT undergone clinical, ethical, or production validation ' +
  'and must NEVER be deployed as a high-stakes decision or diagnostic system.';

/**
 * Deterministic Mulberry32 PRNG
 */
function createPrng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sigmoid(z: number): number {
  if (z > 30) return 1.0;
  if (z < -30) return 0.0;
  return 1.0 / (1.0 + Math.exp(-z));
}

function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Trains a leak-free deterministic experimental reference baseline classifier
 */
export function trainExperimentalBaseline(
  request: BaselineTrainingRequest
): BaselineTrainingResult {
  // 1. Strict Opt-In Gate
  if (!request.optInConfirmed) {
    throw new Error(
      'Experimental baseline training prohibited: operator opt-in was not confirmed. ' +
        'WhyLab strictly enforces human-in-the-loop consent before fitting reference models.'
    );
  }

  const {
    rows,
    targetColumn,
    positiveLabel,
    seed = 42,
    trainRatio = 0.7,
    valRatio = 0.15,
    testRatio = 0.15,
  } = request;

  if (!rows || rows.length < 10) {
    throw new Error(`Insufficient data rows (${rows?.length ?? 0}). Minimum 10 rows required for baseline training.`);
  }

  if (!targetColumn) {
    throw new Error('Target column is required for baseline training.');
  }

  const prng = createPrng(seed);

  // 2. Discover Negative Label & Target Binarization
  const targetValues = rows.map((r) => String(r[targetColumn] ?? '').trim());
  const distinctTargets = Array.from(new Set(targetValues.filter((v) => v !== '')));

  let negativeLabel = request.negativeLabel;
  if (!negativeLabel) {
    const candidateNeg = distinctTargets.find((v) => v !== positiveLabel);
    negativeLabel = candidateNeg ?? (positiveLabel === '1' ? '0' : 'negative');
  }

  // 3. Determine Candidate Feature Columns
  const excludedKeys = new Set([targetColumn, 'id', 'sample_id', 'index', 'timestamp']);
  const featureCols =
    request.featureColumns && request.featureColumns.length > 0
      ? request.featureColumns.filter((c) => !excludedKeys.has(c))
      : Object.keys(rows[0]).filter((c) => !excludedKeys.has(c));

  if (featureCols.length === 0) {
    throw new Error('No valid feature columns found for baseline model training.');
  }

  // 4. Deterministic Stratified Split
  const indicesByClass: { positive: number[]; negative: number[] } = {
    positive: [],
    negative: [],
  };

  rows.forEach((r, idx) => {
    const val = String(r[targetColumn] ?? '').trim();
    if (val === positiveLabel) {
      indicesByClass.positive.push(idx);
    } else {
      indicesByClass.negative.push(idx);
    }
  });

  // Seeded Fisher-Yates Shuffle
  const shuffle = (arr: number[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(prng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  shuffle(indicesByClass.positive);
  shuffle(indicesByClass.negative);

  const splitIndices = (arr: number[]) => {
    const nTrain = Math.max(1, Math.floor(arr.length * trainRatio));
    const nVal = Math.max(1, Math.floor(arr.length * valRatio));
    const train = arr.slice(0, nTrain);
    const val = arr.slice(nTrain, nTrain + nVal);
    const test = arr.slice(nTrain + nVal);
    // If test is empty due to small size, reserve at least 1 for test
    if (test.length === 0 && val.length > 1) {
      test.push(val.pop()!);
    }
    return { train, val, test };
  };

  const posSplit = splitIndices(indicesByClass.positive);
  const negSplit = splitIndices(indicesByClass.negative);

  const trainIndices = [...posSplit.train, ...negSplit.train].sort((a, b) => a - b);
  const valIndices = [...posSplit.val, ...negSplit.val].sort((a, b) => a - b);
  const testIndices = [...posSplit.test, ...negSplit.test].sort((a, b) => a - b);

  const trainRows = trainIndices.map((i) => rows[i]);

  // 5. Fit Preprocessing ONLY on Train Split
  const numericFeatures: string[] = [];
  const categoricalFeatures: string[] = [];

  for (const col of featureCols) {
    const trainValues = trainRows
      .map((r) => r[col])
      .filter((v) => v !== null && v !== undefined && v !== '');

    const isNum =
      trainValues.length > 0 &&
      trainValues.every((v) => !isNaN(Number(v)) && Number.isFinite(Number(v)));

    if (isNum) {
      numericFeatures.push(col);
    } else {
      categoricalFeatures.push(col);
    }
  }

  // Compute training medians, means, and stds for numeric features
  const trainMedians: Record<string, number> = {};
  const trainMeans: Record<string, number> = {};
  const trainStds: Record<string, number> = {};

  for (const col of numericFeatures) {
    const nums = trainRows
      .map((r) => Number(r[col]))
      .filter((n) => !isNaN(n) && Number.isFinite(n))
      .sort((a, b) => a - b);

    if (nums.length === 0) {
      trainMedians[col] = 0;
      trainMeans[col] = 0;
      trainStds[col] = 1;
    } else {
      const mid = Math.floor(nums.length / 2);
      trainMedians[col] = nums.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
      const mean = nums.reduce((s, x) => s + x, 0) / nums.length;
      trainMeans[col] = mean;
      const variance = nums.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / Math.max(1, nums.length - 1);
      trainStds[col] = variance > 1e-9 ? Math.sqrt(variance) : 1.0;
    }
  }

  // Compute category vocabularies from train rows ONLY (top 10 categories per column)
  const categoryVocabularies: Record<string, string[]> = {};
  for (const col of categoricalFeatures) {
    const counts = new Map<string, number>();
    for (const r of trainRows) {
      const val = String(r[col] ?? '').trim();
      if (val) counts.set(val, (counts.get(val) ?? 0) + 1);
    }
    const topCats = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map((e) => e[0]);
    categoryVocabularies[col] = topCats;
  }

  // 6. Vectorize Rows using Training Statistics
  // Build feature names array
  const vectorFeatureNames: string[] = [...numericFeatures];
  for (const col of categoricalFeatures) {
    for (const cat of categoryVocabularies[col]) {
      vectorFeatureNames.push(`${col}=${cat}`);
    }
  }

  const vectorize = (r: Record<string, unknown>): number[] => {
    const vec: number[] = [];
    // Numeric standardizations
    for (const col of numericFeatures) {
      const rawVal = r[col];
      const isMissing = rawVal === null || rawVal === undefined || rawVal === '' || isNaN(Number(rawVal));
      const val = isMissing ? trainMedians[col] : Number(rawVal);
      const mean = trainMeans[col];
      const std = trainStds[col];
      vec.push((val - mean) / std);
    }
    // Categorical one-hot
    for (const col of categoricalFeatures) {
      const rowVal = String(r[col] ?? '').trim();
      const vocab = categoryVocabularies[col];
      for (const cat of vocab) {
        vec.push(rowVal === cat ? 1.0 : 0.0);
      }
    }
    return vec;
  };

  const numFeaturesTotal = vectorFeatureNames.length;
  const X_train = trainIndices.map((i) => vectorize(rows[i]));
  const y_train = trainIndices.map((i) => (String(rows[i][targetColumn] ?? '').trim() === positiveLabel ? 1 : 0));

  // 7. Deterministic Regularized Logistic Regression via Gradient Descent
  const weights = new Array(numFeaturesTotal).fill(0.0);
  let bias = 0.0;
  const epochs = 120;
  const learningRate = 0.05;
  const l2Lambda = 0.001;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const lr = learningRate / (1 + 0.01 * epoch);
    const gradW = new Array(numFeaturesTotal).fill(0.0);
    let gradB = 0.0;

    for (let i = 0; i < X_train.length; i++) {
      const xi = X_train[i];
      const yi = y_train[i];

      let z = bias;
      for (let j = 0; j < numFeaturesTotal; j++) {
        z += weights[j] * xi[j];
      }
      const pred = sigmoid(z);
      const err = pred - yi;

      for (let j = 0; j < numFeaturesTotal; j++) {
        gradW[j] += err * xi[j];
      }
      gradB += err;
    }

    const n = X_train.length;
    for (let j = 0; j < numFeaturesTotal; j++) {
      weights[j] -= lr * (gradW[j] / n + l2Lambda * weights[j]);
    }
    bias -= lr * (gradB / n);
  }

  // Predict function
  const predictRow = (r: Record<string, unknown>): { probability: number; label: string } => {
    const vec = vectorize(r);
    let z = bias;
    for (let j = 0; j < numFeaturesTotal; j++) {
      z += weights[j] * vec[j];
    }
    const prob = sigmoid(z);
    return {
      probability: Math.round(prob * 10000) / 10000,
      label: prob >= 0.5 ? positiveLabel : negativeLabel!,
    };
  };

  // 8. Independent Holdout Evaluation (Test Split ONLY)
  const testActuals: number[] = [];
  const testScores: number[] = [];
  const testPreds: number[] = [];

  let correctCount = 0;
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let brierSum = 0;

  for (const testIdx of testIndices) {
    const row = rows[testIdx];
    const actualStr = String(row[targetColumn] ?? '').trim();
    const actualNum = actualStr === positiveLabel ? 1 : 0;
    const { probability, label } = predictRow(row);
    const predNum = label === positiveLabel ? 1 : 0;

    testActuals.push(actualNum);
    testScores.push(probability);
    testPreds.push(predNum);

    if (actualNum === predNum) correctCount++;
    if (actualNum === 1 && predNum === 1) tp++;
    if (actualNum === 0 && predNum === 1) fp++;
    if (actualNum === 1 && predNum === 0) fn++;
    if (actualNum === 0 && predNum === 0) tn++;

    brierSum += Math.pow(probability - actualNum, 2);
  }

  const testSize = Math.max(1, testIndices.length);
  const accuracy = Math.round((correctCount / testSize) * 10000) / 10000;
  const precision = tp + fp > 0 ? Math.round((tp / (tp + fp)) * 10000) / 10000 : 0;
  const recall = tp + fn > 0 ? Math.round((tp / (tp + fn)) * 10000) / 10000 : 0;
  const f1 = precision + recall > 0 ? Math.round(((2 * precision * recall) / (precision + recall)) * 10000) / 10000 : 0;
  const brierScore = Math.round((brierSum / testSize) * 10000) / 10000;

  // ROC-AUC on holdout
  let rocAuc: number | null = null;
  const posCount = testActuals.filter((a) => a === 1).length;
  const negCount = testActuals.length - posCount;
  if (posCount > 0 && negCount > 0) {
    // Wilcoxon rank sum
    const paired = testActuals.map((a, i) => ({ actual: a, score: testScores[i] }));
    paired.sort((a, b) => a.score - b.score);
    let rankSumPos = 0;
    for (let r = 0; r < paired.length; r++) {
      if (paired[r].actual === 1) {
        rankSumPos += r + 1;
      }
    }
    const u = rankSumPos - (posCount * (posCount + 1)) / 2;
    rocAuc = Math.round((u / (posCount * negCount)) * 10000) / 10000;
  }

  // 9. Generate Predictions for Entire Dataset
  const predictions = rows.map((r, idx) => {
    const { probability, label } = predictRow(r);
    return {
      rowIndex: idx,
      predicted: label,
      probability,
    };
  });

  // Feature weights map
  const featureWeights: Record<string, number> = {};
  for (let j = 0; j < vectorFeatureNames.length; j++) {
    featureWeights[vectorFeatureNames[j]] = Math.round(weights[j] * 1000) / 1000;
  }

  const provenanceHash = fnv1a(
    `${request.datasetName}:${seed}:${epochs}:${weights.slice(0, 5).join(',')}:${bias}`
  );

  return {
    isExperimentalBaseline: true,
    modelType: 'logistic_regression',
    seed,
    provenanceHash,
    createdAt: new Date().toISOString(),
    targetColumn,
    positiveLabel,
    negativeLabel,
    featureWeights,
    bias: Math.round(bias * 1000) / 1000,
    splits: {
      trainCount: trainIndices.length,
      valCount: valIndices.length,
      testCount: testIndices.length,
      trainPositiveRatio:
        Math.round((posSplit.train.length / Math.max(1, trainIndices.length)) * 1000) / 1000,
      testPositiveRatio:
        Math.round((posSplit.test.length / Math.max(1, testIndices.length)) * 1000) / 1000,
    },
    preprocessing: {
      numericFeatures,
      categoricalFeatures,
      trainMedians,
      trainMeans,
      trainStds,
      categoryVocabularies,
    },
    holdoutMetrics: {
      sampleSize: testIndices.length,
      accuracy,
      precision,
      recall,
      f1,
      rocAuc,
      brierScore,
    },
    predictions,
    disclaimer: EXPERIMENTAL_BASELINE_DISCLAIMER,
    leakageAudit: {
      fitOnTrainOnly: true,
      holdoutIsolated: true,
      preprocessorLeakageFree: true,
    },
  };
}

import type { InvestigationArtifact } from '../domain/artifacts.ts';
import { parseCsv } from './csv.ts';

export interface SplitContaminationResult {
  hasContamination: boolean;
  duplicateRowCount: number;
  duplicatePercentage: number;
  totalTrainRows: number;
  totalTestRows: number;
  sharedFeatureColumns: string[];
  sampleDuplicates: Array<{
    trainRowIndex: number;
    testRowIndex: number;
    featureValues: Record<string, string>;
  }>;
  warnings: string[];
}

export interface DataQualityAuditResult {
  artifactName: string;
  totalRows: number;
  totalColumns: number;
  missingValuesSummary: Record<string, { count: number; percentage: number }>;
  internalDuplicateRowCount: number;
  columnsWithOutliers: Array<{
    columnName: string;
    outlierCount: number;
    lowerBound: number;
    upperBound: number;
  }>;
  warnings: string[];
}

/**
 * Checks for record contamination (exact duplicates) between train and test datasets
 */
export function checkSplitContamination(
  trainCsvText: string,
  testCsvText: string,
  targetColumnName?: string
): SplitContaminationResult {
  const warnings: string[] = [];
  const trainRows = parseCsv(trainCsvText);
  const testRows = parseCsv(testCsvText);

  if (trainRows.length < 2 || testRows.length < 2) {
    return {
      hasContamination: false,
      duplicateRowCount: 0,
      duplicatePercentage: 0,
      totalTrainRows: Math.max(0, trainRows.length - 1),
      totalTestRows: Math.max(0, testRows.length - 1),
      sharedFeatureColumns: [],
      sampleDuplicates: [],
      warnings: ['Datasets do not contain sufficient rows to evaluate split contamination.'],
    };
  }

  const [trainHeaders, ...trainData] = trainRows;
  const [testHeaders, ...testData] = testRows;

  // Find shared feature columns (excluding target if specified)
  const trainColSet = new Set(trainHeaders);
  const sharedCols = testHeaders.filter(
    (c) => trainColSet.has(c) && (!targetColumnName || c !== targetColumnName)
  );

  if (sharedCols.length === 0) {
    warnings.push('No common feature columns found between splits to check contamination.');
    return {
      hasContamination: false,
      duplicateRowCount: 0,
      duplicatePercentage: 0,
      totalTrainRows: trainData.length,
      totalTestRows: testData.length,
      sharedFeatureColumns: [],
      sampleDuplicates: [],
      warnings,
    };
  }

  const trainIndices = sharedCols.map((c) => trainHeaders.indexOf(c));
  const testIndices = sharedCols.map((c) => testHeaders.indexOf(c));

  // Build hash map of train feature signatures
  const trainSignatureMap = new Map<string, number>();
  for (let r = 0; r < trainData.length; r++) {
    const row = trainData[r];
    const sig = trainIndices.map((i) => row[i] ?? '').join('§');
    if (!trainSignatureMap.has(sig)) {
      trainSignatureMap.set(sig, r);
    }
  }

  // Probe test rows against train signatures
  let duplicates = 0;
  const sampleDuplicates: SplitContaminationResult['sampleDuplicates'] = [];

  for (let r = 0; r < testData.length; r++) {
    const row = testData[r];
    const sig = testIndices.map((i) => row[i] ?? '').join('§');
    if (trainSignatureMap.has(sig)) {
      duplicates++;
      if (sampleDuplicates.length < 5) {
        const trainRowIdx = trainSignatureMap.get(sig)!;
        const featureValues: Record<string, string> = {};
        sharedCols.slice(0, 5).forEach((col, idx) => {
          featureValues[col] = row[testIndices[idx]] ?? '';
        });
        sampleDuplicates.push({
          trainRowIndex: trainRowIdx + 1,
          testRowIndex: r + 1,
          featureValues,
        });
      }
    }
  }

  const hasContamination = duplicates > 0;
  const duplicatePercentage = testData.length > 0 ? (duplicates / testData.length) * 100 : 0;

  if (hasContamination) {
    warnings.push(
      `Split contamination alert: Found ${duplicates} exact duplicate record(s) (${duplicatePercentage.toFixed(1)}% of test set) that exist verbatim in the training data. This creates test-set leakage and artificially inflates evaluation metrics.`
    );
  }

  return {
    hasContamination,
    duplicateRowCount: duplicates,
    duplicatePercentage,
    totalTrainRows: trainData.length,
    totalTestRows: testData.length,
    sharedFeatureColumns: sharedCols,
    sampleDuplicates,
    warnings,
  };
}

/**
 * Performs a deterministic data quality audit on a tabular CSV artifact
 */
export function auditDataQuality(csvText: string, artifactName = 'dataset'): DataQualityAuditResult {
  const records = parseCsv(csvText);
  const [headers, ...data] = records;
  const warnings: string[] = [];

  const missingSummary: Record<string, { count: number; percentage: number }> = {};
  const isNumericCol: boolean[] = [];

  // Initialize summary
  headers.forEach((h) => {
    missingSummary[h] = { count: 0, percentage: 0 };
  });

  const numericVals: number[][] = headers.map(() => []);
  const seenRowSignatures = new Set<string>();
  let internalDuplicates = 0;

  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    const rowSig = row.join('§');
    if (seenRowSignatures.has(rowSig)) {
      internalDuplicates++;
    } else {
      seenRowSignatures.add(rowSig);
    }

    for (let c = 0; c < headers.length; c++) {
      const val = row[c]?.trim();
      if (!val || /^(null|na|nan|n\/a)$/i.test(val)) {
        missingSummary[headers[c]].count++;
      } else {
        const num = Number(val);
        if (Number.isFinite(num)) {
          numericVals[c].push(num);
        }
      }
    }
  }

  // Compute percentages & warnings
  headers.forEach((h) => {
    const count = missingSummary[h].count;
    const pct = data.length > 0 ? (count / data.length) * 100 : 0;
    missingSummary[h].percentage = pct;
    if (pct > 20) {
      warnings.push(`Column "${h}" has ${pct.toFixed(1)}% missing values (${count} rows).`);
    }
  });

  if (internalDuplicates > 0) {
    warnings.push(
      `Dataset contains ${internalDuplicates} internal duplicate rows (${((internalDuplicates / data.length) * 100).toFixed(1)}%).`
    );
  }

  // Detect numeric outliers via IQR (1.5 * IQR)
  const columnsWithOutliers: DataQualityAuditResult['columnsWithOutliers'] = [];
  for (let c = 0; c < headers.length; c++) {
    const nums = numericVals[c];
    if (nums.length > 20 && nums.length / data.length > 0.8) {
      nums.sort((a, b) => a - b);
      const q1 = nums[Math.floor(nums.length * 0.25)];
      const q3 = nums[Math.floor(nums.length * 0.75)];
      const iqr = q3 - q1;
      if (iqr > 0) {
        const lower = q1 - 1.5 * iqr;
        const upper = q3 + 1.5 * iqr;
        let outliers = 0;
        for (const v of nums) {
          if (v < lower || v > upper) outliers++;
        }
        if (outliers > 0) {
          columnsWithOutliers.push({
            columnName: headers[c],
            outlierCount: outliers,
            lowerBound: lower,
            upperBound: upper,
          });
        }
      }
    }
  }

  return {
    artifactName,
    totalRows: data.length,
    totalColumns: headers.length,
    missingValuesSummary: missingSummary,
    internalDuplicateRowCount: internalDuplicates,
    columnsWithOutliers,
    warnings,
  };
}

import { parseCsv } from './csv.ts';
import { createId, id, type Id } from '../domain/primitives.ts';
import { datasetMetadataSchema, sourceSchema, type DatasetMetadata } from '../domain/types.ts';
import type { Infer } from '../domain/schema.ts';
import {
  inferColumnMapping,
  inferBinaryLabels,
  evaluateCapabilities,
  type ColumnSummaryStats,
  type DatasetPreview,
} from './capability.ts';

export const EVALUATION_LIMITS = Object.freeze({
  bytes: 2_000_000,
  rows: 10_000,
  columns: 100,
  cells: 1_000_000,
  issues: 50,
});

const missing = (value: string | null | undefined) =>
  value === null || value === undefined || !value || /^(null|na|nan|n\/a)$/i.test(value.trim());
const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

export type EvaluationIssue = {
  code:
    | 'configuration'
    | 'file_type'
    | 'encoding'
    | 'limit'
    | 'csv'
    | 'required_column'
    | 'missing_value'
    | 'label'
    | 'probability';
  message: string;
  row: number | null;
  column: string | null;
};

export class EvaluationValidationError extends Error {
  readonly issues: EvaluationIssue[];
  readonly totalIssues: number;
  constructor(issues: EvaluationIssue[], totalIssues = issues.length) {
    super(
      issues
        .map(
          (i) =>
            `${i.row === null ? '' : `Data row ${i.row}, `}${i.column ? `${i.column}: ` : ''}${i.message}`
        )
        .join('\n') + (totalIssues > issues.length ? `\nShowing ${issues.length} of ${totalIssues} issues.` : '')
    );
    this.name = 'EvaluationValidationError';
    this.issues = issues;
    this.totalIssues = totalIssues;
  }
}

function reject(code: EvaluationIssue['code'], message: string): never {
  throw new EvaluationValidationError([{ code, message, row: null, column: null }]);
}

export type ColumnMapping = {
  targetColumn?: string;
  predictionColumn?: string;
  probabilityColumn?: string | null;
  sliceColumns?: string[];
  idColumn?: string;
};

export type EvaluationOptions = {
  labels?: { positive: string; negative: string };
  datasetId?: Id<'dataset'>;
  sourceId?: Id<'source'>;
  columnMapping?: ColumnMapping;
};

export type EvaluationRow = {
  sourceRow: number;
  actual: string;
  predicted: string;
  positiveProbability: number | null;
  attributes: Record<string, string | null>;
};

export type EvaluationDataset = {
  schemaVersion: 1;
  metadata: DatasetMetadata;
  source: Infer<typeof sourceSchema>;
  labels: { positive: string; negative: string };
  rows: EvaluationRow[];
  warnings: string[];
};

/**
 * Parses and summarizes CSV column values for safe UI preview and mapping inference
 */
export function previewEvaluationCsv(text: string, name: string): DatasetPreview {
  if (typeof name !== 'string' || !name.trim() || name.length > 4000 || !/\.csv$/i.test(name)) {
    reject('file_type', 'Choose a named .csv evaluation file.');
  }
  if (typeof text !== 'string') reject('encoding', 'Supply UTF-8 CSV text.');
  if (
    text.length > EVALUATION_LIMITS.bytes ||
    new TextEncoder().encode(text).byteLength > EVALUATION_LIMITS.bytes
  ) {
    reject('limit', `Evaluation CSV exceeds maximum allowed file size (${(EVALUATION_LIMITS.bytes / (1024 * 1024)).toFixed(0)} MB).`);
  }
  if (text.includes('\0') || text.includes('\uFFFD')) {
    reject('encoding', 'Export readable UTF-8 text; binary or replacement characters were detected.');
  }

  let records: string[][];
  try {
    records = parseCsv(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    reject(
      error instanceof Error && /exceeds/.test(error.message) ? 'limit' : 'csv',
      error instanceof Error ? error.message : 'Malformed CSV.'
    );
  }

  const [headers, ...data] = records;
  if (!headers || headers.length === 0) {
    reject('csv', 'CSV file contains no headers.');
  }
  if (headers.length > EVALUATION_LIMITS.columns) {
    reject('limit', `CSV has ${headers.length} columns, exceeding the limit of ${EVALUATION_LIMITS.columns}.`);
  }
  if (data.length > EVALUATION_LIMITS.rows) {
    reject('limit', `CSV has ${data.length.toLocaleString()} data rows, exceeding the limit of ${EVALUATION_LIMITS.rows.toLocaleString()}.`);
  }

  const totalRows = data.length;
  const sampleData = data.slice(0, 100);

  const columns: ColumnSummaryStats[] = headers.map((colName, colIdx) => {
    const rawValues = sampleData.map((row) => row[colIdx] ?? '');
    const nonMissing = rawValues.filter((v) => !missing(v));
    const uniqueVals = Array.from(new Set(nonMissing));
    const isNum =
      nonMissing.length > 0 &&
      nonMissing.every((v) => numeric.test(v) && Number.isFinite(Number(v)));

    const numVals = isNum ? nonMissing.map((v) => Number(v)) : [];
    const min = numVals.length > 0 ? Math.min(...numVals) : null;
    const max = numVals.length > 0 ? Math.max(...numVals) : null;

    let detectedType: ColumnSummaryStats['detectedType'] = 'categorical';
    if (nonMissing.length === 0) {
      detectedType = 'empty';
    } else if (isNum) {
      detectedType = 'numeric';
    } else if (
      uniqueVals.length <= 2 &&
      uniqueVals.every((v) => /^(true|false|0|1|yes|no)$/i.test(v))
    ) {
      detectedType = 'boolean';
    } else if (colName.toLowerCase().includes('time') || colName.toLowerCase().includes('date')) {
      detectedType = 'timestamp';
    }

    return {
      name: colName,
      detectedType,
      sampleValues: uniqueVals.slice(0, 5),
      distinctCount: uniqueVals.length,
      missingCount: rawValues.length - nonMissing.length,
      isNumeric: isNum,
      min,
      max,
    };
  });

  const inferredMapping = inferColumnMapping(headers, columns);

  let detectedLabels: DatasetPreview['detectedLabels'] = null;
  if (inferredMapping.targetColumn) {
    const targetIdx = headers.indexOf(inferredMapping.targetColumn);
    const targetValues = sampleData.map((row) => row[targetIdx] ?? '').filter((v) => !missing(v));
    detectedLabels = inferBinaryLabels(targetValues);
  }

  const capabilities = evaluateCapabilities(columns, inferredMapping);

  const previewRows: Record<string, string>[] = data.slice(0, 10).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? '';
    });
    return obj;
  });

  const validationIssues: string[] = [];
  if (!inferredMapping.targetColumn) {
    validationIssues.push('No ground-truth target column detected. Please map your target label column.');
  }
  if (!inferredMapping.predictionColumn) {
    validationIssues.push('No model prediction column detected. Please map your predicted label column.');
  }
  if (!inferredMapping.probabilityColumn) {
    validationIssues.push('No probability score column detected. Probabilistic analyses (ROC-AUC, calibration, threshold sweep) will be disabled.');
  }

  return {
    fileName: name,
    totalRows,
    previewRows,
    columns,
    inferredMapping,
    detectedLabels,
    capabilities,
    validationIssues,
  };
}

/**
 * Ingests a CSV file into a normalized EvaluationDataset with full column mapping and capability validation
 */
export function ingestEvaluationCsv(
  text: string,
  name: string,
  options: EvaluationOptions = {}
): EvaluationDataset {
  if (typeof name !== 'string' || !name.trim() || name.length > 4000 || !/\.csv$/i.test(name)) {
    reject('file_type', 'Choose a named .csv evaluation file.');
  }
  if (typeof text !== 'string') reject('encoding', 'Supply UTF-8 CSV text.');
  if (
    text.length > EVALUATION_LIMITS.bytes ||
    new TextEncoder().encode(text).byteLength > EVALUATION_LIMITS.bytes
  ) {
    reject('limit', `Evaluation CSV exceeds ${(EVALUATION_LIMITS.bytes / (1024 * 1024)).toFixed(0)} MB.`);
  }
  if (text.includes('\0') || text.includes('\uFFFD')) {
    reject('encoding', 'Export readable UTF-8 text; binary or replacement characters were detected.');
  }
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    Object.keys(options).some((k) => !['labels', 'datasetId', 'sourceId', 'columnMapping'].includes(k))
  ) {
    reject('configuration', 'Invalid evaluation options.');
  }

  let records: string[][];
  try {
    records = parseCsv(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    reject(
      error instanceof Error && /exceeds/.test(error.message) ? 'limit' : 'csv',
      error instanceof Error ? error.message : 'Malformed CSV.'
    );
  }

  const [headers, ...data] = records;
  if (!headers || headers.length === 0) {
    reject('csv', 'CSV contains no headers.');
  }
  if (headers.length > EVALUATION_LIMITS.columns || data.length > EVALUATION_LIMITS.rows) {
    reject('limit', `Use at most ${EVALUATION_LIMITS.columns} columns and ${EVALUATION_LIMITS.rows.toLocaleString()} data rows.`);
  }
  if (headers.some((h) => h.length > 4000)) {
    reject('limit', 'Column names must contain at most 4,000 characters.');
  }

  // Resolve column mappings
  const mapping = options.columnMapping;
  let targetCol = mapping?.targetColumn;
  let predCol = mapping?.predictionColumn;
  let probCol: string | null = mapping?.probabilityColumn !== undefined ? mapping.probabilityColumn : null;

  // If mapping not explicitly provided, attempt auto-resolution
  if (!targetCol || !predCol) {
    if (headers.includes('y_true') && headers.includes('y_pred')) {
      targetCol = 'y_true';
      predCol = 'y_pred';
      if (probCol === null && headers.includes('y_probability')) {
        probCol = 'y_probability';
      }
    } else {
      const inferred = inferColumnMapping(headers);
      targetCol = targetCol ?? inferred.targetColumn ?? 'y_true';
      predCol = predCol ?? inferred.predictionColumn ?? 'y_pred';
      if (probCol === null && inferred.probabilityColumn) {
        probCol = inferred.probabilityColumn;
      }
    }
  } else if (probCol === null && mapping?.probabilityColumn === undefined && headers.includes('y_probability')) {
    probCol = 'y_probability';
  }

  // Validate required target and prediction columns exist
  const missingCols: string[] = [];
  if (!headers.includes(targetCol)) missingCols.push(targetCol);
  if (!headers.includes(predCol)) missingCols.push(predCol);
  if (probCol !== null && !headers.includes(probCol)) missingCols.push(probCol);

  if (missingCols.length > 0) {
    throw new EvaluationValidationError(
      missingCols.map((col) => ({
        code: 'required_column',
        column: col,
        row: null,
        message: `Column '${col}' is missing from CSV headers (available: ${headers.join(', ')}).`,
      }))
    );
  }

  const targetIdx = headers.indexOf(targetCol);
  const predIdx = headers.indexOf(predCol);
  const probIdx = probCol !== null ? headers.indexOf(probCol) : -1;

  // Determine or validate class labels
  let labels = options.labels
    ? { positive: options.labels.positive, negative: options.labels.negative }
    : undefined;

  if (!labels) {
    const targetValues = data
      .map((row) => row[targetIdx])
      .filter((v) => !missing(v));
    const inferred = inferBinaryLabels(targetValues);
    if (inferred) {
      labels = { positive: inferred.positive, negative: inferred.negative };
    } else {
      labels = { positive: '1', negative: '0' };
    }
  }

  if (
    !labels ||
    typeof labels !== 'object' ||
    Array.isArray(labels) ||
    [labels.positive, labels.negative].some(
      (v) => typeof v !== 'string' || missing(v) || v !== v.trim() || v.length > 128
    ) ||
    labels.positive === labels.negative
  ) {
    reject(
      'configuration',
      'Provide two distinct nonmissing class labels, at most 128 characters each, with no surrounding whitespace.'
    );
  }

  const datasetId = options.datasetId === undefined ? createId('dataset') : options.datasetId;
  const sourceId = options.sourceId === undefined ? createId('source') : options.sourceId;

  try {
    id('dataset').parse(datasetId);
    id('source').parse(sourceId);
  } catch {
    reject('configuration', 'Invalid dataset or source identifier.');
  }

  const coreColIndices = new Set([targetIdx, predIdx, ...(probIdx !== -1 ? [probIdx] : [])]);
  const extraCols = headers
    .map((name, index) => ({ name, index }))
    .filter((c) => !coreColIndices.has(c.index));

  const issues: EvaluationIssue[] = [];
  let totalIssues = 0;
  const add = (code: EvaluationIssue['code'], row: number, column: string, message: string) => {
    totalIssues++;
    if (issues.length < EVALUATION_LIMITS.issues) issues.push({ code, row, column, message });
  };

  const rows: EvaluationRow[] = [];
  const actualLabels = new Set<string>();
  let optionalMissing = 0;

  for (const [index, record] of data.entries()) {
    const sourceRow = index + 1;
    const actual = record[targetIdx];
    const predicted = record[predIdx];
    const rawProbability = probIdx !== -1 ? record[probIdx] : null;
    const before = totalIssues;

    if (missing(actual)) {
      add('missing_value', sourceRow, targetCol, 'A ground-truth class label is required; rows are not silently dropped.');
    } else if (actual !== labels.positive && actual !== labels.negative) {
      add('label', sourceRow, targetCol, `Label '${actual}' is outside configured positive/negative pair ('${labels.positive}', '${labels.negative}'). Check spelling and case.`);
    }

    if (missing(predicted)) {
      add('missing_value', sourceRow, predCol, 'A predicted class label is required; rows are not silently dropped.');
    } else if (predicted !== labels.positive && predicted !== labels.negative) {
      add('label', sourceRow, predCol, `Predicted label '${predicted}' is outside configured positive/negative pair ('${labels.positive}', '${labels.negative}'). Check spelling and case.`);
    }

    let probability: number | null = null;
    if (probIdx !== -1) {
      if (missing(rawProbability)) {
        add('missing_value', sourceRow, probCol!, 'A probability score for the configured positive class is required.');
      } else if (
        !numeric.test(rawProbability!) ||
        !Number.isFinite(Number(rawProbability)) ||
        Number(rawProbability) < 0 ||
        Number(rawProbability) > 1
      ) {
        add('probability', sourceRow, probCol!, 'Use a finite decimal probability from 0 to 1, not percentages or logits.');
      } else {
        probability = Number(rawProbability);
      }
    }

    const attributes = Object.fromEntries(
      extraCols.map(({ name, index: colIdx }) => {
        const val = record[colIdx];
        if (missing(val)) {
          optionalMissing++;
          return [name, null];
        }
        return [name, val];
      })
    );

    if (totalIssues === before) {
      actualLabels.add(actual);
      rows.push({
        sourceRow,
        actual,
        predicted,
        positiveProbability: probability,
        attributes,
      });
    }
  }

  if (totalIssues) throw new EvaluationValidationError(issues, totalIssues);

  const warnings: string[] = [];
  if (probCol !== null) {
    warnings.push(
      `${probCol} is interpreted as the probability of the configured positive label (${labels.positive}). This semantic mapping cannot be verified from the CSV alone.`
    );
    warnings.push(
      `Supplied ${predCol} values are preserved; no decision threshold is inferred from probabilities.`
    );
  } else {
    warnings.push(
      'No probability column provided. Discrete prediction metrics will be evaluated; continuous threshold sweeping and calibration curves are unavailable.'
    );
  }
  if (actualLabels.size === 1) {
    warnings.push(
      'Only one true class is present. Some classification metrics will be undefined; no rows or classes were fabricated.'
    );
  }
  if (optionalMissing) {
    warnings.push(`${optionalMissing} missing optional values were retained as null.`);
  }
  if (headers.includes('timestamp')) {
    warnings.push(
      'Timestamp values are preserved as text. Temporal validity and time-bucket semantics have not been checked.'
    );
  }

  const source = sourceSchema.parse({
    id: sourceId,
    kind: 'uploaded_file',
    name,
    capturedAt: new Date().toISOString(),
    contentDigest: null,
  });

  const metadata = datasetMetadataSchema.parse({
    id: datasetId,
    sourceId,
    name,
    rowCount: rows.length,
    columns: headers,
    role: 'evaluation',
    task: 'binary_classification',
    targetColumn: targetCol,
    predictionColumn: predCol,
    probabilityColumn: probCol,
    positiveLabel: labels.positive,
  });

  return { schemaVersion: 1, metadata, source, labels: { ...labels }, rows, warnings };
}

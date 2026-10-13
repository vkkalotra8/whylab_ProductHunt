/**
 * Unified Multi-Format Tabular Adapter
 * Standardizes CSV, TSV, Excel (.xlsx), and Parquet into WhyLab tabular structures
 * while enforcing CWE-502 (Pickle rejection) and CWE-409 (Decompression bomb) defenses.
 */

import { parseDelimitedText } from './tsv-parser.ts';
import { parseExcelWorkbook } from './excel-parser.ts';
import {
  parseParquetBuffer,
  auditBufferForUnsafeSerialization,
} from './parquet-parser.ts';

export type SupportedTabularFormat = 'csv' | 'tsv' | 'xlsx' | 'parquet';

export interface FormatAdapterOptions {
  sheetName?: string;
  sheetIndex?: number;
  delimiter?: string;
  maxRows?: number;
}

export interface UnifiedFormatParseResult {
  format: SupportedTabularFormat;
  fileName: string;
  headers: string[];
  rows: string[][];
  records: Record<string, unknown>[];
  totalRows: number;
  columnCount: number;
  metadata?: Record<string, unknown>;
}

export class UnsupportedFormatError extends Error {
  public readonly code: string;
  constructor(message: string, code = 'UNSUPPORTED_FORMAT') {
    super(message);
    this.name = 'UnsupportedFormatError';
    this.code = code;
  }
}

/**
 * Detects format from extension and binary magic bytes
 */
export function detectFileFormat(fileName: string, buffer?: Buffer): SupportedTabularFormat {
  const lower = fileName.toLowerCase();

  // 1. Prohibited pickled / serialized extensions
  if (
    lower.endsWith('.pkl') ||
    lower.endsWith('.pickle') ||
    lower.endsWith('.joblib') ||
    lower.endsWith('.pt') ||
    lower.endsWith('.pth') ||
    lower.endsWith('.bin')
  ) {
    if (buffer) auditBufferForUnsafeSerialization(buffer);
    throw new UnsupportedFormatError(
      `File format for '${fileName}' is prohibited (CWE-502: unsafe serialization). ` +
        'Upload structured CSV, TSV, Excel (.xlsx), or Parquet datasets instead.',
      'PROHIBITED_SERIALIZED_FORMAT'
    );
  }

  // 2. Parquet check
  if (lower.endsWith('.parquet') || lower.endsWith('.pq')) {
    return 'parquet';
  }
  if (buffer && buffer.length >= 8 && buffer.subarray(0, 4).toString('ascii') === 'PAR1') {
    return 'parquet';
  }

  // 3. Excel check
  if (lower.endsWith('.xlsx')) {
    return 'xlsx';
  }
  if (
    buffer &&
    buffer.length >= 4 &&
    buffer.readUInt32LE(0) === 0x04034b50 &&
    (lower.endsWith('.xlsx') || lower.endsWith('.zip'))
  ) {
    return 'xlsx';
  }

  // 4. TSV / Tab check
  if (lower.endsWith('.tsv') || lower.endsWith('.tab')) {
    return 'tsv';
  }

  // 5. Default / CSV
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    return 'csv';
  }

  throw new UnsupportedFormatError(
    `Unsupported file extension for '${fileName}'. Supported formats: .csv, .tsv, .xlsx, .parquet`,
    'UNRECOGNIZED_EXTENSION'
  );
}

/**
 * Universal parser for any supported tabular format
 */
export function parseAnyTabularDataset(
  input: string | Buffer,
  fileName: string,
  options: FormatAdapterOptions = {}
): UnifiedFormatParseResult {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  const format = detectFileFormat(fileName, buffer);

  // Security check on buffer
  auditBufferForUnsafeSerialization(buffer);

  switch (format) {
    case 'parquet': {
      const pqRes = parseParquetBuffer(buffer, { maxRows: options.maxRows });
      const strRows = pqRes.records.map((r) => pqRes.headers.map((h) => String(r[h] ?? '')));
      return {
        format: 'parquet',
        fileName,
        headers: pqRes.headers,
        rows: strRows,
        records: pqRes.records,
        totalRows: pqRes.totalRows,
        columnCount: pqRes.columnCount,
        metadata: { ...pqRes.metadata },
      };
    }

    case 'xlsx': {
      const excelRes = parseExcelWorkbook(buffer, {
        sheetName: options.sheetName,
        sheetIndex: options.sheetIndex,
        maxRows: options.maxRows,
      });
      return {
        format: 'xlsx',
        fileName,
        headers: excelRes.headers,
        rows: excelRes.rows,
        records: excelRes.records,
        totalRows: excelRes.totalRows,
        columnCount: excelRes.columnCount,
        metadata: {
          activeSheet: excelRes.sheetName,
          availableSheets: excelRes.availableSheets,
        },
      };
    }

    case 'tsv':
    case 'csv': {
      const text = buffer.toString('utf8');
      const delRes = parseDelimitedText(text, {
        explicitDelimiter: format === 'tsv' ? '\t' : options.delimiter ?? 'auto',
        maxRows: options.maxRows,
      });
      return {
        format: delRes.delimiter === '\t' ? 'tsv' : 'csv',
        fileName,
        headers: delRes.headers,
        rows: delRes.rows,
        records: delRes.records,
        totalRows: delRes.totalRows,
        columnCount: delRes.columnCount,
        metadata: {
          delimiter: delRes.delimiter,
        },
      };
    }
  }
}

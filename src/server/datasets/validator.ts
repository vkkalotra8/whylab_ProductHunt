import crypto from 'node:crypto';
import type {
  ColumnSummary,
  ColumnDataType,
  ValidationIssue,
  ValidationSummary,
} from './types.ts';

const NUMERIC_REGEX = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const BOOLEAN_VALUES = new Set(['true', 'false', '0', '1', 'yes', 'no']);
const FORMULA_START_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

// Model binary and serialized magic bytes to prevent CWE-502 execution
const DANGEROUS_MAGIC_HEADERS: { pattern: Buffer; name: string }[] = [
  { pattern: Buffer.from([0x80, 0x02]), name: 'Python Pickle (Protocol 2)' },
  { pattern: Buffer.from([0x80, 0x03]), name: 'Python Pickle (Protocol 3)' },
  { pattern: Buffer.from([0x80, 0x04]), name: 'Python Pickle (Protocol 4)' },
  { pattern: Buffer.from([0x80, 0x05]), name: 'Python Pickle (Protocol 5)' },
  { pattern: Buffer.from([0xac, 0xed]), name: 'Java Serialization' },
  { pattern: Buffer.from([0x4d, 0x5a]), name: 'Windows Executable (PE/MZ)' },
  { pattern: Buffer.from([0x7f, 0x45, 0x4c, 0x46]), name: 'Linux Executable (ELF)' },
];

export interface ValidationOptions {
  filename?: string;
  sanitizeFormulas?: boolean;
  maxSizeBytes?: number;
  maxRows?: number;
}

export function isMissingValue(val: string | null | undefined): boolean {
  if (val === null || val === undefined) return true;
  const trimmed = val.trim();
  if (trimmed === '') return true;
  return /^(null|na|nan|n\/a|none|undefined)$/i.test(trimmed);
}

export function detectColumnDataType(values: (string | null | undefined)[]): ColumnDataType {
  const nonNulls = values
    .filter((v): v is string => !isMissingValue(v))
    .map((v) => v.trim());

  if (nonNulls.length === 0) {
    return 'string';
  }

  const allNumeric = nonNulls.every((v) => NUMERIC_REGEX.test(v));
  if (allNumeric) return 'numeric';

  const allBoolean = nonNulls.every((v) => BOOLEAN_VALUES.has(v.toLowerCase()));
  if (allBoolean) return 'boolean';

  const allDates = nonNulls.every((v) => {
    if (v.length < 8) return false;
    const ts = Date.parse(v);
    return !Number.isNaN(ts);
  });
  if (allDates) return 'datetime';

  return 'string';
}

/**
 * Parses raw CSV line into fields respecting quotes and escaped quotes
 */
export function parseCsvLine(line: string, delimiter: string = ','): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        fields.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Validates dataset binary or text stream, computes SHA-256 hash, extracts schema and column missingness,
 * and performs formula injection detection and sanitization.
 */
export function validateDatasetContent(
  rawInput: Buffer | string,
  options: ValidationOptions = {}
): ValidationSummary {
  const buffer = Buffer.isBuffer(rawInput) ? rawInput : Buffer.from(rawInput, 'utf-8');
  const sizeBytes = buffer.length;
  const issues: ValidationIssue[] = [];

  // Compute SHA-256 digest
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  // Check size limit (default 100MB)
  const maxSizeBytes = options.maxSizeBytes ?? 100 * 1024 * 1024;
  if (sizeBytes > maxSizeBytes) {
    issues.push({
      code: 'SIZE_EXCEEDED',
      severity: 'error',
      message: `Dataset size (${sizeBytes} bytes) exceeds maximum allowed limit of ${maxSizeBytes} bytes.`,
    });
    return {
      isValid: false,
      sha256,
      sizeBytes,
      rowCount: 0,
      columnCount: 0,
      columns: [],
      injectedCellsCount: 0,
      issues,
    };
  }

  // Check for dangerous binary/executable/pickle magic headers (CWE-502)
  for (const header of DANGEROUS_MAGIC_HEADERS) {
    if (buffer.length >= header.pattern.length) {
      let match = true;
      for (let i = 0; i < header.pattern.length; i++) {
        if (buffer[i] !== header.pattern[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        issues.push({
          code: 'MALICIOUS_CONTENT',
          severity: 'error',
          message: `File header matches prohibited executable/serialized binary signature: ${header.name}. Execution of arbitrary binaries is strictly prohibited (CWE-502).`,
        });
        return {
          isValid: false,
          sha256,
          sizeBytes,
          rowCount: 0,
          columnCount: 0,
          columns: [],
          injectedCellsCount: 0,
          issues,
        };
      }
    }
  }

  // Check file extension if provided
  if (options.filename) {
    const lower = options.filename.toLowerCase();
    const disallowedExtensions = ['.pkl', '.pickle', '.joblib', '.pt', '.pth', '.bin', '.h5', '.exe', '.sh', '.bat'];
    for (const ext of disallowedExtensions) {
      if (lower.endsWith(ext)) {
        issues.push({
          code: 'FILE_TYPE_REJECTED',
          severity: 'error',
          message: `Prohibited file extension ${ext}. Only tabular data formats (.csv, .tsv, .jsonl) are supported.`,
        });
        return {
          isValid: false,
          sha256,
          sizeBytes,
          rowCount: 0,
          columnCount: 0,
          columns: [],
          injectedCellsCount: 0,
          issues,
        };
      }
    }
  }

  // Decode UTF-8 string, stripping UTF-8 BOM if present
  let text = buffer.toString('utf-8');
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  // Empty check
  if (text.trim().length === 0) {
    issues.push({
      code: 'EMPTY_FILE',
      severity: 'error',
      message: 'The uploaded file is empty.',
    });
    return {
      isValid: false,
      sha256,
      sizeBytes,
      rowCount: 0,
      columnCount: 0,
      columns: [],
      injectedCellsCount: 0,
      issues,
    };
  }

  // Check line endings and split
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    issues.push({
      code: 'MISSING_COLUMNS',
      severity: 'error',
      message: 'Tabular dataset must contain at least a header row and one data row.',
    });
    return {
      isValid: false,
      sha256,
      sizeBytes,
      rowCount: 0,
      columnCount: 0,
      columns: [],
      injectedCellsCount: 0,
      issues,
    };
  }

  // Detect delimiter
  const firstLine = lines[0];
  let delimiter = ',';
  if ((firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length) {
    delimiter = '\t';
  } else if ((firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length) {
    delimiter = ';';
  }

  const rawHeaders = parseCsvLine(firstLine, delimiter).map((h) => h.trim().replace(/^"|"$/g, ''));
  const columnCount = rawHeaders.length;

  if (columnCount === 0) {
    issues.push({
      code: 'MISSING_COLUMNS',
      severity: 'error',
      message: 'Failed to extract headers from the first row.',
    });
    return {
      isValid: false,
      sha256,
      sizeBytes,
      rowCount: 0,
      columnCount: 0,
      columns: [],
      injectedCellsCount: 0,
      issues,
    };
  }

  const rows: string[][] = [];
  let injectedCellsCount = 0;
  const sanitizedRows: string[][] = [];

  if (options.sanitizeFormulas) {
    sanitizedRows.push([...rawHeaders]);
  }

  const dataLines = lines.slice(1);
  const rowCount = dataLines.length;

  // Max rows limit check
  if (options.maxRows && rowCount > options.maxRows) {
    issues.push({
      code: 'SIZE_EXCEEDED',
      severity: 'error',
      message: `Row count (${rowCount}) exceeds maximum allowed limit of ${options.maxRows} rows.`,
    });
  }

  for (let r = 0; r < rowCount; r++) {
    const rowIdx = r + 2; // 1-indexed, header is row 1
    const line = dataLines[r];
    const fields = parseCsvLine(line, delimiter);

    if (fields.length !== columnCount) {
      if (issues.filter((i) => i.code === 'JAGGED_ROWS').length < 5) {
        issues.push({
          code: 'JAGGED_ROWS',
          severity: 'warning',
          row: rowIdx,
          message: `Row has ${fields.length} columns; expected ${columnCount}.`,
        });
      }
    }

    const sanitizedRow: string[] = [];
    for (let c = 0; c < fields.length; c++) {
      let cell = fields[c];
      const trimmed = cell.trim();

      // Check formula injection
      if (trimmed.length > 0 && FORMULA_START_CHARS.has(trimmed[0])) {
        injectedCellsCount++;
        if (issues.filter((i) => i.code === 'FORMULA_INJECTION').length < 5) {
          issues.push({
            code: 'FORMULA_INJECTION',
            severity: 'warning',
            row: rowIdx,
            column: rawHeaders[c] || `col_${c + 1}`,
            message: `Potential CSV formula injection detected in cell: "${trimmed.slice(0, 16)}..."`,
          });
        }
        if (options.sanitizeFormulas) {
          // Prefix with apostrophe to neutralize spreadsheet formula execution
          cell = `'${cell}`;
        }
      }
      sanitizedRow.push(cell);
    }

    rows.push(fields);
    if (options.sanitizeFormulas) {
      sanitizedRows.push(sanitizedRow);
    }
  }

  // Column summaries and missingness
  const columns: ColumnSummary[] = rawHeaders.map((headerName, colIdx) => {
    const colValues = rows.map((r) => r[colIdx]);
    let nullCount = 0;
    const distinctSet = new Set<string>();
    const samples: string[] = [];

    for (const val of colValues) {
      if (isMissingValue(val)) {
        nullCount++;
      } else {
        const clean = val.trim();
        distinctSet.add(clean);
        if (samples.length < 5 && !samples.includes(clean)) {
          samples.push(clean);
        }
      }
    }

    const missingRate = rowCount > 0 ? nullCount / rowCount : 0;
    const dataType = detectColumnDataType(colValues);

    return {
      name: headerName || `col_${colIdx + 1}`,
      dataType,
      totalCount: rowCount,
      nullCount,
      missingRate: Number(missingRate.toFixed(4)),
      distinctCount: distinctSet.size,
      sampleValues: samples,
    };
  });

  const hasErrors = issues.some((i) => i.severity === 'error');

  let sanitizedContent: string | undefined;
  if (options.sanitizeFormulas && injectedCellsCount > 0) {
    sanitizedContent = sanitizedRows
      .map((row) =>
        row
          .map((field) => {
            if (field.includes(delimiter) || field.includes('"') || field.includes('\n')) {
              return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
          })
          .join(delimiter)
      )
      .join('\n');
  }

  return {
    isValid: !hasErrors,
    sha256,
    sizeBytes,
    rowCount,
    columnCount,
    columns,
    injectedCellsCount,
    issues,
    sanitizedContent,
  };
}

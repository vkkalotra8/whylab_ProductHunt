/**
 * Robust TSV and Custom-Delimited Parser Adapter
 * Supports Tab (\t), Comma (,), Semicolon (;), and Pipe (|) with auto-detection,
 * BOM stripping, CRLF normalization, escaped quotes, and structural validation.
 */

export type DelimiterType = '\t' | ',' | ';' | '|';

export interface DelimitedParseOptions {
  explicitDelimiter?: string | 'auto';
  maxRows?: number;
  maxCells?: number;
  trimWhitespace?: boolean;
}

export interface DelimitedParseResult {
  delimiter: string;
  headers: string[];
  rows: string[][];
  records: Record<string, string>[];
  totalRows: number;
  columnCount: number;
  hasHeaders: boolean;
}

/**
 * Auto-detects the most probable delimiter from the first several non-empty lines
 */
export function detectAutoDelimiter(text: string): DelimiterType {
  const sampleLines = text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, 5);

  if (sampleLines.length === 0) return ',';

  const counts: Record<DelimiterType, number> = {
    '\t': 0,
    ',': 0,
    ';': 0,
    '|': 0,
  };

  for (const line of sampleLines) {
    // Count delimiters outside of quotes
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes) {
        if (ch === '\t') counts['\t']++;
        else if (ch === ',') counts[',']++;
        else if (ch === ';') counts[';']++;
        else if (ch === '|') counts['|']++;
      }
    }
  }

  // Prioritize delimiter with highest count across lines
  let bestDelimiter: DelimiterType = ',';
  let maxCount = -1;

  const candidateDelimiters: DelimiterType[] = ['\t', ';', '|', ','];
  for (const delim of candidateDelimiters) {
    if (counts[delim] > maxCount) {
      maxCount = counts[delim];
      bestDelimiter = delim;
    }
  }

  return maxCount > 0 ? bestDelimiter : ',';
}

/**
 * Parses delimited text into structured records
 */
export function parseDelimitedText(
  rawText: string,
  options: DelimitedParseOptions = {}
): DelimitedParseResult {
  if (typeof rawText !== 'string') {
    throw new Error('Input must be a valid text string');
  }

  // Strip UTF-8 BOM
  const text = rawText.replace(/^\uFEFF/, '');
  if (!text.trim()) {
    throw new Error('Delimited data is empty');
  }

  const delimiter =
    options.explicitDelimiter && options.explicitDelimiter !== 'auto'
      ? options.explicitDelimiter
      : detectAutoDelimiter(text);

  const maxCells = options.maxCells ?? 10_000_000;
  const maxRows = options.maxRows ?? 1_000_000;
  const trim = options.trimWhitespace ?? true;

  const parsedRows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;
  let quoteClosed = false;
  let cellCount = 0;

  const flushCell = () => {
    if (++cellCount > maxCells) {
      throw new Error(`Text exceeds maximum allowed cell limit (${maxCells.toLocaleString()}).`);
    }
    currentRow.push(trim ? currentCell.trim() : currentCell);
    currentCell = '';
    quoteClosed = false;
  };

  const flushRow = () => {
    flushCell();
    // Only push if row has content
    if (currentRow.length > 1 || currentRow.some((c) => c.length > 0)) {
      parsedRows.push(currentRow);
    }
    currentRow = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
        quoteClosed = true;
      } else {
        currentCell += ch;
      }
    } else if (ch === delimiter) {
      flushCell();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i++; // consume LF
      }
      flushRow();
      if (parsedRows.length >= maxRows) break;
    } else if (ch === '"' && !currentCell && !quoteClosed) {
      inQuotes = true;
    } else if (ch === '"' || (quoteClosed && ch.trim())) {
      throw new Error('Malformed delimited syntax: unexpected quote or character after closing quote.');
    } else if (!quoteClosed) {
      currentCell += ch;
    }
  }

  if (inQuotes) {
    throw new Error('Malformed delimited syntax: unclosed quote detected at end of file.');
  }

  if (currentCell || currentRow.length || quoteClosed) {
    flushRow();
  }

  if (parsedRows.length < 2) {
    throw new Error('Delimited dataset must contain a header row and at least one data row.');
  }

  const headers = parsedRows[0];
  if (headers.some((h) => !h.trim())) {
    throw new Error('Header row contains empty column names.');
  }

  if (new Set(headers).size !== headers.length) {
    throw new Error('Header row contains duplicate column names.');
  }

  const expectedCols = headers.length;
  const dataRows = parsedRows.slice(1);

  // Validate column count consistency
  for (let r = 0; r < dataRows.length; r++) {
    if (dataRows[r].length !== expectedCols) {
      throw new Error(
        `Row ${r + 2} column count mismatch: expected ${expectedCols} columns, found ${dataRows[r].length}.`
      );
    }
  }

  const records = dataRows.map((row) => {
    const rec: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      rec[headers[c]] = row[c] ?? '';
    }
    return rec;
  });

  return {
    delimiter,
    headers,
    rows: dataRows,
    records,
    totalRows: dataRows.length,
    columnCount: expectedCols,
    hasHeaders: true,
  };
}

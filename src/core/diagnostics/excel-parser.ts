/**
 * Safe In-Memory Excel (.xlsx) Parser with Pure Node.js & Zlib.
 *
 * OpenXML .xlsx files are standard ZIP containers containing XML structures:
 * - xl/workbook.xml (sheet catalog and names)
 * - xl/sharedStrings.xml (shared string lookup table)
 * - xl/worksheets/sheet*.xml (row & cell data)
 *
 * DEFENSES & INVARIANTS:
 * - CWE-409 Decompression Bomb protection: Strict caps on uncompressed size, file count, and compression ratio.
 * - CWE-22 Path Traversal protection: Strict validation of relative entry names.
 * - Zero external npm dependencies: Uses built-in node:zlib (inflateRawSync) and safe XML regex stream extraction.
 */

import { inflateRawSync } from 'node:zlib';

export interface ExcelParseOptions {
  sheetName?: string;
  sheetIndex?: number; // 0-based
  maxRows?: number;
  maxCells?: number;
}

export interface ExcelSheetInfo {
  name: string;
  sheetId: number;
  relId: string;
  fileName: string;
}

export interface ExcelParseResult {
  sheetName: string;
  availableSheets: string[];
  headers: string[];
  rows: string[][];
  records: Record<string, string>[];
  totalRows: number;
  columnCount: number;
}

export const EXCEL_SECURITY_LIMITS = {
  maxTotalBytes: 50 * 1024 * 1024, // 50 MB
  maxEntryBytes: 25 * 1024 * 1024, // 25 MB
  maxFileCount: 100,
  maxCompressionRatio: 20, // 20:1
};

export class ExcelSecurityError extends Error {
  public readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'ExcelSecurityError';
    this.code = code;
  }
}

interface ZipEntry {
  fileName: string;
  uncompressedSize: number;
  compressedSize: number;
  compressionMethod: number;
  dataOffset: number;
}

/**
 * Parses central directory or local headers of a ZIP buffer safely
 */
function readZipEntries(buffer: Buffer): Map<string, ZipEntry> {
  if (!buffer || buffer.length < 22) {
    throw new ExcelSecurityError('Buffer too small to be a valid .xlsx ZIP container', 'INVALID_SIZE');
  }

  // Magic header: PK\x03\x04
  if (buffer.readUInt32LE(0) !== 0x04034b50) {
    throw new ExcelSecurityError('Invalid Excel file: Missing PK ZIP header signature', 'NOT_A_ZIP');
  }

  const entries = new Map<string, ZipEntry>();
  let offset = 0;
  let fileCount = 0;
  let totalExtractedBytes = 0;

  while (offset < buffer.length - 30) {
    const signature = buffer.readUInt32LE(offset);

    // Local file header PK\x03\x04
    if (signature === 0x04034b50) {
      fileCount++;
      if (fileCount > EXCEL_SECURITY_LIMITS.maxFileCount) {
        throw new ExcelSecurityError(
          `Archive contains too many entries (CWE-409 Decompression Bomb protection)`,
          'TOO_MANY_FILES'
        );
      }

      const compressionMethod = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const uncompressedSize = buffer.readUInt32LE(offset + 22);
      const fileNameLength = buffer.readUInt16LE(offset + 26);
      const extraFieldLength = buffer.readUInt16LE(offset + 28);

      if (uncompressedSize > EXCEL_SECURITY_LIMITS.maxEntryBytes) {
        throw new ExcelSecurityError(
          `Excel entry exceeds maximum uncompressed size (${EXCEL_SECURITY_LIMITS.maxEntryBytes} bytes)`,
          'ENTRY_TOO_LARGE'
        );
      }

      totalExtractedBytes += uncompressedSize;
      if (totalExtractedBytes > EXCEL_SECURITY_LIMITS.maxTotalBytes) {
        throw new ExcelSecurityError(
          `Excel total uncompressed size exceeds limit (CWE-409 Decompression Bomb protection)`,
          'DECOMPRESSION_BOMB_LIMIT'
        );
      }

      if (compressedSize > 0) {
        const ratio = uncompressedSize / compressedSize;
        if (ratio > EXCEL_SECURITY_LIMITS.maxCompressionRatio) {
          throw new ExcelSecurityError(
            `Suspicious compression ratio ${ratio.toFixed(1)}:1 (CWE-409 Decompression Bomb protection)`,
            'HIGH_COMPRESSION_RATIO'
          );
        }
      }

      const rawFileName = buffer
        .subarray(offset + 30, offset + 30 + fileNameLength)
        .toString('utf8');

      // CWE-22 Path Traversal check
      if (rawFileName.includes('..') || rawFileName.startsWith('/') || rawFileName.startsWith('\\')) {
        throw new ExcelSecurityError(
          `Malicious path traversal sequence in entry name: ${rawFileName}`,
          'PATH_TRAVERSAL'
        );
      }

      const dataOffset = offset + 30 + fileNameLength + extraFieldLength;

      entries.set(rawFileName, {
        fileName: rawFileName,
        uncompressedSize,
        compressedSize,
        compressionMethod,
        dataOffset,
      });

      offset = dataOffset + compressedSize;
    } else {
      // Seek forward
      offset++;
    }
  }

  return entries;
}

/**
 * Extracts a specific file from the ZIP buffer by name
 */
function extractZipFile(buffer: Buffer, entries: Map<string, ZipEntry>, targetPath: string): string | null {
  const normalizedTarget = targetPath.replace(/^\//, '');
  let entry = entries.get(normalizedTarget);

  if (!entry) {
    // Try case-insensitive search
    for (const [k, v] of entries.entries()) {
      if (k.toLowerCase() === normalizedTarget.toLowerCase()) {
        entry = v;
        break;
      }
    }
  }

  if (!entry) return null;

  const dataSlice = buffer.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    // Stored (no compression)
    return dataSlice.toString('utf8');
  }

  if (entry.compressionMethod === 8) {
    // Deflate
    const uncompressed = inflateRawSync(dataSlice);
    return uncompressed.toString('utf8');
  }

  throw new ExcelSecurityError(
    `Unsupported compression method (${entry.compressionMethod}) in Excel entry`,
    'UNSUPPORTED_COMPRESSION'
  );
}

/**
 * Parses shared strings table from xl/sharedStrings.xml
 */
function parseSharedStrings(xmlContent: string | null): string[] {
  if (!xmlContent) return [];

  const strings: string[] = [];
  // Match each <si> item
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let siMatch: RegExpExecArray | null;

  while ((siMatch = siRegex.exec(xmlContent)) !== null) {
    const siBody = siMatch[1];
    // Collect all text tags inside this <si>
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tMatch: RegExpExecArray | null;
    let combinedText = '';

    while ((tMatch = tRegex.exec(siBody)) !== null) {
      combinedText += tMatch[1];
    }

    strings.push(decodeXmlEntities(combinedText));
  }

  return strings;
}

/**
 * Discovers available worksheets from xl/workbook.xml
 */
export function listExcelSheets(buffer: Buffer): ExcelSheetInfo[] {
  const entries = readZipEntries(buffer);
  const workbookXml = extractZipFile(buffer, entries, 'xl/workbook.xml') ?? extractZipFile(buffer, entries, 'workbook.xml');

  if (!workbookXml) {
    throw new ExcelSecurityError('Corrupt Excel file: Missing xl/workbook.xml catalog', 'MISSING_WORKBOOK');
  }

  const sheets: ExcelSheetInfo[] = [];
  const sheetTagRegex = /<sheet\b([^>]*)\/?>/g;
  let match: RegExpExecArray | null;

  let sheetIndex = 1;
  while ((match = sheetTagRegex.exec(workbookXml)) !== null) {
    const attrs = match[1];
    const nameMatch = /name="([^"]*)"/.exec(attrs);
    const idMatch = /sheetId="([^"]*)"/.exec(attrs);
    const rIdMatch = /r:id="([^"]*)"/.exec(attrs);

    const name = nameMatch ? decodeXmlEntities(nameMatch[1]) : `Sheet${sheetIndex}`;
    const sheetId = idMatch ? parseInt(idMatch[1], 10) : sheetIndex;
    const relId = rIdMatch ? rIdMatch[1] : `rId${sheetIndex}`;

    // Target filename usually xl/worksheets/sheet{index}.xml
    const fileName = `xl/worksheets/sheet${sheetIndex}.xml`;

    sheets.push({ name, sheetId, relId, fileName });
    sheetIndex++;
  }

  if (sheets.length === 0) {
    sheets.push({ name: 'Sheet1', sheetId: 1, relId: 'rId1', fileName: 'xl/worksheets/sheet1.xml' });
  }

  return sheets;
}

/**
 * Converts column letter (A, B, ..., Z, AA, AB) to 0-based column index
 */
function colLetterToIndex(colStr: string): number {
  let index = 0;
  for (let i = 0; i < colStr.length; i++) {
    index = index * 26 + (colStr.charCodeAt(i) - 64);
  }
  return index - 1;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Parses an entire Excel workbook buffer into structured tabular data
 */
export function parseExcelWorkbook(buffer: Buffer, options: ExcelParseOptions = {}): ExcelParseResult {
  const entries = readZipEntries(buffer);
  const sheets = listExcelSheets(buffer);

  if (sheets.length === 0) {
    throw new ExcelSecurityError('No worksheets found in Excel workbook', 'NO_SHEETS');
  }

  // Determine target sheet
  let targetSheet = sheets[0];
  if (options.sheetName) {
    const found = sheets.find((s) => s.name.toLowerCase() === options.sheetName!.toLowerCase());
    if (found) targetSheet = found;
  } else if (options.sheetIndex !== undefined && options.sheetIndex >= 0 && options.sheetIndex < sheets.length) {
    targetSheet = sheets[options.sheetIndex];
  }

  // Extract shared strings
  const sharedStringsXml =
    extractZipFile(buffer, entries, 'xl/sharedStrings.xml') ??
    extractZipFile(buffer, entries, 'sharedStrings.xml');

  const sharedStrings = parseSharedStrings(sharedStringsXml);

  // Extract target worksheet XML
  const worksheetXml =
    extractZipFile(buffer, entries, targetSheet.fileName) ??
    extractZipFile(buffer, entries, `worksheets/${targetSheet.fileName.split('/').pop()}`) ??
    extractZipFile(buffer, entries, 'xl/worksheets/sheet1.xml');

  if (!worksheetXml) {
    throw new ExcelSecurityError(
      `Worksheet ${targetSheet.name} (${targetSheet.fileName}) not found in archive`,
      'MISSING_WORKSHEET'
    );
  }

  // Parse worksheet rows
  const maxRows = options.maxRows ?? 500_000;
  const rawRows: string[][] = [];

  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(worksheetXml)) !== null && rawRows.length < maxRows) {
    const rowBody = rowMatch[1];
    const cellMap: Map<number, string> = new Map();
    let maxColIdx = -1;

    // Match cell <c r="A1" t="s"><v>0</v></c>
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowBody)) !== null) {
      const attrs = cellMatch[1];
      const cellBody = cellMatch[2];

      const refMatch = /r="([A-Z]+)(\d+)"/.exec(attrs);
      if (!refMatch) continue;

      const colLetters = refMatch[1];
      const colIdx = colLetterToIndex(colLetters);
      if (colIdx > maxColIdx) maxColIdx = colIdx;

      const typeMatch = /t="([^"]*)"/.exec(attrs);
      const cellType = typeMatch ? typeMatch[1] : '';

      let value = '';

      if (cellType === 'inlineStr') {
        const tMatch = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(cellBody);
        value = tMatch ? decodeXmlEntities(tMatch[1]) : '';
      } else {
        const valMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cellBody);
        if (valMatch) {
          const rawVal = valMatch[1].trim();
          if (cellType === 's') {
            const strIdx = parseInt(rawVal, 10);
            value = sharedStrings[strIdx] ?? '';
          } else if (cellType === 'b') {
            value = rawVal === '1' ? 'true' : 'false';
          } else {
            value = rawVal;
          }
        }
      }

      cellMap.set(colIdx, value);
    }

    if (maxColIdx >= 0) {
      const denseRow: string[] = [];
      for (let c = 0; c <= maxColIdx; c++) {
        denseRow.push(cellMap.get(c) ?? '');
      }
      rawRows.push(denseRow);
    }
  }

  if (rawRows.length < 2) {
    throw new ExcelSecurityError('Worksheet must contain a header row and at least one data row', 'INSUFFICIENT_ROWS');
  }

  // Normalize headers
  const rawHeaders = rawRows[0];
  const headers = rawHeaders.map((h, i) => (h.trim() ? h.trim() : `column_${i + 1}`));

  if (new Set(headers).size !== headers.length) {
    throw new ExcelSecurityError('Excel worksheet headers must be unique', 'DUPLICATE_HEADERS');
  }

  const expectedCols = headers.length;
  const dataRows = rawRows.slice(1).map((r) => {
    // Pad or trim to expectedCols
    if (r.length < expectedCols) {
      return [...r, ...new Array(expectedCols - r.length).fill('')];
    }
    return r.slice(0, expectedCols);
  });

  const records = dataRows.map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] ?? '';
    });
    return obj;
  });

  return {
    sheetName: targetSheet.name,
    availableSheets: sheets.map((s) => s.name),
    headers,
    rows: dataRows,
    records,
    totalRows: dataRows.length,
    columnCount: expectedCols,
  };
}

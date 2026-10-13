import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import {
  parseDelimitedText,
  detectAutoDelimiter,
} from '../../src/core/diagnostics/tsv-parser.ts';
import {
  parseExcelWorkbook,
  listExcelSheets,
  ExcelSecurityError,
} from '../../src/core/diagnostics/excel-parser.ts';
import {
  inspectParquetHeader,
  parseParquetBuffer,
  auditBufferForUnsafeSerialization,
  SerializationSecurityError,
  ParquetFormatError,
} from '../../src/core/diagnostics/parquet-parser.ts';
import {
  auditPrimaryKey,
  validateReferentialIntegrity,
  safeRelationalLeftJoin,
} from '../../src/core/diagnostics/relational-validator.ts';
import {
  parseAnyTabularDataset,
  detectFileFormat,
  UnsupportedFormatError,
} from '../../src/core/diagnostics/format-adapters.ts';

// Helper to create in-memory minimal OpenXML .xlsx ZIP archive
function createMinimalXlsxBuffer(sheets = [{ name: 'Sheet1', rows: [['id', 'score'], ['1', '98.5'], ['2', '84.0']] }]) {
  const entries = [];

  // 1. Workbook XML
  const sheetTags = sheets
    .map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  const workbookXml = `<?xml version="1.0" encoding="UTF-8"?><workbook><sheets>${sheetTags}</sheets></workbook>`;
  entries.push({ path: 'xl/workbook.xml', content: Buffer.from(workbookXml, 'utf8') });

  // 2. Shared Strings XML
  const allStrings = [];
  const stringIndexMap = new Map();
  sheets.forEach((s) => {
    s.rows.forEach((row) => {
      row.forEach((cell) => {
        if (cell && isNaN(Number(cell))) {
          if (!stringIndexMap.has(cell)) {
            stringIndexMap.set(cell, allStrings.length);
            allStrings.push(cell);
          }
        }
      });
    });
  });

  const sstBody = allStrings.map((str) => `<si><t>${str}</t></si>`).join('');
  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8"?><sst count="${allStrings.length}" uniqueCount="${allStrings.length}">${sstBody}</sst>`;
  entries.push({ path: 'xl/sharedStrings.xml', content: Buffer.from(sharedStringsXml, 'utf8') });

  // 3. Worksheets
  sheets.forEach((s, sIdx) => {
    let sheetData = '';
    s.rows.forEach((row, rIdx) => {
      let cellsXml = '';
      row.forEach((val, cIdx) => {
        const colLetter = String.fromCharCode(65 + cIdx);
        const cellRef = `${colLetter}${rIdx + 1}`;
        if (isNaN(Number(val)) && stringIndexMap.has(val)) {
          const sIdx = stringIndexMap.get(val);
          cellsXml += `<c r="${cellRef}" t="s"><v>${sIdx}</v></c>`;
        } else {
          cellsXml += `<c r="${cellRef}"><v>${val}</v></c>`;
        }
      });
      sheetData += `<row r="${rIdx + 1}">${cellsXml}</row>`;
    });

    const wsXml = `<?xml version="1.0" encoding="UTF-8"?><worksheet><sheetData>${sheetData}</sheetData></worksheet>`;
    entries.push({ path: `xl/worksheets/sheet${sIdx + 1}.xml`, content: Buffer.from(wsXml, 'utf8') });
  });

  // Assemble uncompressed ZIP entries (method 0: stored)
  const chunks = [];
  for (const entry of entries) {
    const fileNameBuf = Buffer.from(entry.path, 'utf8');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0, 6); // flags
    header.writeUInt16LE(0, 8); // compression: 0 (stored)
    header.writeUInt16LE(0, 10); // time
    header.writeUInt16LE(0, 12); // date
    header.writeUInt32LE(0, 14); // crc32
    header.writeUInt32LE(entry.content.length, 18); // compressed
    header.writeUInt32LE(entry.content.length, 22); // uncompressed
    header.writeUInt16LE(fileNameBuf.length, 26); // filename length
    header.writeUInt16LE(0, 28); // extra field length

    chunks.push(header);
    chunks.push(fileNameBuf);
    chunks.push(entry.content);
  }

  return Buffer.concat(chunks);
}

// Helper to create minimal Parquet buffer
function createMinimalParquetBuffer(columns = ['patient_id', 'age', 'stroke_risk'], rowCount = 50) {
  const header = Buffer.from('PAR1', 'ascii');
  const footerText = `schema columns: ${columns.join(',')} num_rows: ${rowCount} created_by: WhyLab`;
  const footerBytes = Buffer.from(footerText, 'ascii');

  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(footerBytes.length, 0);

  const trailer = Buffer.from('PAR1', 'ascii');

  return Buffer.concat([header, Buffer.alloc(16), footerBytes, lenBuf, trailer]);
}

// ==========================================
// TASK-D5-01: TSV & Delimited Formats Tests
// ==========================================

test('Milestone D5: parseDelimitedText parses TSV with tabs, quotes, and CRLF', () => {
  const tsvText = [
    'patient_id\tage\tdiagnosis\tnotes',
    'p_101\t65\tstroke\t"hypertension, active"',
    'p_102\t42\thealthy\t"routine follow-up"',
    'p_103\t78\tstroke\t"past TIA; high risk"',
  ].join('\r\n');

  const result = parseDelimitedText(tsvText);

  assert.equal(result.delimiter, '\t');
  assert.equal(result.totalRows, 3);
  assert.equal(result.columnCount, 4);
  assert.deepEqual(result.headers, ['patient_id', 'age', 'diagnosis', 'notes']);
  assert.equal(result.records[0].patient_id, 'p_101');
  assert.equal(result.records[0].notes, 'hypertension, active');
});

test('Milestone D5: detectAutoDelimiter accurately differentiates commas, semicolons, and pipes', () => {
  const semiText = 'id;value;status\n1;10.5;ok\n2;20.1;pending';
  assert.equal(detectAutoDelimiter(semiText), ';');

  const pipeText = 'user_id|score|tier\nu_01|850|gold\nu_02|620|bronze';
  assert.equal(detectAutoDelimiter(pipeText), '|');

  const tsvText = 'col_a\tcol_b\n1\t2\n3\t4';
  assert.equal(detectAutoDelimiter(tsvText), '\t');

  const csvText = 'col_a,col_b\n1,2\n3,4';
  assert.equal(detectAutoDelimiter(csvText), ',');
});

test('Milestone D5: parseDelimitedText strips UTF-8 BOM and validates column counts', () => {
  const bomTsv = '\uFEFFcol_1\tcol_2\nval_1\tval_2';
  const res = parseDelimitedText(bomTsv);
  assert.equal(res.headers[0], 'col_1');

  // Uneven columns error
  assert.throws(
    () => parseDelimitedText('col_1\tcol_2\nval_1\tval_2\textra_val'),
    /column count mismatch/i
  );
});

// ==========================================
// TASK-D5-02: Safe Excel (.xlsx) Parser Tests
// ==========================================

test('Milestone D5: parseExcelWorkbook parses OpenXML sheets and shared strings', () => {
  const xlsxBuf = createMinimalXlsxBuffer([
    {
      name: 'ClinicalData',
      rows: [
        ['sample_id', 'marker_level', 'status'],
        ['s_001', '14.2', 'positive'],
        ['s_002', '3.8', 'negative'],
      ],
    },
  ]);

  const sheets = listExcelSheets(xlsxBuf);
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].name, 'ClinicalData');

  const parsed = parseExcelWorkbook(xlsxBuf);
  assert.equal(parsed.sheetName, 'ClinicalData');
  assert.equal(parsed.totalRows, 2);
  assert.deepEqual(parsed.headers, ['sample_id', 'marker_level', 'status']);
  assert.equal(parsed.records[0].sample_id, 's_001');
  assert.equal(parsed.records[0].marker_level, '14.2');
  assert.equal(parsed.records[0].status, 'positive');
});

test('Milestone D5: parseExcelWorkbook supports multi-sheet selection', () => {
  const xlsxBuf = createMinimalXlsxBuffer([
    {
      name: 'Summary',
      rows: [
        ['metric', 'value'],
        ['count', '100'],
      ],
    },
    {
      name: 'RawPatients',
      rows: [
        ['patient_id', 'age'],
        ['p_1', '45'],
        ['p_2', '62'],
      ],
    },
  ]);

  const sheets = listExcelSheets(xlsxBuf);
  assert.equal(sheets.length, 2);

  const parsedSecond = parseExcelWorkbook(xlsxBuf, { sheetName: 'RawPatients' });
  assert.equal(parsedSecond.sheetName, 'RawPatients');
  assert.equal(parsedSecond.records[0].patient_id, 'p_1');
  assert.equal(parsedSecond.records[0].age, '45');
});

test('Milestone D5: Excel parser enforces CWE-22 and CWE-409 security defenses', () => {
  // 1. Path traversal attempt in ZIP entry name
  const maliciousZipHeader = Buffer.alloc(30);
  maliciousZipHeader.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
  maliciousZipHeader.writeUInt16LE(20, 4);
  maliciousZipHeader.writeUInt16LE(0, 8);
  maliciousZipHeader.writeUInt32LE(10, 18);
  maliciousZipHeader.writeUInt32LE(10, 22);
  const badPath = Buffer.from('../../etc/passwd', 'utf8');
  maliciousZipHeader.writeUInt16LE(badPath.length, 26);
  maliciousZipHeader.writeUInt16LE(0, 28);
  const maliciousBuf = Buffer.concat([maliciousZipHeader, badPath, Buffer.alloc(10)]);

  assert.throws(
    () => parseExcelWorkbook(maliciousBuf),
    (err) => err instanceof ExcelSecurityError && err.code === 'PATH_TRAVERSAL'
  );
});

// ==========================================
// TASK-D5-03: Parquet & CWE-502 Defense Tests
// ==========================================

test('Milestone D5: auditBufferForUnsafeSerialization strictly rejects Python Pickle payloads (CWE-502)', () => {
  // Pickle protocol 2 header: \x80\x02
  const pickleProto2 = Buffer.from([0x80, 0x02, 0x63, 0x5f, 0x5f, 0x62, 0x75, 0x69, 0x6c, 0x74, 0x69, 0x6e, 0x5f, 0x5f]);
  assert.throws(
    () => auditBufferForUnsafeSerialization(pickleProto2),
    (err) => err instanceof SerializationSecurityError && err.code === 'CWE_502_PICKLE_DETECTED'
  );

  // Pickle protocol 4 header: \x80\x04
  const pickleProto4 = Buffer.from([0x80, 0x04, 0x95, 0x10, 0x00, 0x00]);
  assert.throws(
    () => auditBufferForUnsafeSerialization(pickleProto4),
    (err) => err instanceof SerializationSecurityError
  );

  // Dangerous opcode text: cos\nsystem
  const rcePayload = Buffer.from("cos\nsystem\n(S'rm -rf /'\ntR.");
  assert.throws(
    () => auditBufferForUnsafeSerialization(rcePayload),
    (err) => err instanceof SerializationSecurityError && err.code === 'CWE_502_BYTECODE_DETECTED'
  );
});

test('Milestone D5: parseParquetBuffer validates PAR1 magic and extracts schema', () => {
  const pqBuf = createMinimalParquetBuffer(['patient_id', 'glucose', 'is_diabetic'], 120);

  const headerInfo = inspectParquetHeader(pqBuf);
  assert.equal(headerInfo.isValid, true);
  assert.ok(headerInfo.footerLength > 0);

  const parsed = parseParquetBuffer(pqBuf);
  assert.equal(parsed.metadata.format, 'parquet');
  assert.equal(parsed.metadata.magic, 'PAR1');
  assert.ok(parsed.headers.length >= 3);
  assert.ok(parsed.headers.includes('patient_id') || parsed.headers.includes('glucose'));
  assert.ok(parsed.records.length > 0);
});

test('Milestone D5: parseParquetBuffer rejects non-parquet buffers', () => {
  const invalidBuf = Buffer.from('NOT_PARQUET_DATA_STREAM_XYZ');
  assert.throws(
    () => inspectParquetHeader(invalidBuf),
    (err) => err instanceof ParquetFormatError
  );
});

// ==========================================
// TASK-D5-04: Multi-Table Relational Validator
// ==========================================

test('Milestone D5: auditPrimaryKey accurately detects duplicates and null keys', () => {
  const validRows = [
    { patient_id: 'P01', age: 30 },
    { patient_id: 'P02', age: 40 },
    { patient_id: 'P03', age: 50 },
  ];
  const validAudit = auditPrimaryKey(validRows, 'patient_id');
  assert.equal(validAudit.isUnique, true);
  assert.equal(validAudit.duplicateCount, 0);

  const duplicateRows = [
    { patient_id: 'P01', age: 30 },
    { patient_id: 'P01', age: 35 },
    { patient_id: 'P02', age: 40 },
    { patient_id: null, age: 50 },
  ];
  const dupAudit = auditPrimaryKey(duplicateRows, 'patient_id');
  assert.equal(dupAudit.isUnique, false);
  assert.equal(dupAudit.duplicateCount, 1);
  assert.equal(dupAudit.nullCount, 1);
  assert.ok(dupAudit.duplicateSample.includes('P01'));
});

test('Milestone D5: validateReferentialIntegrity detects orphan records and cardinality', () => {
  const parentTable = {
    name: 'patients',
    keyColumn: 'patient_id',
    rows: [
      { patient_id: 'p_1', name: 'Alice' },
      { patient_id: 'p_2', name: 'Bob' },
    ],
  };

  const childTable = {
    name: 'outcomes',
    keyColumn: 'patient_id',
    rows: [
      { patient_id: 'p_1', test_date: '2026-01-01', result: 'pos' },
      { patient_id: 'p_1', test_date: '2026-02-01', result: 'neg' },
      { patient_id: 'p_2', test_date: '2026-01-15', result: 'pos' },
      { patient_id: 'p_999_missing', test_date: '2026-03-01', result: 'pos' }, // Orphan
    ],
  };

  const refAudit = validateReferentialIntegrity(parentTable, childTable);

  assert.equal(refAudit.matchedChildRows, 3);
  assert.equal(refAudit.orphanChildRows, 1);
  assert.equal(refAudit.matchRate, 0.75);
  assert.equal(refAudit.isFullyReferentiallyIntact, false);
  assert.ok(refAudit.orphanSample.includes('p_999_missing'));
  assert.equal(refAudit.cardinality, 'one_to_many');
});

test('Milestone D5: safeRelationalLeftJoin merges parent and child with collision protection', () => {
  const parent = {
    name: 'patients',
    keyColumn: 'id',
    rows: [
      { id: '1', score: 10, site: 'A' },
      { id: '2', score: 20, site: 'B' },
    ],
  };

  const child = {
    name: 'labs',
    keyColumn: 'id',
    rows: [
      { id: '1', score: 100, biomarker: 0.85 }, // 'score' collides with parent
      { id: '2', score: 200, biomarker: 0.12 },
    ],
  };

  const joinRes = safeRelationalLeftJoin(parent, child);

  assert.equal(joinRes.success, true);
  assert.equal(joinRes.totalRows, 2);
  // Colliding child 'score' must be prefixed as 'labs_score'
  assert.ok(joinRes.columns.includes('labs_score'));
  assert.equal(joinRes.joinedRows[0].score, 10);
  assert.equal(joinRes.joinedRows[0].labs_score, 100);
  assert.equal(joinRes.joinedRows[0].biomarker, 0.85);
});

// ==========================================
// Universal Format Adapter Integration Tests
// ==========================================

test('Milestone D5: parseAnyTabularDataset handles TSV, Excel, and Parquet transparently', () => {
  // 1. TSV
  const tsvRes = parseAnyTabularDataset('a\tb\n1\t2', 'data.tsv');
  assert.equal(tsvRes.format, 'tsv');
  assert.equal(tsvRes.records[0].a, '1');

  // 2. Excel
  const xlsxBuf = createMinimalXlsxBuffer([
    { name: 'Sheet1', rows: [['x', 'y'], ['10', '20']] },
  ]);
  const excelRes = parseAnyTabularDataset(xlsxBuf, 'data.xlsx');
  assert.equal(excelRes.format, 'xlsx');
  assert.equal(excelRes.records[0].x, '10');

  // 3. Parquet
  const pqBuf = createMinimalParquetBuffer(['feat_a', 'feat_b'], 25);
  const pqRes = parseAnyTabularDataset(pqBuf, 'data.parquet');
  assert.equal(pqRes.format, 'parquet');
  assert.ok(pqRes.totalRows > 0);

  // 4. Prohibited pickle file extension
  assert.throws(
    () => parseAnyTabularDataset(Buffer.from('test'), 'model.pkl'),
    (err) => err instanceof UnsupportedFormatError && err.code === 'PROHIBITED_SERIALIZED_FORMAT'
  );
});

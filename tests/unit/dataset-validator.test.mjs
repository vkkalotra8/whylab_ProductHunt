import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  validateDatasetContent,
  detectColumnDataType,
  parseCsvLine,
} from '../../src/server/datasets/validator.ts';

test('parseCsvLine: handles commas, quotes, and escaped quotes properly', () => {
  const line = 'id,"John ""Doc"" Doe",35,"San Francisco, CA"';
  const parsed = parseCsvLine(line);
  assert.deepEqual(parsed, ['id', 'John "Doc" Doe', '35', 'San Francisco, CA']);
});

test('detectColumnDataType: accurately infers types', () => {
  assert.equal(detectColumnDataType(['1', '2.5', '-10', '1e4']), 'numeric');
  assert.equal(detectColumnDataType(['true', 'false', 'True', '0', '1']), 'boolean');
  assert.equal(detectColumnDataType(['2026-01-01', '2026-10-10T12:00:00Z', '2025/04/15']), 'datetime');
  assert.equal(detectColumnDataType(['apple', 'banana', 'orange']), 'string');
  assert.equal(detectColumnDataType(['10', 'abc', '20']), 'string');
});

test('validateDatasetContent: processes valid CSV, computes SHA-256 and missingness', () => {
  const csv = [
    'patient_id,age,is_admitted,admission_date,diagnosis',
    'p001,45,true,2026-03-01,Melanoma',
    'p002,62,false,2026-03-02,Benign',
    'p003,,true,2026-03-05,Melanoma', // missing age
    'p004,28,,2026-03-06,null', // missing admission, null diagnosis
  ].join('\n');

  const summary = validateDatasetContent(csv, { filename: 'patients.csv' });

  assert.equal(summary.isValid, true);
  assert.equal(summary.rowCount, 4);
  assert.equal(summary.columnCount, 5);

  const expectedHash = crypto.createHash('sha256').update(Buffer.from(csv)).digest('hex');
  assert.equal(summary.sha256, expectedHash);

  // Check columns
  const ageCol = summary.columns.find((c) => c.name === 'age');
  assert.ok(ageCol);
  assert.equal(ageCol.dataType, 'numeric');
  assert.equal(ageCol.nullCount, 1);
  assert.equal(ageCol.missingRate, 0.25);

  const diagCol = summary.columns.find((c) => c.name === 'diagnosis');
  assert.ok(diagCol);
  assert.equal(diagCol.nullCount, 1); // 'null' string counted as missing
  assert.equal(diagCol.missingRate, 0.25);
});

test('validateDatasetContent: detects and sanitizes CSV formula injection', () => {
  const csv = [
    'id,formula_col,notes',
    '1,=cmd|/c calc.exe!A0,normal note',
    '2,+100+200,ok',
    '3,@SUM(1,2),ok',
  ].join('\n');

  // Without sanitization
  const unsanitized = validateDatasetContent(csv, { sanitizeFormulas: false });
  assert.equal(unsanitized.injectedCellsCount, 3);
  assert.ok(unsanitized.issues.some((i) => i.code === 'FORMULA_INJECTION'));

  // With sanitization
  const sanitized = validateDatasetContent(csv, { sanitizeFormulas: true });
  assert.equal(sanitized.injectedCellsCount, 3);
  assert.ok(sanitized.sanitizedContent);
  assert.ok(sanitized.sanitizedContent.includes("'=cmd|/c calc.exe!A0"));
  assert.ok(sanitized.sanitizedContent.includes("'+100+200"));
});

test('validateDatasetContent: rejects malicious pickle/executable headers (CWE-502)', () => {
  // Pickle protocol 3 header: \x80\x03
  const maliciousPickle = Buffer.concat([Buffer.from([0x80, 0x03]), Buffer.from('cos\nsystem\n')]);
  const result = validateDatasetContent(maliciousPickle, { filename: 'model_weights.pkl' });

  assert.equal(result.isValid, false);
  assert.ok(result.issues.some((i) => i.code === 'MALICIOUS_CONTENT'));
});

test('validateDatasetContent: rejects prohibited file extensions', () => {
  const csv = 'col1,col2\n1,2\n';
  const result = validateDatasetContent(csv, { filename: 'exploit.joblib' });

  assert.equal(result.isValid, false);
  assert.ok(result.issues.some((i) => i.code === 'FILE_TYPE_REJECTED'));
});

test('validateDatasetContent: rejects empty files', () => {
  const result = validateDatasetContent('   \n\n  ');
  assert.equal(result.isValid, false);
  assert.ok(result.issues.some((i) => i.code === 'EMPTY_FILE'));
});

test('validateDatasetContent: detects jagged rows', () => {
  const csv = [
    'col1,col2,col3',
    '1,2,3',
    '4,5', // missing column
    '7,8,9,10', // extra column
  ].join('\n');

  const result = validateDatasetContent(csv);
  assert.equal(result.isValid, true); // warning level
  assert.ok(result.issues.some((i) => i.code === 'JAGGED_ROWS'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCsvCell, sanitizeInputText, sanitizeFileName } from '../../src/server/security/sanitizer.ts';
import { SlidingWindowRateLimiter, getClientIp } from '../../src/server/security/rate-limiter.ts';
import { ingestEvaluationCsv, EVALUATION_LIMITS, EvaluationValidationError } from '../../src/core/diagnostics/evaluation-ingestion.ts';

test('security sanitizer: neutralizes spreadsheet formula injection (CWE-1236)', () => {
  // Dangerous triggers starting with =, +, -, @, \t, \r
  assert.equal(sanitizeCsvCell('=1+1'), "'=1+1");
  assert.equal(sanitizeCsvCell('+cmd|/c calc'), "'+cmd|/c calc");
  assert.equal(sanitizeCsvCell('-2+3'), "'-2+3");
  assert.equal(sanitizeCsvCell('@SUM(A1:A10)'), "'@SUM(A1:A10)");
  assert.equal(sanitizeCsvCell('\tDDE'), "'\tDDE");
  assert.equal(sanitizeCsvCell('\rDDE'), "'\rDDE");

  // Safe values remain untouched
  assert.equal(sanitizeCsvCell('melanoma'), 'melanoma');
  assert.equal(sanitizeCsvCell(0.85), '0.85');
  assert.equal(sanitizeCsvCell(true), 'true');
  assert.equal(sanitizeCsvCell(null), '');
  assert.equal(sanitizeCsvCell(undefined), '');
  assert.equal(sanitizeCsvCell(''), '');
});

test('security sanitizer: strips control characters and enforces length limits', () => {
  const dirty = 'Hello\x00\x08World\x1F!   ';
  assert.equal(sanitizeInputText(dirty), 'HelloWorld!');

  const longString = 'a'.repeat(3000);
  const sanitized = sanitizeInputText(longString, 50);
  assert.equal(sanitized.length, 50);
});

test('security sanitizer: prevents directory traversal in filenames', () => {
  assert.equal(sanitizeFileName('../../../etc/passwd'), 'passwd.csv');
  assert.equal(sanitizeFileName('..\\..\\windows\\system32\\cmd.exe'), 'cmd.exe.csv');
  assert.equal(sanitizeFileName('my dataset$#@.csv'), 'my_dataset___.csv');
  assert.equal(sanitizeFileName('valid_dataset.csv'), 'valid_dataset.csv');
});

test('security rate-limiter: enforces sliding window and token limits', () => {
  const limiter = new SlidingWindowRateLimiter({ maxRequests: 3, windowMs: 10_000 });
  const client = '192.168.1.50';

  // First 3 requests should be allowed
  const r1 = limiter.check(client);
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 2);

  const r2 = limiter.check(client);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 1);

  const r3 = limiter.check(client);
  assert.equal(r3.allowed, true);
  assert.equal(r3.remaining, 0);

  // 4th request exceeds limit
  const r4 = limiter.check(client);
  assert.equal(r4.allowed, false);
  assert.equal(r4.remaining, 0);
  assert.ok(r4.headers['Retry-After'] !== undefined);
  assert.equal(r4.headers['X-RateLimit-Remaining'], '0');

  // Reset clears bucket
  limiter.reset(client);
  const r5 = limiter.check(client);
  assert.equal(r5.allowed, true);
});

test('security rate-limiter: extracts client IP correctly from proxy headers', () => {
  const req1 = new Request('http://localhost:3000', {
    headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178' },
  });
  assert.equal(getClientIp(req1), '203.0.113.195');

  const req2 = new Request('http://localhost:3000', {
    headers: { 'x-real-ip': '198.51.100.42' },
  });
  assert.equal(getClientIp(req2), '198.51.100.42');

  const req3 = new Request('http://localhost:3000');
  assert.equal(getClientIp(req3), '127.0.0.1');
});

test('security validation: rejects CSV inputs exceeding file size limits', () => {
  // Non-csv extension rejected
  assert.throws(
    () => ingestEvaluationCsv('y_true,y_pred,y_probability\n1,1,0.9', 'dataset.json'),
    (err) => err instanceof EvaluationValidationError
  );

  // Exceeding 2MB limit rejected
  const oversizedText = 'y_true,y_pred,y_probability\n' + '0,0,0.1\n'.repeat(300_000);
  assert.ok(oversizedText.length > EVALUATION_LIMITS.bytes);

  assert.throws(
    () => ingestEvaluationCsv(oversizedText, 'huge.csv'),
    (err) => err instanceof EvaluationValidationError
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessable,
  internalError,
  errorResponse,
} from '../../src/server/api/errors.ts';

test('errors: ApiError constructs proper problem details', () => {
  const err = badRequest('Column "target" is missing', 'MISSING_COLUMN', { missing: 'target' });
  assert.strictEqual(err.status, 400);
  assert.strictEqual(err.code, 'MISSING_COLUMN');
  assert.strictEqual(err.message, 'Column "target" is missing');

  const problem = err.toProblemDetails('req_test_123', '/api/v1/datasets/validate');
  assert.strictEqual(problem.status, 400);
  assert.strictEqual(problem.code, 'MISSING_COLUMN');
  assert.strictEqual(problem.requestId, 'req_test_123');
  assert.strictEqual(problem.instance, '/api/v1/datasets/validate');
  assert.deepStrictEqual(problem.details, { missing: 'target' });
});

test('errors: factory functions return appropriate HTTP status codes', () => {
  assert.strictEqual(unauthorized().status, 401);
  assert.strictEqual(forbidden().status, 403);
  assert.strictEqual(notFound('Dataset', 'ds_123').status, 404);
  assert.strictEqual(conflict('Duplicate model version').status, 409);
  assert.strictEqual(unprocessable('Invalid probability value').status, 422);
  assert.strictEqual(internalError().status, 500);
});

test('errors: errorResponse produces RFC 7807 problem+json response', async () => {
  const err = forbidden('Viewer cannot approve repairs');
  const response = errorResponse(err, 'req_abc_999', '/api/v1/repairs/rep_1/approve');

  assert.strictEqual(response.status, 403);
  assert.strictEqual(response.headers.get('Content-Type'), 'application/problem+json');
  assert.strictEqual(response.headers.get('X-Request-Id'), 'req_abc_999');

  const body = await response.json();
  assert.strictEqual(body.status, 403);
  assert.strictEqual(body.code, 'FORBIDDEN');
  assert.strictEqual(body.detail, 'Viewer cannot approve repairs');
  assert.strictEqual(body.requestId, 'req_abc_999');
});

test('errors: errorResponse safely handles standard Error instances', async () => {
  const stdError = new Error('Unexpected filesystem failure');
  const response = errorResponse(stdError, 'req_sys_error');

  assert.strictEqual(response.status, 500);
  const body = await response.json();
  assert.strictEqual(body.status, 500);
  assert.strictEqual(body.code, 'INTERNAL_ERROR');
  assert.strictEqual(body.detail, 'Unexpected filesystem failure');
});

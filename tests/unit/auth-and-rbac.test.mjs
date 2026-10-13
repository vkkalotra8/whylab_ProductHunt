import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken, verifySessionToken, extractBearerToken } from '../../src/server/auth/session.ts';
import { hasPermission, isRoleAtLeast, assertTenantAccess } from '../../src/server/auth/rbac.ts';

test('auth: createSessionToken and verifySessionToken round-trip successfully', async () => {
  const secret = 'test-secret-key-for-unit-testing-32-chars-long!';
  const claims = {
    sub: 'usr_alice_123',
    email: 'alice@clinical-ai.org',
    name: 'Dr. Alice',
    organizationId: 'org_hospital_alpha',
    role: 'admin',
  };

  const token = await createSessionToken(claims, secret, 3600);
  assert.ok(typeof token === 'string');
  assert.strictEqual(token.split('.').length, 3);

  const verified = await verifySessionToken(token, secret);
  assert.ok(verified !== null);
  assert.strictEqual(verified.sub, 'usr_alice_123');
  assert.strictEqual(verified.email, 'alice@clinical-ai.org');
  assert.strictEqual(verified.organizationId, 'org_hospital_alpha');
  assert.strictEqual(verified.role, 'admin');
  assert.ok(verified.exp > verified.iat);
});

test('auth: verifySessionToken rejects tampered signature', async () => {
  const secret = 'test-secret-key-for-unit-testing-32-chars-long!';
  const claims = {
    sub: 'usr_bob_456',
    email: 'bob@example.com',
    name: 'Bob',
    organizationId: 'org_test',
    role: 'viewer',
  };

  const token = await createSessionToken(claims, secret, 3600);
  const parts = token.split('.');
  // Tamper with payload
  const tampered = `${parts[0]}.${parts[1]}tampered.${parts[2]}`;

  const verified = await verifySessionToken(tampered, secret);
  assert.strictEqual(verified, null);
});

test('auth: verifySessionToken rejects wrong secret', async () => {
  const secret1 = 'test-secret-key-for-unit-testing-32-chars-long!';
  const secret2 = 'different-secret-key-32-characters-minimum!';
  const claims = {
    sub: 'usr_charlie',
    email: 'charlie@test.org',
    name: 'Charlie',
    organizationId: 'org_charlie',
    role: 'editor',
  };

  const token = await createSessionToken(claims, secret1, 3600);
  const verified = await verifySessionToken(token, secret2);
  assert.strictEqual(verified, null);
});

test('auth: verifySessionToken rejects expired tokens', async () => {
  const secret = 'test-secret-key-for-unit-testing-32-chars-long!';
  const claims = {
    sub: 'usr_expired',
    email: 'exp@test.org',
    name: 'Expired User',
    organizationId: 'org_exp',
    role: 'viewer',
  };

  // 0 seconds expiration
  const token = await createSessionToken(claims, secret, -10);
  const verified = await verifySessionToken(token, secret);
  assert.strictEqual(verified, null);
});

test('auth: extractBearerToken correctly parses standard authorization header', () => {
  assert.strictEqual(extractBearerToken('Bearer token123'), 'token123');
  assert.strictEqual(extractBearerToken('bearer token456'), 'token456');
  assert.strictEqual(extractBearerToken('Basic dXNlcjpwYXNz'), null);
  assert.strictEqual(extractBearerToken(null), null);
  assert.strictEqual(extractBearerToken(undefined), null);
});

test('rbac: role hierarchy correctly checks permission levels', () => {
  assert.strictEqual(isRoleAtLeast('owner', 'owner'), true);
  assert.strictEqual(isRoleAtLeast('owner', 'admin'), true);
  assert.strictEqual(isRoleAtLeast('owner', 'editor'), true);
  assert.strictEqual(isRoleAtLeast('owner', 'viewer'), true);

  assert.strictEqual(isRoleAtLeast('admin', 'owner'), false);
  assert.strictEqual(isRoleAtLeast('admin', 'admin'), true);
  assert.strictEqual(isRoleAtLeast('admin', 'editor'), true);

  assert.strictEqual(isRoleAtLeast('editor', 'admin'), false);
  assert.strictEqual(isRoleAtLeast('editor', 'editor'), true);
  assert.strictEqual(isRoleAtLeast('editor', 'viewer'), true);

  assert.strictEqual(isRoleAtLeast('viewer', 'editor'), false);
  assert.strictEqual(isRoleAtLeast('viewer', 'viewer'), true);
});

test('rbac: hasPermission enforces role boundaries', () => {
  // Viewer can view but not create/edit
  assert.strictEqual(hasPermission('viewer', 'view_investigations'), true);
  assert.strictEqual(hasPermission('viewer', 'create_investigations'), false);
  assert.strictEqual(hasPermission('viewer', 'upload_datasets'), false);

  // Editor can create investigations and upload datasets
  assert.strictEqual(hasPermission('editor', 'view_investigations'), true);
  assert.strictEqual(hasPermission('editor', 'create_investigations'), true);
  assert.strictEqual(hasPermission('editor', 'upload_datasets'), true);
  assert.strictEqual(hasPermission('editor', 'approve_repairs'), false);

  // Admin can approve repairs and manage members
  assert.strictEqual(hasPermission('admin', 'approve_repairs'), true);
  assert.strictEqual(hasPermission('admin', 'manage_members'), true);
  assert.strictEqual(hasPermission('admin', 'manage_organization'), false);

  // Owner has all permissions
  assert.strictEqual(hasPermission('owner', 'manage_organization'), true);
});

test('rbac: assertTenantAccess enforces strict organization boundaries', () => {
  const contextAlpha = {
    user: { id: 'usr_1', email: 'u1@a.org', name: 'User 1' },
    organizationId: 'org_alpha',
    role: 'admin',
    requestId: 'req_1',
  };

  assert.strictEqual(assertTenantAccess(contextAlpha, 'org_alpha'), true);
  assert.strictEqual(assertTenantAccess(contextAlpha, 'org_beta'), false);
  assert.strictEqual(assertTenantAccess(null, 'org_alpha'), false);
});

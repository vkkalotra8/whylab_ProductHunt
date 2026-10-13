import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../src/server/auth/session.ts';
import { withAuth } from '../../src/server/auth/guard.ts';
import { GET as getProjects, POST as createProject } from '../../src/app/api/v1/projects/route.ts';
import { getAuditEvents, _resetAuditEventsForTest } from '../../src/server/audit/audit-logger.ts';

const TEST_SECRET = 'whylab-dev-insecure-secret-key-32-chars-min!';

test('tenant-isolation: withAuth rejects unauthenticated requests when auth is enforced', async () => {
  process.env.AUTH_REQUIRED = 'true';

  const protectedHandler = withAuth(async () => {
    return new Response(JSON.stringify({ secret: 'data' }), { status: 200 });
  });

  const unauthenticatedReq = new Request('http://localhost:3000/api/v1/projects', {
    method: 'GET',
    headers: {},
  });

  const res = await protectedHandler(unauthenticatedReq);
  assert.strictEqual(res.status, 401);
  const body = await res.json();
  assert.strictEqual(body.code, 'UNAUTHORIZED');

  process.env.AUTH_REQUIRED = 'false';
});

test('tenant-isolation: withAuth rejects insufficient role permissions', async () => {
  const viewerToken = await createSessionToken(
    {
      sub: 'usr_viewer_1',
      email: 'viewer@org-a.com',
      name: 'Viewer Alice',
      organizationId: 'org_a',
      role: 'viewer',
    },
    TEST_SECRET
  );

  const adminOnlyHandler = withAuth(
    async () => {
      return new Response(JSON.stringify({ status: 'admin-action-done' }), { status: 200 });
    },
    { requiredRole: 'admin' }
  );

  const req = new Request('http://localhost:3000/api/v1/settings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${viewerToken}`,
    },
  });

  const res = await adminOnlyHandler(req);
  assert.strictEqual(res.status, 403);
  const body = await res.json();
  assert.strictEqual(body.code, 'FORBIDDEN');
  assert.ok(body.detail.includes("Role 'admin' or higher required"));
});

test('tenant-isolation: withAuth blocks cross-tenant access attempts', async () => {
  const orgAToken = await createSessionToken(
    {
      sub: 'usr_org_a',
      email: 'user@org-a.com',
      name: 'User A',
      organizationId: 'org_alpha',
      role: 'admin',
    },
    TEST_SECRET
  );

  const tenantSensitiveHandler = withAuth(
    async () => {
      return new Response(JSON.stringify({ dataset: 'sensitive-phi' }), { status: 200 });
    },
    { enforceTenantOrgId: 'org_beta' } // Requires org_beta
  );

  const req = new Request('http://localhost:3000/api/v1/datasets/ds_beta', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${orgAToken}`,
    },
  });

  const res = await tenantSensitiveHandler(req);
  assert.strictEqual(res.status, 403);
  const body = await res.json();
  assert.strictEqual(body.code, 'FORBIDDEN');
  assert.ok(body.detail.includes('cross-tenant access violation'));
});

test('tenant-isolation: projects endpoint returns tenant-isolated data and records audit logs', async () => {
  _resetAuditEventsForTest();

  const orgAlphaToken = await createSessionToken(
    {
      sub: 'usr_alpha_editor',
      email: 'editor@alpha.org',
      name: 'Alpha Editor',
      organizationId: 'org_alpha_clinical',
      role: 'editor',
    },
    TEST_SECRET
  );

  // 1. Create project for org_alpha_clinical
  const createReq = new Request('http://localhost:3000/api/v1/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${orgAlphaToken}`,
    },
    body: JSON.stringify({
      name: 'Dermatology AI Trial',
      description: 'Skin lesion diagnostic evaluation',
    }),
  });

  const createRes = await createProject(createReq);
  assert.strictEqual(createRes.status, 201);
  const createBody = await createRes.json();
  assert.strictEqual(createBody.project.name, 'Dermatology AI Trial');
  assert.strictEqual(createBody.project.organizationId, 'org_alpha_clinical');

  // 2. Verify audit event was recorded
  const auditLogs = await getAuditEvents('org_alpha_clinical');
  assert.strictEqual(auditLogs.total, 1);
  assert.strictEqual(auditLogs.events[0].action, 'PROJECT_CREATED');
  assert.strictEqual(auditLogs.events[0].actorId, 'usr_alpha_editor');

  // 3. User from org_beta queries projects and must NOT see org_alpha's project
  const orgBetaToken = await createSessionToken(
    {
      sub: 'usr_beta_user',
      email: 'user@beta.org',
      name: 'Beta User',
      organizationId: 'org_beta_hospital',
      role: 'viewer',
    },
    TEST_SECRET
  );

  const betaListReq = new Request('http://localhost:3000/api/v1/projects', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${orgBetaToken}`,
    },
  });

  const betaListRes = await getProjects(betaListReq);
  assert.strictEqual(betaListRes.status, 200);
  const betaListBody = await betaListRes.json();
  assert.strictEqual(betaListBody.organizationId, 'org_beta_hospital');
  // Must not contain Dermatology AI Trial from Alpha
  const foundAlphaProject = betaListBody.projects.some((p) => p.name === 'Dermatology AI Trial');
  assert.strictEqual(foundAlphaProject, false);
});

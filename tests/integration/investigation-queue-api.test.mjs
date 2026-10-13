import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../src/server/auth/session.ts';
import { POST as submitJob, GET as listJobs } from '../../src/app/api/v1/investigations/jobs/route.ts';
import { GET as getJob } from '../../src/app/api/v1/investigations/jobs/[id]/route.ts';
import { POST as cancelJob } from '../../src/app/api/v1/investigations/jobs/[id]/cancel/route.ts';
import { GET as streamEvents } from '../../src/app/api/v1/investigations/[id]/events/route.ts';
import { getInvestigationQueue } from '../../src/server/queue/investigation-queue.ts';
import { getEventHub } from '../../src/server/queue/event-hub.ts';
import { getInvestigationWorker } from '../../src/server/worker/investigation-worker.ts';
import { getAuditEvents, _resetAuditEventsForTest } from '../../src/server/audit/audit-logger.ts';

const TEST_SECRET = 'whylab-dev-insecure-secret-key-32-chars-min!';

test('Investigation Queue & Telemetry API: asynchronous job submission, SSE streaming, reconnection, and cancellation', async () => {
  _resetAuditEventsForTest();
  getInvestigationQueue().resetForTesting();
  getEventHub().resetForTesting();

  const orgId = 'org_oncology_clinic';
  const projectId = 'proj_research_lab';

  const editorToken = await createSessionToken(
    {
      sub: 'usr_editor_2',
      email: 'dr.curie@oncology.org',
      name: 'Dr. Curie',
      organizationId: orgId,
      role: 'editor',
    },
    TEST_SECRET
  );

  const viewerToken = await createSessionToken(
    {
      sub: 'usr_viewer_2',
      email: 'nurse.joy@oncology.org',
      name: 'Nurse Joy',
      organizationId: orgId,
      role: 'viewer',
    },
    TEST_SECRET
  );

  // 1. Viewer cannot submit job (403 Forbidden)
  const viewerReq = new Request('http://localhost:3000/api/v1/investigations/jobs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${viewerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId,
      fixtureName: 'melanoma-synthetic.csv',
    }),
  });

  const viewerRes = await submitJob(viewerReq);
  assert.equal(viewerRes.status, 403);
  const viewerErr = await viewerRes.json();
  assert.equal(viewerErr.code, 'FORBIDDEN');

  // 2. Editor submits job -> 202 Accepted
  const editorReq = new Request('http://localhost:3000/api/v1/investigations/jobs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${editorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId,
      fixtureName: 'melanoma-synthetic.csv',
      objective: 'Evaluate melanoma classification sensitivity drop',
      offlineOnly: true,
    }),
  });

  const editorRes = await submitJob(editorReq);
  assert.equal(editorRes.status, 202);
  const jobPayload = await editorRes.json();

  assert.ok(jobPayload.jobId.startsWith('job_'));
  assert.ok(jobPayload.investigationId);
  assert.equal(jobPayload.status, 'queued');
  assert.ok(jobPayload.eventsUrl.includes('/events'));

  // 3. Verify audit event recorded for job submission
  const { events } = await getAuditEvents(orgId);
  const queuedAudit = events.find((e) => e.action === 'INVESTIGATION_JOB_QUEUED');
  assert.ok(queuedAudit);
  assert.equal(queuedAudit.objectId, jobPayload.jobId);

  // 4. Inspect job status via GET /api/v1/investigations/jobs/[id]
  const inspectReq = new Request(`http://localhost:3000/api/v1/investigations/jobs/${jobPayload.jobId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${viewerToken}`,
    },
  });

  const inspectRes = await getJob(inspectReq, {
    params: Promise.resolve({ id: jobPayload.jobId }),
  });
  assert.equal(inspectRes.status, 200);
  const { job } = await inspectRes.json();
  assert.equal(job.id, jobPayload.jobId);
  assert.equal(job.data.organizationId, orgId);

  // 5. List jobs for project
  const listReq = new Request(`http://localhost:3000/api/v1/investigations/jobs?projectId=${projectId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${viewerToken}`,
    },
  });

  const listRes = await listJobs(listReq);
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.count, 1);
  assert.equal(listData.jobs[0].id, jobPayload.jobId);

  // 6. Test Reconnectable SSE Stream with Last-Event-ID
  // Seed events into event hub to simulate active worker telemetry
  const eventHub = getEventHub();
  eventHub.publish(jobPayload.investigationId, {
    type: 'started',
    investigationId: jobPayload.investigationId,
    objective: 'Melanoma check',
  });
  eventHub.publish(jobPayload.investigationId, {
    type: 'progress',
    round: 1,
    maxRounds: 5,
    stage: 'profile',
    message: 'Profiling data',
  });
  eventHub.publish(jobPayload.investigationId, {
    type: 'progress',
    round: 2,
    maxRounds: 5,
    stage: 'classification',
    message: 'Evaluating baseline metrics',
  });

  // Client connects with Last-Event-ID = 1 (should catch up events 2 and 3)
  const sseReq = new Request(
    `http://localhost:3000/api/v1/investigations/${jobPayload.investigationId}/events`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        'Last-Event-ID': '1',
      },
    }
  );

  const sseRes = await streamEvents(sseReq, {
    params: Promise.resolve({ id: jobPayload.investigationId }),
  });

  assert.equal(sseRes.status, 200);
  assert.ok(sseRes.headers.get('content-type')?.includes('text/event-stream'));

  // Read response chunks (events 2 and 3)
  const reader = sseRes.body?.getReader();
  assert.ok(reader);

  let text = '';
  for (let i = 0; i < 2; i++) {
    const { value, done } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
  }

  assert.ok(text.includes('id: 2'));
  assert.ok(text.includes('id: 3'));
  assert.ok(!text.includes('id: 1\n')); // Event 1 was skipped because client already had it

  await reader.cancel();

  // 7. Attempting to cancel already completed job returns 400 Bad Request
  const cancelCompletedReq = new Request(
    `http://localhost:3000/api/v1/investigations/jobs/${jobPayload.jobId}/cancel`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${editorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Operator requested abort' }),
    }
  );

  const cancelCompletedRes = await cancelJob(cancelCompletedReq, {
    params: Promise.resolve({ id: jobPayload.jobId }),
  });
  assert.equal(cancelCompletedRes.status, 400);

  // 8. Submit fresh job and cancel it while queued
  const cancelTargetReq = new Request('http://localhost:3000/api/v1/investigations/jobs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${editorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId,
      fixtureName: 'melanoma-synthetic.csv',
      objective: 'Job to be aborted',
      offlineOnly: true,
      autoStart: false,
    }),
  });
  const cancelTargetRes = await submitJob(cancelTargetReq);
  const cancelTargetData = await cancelTargetRes.json();

  const cancelActiveReq = new Request(
    `http://localhost:3000/api/v1/investigations/jobs/${cancelTargetData.jobId}/cancel`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${editorToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Operator requested abort' }),
    }
  );

  const cancelActiveRes = await cancelJob(cancelActiveReq, {
    params: Promise.resolve({ id: cancelTargetData.jobId }),
  });
  assert.equal(cancelActiveRes.status, 200);
  const cancelData = await cancelActiveRes.json();
  assert.equal(cancelData.ok, true);
  assert.equal(cancelData.status, 'cancelled');

  const { events: eventsAfterCancel } = await getAuditEvents(orgId);
  const cancelAudit = eventsAfterCancel.find((e) => e.action === 'INVESTIGATION_JOB_CANCELLED');
  assert.ok(cancelAudit);
});

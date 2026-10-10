# WhyLab 2.0 — Prioritized Production Implementation Backlog

**Document Version:** 1.0.0 (M0 Baseline)  
**Date:** October 10, 2026  
**Status:** Approved Master Backlog for Milestones M0–M7  

---

## Backlog Overview by Milestone

```
M0: Repository Audit & Architecture Decisions   [COMPLETED]
M1: Production Foundation (Auth, Tenancy, DB)   [NEXT - READY]
M2: Production Ingestion & Object Storage       [PENDING]
M3: Diagnostic Correctness & Holdout Guards     [PENDING]
M4: Durable Astra Worker & Redis Streaming      [PENDING]
M5: Evidence Graph & Repair Approval            [PENDING]
M6: Monitoring Engine & Drift Alerting          [PENDING]
M7: Hardening, E2E Testing & Pilot Launch       [PENDING]
```

---

## Milestone M0: Repository Audit & Architecture (Completed)

### Task M0-01: Comprehensive Repository Inventory & Baseline Audit
- **Unique Task ID:** `TASK-M0-01`
- **Priority:** Critical (P0)
- **Current Status:** **COMPLETED**
- **Objective:** Verify live repository capabilities, dependencies, baseline test passes, and type safety.
- **Implementation Instructions:**
  - Execute `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
  - Record exact test counts, compilation times, and exit codes.
  - Audit existing diagnostic tools and Next.js routes.
- **Relevant Paths:** `src/core/`, `src/app/`, `package.json`, `tests/`
- **Dependencies:** None.
- **Acceptance Criteria:**
  - All tests documented with exact outputs.
  - Zero unverified assumptions about repository capabilities.
- **Test Requirements:** All 112 existing unit/integration tests must pass.
- **Completion Evidence:** 112/112 tests pass, `npm run typecheck` passes with 0 errors, production build succeeds.

---

## Milestone M1: Production Foundation (Tenancy, Auth, Database)

### Task M1-01: Authentication & Multi-Tenant RBAC Middleware
- **Unique Task ID:** `TASK-M1-01`
- **Priority:** Critical (P0)
- **Current Status:** **PENDING**
- **Objective:** Establish organization tenant boundaries and user role-based access control.
- **Implementation Instructions:**
  - Implement session validation supporting standard JWT / OIDC claims.
  - Add `src/server/auth/rbac.ts` defining roles: `owner`, `admin`, `editor`, `viewer`.
  - Add Next.js middleware extracting tenant context and enforcing route-level permissions.
- **Relevant Paths:** `src/middleware.ts`, `src/server/auth/`
- **Dependencies:** Task M0-01.
- **Acceptance Criteria:**
  - Unauthenticated requests to protected endpoints return HTTP 401.
  - Users with `viewer` role cannot mutate investigation or dataset records (HTTP 403).
  - Cross-tenant ID access is strictly rejected.
- **Test Requirements:** Automated unit and integration tests verifying permission denial paths.
- **Completion Evidence:** Test suite passing tenant isolation test cases.

### Task M1-02: PostgreSQL Relational Schema & Migration Engine
- **Unique Task ID:** `TASK-M1-02`
- **Priority:** Critical (P0)
- **Current Status:** **PENDING**
- **Objective:** Define and migrate relational data models for organizations, projects, models, and investigations.
- **Implementation Instructions:**
  - Create schema definition using Drizzle / Prisma or raw SQL migrations.
  - Tables: `organizations`, `memberships`, `projects`, `models`, `model_versions`, `datasets`, `dataset_versions`, `investigations`, `evidence`, `audit_events`.
  - Apply foreign keys with cascade constraints and tenant indexes.
- **Relevant Paths:** `src/server/db/schema.ts`, `src/server/db/migrations/`
- **Dependencies:** Task M1-01.
- **Acceptance Criteria:**
  - Migrations execute cleanly on a fresh PostgreSQL instance.
  - Schema enforces foreign keys and unique constraints.
- **Test Requirements:** Migration rollback and schema validation integration tests.
- **Completion Evidence:** Migration scripts tested against live test database.

### Task M1-03: Pluggable Store Repository with PostgreSQL Adapter
- **Unique Task ID:** `TASK-M1-03`
- **Priority:** High (P1)
- **Current Status:** **PENDING**
- **Objective:** Extend `src/core/investigation/store.ts` to seamlessly switch between local filesystem and PostgreSQL.
- **Implementation Instructions:**
  - Define `InvestigationRepository` interface with `save`, `get`, `list`, `delete`.
  - Maintain `FileInvestigationRepository` for standalone developer mode.
  - Implement `PostgresInvestigationRepository` for cloud production mode.
  - Dynamically select adapter based on `DATABASE_URL` presence.
- **Relevant Paths:** `src/core/investigation/store.ts`, `src/server/db/repositories/`
- **Dependencies:** Task M1-02.
- **Acceptance Criteria:**
  - Standalone mode continues passing all 112 existing tests with zero database requirements.
  - Production mode writes structured rows to PostgreSQL.
- **Test Requirements:** Unit tests for both repository adapters.
- **Completion Evidence:** Zero regressions in existing test suite.

---

## Milestone M2: Production Dataset Ingestion & Object Storage

### Task M2-01: Private S3-Compatible Storage Client & Presigned URLs
- **Unique Task ID:** `TASK-M2-01`
- **Priority:** High (P1)
- **Current Status:** **PENDING**
- **Objective:** Enable direct, secure uploads of large datasets to private object storage.
- **Implementation Instructions:**
  - Add S3 storage adapter supporting AWS S3 and MinIO (`src/server/storage/s3-client.ts`).
  - Add `POST /api/v1/datasets/uploads` generating short-lived presigned PUT URLs.
  - Enforce tenant-scoped prefixes: `org_{id}/proj_{id}/datasets/{versionId}.csv`.
- **Relevant Paths:** `src/server/storage/`, `src/app/api/v1/datasets/uploads/`
- **Dependencies:** Task M1-03.
- **Acceptance Criteria:**
  - Upload URLs expire after 15 minutes.
  - Files are stored with server-side encryption enabled.
- **Test Requirements:** Mock S3 client upload and URL generation tests.
- **Completion Evidence:** Direct file upload verified with MinIO / S3 test suite.

### Task M2-02: Dataset Registry & Cryptographic Content Hashing
- **Unique Task ID:** `TASK-M2-02`
- **Priority:** High (P1)
- **Current Status:** **PENDING**
- **Objective:** Track immutable dataset versions with SHA-256 integrity hashes.
- **Implementation Instructions:**
  - Compute SHA-256 digest upon upload completion.
  - Register immutable record in `dataset_versions` table.
  - Prevent duplicate identical file uploads within the same project.
- **Relevant Paths:** `src/core/diagnostics/evaluation-ingestion.ts`, `src/server/db/`
- **Dependencies:** Task M2-01.
- **Acceptance Criteria:**
  - Every dataset version displays verified SHA-256 checksum.
  - Raw files are strictly immutable.
- **Test Requirements:** Hash verification and deduplication unit tests.
- **Completion Evidence:** Verified SHA-256 match between client upload and stored digest.

---

## Milestone M3: Diagnostic Correctness & Holdout Safeguards

### Task M3-01: Scientific Holdout Partitioning & Leakage Warnings
- **Unique Task ID:** `TASK-M3-01`
- **Priority:** High (P1)
- **Current Status:** **PENDING**
- **Objective:** Prevent test-set leakage during threshold optimization in the Repair Lab.
- **Implementation Instructions:**
  - Update `reEvaluateRepair` to evaluate threshold optimization on Validation set and generalization on Holdout set.
  - In single-dataset mode, display prominent educational disclaimer in UI and PDF report.
- **Relevant Paths:** `src/core/diagnostics/repair-reevaluation.ts`, `src/ui/components/repair/before-after-table.tsx`
- **Dependencies:** Task M0-01.
- **Acceptance Criteria:**
  - Single-dataset mode clearly labels results as "Optimization Cohort (Not Holdout)".
  - Multi-dataset mode reports separate Validation and Holdout metrics.
- **Test Requirements:** Repair evaluation test asserting disclaimer presence.
- **Completion Evidence:** Automated test confirming holdout separation.

### Task M3-02: Reference Statistical Metric Tests
- **Unique Task ID:** `TASK-M3-02`
- **Priority:** Medium (P2)
- **Current Status:** **PENDING**
- **Objective:** Validate pure TypeScript diagnostic math against known reference statistics.
- **Implementation Instructions:**
  - Add test suite comparing TypeScript calculations against verified SciPy / Scikit-Learn golden tables for KS-test, PSI, ROC-AUC, and Brier score.
- **Relevant Paths:** `tests/unit/reference-comparison.test.mjs`
- **Dependencies:** Task M0-01.
- **Acceptance Criteria:**
  - Calculated values match reference standards within $\pm 10^{-5}$ tolerance.
- **Test Requirements:** Golden mathematical test suite.
- **Completion Evidence:** Automated test report with zero mathematical discrepancies.

---

## Milestone M4: Durable Astra Worker & Redis Streaming

### Task M4-01: Redis BullMQ Asynchronous Investigation Worker
- **Unique Task ID:** `TASK-M4-01`
- **Priority:** High (P1)
- **Current Status:** **PENDING**
- **Objective:** Decouple long-running investigations from synchronous HTTP request handlers.
- **Implementation Instructions:**
  - Add BullMQ worker processing `run_investigation` jobs.
  - Persist investigation lifecycle states: `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`.
  - Handle graceful shutdown and automatic retries.
- **Relevant Paths:** `src/server/worker/`, `src/server/queue/`
- **Dependencies:** Task M1-03, Task M2-02.
- **Acceptance Criteria:**
  - HTTP POST returns immediately with `202 Accepted` and job ID.
  - Worker failure triggers bounded retry without corrupting investigation state.
- **Test Requirements:** Worker lifecycle and failure recovery tests.
- **Completion Evidence:** Asynchronous worker processing verified under simulated timeout.

### Task M4-02: Reconnectable SSE Progress Stream
- **Unique Task ID:** `TASK-M4-02`
- **Priority:** High (P1)
- **Current Status:** **PENDING**
- **Objective:** Enable clients to resume live telemetry streaming across browser refreshes.
- **Implementation Instructions:**
  - Publish Astra NDJSON events to Redis Pub/Sub channel.
  - Add `GET /api/v1/investigations/{id}/events` SSE route supporting `Last-Event-ID`.
- **Relevant Paths:** `src/app/api/v1/investigations/[id]/events/route.ts`
- **Dependencies:** Task M4-01.
- **Acceptance Criteria:**
  - Refreshing the browser during an investigation reconnects seamlessly to the live log stream.
- **Test Requirements:** SSE reconnection integration test.
- **Completion Evidence:** Verified uninterrupted telemetry during browser disconnect test.

---

## Milestone M5: Evidence Graph & Repair Approval

### Task M5-01: Explicit Repair Policy Human Approval Workflow
- **Unique Task ID:** `TASK-M5-01`
- **Priority:** High (P1)
- **Current Status:** **PENDING**
- **Objective:** Enforce human review and audit trails before deploying or exporting decision policies.
- **Implementation Instructions:**
  - Add `POST /api/v1/repairs/{id}/approve` endpoint requiring human comment and expected version.
  - Prohibit automatic model deployment.
  - Record approval event in `audit_events` table.
- **Relevant Paths:** `src/server/repair/`, `src/ui/components/repair/policy-exporter.tsx`
- **Dependencies:** Task M1-01, Task M3-01.
- **Acceptance Criteria:**
  - Policy export records user ID, timestamp, and rationale.
  - Zero automated deployment triggers.
- **Test Requirements:** Approval workflow integration test.
- **Completion Evidence:** Audit event recorded upon policy approval.

---

## Milestone M6: Monitoring Engine & Drift Alerting

### Task M6-01: Scheduled Batch Drift & Quality Monitors
- **Unique Task ID:** `TASK-M6-01`
- **Priority:** Medium (P2)
- **Current Status:** **PENDING**
- **Objective:** Periodically evaluate incoming production batches against reference baselines.
- **Implementation Instructions:**
  - Implement recurring cron worker evaluating active Monitor Rules.
  - Evaluate KS drift, PSI, missingness rate, and delayed-label performance.
- **Relevant Paths:** `src/server/monitoring/`
- **Dependencies:** Task M4-01.
- **Acceptance Criteria:**
  - Monitors evaluate on scheduled intervals.
  - Failures generate alerts without false alarm storms.
- **Test Requirements:** Scheduled monitor execution test.
- **Completion Evidence:** Automated drift detection test on multi-site benchmark.

---

## Milestone M7: Hardening, E2E Testing & Pilot Launch

### Task M7-01: Comprehensive Security Hardening & Penetration Verification
- **Unique Task ID:** `TASK-M7-01`
- **Priority:** Critical (P0)
- **Current Status:** **PENDING**
- **Objective:** Eliminate security vulnerabilities across all public API routes and upload handlers.
- **Implementation Instructions:**
  - Validate against OWASP Top 10: Path traversal, CSV formula injection, CSRF, IDOR, and SSRF.
  - Conduct automated penetration tests on all API routes.
- **Relevant Paths:** `tests/security/`
- **Dependencies:** Milestones M1–M6.
- **Acceptance Criteria:**
  - Zero critical or high security vulnerabilities.
- **Test Requirements:** Security test suite passing 100%.
- **Completion Evidence:** Security audit report and automated penetration test log.

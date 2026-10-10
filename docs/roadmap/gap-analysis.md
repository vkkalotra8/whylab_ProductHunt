# WhyLab 2.0 — Evidence-Based Production Gap Analysis

**Document Version:** 1.0.0 (M0 Baseline)  
**Date:** October 10, 2026  
**Auditor:** Principal Machine Learning Engineer & Security Architect  
**Classification Standard:** Verified Against Live Workspace Code and Document B Blueprint  

---

## Gap Analysis Matrix Summary

| Requirement Area | Classification | Existing File References | Production Gap / Risk |
| :--- | :---: | :--- | :--- |
| **1. Diagnostic Math Engine** | **IMPLEMENTED** | `src/core/diagnostics/*.ts` | 10 pure TypeScript tools verified; 112 unit tests pass. |
| **2. Astra Orchestrator Loop** | **IMPLEMENTED** | `src/server/orchestrator/investigator.ts` | Multi-turn streaming loop functional with offline & OpenAI modes. |
| **3. Repair Lab & Thresholds** | **IMPLEMENTED** | `src/core/diagnostics/threshold-sweep.ts` | 101 sweep points & cost matrix verified on identical rows. |
| **4. Vector PDF Export** | **IMPLEMENTED** | `src/server/export/pdf-generator.ts` | Pure TS PDF 1.4 engine with pagination & cryptographic seals. |
| **5. Six-Stage Studio UI** | **IMPLEMENTED** | `src/app/investigate/page.tsx` | Ingest → Profile → Investigate → Verify → Repair → Report. |
| **6. Multi-Artifact Ingestion** | **IMPLEMENTED** | `src/core/diagnostics/multi-artifact-ingestion.ts` | CSV/TSV/JSON/LOG parsing and schema relationship validation. |
| **7. Multi-Tenancy & RBAC** | **MISSING** | None (Single flat namespace) | Needs Organization/Project hierarchy, roles (Admin/Editor/Viewer). |
| **8. Relational Metadata Store** | **MISSING** | `src/core/investigation/store.ts` (JSON/disk) | Needs PostgreSQL schema, migrations, indexed queries. |
| **9. Private Object Storage** | **MISSING** | Local `.whylab/` disk folder | Needs S3-compatible private buckets & signed upload URLs. |
| **10. Asynchronous Worker Queue** | **MISSING** | Next.js API in-process execution | Needs Redis / BullMQ worker for long-running jobs. |
| **11. Continuous Batch Monitors** | **MISSING** | None | Needs scheduled monitor rules, alert deduplication, cooldowns. |
| **12. Holdout Leakage Guard** | **PARTIAL** | `src/core/diagnostics/repair-candidates.ts` | Needs explicit validation/test split separation warnings. |

---

## Detailed Requirement Analysis

### Item 1: Multi-Tenant Organizations & Role-Based Access Control (RBAC)
- **Status:** **MISSING**
- **Existing Files:** None (`src/core/investigation/store.ts` uses an unauthenticated local directory).
- **Evidence:** Inspection of `src/app/api/` reveals zero authentication middleware or user session validation. All investigations share a flat local namespace.
- **Existing Behavior:** Anyone accessing the server has unrestricted access to all saved investigations.
- **Production Requirement:** Organizations as tenant boundaries, project workspaces, user memberships with roles (`owner`, `admin`, `editor`, `viewer`), OIDC session validation.
- **Required Changes:**
  - Introduce Next.js authentication middleware.
  - Implement tenant context extraction from sessions.
  - Scope all investigation and dataset operations to `organization_id` and `project_id`.
- **Files to Create / Modify:**
  - `src/server/auth/session.ts`
  - `src/server/auth/rbac.ts`
  - `src/middleware.ts`
- **Dependencies:** OIDC provider / JWT verification libraries.
- **Security Considerations:** CWE-639 (Insecure Direct Object Reference) prevention; cross-tenant data leaks.
- **Tests Required:** Tenant boundary tests (User A cannot read/mutate User B's projects or datasets).
- **Acceptance Criteria:** Unauthenticated requests return 401; unauthorized tenant access returns 403.
- **Priority:** Critical (P0) — Milestone M1.
- **Complexity:** High.

---

### Item 2: Relational Metadata Storage (PostgreSQL & Migrations)
- **Status:** **MISSING**
- **Existing Files:** `src/core/investigation/store.ts`.
- **Evidence:** `store.ts` reads and writes raw JSON files under `.whylab/investigations/`.
- **Existing Behavior:** JSON files on local disk; no ACID transactions, foreign keys, or relational query capabilities.
- **Production Requirement:** PostgreSQL database storing organizations, projects, models, model versions, datasets, dataset versions, investigations, evidence items, and audit logs.
- **Required Changes:**
  - Introduce database client and migration tool (e.g., Prisma or Drizzle ORM).
  - Create migration scripts for relational entities.
  - Implement pluggable repository interface in `src/core/investigation/store.ts` switching between local disk and PostgreSQL.
- **Files to Create / Modify:**
  - `src/server/db/schema.ts`
  - `src/server/db/client.ts`
  - `src/core/investigation/store.ts`
- **Dependencies:** PostgreSQL driver (`pg`), migration engine.
- **Security Considerations:** SQL injection prevention; encryption at rest.
- **Tests Required:** Migration forward/rollback tests, repository CRUD tests.
- **Acceptance Criteria:** Database migrations apply cleanly; relational entities maintain foreign key constraints.
- **Priority:** Critical (P0) — Milestone M1.
- **Complexity:** High.

---

### Item 3: Private S3-Compatible Object Storage & Signed Uploads
- **Status:** **MISSING**
- **Existing Files:** `src/ui/components/ingest/csv-dropzone.tsx`, `src/app/api/investigate/route.ts`.
- **Evidence:** Uploaded CSV files are currently sent directly inside HTTP JSON payloads (`payload.csvContent`) and saved locally.
- **Existing Behavior:** Browser sends raw CSV text to Next.js server; limited to 2MB in-memory payloads.
- **Production Requirement:** Direct-to-storage signed uploads via pre-authenticated URLs (AWS S3 / MinIO), streaming server validation, content immutability, SHA-256 verification.
- **Required Changes:**
  - Add `POST /api/v1/datasets/uploads` endpoint issuing short-lived presigned PUT URLs.
  - Add upload completion notification triggering background validation.
  - Enforce per-tenant storage prefixes (`s3://bucket/org_{id}/...`).
- **Files to Create / Modify:**
  - `src/server/storage/s3-client.ts`
  - `src/app/api/v1/datasets/uploads/route.ts`
  - `src/ui/components/ingest/multi-artifact-dropzone.tsx`
- **Dependencies:** S3 SDK (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`).
- **Security Considerations:** Prevent public bucket leaks; validate Content-Type and file size headers.
- **Tests Required:** Signed URL generation test, S3 put/get test, quota enforcement test.
- **Acceptance Criteria:** Client uploads large files directly to private object storage without hitting web server memory limits.
- **Priority:** High (P1) — Milestone M2.
- **Complexity:** Medium.

---

### Item 4: Asynchronous Worker Queue (BullMQ / Redis)
- **Status:** **MISSING**
- **Existing Files:** `src/app/api/investigate/route.ts`, `src/server/orchestrator/investigator.ts`.
- **Evidence:** In `src/app/api/investigate/route.ts`, `runAutonomousInvestigation` is spawned directly inside the HTTP request handler and streams NDJSON over the open connection.
- **Existing Behavior:** If the client disconnects or an intermediate proxy closes the HTTP stream after 60–100 seconds, the investigation is aborted.
- **Production Requirement:** Decoupled background worker executing long investigations asynchronously; Redis-backed queue with retries, job states (`queued`, `running`, `completed`, `failed`), and reconnectable progress SSE streams.
- **Required Changes:**
  - Introduce Redis and BullMQ job processor.
  - Move `runAutonomousInvestigation` execution into background worker.
  - Store progress events in Redis Pub/Sub; SSE endpoint subscribes to Redis channel.
- **Files to Create / Modify:**
  - `src/server/queue/investigation-queue.ts`
  - `src/server/worker/investigation-worker.ts`
  - `src/app/api/v1/investigations/[id]/events/route.ts`
- **Dependencies:** Redis (`ioredis`), BullMQ.
- **Security Considerations:** Protect Redis port; prevent job payload tampering.
- **Tests Required:** Worker execution test, job retry test, reconnection test with `Last-Event-ID`.
- **Acceptance Criteria:** Investigations continue executing even if browser tab closes; reconnecting restores live stream.
- **Priority:** High (P1) — Milestone M4.
- **Complexity:** High.

---

### Item 5: Continuous Batch Monitoring & Drift Alerts
- **Status:** **MISSING**
- **Existing Files:** None (`src/core/diagnostics/drift-tests.ts` provides the math, but no scheduled cron system exists).
- **Evidence:** All drift and disparity tools currently run only on static snapshots during manual investigations.
- **Existing Behavior:** User must manually open the studio and upload a dataset to detect drift.
- **Production Requirement:** Scheduled cron evaluation of incoming inference batches against reference baselines; alert deduplication; threshold violation notifications.
- **Required Changes:**
  - Create Monitor Rule entity (`metric`, `threshold`, `window`, `reference_dataset_id`).
  - Create recurring scheduler checking new batches.
  - Implement alert lifecycle (`OPEN`, `ACKNOWLEDGED`, `RESOLVED`).
- **Files to Create / Modify:**
  - `src/server/monitoring/scheduler.ts`
  - `src/server/monitoring/alert-engine.ts`
  - `src/app/monitoring/page.tsx`
- **Dependencies:** Redis / Cron scheduler.
- **Security Considerations:** Alert spam suppression; sensitive data redaction in notification payloads.
- **Tests Required:** Monitor trigger test, alert deduplication test, status transition test.
- **Acceptance Criteria:** Sustained statistical drift triggers exactly one alert; resolved alerts do not re-fire without fresh drift.
- **Priority:** Medium (P2) — Milestone M6.
- **Complexity:** Medium.

---

### Item 6: Scientific Holdout Validation Safeguards
- **Status:** **PARTIALLY IMPLEMENTED**
- **Existing Files:** `src/core/diagnostics/repair-candidates.ts`, `src/core/diagnostics/repair-reevaluation.ts`, `src/ui/components/repair/repair-workbench.tsx`.
- **Evidence:** The Repair Lab accurately re-evaluates thresholds on identical rows, but when users upload a single dataset, the threshold is optimized and reported on the same cohort.
- **Existing Behavior:** UI computes cost-optimal threshold and displays before/after metrics without warning the user if separate holdout data is missing.
- **Production Requirement:** Strict scientific distinction between threshold discovery (validation set) and generalization evaluation (independent holdout set). Prominent UI and PDF warnings when only a single set is available.
- **Required Changes:**
  - Update `reEvaluateRepair` to accept optional `holdoutDataset`.
  - Add explicit "Holdout Generalization" vs "Optimization Training" badges in `repair-workbench.tsx` and PDF export.
- **Files to Modify:**
  - `src/core/diagnostics/repair-reevaluation.ts`
  - `src/ui/components/repair/repair-workbench.tsx`
  - `src/server/export/pdf-generator.ts`
- **Dependencies:** None (Pure TypeScript).
- **Security Considerations:** Scientific integrity and compliance audit readiness.
- **Tests Required:** Holdout evaluation test, single-dataset disclaimer test.
- **Acceptance Criteria:** Clear disclaimer rendered whenever validation and evaluation cohorts are identical.
- **Priority:** High (P1) — Milestone M3/M5.
- **Complexity:** Low.

# WhyLab 2.0 — Target Production Architecture

**Document Version:** 1.0.0 (M0 Baseline)  
**Date:** October 10, 2026  
**Status:** Approved Target Blueprint for Milestones M1–M7  

---

## 1. Architectural Vision & Guiding Philosophy

The target production architecture transforms WhyLab 2.0 from a single-node local developer application into an enterprise-ready, multi-tenant SaaS platform. 

### 1.1 Non-Negotiable Architectural Commitments
1. **Preserve the Pure TypeScript Diagnostic Engine:** Never replace working deterministic TypeScript math with Python solely for aesthetic parity. Keep statistical calculations running in pure, verifiable code.
2. **Incremental Modular Monolith First:** Avoid distributed microservice sprawl. Next.js App Router serves as both the Web Presentation tier and Backend-For-Frontend (BFF), delegating heavy asynchronous workloads to an isolated background worker.
3. **Strict Separation of Diagnostic Concerns:**
   - Web frontend: UX, file selection, typed API calls, real-time telemetry rendering.
   - API / BFF: Authorization, schema validation, signed URL generation, job dispatch.
   - Background Worker: Ingestion parsing, statistical diagnostics, Astra orchestration, PDF generation.
   - PostgreSQL: Relational metadata, tenancy boundaries, audit trails, evidence indexes.
   - Object Storage: Private, immutable raw artifacts, dataset snapshots, and generated PDFs.
   - Redis: Ephemeral queue transport, worker heartbeats, progress pub/sub.

---

## 2. High-Level Target System Topology

```
                              ┌──────────────────────────────────┐
                              │          CLIENT BROWSER          │
                              │ React 19 / Vanilla CSS Dark Grid │
                              └─────────────────┬────────────────┘
                                                │
                                HTTPS / WSS / SSE
                                                │
                                                ▼
                              ┌──────────────────────────────────┐
                              │      NEXT.JS 16 BFF / API        │
                              │  - Auth & RBAC Middleware        │
                              │  - REST API /v1 Handlers         │
                              │  - Signed Upload Initiator       │
                              │  - SSE Telemetry Streamer        │
                              └───────┬──────────────┬───────────┘
                                      │              │
                   ┌──────────────────┘              └──────────────────┐
                   ▼                                                    ▼
    ┌─────────────────────────────┐                      ┌─────────────────────────────┐
    │     POSTGRESQL DATABASE     │                      │      REDIS MESSAGE BROKER   │
    │ - Organizations & Users     │                      │ - Job Queues (BullMQ)       │
    │ - Projects & Model Versions │                      │ - Live Event Pub/Sub        │
    │ - Dataset Metadata & Schemas│                      │ - Rate Limit Token Buckets  │
    │ - Investigations & Evidence │                      └──────────────┬──────────────┘
    │ - Audit Logs & Monitors     │                                     │
    └─────────────────────────────┘                                     │ Job Dispatch
                   ▲                                                    ▼
                   │                                     ┌─────────────────────────────┐
                   │                                     │     BACKGROUND WORKER       │
                   │ Database Queries                    │ - Large Dataset Ingestion   │
                   │                                     │ - Deterministic ML Engines  │
                   │                                     │ - Astra Multi-Turn Loop     │
                   │                                     │ - Monitor Rule Sweeps       │
                   │                                     │ - Pure TS PDF Generation    │
                   │                                     └──────────────┬──────────────┘
                   │                                                    │
                   └──────────────────┬─────────────────────────────────┘
                                      ▼
                       ┌─────────────────────────────┐
                       │   S3-COMPATIBLE STORAGE     │
                       │ - Immutable Uploaded CSVs   │
                       │ - Cleaned Dataset Snapshots │
                       │ - Generated Incident PDFs   │
                       └─────────────────────────────┘
```

---

## 3. Core Component Boundaries & Responsibilities

| Subsystem | Technology | Responsibilities | Must NOT Do |
| :--- | :--- | :--- | :--- |
| **Web Frontend** | Next.js 16 / React 19 / Vanilla CSS | User interface, file drag-and-drop, interactive charts, progressive disclosure toggles, telemetry streaming. | Hold secrets; directly write to database; execute unvalidated diagnostic math. |
| **API Layer (BFF)** | Next.js Route Handlers / API v1 | Authentication verification, RBAC enforcement, request input validation, signed upload URLs, job enqueueing. | Perform long-running CPU calculations (>5s) inside request handlers. |
| **Background Worker** | Node.js Worker Service (BullMQ) | Streaming CSV/TSV/JSON ingestion, schema profiling, 10 diagnostic tools, Astra supervisor loop, report rendering. | Expose public endpoints; bypass tenant isolation boundaries. |
| **Relational Database** | PostgreSQL 16+ | Organizations, projects, model registries, dataset metadata, investigation records, immutable evidence, audit logs. | Store large raw dataset files (>10MB); store binary files. |
| **Object Storage** | S3-Compatible Storage (MinIO / AWS S3) | Immutable raw dataset storage, versioned clean CSV snapshots, binary PDF export files. | Public-by-default access; allow unauthenticated uploads. |
| **Queue & Cache** | Redis 7+ | Asynchronous job delivery, retry management, SSE telemetry message fan-out, rate limit tracking. | Act as source of truth for historical incident records. |

---

## 4. Multi-Tenant Data Isolation Strategy

### 4.1 Tenancy Hierarchy
Every domain entity belongs strictly to a hierarchical tenancy model:
```
Organization (Tenant Boundary)
  └── Project
        ├── Model Registry (Model & Model Versions)
        ├── Dataset Registry (Dataset & Dataset Versions)
        ├── Investigations (Evidence, Hypotheses, Repairs, Diagnoses)
        └── Monitors & Alerts
```

### 4.2 Query-Level Enforcement
- All database queries MUST include `organization_id` or `project_id` in their `WHERE` clause.
- Access tokens contain the user ID and active organization membership.
- Object storage keys are prefixed by organization and project:
  `s3://whylab-artifacts/org_{orgId}/proj_{projId}/datasets/{datasetVersionId}.csv`

---

## 5. Asynchronous Job & Streaming Protocol

To prevent gateway timeouts on long investigations:
1. Client calls `POST /api/v1/investigations` with dataset parameters and objective.
2. Server validates authorization and enqueues a `run_investigation` job in Redis.
3. Server returns `202 Accepted` with `{ investigation_id: "inve_...", status: "queued" }`.
4. Client connects to `GET /api/v1/investigations/{id}/events` via Server-Sent Events (SSE).
5. Background worker consumes job, executes Astra rounds, records evidence in PostgreSQL, and publishes NDJSON progress events to Redis Pub/Sub.
6. The SSE route handler relays Redis events directly to the client browser.
7. If the browser disconnects or refreshes, reconnecting with `Last-Event-ID` resumes progress without restarting the investigation.

---

## 6. Migration Plan: Preserving What Works

The target architecture is implemented incrementally without breaking existing features:
1. **Local Mode Remains Supported:** When `DATABASE_URL` is not set, WhyLab operates in standalone local mode using filesystem storage under `.whylab/`.
2. **Deterministic Diagnostic Core Untouched:** The existing 10 pure TypeScript diagnostic modules in `src/core/diagnostics/` are shared directly between the local Next.js runtime and the production background worker.
3. **Continuous Golden Regression:** All 112 existing unit and integration tests continue running in CI to prevent mathematical or UX regressions.

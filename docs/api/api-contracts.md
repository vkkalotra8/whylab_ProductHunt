# WhyLab 2.0 — Production API Specification & Contracts

**Document Version:** 1.0.0 (M0 Baseline)  
**Date:** October 10, 2026  
**Status:** Canonical API Specification for WhyLab 2.0  

---

## 1. Global API Conventions

### 1.1 Base URL & Content Negotiation
- **Base Path:** `/api/v1` (with legacy compatibility at `/api`)
- **Content Type:** `application/json` (except SSE streams: `text/event-stream`, and PDF export: `application/pdf`)
- **Character Encoding:** UTF-8
- **Date Format:** ISO 8601 UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`)

### 1.2 Standard Headers
- `Authorization: Bearer <token>`: Required for all authenticated routes.
- `X-Organization-Id: <org_id>`: Contextual organization header.
- `X-Request-Id: <uuid>`: Distributed tracing identifier.
- `Idempotency-Key: <string>`: Required on resource-creation endpoints to prevent duplicate operations.

### 1.3 Standard Error Envelope (`application/problem+json`)
```json
{
  "error": {
    "code": "DATASET_SCHEMA_INVALID",
    "message": "The uploaded dataset is missing required column: 'target'",
    "details": {
      "missingColumns": ["target"],
      "observedColumns": ["id", "feature_1", "feature_2"]
    },
    "requestId": "req_84f932e1-4c12-4019-b76b-c743812903fe"
  }
}
```

---

## 2. API Endpoints Specification

### 2.1 Health & Liveness
- **Route:** `GET /api/health`
- **Auth:** Public
- **Response `200 OK`:**
  ```json
  {
    "status": "healthy",
    "version": "2.0.0",
    "timestamp": "2026-10-10T17:20:00.000Z",
    "uptimeSeconds": 1420
  }
  ```

---

### 2.2 Organizations & Projects (`POST /api/v1/projects`)
- **Route:** `POST /api/v1/projects`
- **Auth:** Required (`editor`, `admin`, `owner`)
- **Headers:** `Idempotency-Key`
- **Request Body:**
  ```json
  {
    "name": "Clinical Sepsis Early Detection",
    "description": "Hospital ICU diagnostic monitoring model"
  }
  ```
- **Response `201 Created`:**
  ```json
  {
    "id": "proj_94b1c20e-8120-4e12-89b1-5091a18290be",
    "organizationId": "org_018b29c1-8402-4192-a189-984019280192",
    "name": "Clinical Sepsis Early Detection",
    "createdAt": "2026-10-10T17:21:00.000Z"
  }
  ```

---

### 2.3 Direct-to-Storage Dataset Uploads (`POST /api/v1/datasets/uploads`)
- **Route:** `POST /api/v1/datasets/uploads`
- **Auth:** Required (`editor`, `admin`, `owner`)
- **Request Body:**
  ```json
  {
    "projectId": "proj_94b1c20e-8120-4e12-89b1-5091a18290be",
    "filename": "eval_batch_2026_10.csv",
    "sizeBytes": 1485920,
    "contentType": "text/csv"
  }
  ```
- **Response `201 Created`:**
  ```json
  {
    "uploadId": "upl_8192a019-8129-4102-b819-509182901829",
    "signedUrl": "https://whylab-artifacts.s3.amazonaws.com/org_.../eval_batch.csv?AWSAccessKeyId=...",
    "expiresAt": "2026-10-10T17:35:00.000Z"
  }
  ```

---

### 2.4 Investigation Execution & SSE Telemetry (`POST /api/v1/investigations`)
- **Route:** `POST /api/v1/investigations`
- **Auth:** Required
- **Request Body:**
  ```json
  {
    "projectId": "proj_94b1c20e-8120-4e12-89b1-5091a18290be",
    "datasetVersionId": "ds_8192019a-9812-4019-b819-401928019281",
    "objective": "Investigate accuracy paradox and minority recall failure",
    "directives": ["Prioritize patient safety and false negative minimization"]
  }
  ```
- **Response `202 Accepted`:**
  ```json
  {
    "investigationId": "inve_289fdb4e-3e4b-43d4-a2be-fce96bb1662d",
    "status": "queued",
    "eventStreamUrl": "/api/v1/investigations/inve_289fdb4e-3e4b-43d4-a2be-fce96bb1662d/events"
  }
  ```

#### Telemetry Event Stream (`GET /api/v1/investigations/{id}/events`)
- **Headers:** `Accept: text/event-stream`, `Last-Event-ID: <id>` (optional for reconnection)
- **Emitted Event Types:**
  - `event: started`
  - `event: progress`
  - `event: tool_call`
  - `event: tool_result`
  - `event: hypothesis_added`
  - `event: experiment_added`
  - `event: repair_added`
  - `event: diagnosis_finalized`
  - `event: completed`

---

### 2.5 Repair Lab Optimization & Approval
- **Compute Sweep:** `POST /api/repair`
  - Body: `{ investigationId, targetRecall, costMatrix: { falseNegativeCost: 20, falsePositiveCost: 1 } }`
  - Returns: `{ points: [...], optimalThreshold: 0.19, beforeAfterComparison: {...} }`
- **Approve Policy:** `POST /api/v1/repairs/{id}/approve`
  - Body: `{ expectedModelVersion: "v1.2", rationale: "Approved by Chief Clinical Officer for low false negatives" }`
  - Returns: `{ approved: true, approvedBy: "user_...", timestamp: "..." }`

---

### 2.6 Incident Report PDF Download (`GET /api/investigations/{id}/pdf`)
- **Route:** `GET /api/investigations/{id}/pdf`
- **Headers:** `Accept: application/pdf`
- **Response `200 OK`:** Binary PDF 1.4 stream
  - `Content-Disposition: attachment; filename="WhyLab_Incident_Report_<id>.pdf"`
  - `Content-Type: application/pdf`

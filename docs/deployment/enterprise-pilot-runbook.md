# WhyLab 2.0 — Enterprise Pilot Deployment & Operations Runbook

**Document Version:** 1.0.0 (Milestone M7 Delivery)  
**Date:** October 12, 2026  
**Audience:** Site Reliability Engineers (SRE), MLOps Leads, Security Engineers, and Enterprise Pilot Operators  
**System:** WhyLab 2.0 Machine Learning Reliability & Autonomous Failure Investigation Platform  

---

## 1. Architecture Overview & Topology

WhyLab 2.0 is designed as a hybrid cloud-native or on-premise SaaS solution with zero mandatory external cloud dependencies for local or standalone operation.

```
       [ Clinician / ML Engineer Web UI & API Clients ]
                              │
                    HTTPS / WebSocket / SSE
                              ▼
        ┌──────────────────────────────────────────────┐
        │       Next.js 16 App Router API Gateway      │
        │  - Native Web Crypto JWT Authentication      │
        │  - RBAC Hierarchy & Tenant Boundary Guard   │
        │  - RFC 7807 Structured Problem Details       │
        │  - Sliding Window Rate Limiting & CWE-1236   │
        └───────┬──────────────┬──────────────┬────────┘
                │              │              │
      Object Storage     Database / State    Worker Queue
                │              │              │
        ┌───────▼──────┐ ┌─────▼───────┐ ┌────▼────────┐
        │  AWS S3 /    │ │ PostgreSQL  │ │ Async Queue │
        │  MinIO SigV4 │ │ 15+ Schema  │ │ & Monotonic │
        │  (or Local)  │ │ (or Memory) │ │ Event Hub   │
        └──────────────┘ └─────────────┘ └────┬────────┘
                                              ▼
                                   ┌────────────────────┐
                                   │ Astra Investigator │
                                   │ Pure TS Diagnostic │
                                   │ Deterministic Eng. │
                                   └────────────────────┘
```

---

## 2. Production Deployment Prerequisites

### 2.1 Hardware Requirements
- **API Server & Next.js Host:** 2 vCPU, 4GB RAM minimum (8GB recommended for concurrent 100MB+ dataset validations).
- **PostgreSQL Database:** PostgreSQL 14+ with SSL enabled (`sslmode=require`).
- **Object Storage:** AWS S3, Cloudflare R2, or MinIO instance with private bucket access.

### 2.2 Environment Configuration Reference

| Environment Variable | Required | Default / Example | Description |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Node environment runtime |
| `AUTH_SECRET` | Yes | `whylab-production-jwt-hmac-secret-min-32-chars!` | Cryptographic key for session token HMAC-SHA256 |
| `AUTH_REQUIRED` | Yes | `true` | Enforces strict authentication on all API routes |
| `DATABASE_URL` | No | `postgres://user:pass@host:5432/whylab` | PostgreSQL connection string (falls back to local filesystem store if unset) |
| `STORAGE_DRIVER` | No | `local` (or `s3`) | Storage adapter selection (`s3` or `local`) |
| `S3_BUCKET` | Cond. | `whylab-enterprise-datasets` | S3 bucket name (required if `STORAGE_DRIVER=s3`) |
| `S3_REGION` | Cond. | `us-east-1` | S3 AWS region |
| `S3_ACCESS_KEY_ID` | Cond. | `AKIA...` | S3 access key ID |
| `S3_SECRET_ACCESS_KEY` | Cond. | `...` | S3 secret access key |
| `S3_ENDPOINT` | No | `https://minio.internal:9000` | Custom endpoint for MinIO or Cloudflare R2 |
| `PORT` | No | `3000` | Application HTTP listener port |

---

## 3. Unassisted User Step-by-Step Walkthrough

This section provides the end-to-end user journey for an unassisted ML Engineer or Clinician.

### Phase 1: Authentication & Workspace Access
1. Generate an enterprise session token or log in through your SSO provider.
2. In all subsequent API or UI requests, provide the bearer token:
   ```bash
   Authorization: Bearer <JWT_TOKEN>
   ```

### Phase 2: Secure Dataset Ingestion
1. Request a presigned upload URL:
   ```bash
   curl -X POST https://whylab.example.com/api/v1/datasets/uploads \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "projectId": "proj_icu_melanoma",
       "datasetName": "ICU Melanoma Baseline",
       "filename": "eval_melanoma_baseline.csv",
       "sizeBytes": 832
     }'
   ```
2. Upload the raw CSV directly to the presigned URL using `PUT`.
3. Complete the upload registration and verify SHA-256 integrity:
   ```bash
   curl -X POST https://whylab.example.com/api/v1/datasets/uploads/{uploadId}/complete \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "projectId": "proj_icu_melanoma",
       "datasetId": "ds_...",
       "objectKey": "org_.../proj_.../datasets/.../eval_melanoma_baseline.csv"
     }'
   ```

### Phase 3: Launch Autonomous Failure Investigation
1. Submit an investigation job to the background queue:
   ```bash
   curl -X POST https://whylab.example.com/api/v1/investigations/jobs \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "projectId": "proj_icu_melanoma",
       "title": "Melanoma Triage Disparity Audit",
       "fixtureName": "melanoma-synthetic.csv",
       "autoStart": true
     }'
   ```
2. Connect to the live telemetry stream via Server-Sent Events (SSE):
   ```bash
   curl -N https://whylab.example.com/api/v1/investigations/{investigationId}/events \
     -H "Authorization: Bearer $TOKEN" \
     -H "Last-Event-ID: 0"
   ```

### Phase 4: Inspect Diagnostics & Holdout Generalization
1. Inspect the resulting incident report:
   - Identify primary failure mode (e.g. `MULTI_SITE_SHIFT`, `SUBGROUP_UNDERPERFORMANCE`, `CAPABILITY_DEFICIT`).
   - Review holdout partition results to ensure zero optimization leakage.
   - Note the educational banner distinguishing optimization cohort metrics from independent generalization.

### Phase 5: Repair Lab & Human Approval Gatekeeper
1. Explore candidate repair thresholds in the Repair Lab before-after matrix.
2. Submit policy for human review:
   ```bash
   curl -X POST https://whylab.example.com/api/v1/repairs/{repairId}/approve \
     -H "Authorization: Bearer $CHIEF_OFFICER_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "expectedVersion": 1,
       "comments": "Approved for clinical assist under mandatory human clinician protocol."
     }'
   ```
3. Export verified multi-language decision policies (Python, TypeScript, JSON, YAML). Notice the enforced `AUTOMATED_DEPLOYMENT_PROHIBITED = True` invariant.

### Phase 6: Production Statistical Drift Monitoring
1. Deploy a statistical drift monitor rule:
   ```bash
   curl -X POST https://whylab.example.com/api/v1/monitors \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "projectId": "proj_icu_melanoma",
       "name": "Probability Drift Guard",
       "referenceDatasetId": "ds_...",
       "conditions": [
         { "metric": "ks_drift", "column": "y_probability", "operator": "gt", "threshold": 0.15, "severity": "critical" }
       ],
       "cooldownMinutes": 60
     }'
   ```
2. In the event of a drift alert, acknowledge the alert via `/api/v1/monitors/alerts/{id}/acknowledge`.

---

## 4. Disaster Recovery & Backup Restore Runbook

### 4.1 Creating a Cryptographic Backup Snapshot
Execute programmatic snapshot export via `createBackupSnapshot`:
```typescript
import { createBackupSnapshot } from '@/server/backup/backup-service.ts';

// Exports entire platform state or single tenant
const snapshot = await createBackupSnapshot('org_target_hospital');
console.log('Snapshot Created:', snapshot.manifestChecksum);
```

### 4.2 Restoring from Backup Post-Crash
Execute restore via `restoreFromSnapshot`:
```typescript
import { restoreFromSnapshot } from '@/server/backup/backup-service.ts';

const report = await restoreFromSnapshot(snapshot);
console.log('Restore Verified:', report.verified);
console.log('Restored Counts:', report.restoredCounts);
```

### 4.3 Tamper Detection Guarantees
- The backup engine computes SHA-256 digests over each table/entity collection and a master `manifestChecksum`.
- If any byte of the data payload is altered or injected, `restoreFromSnapshot` rejects the entire restore with an explicit checksum mismatch error, preventing malicious state injection.

---

## 5. On-Call Operator Troubleshooting Playbook

### Scenario 1: Investigation Worker Queue Backlog
- **Symptom:** Jobs remain in `queued` status without transitioning to `running`.
- **Diagnosis:**
  1. Check worker logs: `grep "Worker poll error" /var/log/whylab.log`.
  2. Inspect queue metrics: `GET /api/v1/investigations/jobs`.
- **Resolution:**
  1. Restart the background worker service: `npm run start`.
  2. The worker automatically recovers waiting jobs on startup and cleans up stale abort controllers.

### Scenario 2: Statistical Alert Storms
- **Symptom:** Hundreds of repetitive drift alerts received for the same feature.
- **Diagnosis:** Check `AlertDeduplicator` state in `src/server/monitoring/alert-deduplicator.ts`.
- **Resolution:**
  1. Increase the rule cooldown window:
     ```json
     { "cooldownMinutes": 120 }
     ```
  2. The deduplicator will automatically suppress duplicates while tracking the suppressed alert counter.

### Scenario 3: Rollback Procedure
- **Trigger:** Critical regression in a production deployment.
- **Action:**
  1. Point the load balancer to the previous stable release artifact.
  2. Execute point-in-time database restore using the pre-deployment backup snapshot.
  3. Verify data integrity using `backup-restore-drill.test.mjs`.

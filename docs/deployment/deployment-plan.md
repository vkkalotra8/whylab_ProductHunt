# WhyLab 2.0 — Production Deployment & Infrastructure Plan

**Document Version:** 1.0.0 (M0 Baseline)  
**Date:** October 10, 2026  
**Status:** Approved Infrastructure & Deployment Architecture  

---

## 1. Multi-Tier Deployment Topology

```
DEVELOPMENT                    STAGING                       PRODUCTION
(Local Docker Compose)         (Managed Cloud Isolated)      (Highly Available Multi-AZ)
┌───────────────────────┐      ┌───────────────────────┐     ┌────────────────────────┐
│ - Next.js (Port 3000) │      │ - Container Web / API │     │ - Next.js Web Cluster  │
│ - Postgres 16 (5432)  │ ───► │ - Managed RDS Postgres│───► │ - Multi-AZ Aurora DB   │
│ - Redis 7 (6379)      │      │ - Managed ElastiCache │     │ - ElastiCache Cluster  │
│ - MinIO S3 (9000)     │      │ - Private S3 Bucket   │     │ - S3 Bucket (Replicated│
└───────────────────────┘      └───────────────────────┘     └────────────────────────┘
```

---

## 2. Local Development Environment (Docker Compose)

For complete local testing of multi-tenant features before cloud deployment:
```yaml
version: '3.8'

services:
  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://whylab_user:whylab_pass@postgres:5432/whylab_db
      - REDIS_URL=redis://redis:6379
      - S3_ENDPOINT=http://minio:9000
      - S3_BUCKET=whylab-artifacts
      - S3_ACCESS_KEY=minioadmin
      - S3_SECRET_KEY=minioadmin
    depends_on:
      - postgres
      - redis
      - minio

  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=whylab_user
      - POSTGRES_PASSWORD=whylab_pass
      - POSTGRES_DB=whylab_db
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  minio_data:
```

---

## 3. Environment Variables & Secret Configuration

| Variable | Scope | Purpose | Example |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | All | Runtime mode | `production` / `development` |
| `DATABASE_URL` | Prod/Staging | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Prod/Staging | Redis connection string | `redis://default:pass@redis-host:6379` |
| `S3_BUCKET` | Prod/Staging | Private artifact bucket name | `whylab-production-artifacts` |
| `S3_REGION` | Prod/Staging | AWS region | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | Prod/Staging | S3 credentials | Secure secret |
| `AWS_SECRET_ACCESS_KEY` | Prod/Staging | S3 credentials | Secure secret |
| `OPENAI_API_KEY` | Optional | Astra AI online supervisor | `sk-...` (Falls back to offline mode) |
| `JWT_SECRET` | Prod/Staging | Session encryption key | Cryptographic 256-bit secret |

---

## 4. Continuous Integration & Deployment Pipeline (GitHub Actions)

```yaml
name: WhyLab CI Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: TypeScript Strict Check
        run: npm run typecheck

      - name: Lint Validation
        run: npm run lint

      - name: Run Test Suite (112 Tests)
        run: npm test

      - name: Next.js Production Build
        run: npm run build
```

---

## 5. Zero-Downtime Database Migration & Backup Strategy

1. **Expand and Contract Migrations:**
   - Step 1: Add new columns as nullable or with defaults.
   - Step 2: Deploy new code writing to both old and new schema.
   - Step 3: Backfill historical rows.
   - Step 4: Add non-null constraints and drop old columns in a subsequent release.
2. **Automated Daily Backups:**
   - Point-in-time recovery (PITR) enabled on PostgreSQL with 7-day retention.
   - S3 versioning and lifecycle policies enabled on the artifact bucket.
   - Monthly restore drill to verify database disaster recovery.

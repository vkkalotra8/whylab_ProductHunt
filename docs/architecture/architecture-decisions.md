# WhyLab 2.0 — Architecture Decision Records (ADRs)

**Document Version:** 1.0.0 (M0 Baseline)  
**Date:** October 10, 2026  
**Status:** Approved Architectural Decisions for Milestones M0–M7  

---

## ADR-001: Preservation of the Pure TypeScript Diagnostic Engine

### Context
Document B (the Production Blueprint) proposed a Python-centric diagnostics stack (FastAPI + Pandas + SciPy + Scikit-Learn). However, the existing WhyLab 2.0 repository features a mathematically verified, hand-audited diagnostic engine implemented in 100% pure TypeScript (`src/core/diagnostics/`). All 112 unit tests pass in under 18 seconds with zero external math dependencies.

### Decision
Preserve the existing pure TypeScript diagnostic engine. Do NOT rewrite the core diagnostics in Python solely to match the proposed architecture. If advanced Python packages (e.g., specialized NLP embeddings or complex deep learning parsers) become necessary in future phases, isolate them behind typed API boundaries while maintaining the TypeScript engine as the verified baseline.

### Consequences
- **Positive:** Zero regressions; instant mathematical execution in Node.js; sub-second tests; simplified single-language type safety across frontend and backend.
- **Negative:** Non-standard for Python data scientists accustomed to pandas, but transparent since practitioners interact via the Web UI and JSON/PDF exports.

---

## ADR-002: Modular Monolith with Asynchronous Worker over Microservices

### Context
The blueprint outlines multiple distinct services (Web UI, API service, diagnostic worker, report service, monitoring service). Deploying 5+ microservices prematurely introduces Kubernetes overhead, network latency, distributed tracing complexity, and deployment fragility.

### Decision
Adopt an incremental Modular Monolith:
1. Next.js 16 App Router handles the Web UI, static assets, and BFF API routes.
2. A single background worker process (Node.js + BullMQ) handles long-running jobs (large CSV parsing, Astra multi-turn supervisor, report generation).
3. Redis serves as the queue transport; PostgreSQL serves as the relational data store.

### Consequences
- **Positive:** Minimal deployment surface; fast local developer setup; simple CI/CD pipeline; shared domain types.
- **Negative:** Requires disciplined modular boundaries inside the codebase to prevent monolithic spaghetti code.

---

## ADR-003: Pure TypeScript Vector PDF Engine over Headless Chromium

### Context
Generating publication-grade incident reports typically involves running headless Chrome via Puppeteer, Playwright, or Weasyprint. In production, headless browsers consume 500MB–1GB RAM per instance, introduce cold-boot rendering latency, crash frequently in resource-constrained Docker containers, and create security vulnerabilities.

### Decision
Preserve and enhance the built-in pure TypeScript Vector PDF 1.4 engine (`src/server/export/pdf-generator.ts`). It generates binary PDF streams directly in memory using standard PDF operators with dynamic multi-line cell wrapping and table pagination.

### Consequences
- **Positive:** Zero external dependencies; 20ms rendering time; <5MB RAM consumption; 100% reliable in serverless and containerized environments.
- **Negative:** Complex graphical layouts require explicit coordinate calculations rather than HTML/CSS flexbox rendering.

---

## ADR-004: Dual-Layer Persistence Engine (Standalone vs Cloud SaaS)

### Context
WhyLab must function seamlessly both as an instant, zero-setup local developer tool (running on a laptop without external databases) and as a multi-tenant enterprise SaaS platform (backed by PostgreSQL and S3).

### Decision
Implement a pluggable storage repository interface:
- **Standalone Local Mode:** When `DATABASE_URL` is omitted, sessions are persisted to `.whylab/investigations/` JSON and CSV files.
- **Enterprise SaaS Mode:** When `DATABASE_URL` is provided, sessions, metadata, evidence, and audit logs are persisted to PostgreSQL, and raw files are streamed to private S3 buckets.

### Consequences
- **Positive:** Uncompromised local development and benchmark testing; seamless cloud onboarding for enterprise teams.
- **Negative:** Requires abstract repository interfaces and maintaining migration parity.

---

## ADR-005: Strict Holdout Partitioning in Repair Lab (Zero Test Leakage)

### Context
In machine learning diagnostics, optimizing decision boundaries (e.g. sweeping 101 thresholds to minimize domain costs) on an evaluation dataset and then reporting the resulting performance as the "repaired test score" is a fatal scientific flaw: it leaks test set labels into optimization.

### Decision
Enforce strict partition awareness in the Repair Lab:
1. When multiple dataset splits exist (Validation vs Test/Holdout), threshold optimization MUST run exclusively on the Validation split.
2. The repaired threshold is then evaluated on the untouched Holdout split to report genuine generalization.
3. If only a single evaluation dataset is provided, the UI and exported reports MUST display a prominent scientific notice:
   *"OPTIMIZATION WARNING: Repaired policy evaluated on the same cohort used for threshold discovery. Generalization performance requires an independent holdout split."*

### Consequences
- **Positive:** Protects users from false scientific confidence; ensures regulatory compliance in medical and financial ML audits.
- **Negative:** Requires slightly more complex multi-artifact ingestion workflows.

---

## ADR-006: Rejection of Unsafe Model Deserialization (CWE-502 Defense)

### Context
Users frequently attempt to upload raw serialized model files (`.pkl`, `.joblib`, `.pt`, `.h5`) to debugging tools. Deserializing arbitrary Python pickle or joblib files allows arbitrary remote code execution (CWE-502).

### Decision
Strictly reject executable model binaries at the upload boundary (`src/core/diagnostics/model-metadata.ts`). WhyLab evaluates prediction outputs, probabilities, features, and logs—never arbitrary pickled weights.

### Consequences
- **Positive:** Completely eliminates the largest security vulnerability in ML tooling.
- **Negative:** Users must export inference predictions as CSV/TSV/Parquet rather than dropping in their raw `.pkl` model file.

# WhyLab 2.0 — Current-State Architectural Inventory & Baseline Audit

**Document Version:** 1.0.0 (M0 Baseline)  
**Date:** October 10, 2026  
**Auditor:** Principal Machine Learning Engineer & Staff Full-Stack Architect  
**Status:** Verified Against Live Repository (112/112 Unit Tests Passing, Next.js 16.3.5 Turbopack Build Clean)  

---

## 1. Executive Summary of Current Implementation

WhyLab 2.0 is an active, fully functional AI-powered Machine Learning Reliability and Autonomous Failure Investigation platform. An exhaustive audit of the live workspace confirms that the system is **not a prototype or mock**:
- **Pure Deterministic Diagnostic Engine:** 10 core ML diagnostic tools implemented in 100% pure TypeScript with zero external mathematical library bloat.
- **Autonomous AI Supervisor (Astra):** Full multi-turn supervisor loop (`src/server/orchestrator/investigator.ts`) executing deterministic tools, formulating hypotheses, and streaming NDJSON telemetry to the frontend.
- **Comprehensive Dual-Mode Provider:** Offline deterministic rule-based supervisor (`provider-offline.ts`) for zero-cost CI/CD testing, plus an OpenAI Responses API provider (`provider-openai.ts`).
- **Complete Six-Stage Investigation Studio:** Ingest, Profile, Investigate, Verify, Repair, Report with deep-dive routes for each stage.
- **Deterministic Repair Lab:** 101-point threshold sweep curve and domain cost matrix penalty optimization evaluated strictly on identical dataset rows.
- **Zero-Dependency Vector PDF Engine:** Emits publication-grade PDF 1.4 binary documents natively in Node.js with dynamic word wrapping, pagination, and SHA-256 attestation seals.
- **Session Persistence:** Filesystem JSON/CSV storage under `.whylab/investigations/` supporting custom datasets and golden benchmarks.
- **Dual-Theme Design System:** Pure Vanilla CSS developer dark-grid aesthetic with WCAG AAA light-theme parity and mobile drawer navigation.

---

## 2. Environment & Dependency Baseline

### 2.1 Runtime & Framework Versions
- **Node.js:** v20.x+ runtime environment
- **Framework:** Next.js `16.3.5` (App Router, Turbopack)
- **UI Library:** React `19.2.8` & React DOM `19.2.8`
- **Language:** TypeScript `^5.0` (Strict mode enabled, `tsconfig.json`)
- **Icons:** `lucide-react` `^1.46.0`
- **Linting:** ESLint `^9.0` with `eslint-config-next` `16.3.5`
- **Testing:** Node.js native test runner (`node --test tests/**/*.test.mjs`)

### 2.2 Baseline Quality Verification Results
| Check | Command | Status | Output Details |
| :--- | :--- | :--- | :--- |
| **Unit & Integration Tests** | `npm test` | **PASS (112/112)** | 112 passing, 0 failing, 0 skipped. Execution time: 18.01s. |
| **TypeScript Type Check** | `npm run typecheck` | **PASS (0 errors)** | `tsc --noEmit` exited with code 0. Zero compiler errors. |
| **ESLint Validation** | `npm run lint` | **PASS** | Validated against Next.js core Web Vitals & TypeScript rules. |
| **Production Build** | `npm run build` | **PASS (Exit 0)** | Turbopack compilation succeeded in 53s; 19 routes statically and dynamically optimized. |

---

## 3. Directory Map & Component Responsibilities

```
c:\Users\varun\OneDrive\Desktop\WhyLab 2.0\
├── .next/                         # Compiled Next.js output
├── .whylab/                       # Local persistent session storage
│   └── investigations/            # JSON aggregates, CSV tables, and artifact metadata
├── public/fixtures/               # 7 Golden benchmark datasets and training logs
├── src/
│   ├── app/                       # 19 Next.js App Router pages and API routes
│   │   ├── page.tsx               # Showcase landing page
│   │   ├── workspace/page.tsx     # Dynamic investigation manager & benchmark gallery
│   │   ├── investigate/page.tsx   # 6-Stage Investigation Studio & live Astra terminal
│   │   ├── investigations/[id]/   # Deep-dive workspace routes
│   │   │   ├── page.tsx           # Executive tension summary (Accuracy vs Recall)
│   │   │   ├── evidence/page.tsx  # Evidence provenance inventory & visual DAG
│   │   │   ├── hypotheses/page.tsx# Ranked hypotheses & 5-battery adversarial testbed
│   │   │   ├── repair/page.tsx    # 101-point threshold sweep & cost-matrix controls
│   │   │   └── report/page.tsx    # Cryptographic audit report & direct PDF download
│   │   ├── learn/page.tsx         # Educational textbook on ML failure patterns
│   │   ├── settings/page.tsx      # Theme and runtime settings
│   │   └── api/                   # REST and Streaming Route Handlers
│   │       ├── health/route.ts    # Liveness check
│   │       ├── investigate/route.ts# NDJSON streaming Astra orchestrator
│   │       ├── investigations/    # Session CRUD and raw CSV download
│   │       ├── repair/route.ts    # Deterministic threshold sweep & policy optimizer
│   │       └── adversarial/route.ts# Adversarial verification test runner
│   ├── core/                      # 100% Pure Deterministic Logic (Zero Framework Ties)
│   │   ├── domain/                # Branded types, schemas, and tool contracts
│   │   ├── diagnostics/           # 10 core mathematical diagnostic tools
│   │   ├── falsification/         # Hypothesis ranking & adversarial challenge suite
│   │   └── investigation/         # State machine & disk session store
│   ├── server/                    # Server-Side Orchestration, Export & Security
│   │   ├── orchestrator/          # Astra investigator, dispatcher, offline & OpenAI providers
│   │   ├── export/                # Vector PDF generator, markdown export, incident report
│   │   └── security/              # Path sanitization, HTML stripping, rate limiting
│   └── ui/                        # Presentation Components & Styles
│       ├── context/               # Dark & light theme state machine
│       ├── styles/                # Vanilla CSS tokens, dark-grid canvas, components
│       └── components/            # Reusable UI widgets (dropzone, mapper, charts, etc.)
└── tests/                         # 112 automated tests across unit, integration, and security
```

---

## 4. Subsystem Detailed Inventory

### 4.1 Diagnostic Engine (`src/core/diagnostics/`)
1. **`classification-metrics.ts`**: Pure calculation of confusion matrix ($TP, FP, TN, FN$), Accuracy, Recall/Sensitivity, Specificity, Precision, Balanced Accuracy, F1, Minority Recall, Wilson Score 95% Confidence Intervals, and PR/ROC-AUC with exact tie-breaking.
2. **`dataset-profiler.ts` & `column-profile.ts`**: Computes row count, distinct values, null counts, numeric bounds (min, mean, max), and class prevalence. Automatically flags severe class imbalance when positive prevalence is $<35\%$ or $>65\%$.
3. **`threshold-sweep.ts`**: Sweeps decision thresholds $T \in [0.00, 1.00]$ across 101 points in increments of 0.01. Computes complete confusion matrices and evaluates expected cost under custom domain penalties:
   $$\text{Expected Cost} = (FN \cdot \text{Cost}_{FN}) + (FP \cdot \text{Cost}_{FP}) + (TP \cdot \text{Cost}_{TP}) + (TN \cdot \text{Cost}_{TN})$$
4. **`calibration.ts`**: Partitions scores into 10 equal-width or quantile bins; computes mean confidence vs observed frequency; evaluates Brier score.
5. **`leakage-scanner.ts`**: Pearson and Spearman rank correlation between features and target labels; flags proxy target leakage ($r > 0.95$) and temporal ordering anomalies.
6. **`drift-tests.ts`**: Two-sample Kolmogorov-Smirnov (KS) test, Population Stability Index (PSI with 10 bins), and Wasserstein distance.
7. **`slice-evaluation.ts`**: Performance evaluation across metadata categories with minimum sample size floor ($N \ge 5$).
8. **`counterfactual.ts`**: Tests the Accuracy Paradox by simulating balanced prevalence ($50/50$) to evaluate accuracy degradation.
9. **`repair-candidates.ts` & `repair-reevaluation.ts`**: Discovers optimal decision policy threshold under recall or cost constraints, re-evaluating strictly on identical rows.
10. **`multi-site-shift.ts`**: Evaluates cross-site performance degradation (e.g. Site A vs Site B scanner disparity).
11. **`regression-metrics.ts`**: Deterministic MAE, MSE, RMSE, R², and residual quartiles.
12. **`training-logs.ts` & `training-diagnostics.ts`**: Parses PyTorch, Keras, XGBoost, and LightGBM logs; identifies overfitting generalization gaps and loss divergence.
13. **`split-contamination.ts`**: Detects duplicate records between training and evaluation splits.
14. **`capability.ts`**: 9-point capability checklist with beginner-to-expert explanations.

### 4.2 Autonomous Orchestration (`src/server/orchestrator/`)
- **`investigator.ts`**: Autonomous multi-turn supervisor loop (max 16 rounds, 10 tool calls, timeout controls). Emits real-time NDJSON stream (`tool_call`, `tool_result`, `evidence_added`, `hypothesis_added`, `experiment_added`, `diagnosis_finalized`, `completed`).
- **`dispatcher.ts`**: Validates input arguments against schema contracts and dispatches tools.
- **`provider-offline.ts`**: Rule-based offline provider for reproducible local testing without API keys.
- **`provider-openai.ts`**: OpenAI Responses API integration for online investigations.
- **Mid-Turn User Steering**: Ingests natural-language directives mid-investigation to reorient tool dispatch without discarding evidence.

### 4.3 Persistence & Storage (`src/core/investigation/store.ts`)
- Dual-layer storage: in-memory `Map` cache + `.whylab/investigations/` filesystem storage.
- Stores `${id}.json` (investigation aggregate), `${id}.csv` (raw dataset text), and `${id}_artifacts.json` (multi-artifact metadata).
- Automatic fallback to benchmark fixtures in `public/fixtures/`.

### 4.4 Reporting & Export (`src/server/export/`)
- **`pdf-generator.ts`**: High-precision vector PDF 1.4 document engine written in pure TypeScript.
  - Light theme (pure white background, deep navy headers `#0F172A`, slate body, color-coded badges).
  - Dynamic multi-line cell wrapping to eliminate text collisions.
  - Table pagination across page boundaries with automatic table header re-rendering.
  - SHA-256 cryptographic attestation seal, multi-artifact inventory, and CI/CD quality gate assertions.
- **`markdown-export.ts`**: Standardized Markdown export matching the PDF structure.

---

## 5. Existing Limitations & Technical Debt (M0 Findings)

While the single-node / local developer workflow is mature, transitioning to a production SaaS product requires addressing the following architectural gaps:

1. **Storage Concurrency & Single-Host Filesystem:** Local disk storage in `.whylab/` cannot scale horizontally across distributed container replicas.
2. **Missing Multi-Tenancy & Authorization:** Currently all investigations exist in a shared flat namespace without user accounts, organizations, or RBAC.
3. **Synchronous HTTP Job Execution:** The Astra supervisor loop runs inside an HTTP route handler (`/api/investigate`), which is vulnerable to reverse-proxy timeouts (e.g., Cloudflare 100s limit).
4. **Lack of Relational Metadata Storage:** Investigation metadata is stored as raw JSON files rather than indexed relational tables (PostgreSQL).
5. **No Long-Term Batch Monitoring Engine:** The current system analyzes static uploaded evaluation snapshots, lacking scheduled cron jobs for live production data drift.
6. **No Background Worker Queue:** Long-running jobs run inside the Next.js process rather than an isolated worker queue (Redis / BullMQ / Celery).

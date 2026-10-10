# WhyLab 2.0 — Complete End-to-End Project Architecture & Implementation Manual

**Document Version:** 2.0.0  
**Status:** Production-Ready & Hardened (112/112 Tests Passing, 0 Type Errors, Production Next.js Build Verified)  
**System Category:** AI Reliability, Machine Learning Failure Investigation & Autonomous Diagnostic System  
**Target Audience:** Machine Learning Practitioners, Software Architects, Full-Stack Engineers, MLOps Teams, and Contributors  

---

## Table of Contents

1. [Executive Overview & Product Vision](#1-executive-overview--product-vision)
2. [Core Architectural Principles](#2-core-architectural-principles)
3. [Technology Stack & Dependencies](#3-technology-stack--dependencies)
4. [Complete Directory & File Structure](#4-complete-directory--file-structure)
5. [Domain Model, Schemas & Data Invariants](#5-domain-model-schemas--data-invariants)
6. [Deterministic Diagnostic Engine (The 10 Core Tools)](#6-deterministic-diagnostic-engine-the-10-core-tools)
7. [Adversarial Verification & Falsification Engine](#7-adversarial-verification--falsification-engine)
8. [Astra Autonomous Orchestrator & Multi-Turn Loop](#8-astra-autonomous-orchestrator--multi-turn-loop)
9. [Investigation Lifecycle & State Machine](#9-investigation-lifecycle--state-machine)
10. [Session Persistence & Storage Architecture](#10-session-persistence--storage-architecture)
11. [The Six-Stage Investigation Workflow (User Journey)](#11-the-six-stage-investigation-workflow-user-journey)
12. [User Interface, Theme System & Responsive Design](#12-user-interface-theme-system--responsive-design)
13. [Export Engine: Light-Theme Vector PDF & Markdown](#13-export-engine-light-theme-vector-pdf--markdown)
14. [Security, Sanitization & Resource Quotas](#14-security-sanitization--resource-quotas)
15. [All Application Routes & API Endpoints](#15-all-application-routes--api-endpoints)
16. [Test Suite, Benchmarks & Quality Assurance](#16-test-suite-benchmarks--quality-assurance)
17. [Implementation History & Milestone Progression](#17-implementation-history--milestone-progression)
18. [Developer Guide: How to Make Changes Safely](#18-developer-guide-how-to-make-changes-safely)

---

## 1. Executive Overview & Product Vision

### 1.1 What is WhyLab 2.0?
**WhyLab 2.0** is an enterprise-grade AI Reliability and ML Debugging platform designed to discover, falsify, explain, and repair silent failures in machine learning systems.

Modern machine learning models often exhibit deceptive performance: a classifier boasting **94.2% top-line accuracy** may in reality suffer a catastrophic **22.4% minority class recall** (an Accuracy Paradox caused by severe class imbalance). When deployed in high-stakes domains—such as healthcare (malignant tumor screening, ICU sepsis alerts), finance (fraud detection), cybersecurity (intrusion monitoring), or autonomous systems—such failures lead to silent, fatal omissions.

Traditional observability tools merely record decaying aggregate metrics without diagnosing root causes. WhyLab 2.0 bridges this gap by acting as an **autonomous investigation laboratory**:
- Ingesting single evaluation tables or complex multi-artifact collections (train, validation, production, reference datasets, training logs, and model metadata).
- Dynamically detecting available diagnostic capabilities without crashing or fabricating synthetic numbers.
- Deploying an autonomous AI supervisor (**Astra**) that executes deterministic statistical tools, formulates evidence-backed hypotheses, and subjects them to rigorous adversarial falsification.
- Providing a **Deterministic Policy Repair Lab** that shifts decision thresholds across 101 operating points to satisfy domain cost matrices (e.g., $FN vs $FP penalties) without requiring costly retraining.
- Generating cryptographically attested (SHA-256) executive incident reports and downloading publication-grade light-theme vector PDFs.

### 1.2 Who is WhyLab Built For?
WhyLab 2.0 serves users across the machine learning experience spectrum:
1. **Students & Beginners:** Progressive disclosure reveals intuitive layperson explanations, visual analogies, and guidance on how to fix missing evidence.
2. **Data Scientists & Researchers:** Pure mathematical rigor with Wilson score confidence intervals, Benjamini-Hochberg FDR adjustments, PR-AUC, ROC-AUC with exact tie handling, and Brier calibration curves.
3. **ML Engineers & MLOps Teams:** Deterministic decision policy export (Python code and JSON rules) ready to drop into production serving inference pipelines, coupled with CI/CD assertion quality gates.
4. **Engineering Leaders & Compliance Auditors:** Verified root-cause incident reports equipped with cryptographic digests and multi-artifact inventories ready for regulatory sign-off.

---

## 2. Core Architectural Principles

WhyLab 2.0 is built on six inviolable architectural commandments:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   WHYLAB 2.0 ARCHITECTURAL FOUNDATION                   │
├────────────────────────────────────────────────────────────────────────┤
│ 1. DETERMINISTIC-FIRST MATH ENGINE                                     │
│    Zero LLM hallucinations. All metrics, intervals, p-values, sweeps,  │
│    and counterfactuals run in 100% pure TypeScript.                    │
├────────────────────────────────────────────────────────────────────────┤
│ 2. ASTRA AS INVESTIGATOR, NOT NARRATOR                                 │
│    The LLM acts as an autonomous reasoning supervisor that dispatches  │
│    deterministic tools and formulates falsifiable hypotheses.          │
├────────────────────────────────────────────────────────────────────────┤
│ 3. SCIENTIFIC FALSIFICATION DAG                                        │
│    Hypotheses are never accepted blindly. They undergo adversarial     │
│    challenge batteries and counterfactual stress testing.              │
├────────────────────────────────────────────────────────────────────────┤
│ 4. DETERMINISTIC REPAIR BEFORE EXPENSIVE RETRAINING                    │
│    Decision boundary threshold optimization under domain cost matrices │
│    tested strictly on identical dataset rows (zero interpolation).     │
├────────────────────────────────────────────────────────────────────────┤
│ 5. HONEST CAPABILITY AWARENESS                                         │
│    Never fabricate missing columns or metrics. If probability scores   │
│    are omitted, gracefully disable probability tools and educate user. │
├────────────────────────────────────────────────────────────────────────┤
│ 6. ZERO-DEPENDENCY VECTOR PDF ENGINE                                   │
│    Native PDF 1.4 binary stream generation. Instant client download    │
│    without headless Chromium or Puppeteer server bloat.                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack & Dependencies

| Layer | Technology | Version | Rationale & Tradeoffs |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router, Turbopack) | `16.3.5` | Modern server-rendered architecture, nested layouts, native route handlers. |
| **Language** | TypeScript (Strict Mode) | `5.x` | Strict type safety, branded types (`Id<'investigation'>`), 0 type errors. |
| **UI Library** | React (Server + Client Components) | `19.2.8` | Concurrent rendering, modern hooks, zero legacy class components. |
| **Styling** | Pure Vanilla CSS (CSS Modules & Custom Properties) | Pure CSS | Zero Tailwind CSS bloat, deterministic cascade, dark & light theme parity. |
| **Icons** | Lucide React | `^1.46.0` | Lightweight SVG icons matching the developer DevTool aesthetic. |
| **Test Runner** | Node.js Test Runner (`node --test`) | Native | Zero Jest/Vitest bloat, sub-15 second execution across 112 tests. |
| **PDF Engine** | Custom Pure TypeScript Vector PDF Engine | Built-in | Dependency-free, runs in Node.js and browser edge, light-theme vector rendering. |
| **Orchestrator** | Dual Provider: Offline Rule-Based & OpenAI API | Built-in | Deterministic testability in CI (zero token cost) + full LLM power in production. |

---

## 4. Complete Directory & File Structure

```
WhyLab 2.0/
├── package.json                        # Project metadata, scripts, and dependencies
├── tsconfig.json                       # Strict TypeScript compiler options
├── next.config.ts                      # Next.js 16 configuration
├── eslint.config.mjs                   # ESLint 9 flat configuration
├── guide.txt                           # Practitioner investigation workflow guide
├── .whylab/                            # Local persistent storage directory
│   └── investigations/                 # Stored sessions (${id}.json, ${id}.csv, ${id}_artifacts.json)
├── public/                             # Public static assets & golden benchmarks
│   └── fixtures/                       # Real-world benchmark evaluation datasets
│       ├── melanoma-synthetic.csv      # Clinical skin lesion classification (Flagship)
│       ├── kaggle_icu_sepsis_benchmark.csv # Critical care early warning benchmark
│       ├── kaggle_stroke_dataset.csv   # Extreme class imbalance dataset (1.8% prevalence)
│       ├── overconfident-classifier.csv# High-confidence miscalibration benchmark
│       ├── site-failure.csv            # Multi-site scanner acquisition covariate shift
│       ├── kaggle_disaster_tweets.csv  # NLP emergency intent classifier
│       └── icu_model_training.log      # Raw training epoch logs (PyTorch / Lightning)
├── src/
│   ├── app/                            # Next.js App Router (19 pages & API routes)
│   │   ├── layout.tsx                  # Root HTML shell, theme provider, fonts
│   │   ├── page.tsx                    # Landing showcase & architectural demo
│   │   ├── workspace/                  # Dynamic workspace manager & benchmark catalog
│   │   │   └── page.tsx                # Saved investigations grid & fixture launcher
│   │   ├── investigate/                # Six-stage Investigation Studio
│   │   │   └── page.tsx                # Dropzone, column mapper, checklist, Astra console
│   │   ├── investigations/[id]/        # Dynamic Investigation Deep-Dive Subroutes
│   │   │   ├── layout.tsx              # Deep-dive subroute navigation shell & breadcrumbs
│   │   │   ├── page.tsx                # Investigation executive summary & tension cards
│   │   │   ├── evidence/page.tsx       # Provenance drawer, measurement list, evidence DAG
│   │   │   ├── hypotheses/page.tsx     # Adversarial challenge workbench & ranked hypotheses
│   │   │   ├── repair/page.tsx         # 101-point threshold sweep, cost matrix, policy export
│   │   │   └── report/page.tsx         # Certified incident report & direct PDF download
│   │   ├── learn/page.tsx              # Interactive ML reliability educational textbook
│   │   ├── settings/page.tsx           # Telemetry, theme, and API key configurations
│   │   └── api/                        # REST & Streaming SSE / NDJSON Route Handlers
│   │       ├── health/route.ts         # Service liveness check
│   │       ├── investigate/route.ts    # Streaming NDJSON Astra autonomous supervisor
│   │       ├── investigations/         # Session persistence endpoints
│   │       │   ├── route.ts            # GET (list) / POST (save) investigations
│   │       │   └── [id]/
│   │       │       ├── route.ts        # GET (fetch) / DELETE (unlink) session
│   │       │       ├── csv/route.ts    # GET raw dataset CSV for session
│   │       │       └── pdf/route.ts    # GET binary application/pdf incident report
│   │       ├── repair/route.ts         # Deterministic threshold sweep & policy optimizer
│   │       └── adversarial/route.ts    # Adversarial verification experiment execution
│   ├── core/                           # 100% Pure Deterministic Logic (Zero Framework Ties)
│   │   ├── domain/                     # Canonical Domain Model & Type Schemas
│   │   │   ├── schema.ts               # Functional schema validation combinators
│   │   │   ├── primitives.ts           # Branded IDs, measurements, cost policies
│   │   │   ├── validation.ts           # Structural schema validation functions
│   │   │   ├── types.ts                # Investigation aggregate domain types
│   │   │   ├── tool-contracts.ts       # Exact input/output schemas for all 10 tools
│   │   │   └── artifacts.ts            # Multi-artifact domain models & role schemas
│   │   ├── diagnostics/                # Pure TypeScript ML Diagnostic Engines
│   │   │   ├── classification-metrics.ts # Accuracy, recall, precision, F1, PR/ROC-AUC
│   │   │   ├── dataset-profiler.ts     # Schema profiling, prevalence, missingness
│   │   │   ├── column-profile.ts       # Statistical column summary generator
│   │   │   ├── threshold-sweep.ts      # 101-point threshold sweep & cost minimization
│   │   │   ├── calibration.ts          # Brier score, equal-width/frequency ECE bins
│   │   │   ├── leakage-scanner.ts      # Proxy target correlation & temporal leakage
│   │   │   ├── drift-tests.ts          # Kolmogorov-Smirnov, PSI, Wasserstein distance
│   │   │   ├── slice-evaluation.ts     # Subgroup slice disparity & performance gap
│   │   │   ├── counterfactual.ts       # Accuracy paradox counterfactual test
│   │   │   ├── repair-candidates.ts    # Threshold policy candidate generator
│   │   │   ├── repair-reevaluation.ts  # Identical-row before-vs-after re-evaluator
│   │   │   ├── flagship-melanoma.ts    # Instant offline flagship demo generator
│   │   │   ├── multi-site-shift.ts     # Multi-site covariate shift & disparity analysis
│   │   │   ├── regression-metrics.ts   # MAE, MSE, RMSE, R², residual distributions
│   │   │   ├── training-logs.ts        # Epoch parser for PyTorch, Keras, XGBoost, LightGBM
│   │   │   ├── training-diagnostics.ts # Overfitting gaps, loss divergence, early stopping
│   │   │   ├── split-contamination.ts  # Train/test duplicates, internal row duplicates
│   │   │   ├── model-metadata.ts       # Model hyperparameter & safe header parser
│   │   │   ├── capability.ts           # 9-point capability checklist & heuristic inference
│   │   │   ├── csv.ts                  # Delimited parser (CSV, TSV, ;, JSON, JSONL)
│   │   │   ├── evaluation-ingestion.ts # Dynamic CSV preview & mapped dataset loader
│   │   │   ├── multi-artifact-ingestion.ts # Ingest multiple files & validate relationships
│   │   │   └── reliability.ts          # 6-dimension reliability score calculation
│   │   ├── falsification/              # Adversarial Review & Hypothesis Engine
│   │   │   ├── falsification-engine.ts # Transitions hypotheses (supported/weakened/rejected)
│   │   │   ├── hypothesis-ranker.ts    # Sorts hypotheses by empirical support & confidence
│   │   │   ├── adversarial-review.ts   # 5-battery stress test suite
│   │   │   └── counterfactual-matrix.ts# Invariant balanced accuracy across prevalence shift
│   │   └── investigation/              # State Machine & Persistence
│   │       ├── state-machine.ts        # Pure immutable state transitions & stage derivation
│   │       └── store.ts                # Dual-layer storage (in-memory Map + .whylab disk)
│   ├── server/                         # Server-Side Orchestration, Export & Security
│   │   ├── orchestrator/               # Astra Autonomous Agent Supervisor
│   │   │   ├── investigator.ts         # Multi-turn autonomous investigation loop
│   │   │   ├── dispatcher.ts           # Dispatches tool calls to core diagnostic engines
│   │   │   ├── provider.ts             # Abstract provider interface & turn types
│   │   │   ├── provider-offline.ts     # Deterministic rule-based provider (zero token cost)
│   │   │   └── provider-openai.ts      # OpenAI Responses API provider (GPT-4o/GPT-5/Astra)
│   │   ├── export/                     # Report & Document Generation
│   │   │   ├── incident-report.ts      # Structured executive incident report generator
│   │   │   ├── markdown-export.ts      # Verified Markdown report exporter
│   │   │   └── pdf-generator.ts        # Pure TypeScript light-theme vector PDF 1.4 engine
│   │   └── security/                   # Security Hardening
│   │       ├── sanitizer.ts            # Path traversal prevention, HTML tag stripping
│   │       └── rate-limiter.ts         # Token-bucket rate limiter for API routes
│   └── ui/                             # Visual Presentation Tier
│       ├── context/                    # React Context Providers
│       │   └── theme-context.tsx       # Dark & Light theme state machine (zero FOUC)
│       ├── styles/                     # Pure Modular Vanilla CSS
│       │   ├── tokens.css              # Design tokens, color scales, typography, spacing
│       │   ├── dark-grid.css           # Developer-First dark grid canvas & surfaces
│       │   └── components.css          # Cards, buttons, tables, forms, badges, modals
│       └── components/                 # Reusable Presentation Components
│           ├── shell/                  # Application Shell & Navigation
│           │   ├── header.tsx          # Top navigation bar & mobile drawer menu
│           │   ├── footer.tsx          # System status footer & build info
│           │   ├── breadcrumbs.tsx     # Breadcrumb hierarchy navigation
│           │   └── theme-toggle.tsx    # Sun/Moon dual-theme toggle button
│           ├── ingest/                 # Stage 01 Ingest Components
│           │   ├── csv-dropzone.tsx    # Single-file drag-and-drop file upload
│           │   ├── multi-artifact-dropzone.tsx # Multi-file collection dropzone & role editor
│           │   ├── column-mapper.tsx   # Interactive column mapping & data preview table
│           │   └── capability-checklist.tsx # Real-time capability indicators
│           ├── evidence/               # Stage 02/03 Evidence Workspace Components
│           │   ├── evidence-workspace.tsx # Evidence collection & measurement list
│           │   ├── evidence-graph.tsx  # Interactive visual DAG of evidence relationships
│           │   ├── provenance-drawer.tsx # Detailed provenance metadata inspection
│           │   └── progressive-disclosure.tsx # Beginner vs Expert explanation toggles
│           ├── falsification/          # Stage 04 Falsification Components
│           │   └── adversarial-workbench.tsx # 5-battery adversarial verification testbed
│           ├── repair/                 # Stage 05 Repair Lab Components
│           │   ├── repair-workbench.tsx # Complete repair laboratory container
│           │   ├── threshold-sweep-chart.tsx # 101-point threshold sensitivity SVG chart
│           │   ├── cost-matrix-controls.tsx # Interactive domain cost penalty controls
│           │   ├── before-after-table.tsx # Side-by-side row-level re-evaluation comparison
│           │   └── policy-exporter.tsx # Downloadable Python & JSON decision rules
│           ├── report/                 # Stage 06 Incident Report Components
│           │   └── incident-report-view.tsx # Executive report viewer & direct PDF download
│           └── settings/               # System Configuration Components
│               └── appearance-card.tsx # Theme preview & visual preference controls
└── tests/                              # Comprehensive Test Suite (112 Tests)
    ├── unit/                           # 26 Unit Test Suites
    │   ├── classification-metrics.test.mjs # Confusion matrix, Wilson score, AUC
    │   ├── dataset-profiler.test.mjs   # Schema analysis, missingness, prevalence
    │   ├── threshold-sweep.test.mjs    # 101-point threshold sweep & cost minimum
    │   ├── calibration.test.mjs        # Brier score, quantile bins, calibration curve
    │   ├── leakage-scanner.test.mjs    # Correlation scanner, proxy leakage detection
    │   ├── drift-tests.test.mjs        # Kolmogorov-Smirnov, PSI, Wasserstein tests
    │   ├── slice-evaluation.test.mjs   # Subgroup slicing & sample size floors
    │   ├── counterfactual.test.mjs     # Accuracy paradox counterfactual testing
    │   ├── repair-lab.test.mjs         # Threshold candidate generator & re-evaluation
    │   ├── falsification.test.mjs      # Hypothesis ranking & status transitions
    │   ├── domain-schemas.test.mjs     # Branded IDs, measurement schemas, validation
    │   ├── custom-dataset-ingestion.test.mjs # Delimited parsing, auto-mapping, labels
    │   ├── custom-dataset-investigation.test.mjs # Dynamic execution on user datasets
    │   ├── session-persistence.test.mjs# Disk storage, CSV retrieval, fixture fallback
    │   ├── pdf-export.test.mjs         # Vector PDF binary structure & layout checks
    │   ├── multi-artifact-ingestion.test.mjs # Multi-file ingestion & relationship checks
    │   ├── multi-site-shift.test.mjs   # Multi-site covariate shift detection
    │   ├── regression-metrics.test.mjs # MAE, MSE, RMSE, R², residual analysis
    │   ├── training-diagnostics.test.mjs # Overfitting, loss divergence, epoch parsing
    │   ├── orchestrator.test.mjs       # Autonomous supervisor loop & mid-turn steering
    │   └── evidence-ux.test.mjs        # Provenance tracking & DAG construction
    ├── integration/                    # Integration Test Suites
    │   ├── full-pipeline.test.mjs      # Ingest → Profile → Investigate → Repair → Report
    │   └── multi-artifact-lifecycle.test.mjs # Multi-artifact lifecycle & cross-validation
    ├── regression/                     # Regression Test Suites
    │   └── golden-regression.test.mjs  # All 7 golden benchmarks pass without regression
    └── security/                       # Security & Threat Verification
        └── sanitization-and-limits.test.mjs # Path traversal, HTML injection, file limits
```

---

## 5. Domain Model, Schemas & Data Invariants

WhyLab 2.0 uses a strictly typed domain model defined in `src/core/domain/`:

### 5.1 Branded Identifiers (`src/core/domain/primitives.ts`)
All domain entities utilize strongly typed branded string identifiers to prevent cross-entity ID contamination:
```typescript
export type Id<K extends string> = string & { readonly __brand: K };

export function createId<K extends string>(kind: K): Id<K> {
  const uuid = crypto.randomUUID();
  return `${kind.slice(0, 4)}_${uuid}` as Id<K>;
}
```
Standard prefixes: `inve_` (Investigation), `sour_` (Source), `data_` (Dataset), `arti_` (Artifact), `evid_` (Evidence), `tool_` (Tool Result), `hypo_` (Hypothesis), `veri_` (Verification Experiment), `repa_` (Repair Candidate), `comp_` (Before-After Comparison), `diag_` (Diagnosis).

### 5.2 The Unified Investigation Aggregate (`src/core/domain/types.ts`)
The root state aggregate encapsulates the entire scientific record of an investigation:
```typescript
export interface Investigation {
  id: Id<'investigation'>;
  status: 'draft' | 'running' | 'completed' | 'stopped' | 'failed';
  objective: string;
  createdAt: string;
  updatedAt: string;
  sources: Source[];
  datasets: DatasetMetadata[];
  toolCalls: DiagnosticToolCall[];
  toolResults: DiagnosticToolResult[];
  evidence: Evidence[];
  hypotheses: Hypothesis[];
  experiments: VerificationExperiment[];
  repairs: RepairCandidate[];
  comparisons: BeforeAfterComparison[];
  diagnosis: Diagnosis | null;
}
```

### 5.3 Honest Measurement Representation
Measurements are never represented as raw bare numbers; they are wrapped in an explicit state object:
```typescript
export type Measurement =
  | { name: string; status: 'measured'; value: number; unit?: string; confidenceInterval?: [number, number] }
  | { name: string; status: 'undefined'; reason: string }
  | { name: string; status: 'insufficient_evidence'; reason: string };
```
*Key Invariant:* When a metric cannot be calculated (e.g., Precision when True Positives + False Positives = 0), WhyLab records `{ status: 'undefined', reason: 'Zero positive predictions' }` instead of returning `0.0`, `NaN`, or inventing a score.

### 5.4 Multi-Artifact Domain Roles (`src/core/domain/artifacts.ts`)
WhyLab recognizes nine distinct artifact roles:
- `training`: Historical dataset used to train the model.
- `validation`: Hold-out dataset used for model tuning and selection.
- `evaluation`: Model test dataset containing actual labels and model predictions.
- `production`: Live unlabelled or delayed-label incoming inference stream.
- `reference`: Baseline golden population used for drift comparison.
- `predictions`: Companion export containing model outputs and logits.
- `ground_truth`: Audited labels from human review or delayed observations.
- `training_log`: Epoch-by-epoch loss and metric output from ML frameworks.
- `model_metadata`: JSON export detailing hyperparameters, seeds, and architecture.

---

## 6. Deterministic Diagnostic Engine (The 10 Core Tools)

All diagnostic tools live in `src/core/diagnostics/` and execute as 100% pure TypeScript functions with zero external dependencies.

```
                              ┌─────────────────────────────┐
                              │     EVALUATION DATASET      │
                              └──────────────┬──────────────┘
                                             │
               ┌─────────────────────────────┼─────────────────────────────┐
               ▼                             ▼                             ▼
    ┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
    │ Classification Math  │      │   Dataset Profiler   │      │ Threshold Sweeper    │
    │  - Confusion Matrix  │      │  - Class Prevalence  │      │  - 101 Sweep Points  │
    │  - Minority Recall   │      │  - Missingness Rate  │      │  - Domain Cost Ratio │
    │  - Wilson Intervals  │      │  - Column Schemas    │      │  - Optimal Cutoff    │
    │  - PR-AUC & ROC-AUC  │      └──────────────────────┘      └──────────────────────┘
    └──────────────────────┘                 │                             │
               │                             ▼                             ▼
               │                  ┌──────────────────────┐      ┌──────────────────────┐
               │                  │  Drift & Multi-Site  │      │ Calibration Engine   │
               │                  │  - 2-Sample KS Test  │      │  - Brier Score       │
               │                  │  - PSI & Wasserstein │      │  - Equal-Width Bins  │
               │                  │  - Site Disparity    │      │  - Quantile Bins     │
               │                  └──────────────────────┘      └──────────────────────┘
               ▼                             │                             │
    ┌──────────────────────┐                 ▼                             ▼
    │ Falsification Test   │      ┌──────────────────────┐      ┌──────────────────────┐
    │  - Paradox Falsifier │      │ Subgroup Slice Tool  │      │ Leakage Scanner      │
    │  - Prevalence Shift  │      │  - Slice Disparity   │      │  - Correlation Proxy │
    │  - Invariant Bal Acc │      │  - Sample Size Floor │      │  - Temporal Leaks    │
    └──────────────────────┘      └──────────────────────┘      └──────────────────────┘
```

### Tool 1: `compute_classification_metrics` (`classification-metrics.ts`)
- **Inputs:** True labels, discrete predicted labels, optional probabilities.
- **Formulas:**
  - $TP, FP, TN, FN$ hand-verifiable count reduction.
  - Accuracy: $(TP + TN) / (TP + FP + TN + FN)$
  - Sensitivity / Recall: $TP / (TP + FN)$
  - Specificity: $TN / (TN + FP)$
  - Precision: $TP / (TP + FP)$ (or undefined if $TP + FP = 0$)
  - Balanced Accuracy: $(Sensitivity + Specificity) / 2$
  - F1 Score: $2 \cdot (Precision \cdot Recall) / (Precision + Recall)$
  - Minority Class Recall: Isolated recall evaluated exclusively on the class with $<50\%$ prevalence.
  - Wilson Score 95% Confidence Intervals: Evaluates uncertainty bounds on proportions.
  - PR-AUC & ROC-AUC: Trapezoidal integration with exact tie-breaking handling.

### Tool 2: `profile_dataset` (`dataset-profiler.ts`)
- Evaluates total row count, distinct values, missingness percentage, numeric ranges (minimum, maximum, mean), and class prevalence ratios.
- Automatically flags severe class imbalance when positive class prevalence falls below 35% or above 65%.

### Tool 3: `threshold_sweep` (`threshold-sweep.ts`)
- Sweeps decision cutoffs $T \in [0.00, 1.00]$ in 101 discrete 0.01 increments.
- Evaluates complete confusion matrix at every single threshold.
- Evaluates Expected Cost Function:
  $$\text{Expected Cost} = (FN \cdot \text{Cost}_{FN}) + (FP \cdot \text{Cost}_{FP}) + (TP \cdot \text{Cost}_{TP}) + (TN \cdot \text{Cost}_{TN})$$
- Deterministically identifies the exact cost-minimizing operating threshold.

### Tool 4: `check_calibration` (`calibration.ts`)
- Partitions continuous confidence scores into 10 equal-width or equal-frequency bins.
- Measures mean predicted probability vs empirical observed frequency per bin.
- Calculates Brier Score:
  $$\text{Brier} = \frac{1}{N} \sum_{i=1}^N (p_i - y_i)^2$$
- Flags overconfident models whose confidence scores cluster near 1.0 despite low empirical accuracy.

### Tool 5: `scan_feature_leakage` (`leakage-scanner.ts`)
- Calculates Pearson and Spearman rank correlation between all features and the target label.
- Detects proxy target leakage ($r > 0.95$) where post-hoc outcome variables contaminate training features.
- Audits timestamp columns to catch temporal ordering violations (features recorded after outcome time).

### Tool 6: `slice_evaluation` (`slice-evaluation.ts`)
- Partitions the evaluation dataset by categorical metadata attributes (e.g., `hospital_site`, `imaging_device`, `age_group`).
- Enforces a minimum sample size floor (default $N \ge 5$) to prevent misleading micro-sample statistics.
- Computes performance disparities across slices (e.g., Site A recall = 95%, Site B recall = 0%).

### Tool 7: `run_drift_tests` (`drift-tests.ts`)
- Compares numerical distributions between Reference and Production/Comparison splits.
- Computes:
  - Two-Sample Kolmogorov-Smirnov (KS) test: Maximum vertical distance between empirical CDFs.
  - Population Stability Index (PSI): Bin-by-bin divergence ($\text{PSI} > 0.25$ indicates significant drift).
  - Wasserstein Distance (Earth Mover's Distance).

### Tool 8: `run_counterfactual_test` (`counterfactual.ts`)
- Adversarially tests the **Accuracy Paradox Hypothesis**:
  *Did top-line accuracy remain high merely because majority class dominance masked minority failure?*
- Evaluates what aggregate accuracy would be if class prevalence were balanced ($50/50$), proving whether the model's accuracy degrades under distribution shift.

### Tool 9: `generate_repair_candidate` (`repair-candidates.ts`)
- Discovers the optimal decision policy threshold that either:
  1. Satisfies a minimum minority recall target (e.g., $\ge 80\%$) while maximizing precision.
  2. Minimizes financial or clinical penalty under a custom Domain Cost Matrix.

### Tool 10: `re_evaluate_repair` (`repair-reevaluation.ts`)
- Re-evaluates baseline default threshold ($0.50$) vs the proposed repaired threshold (e.g., $0.19$) **strictly on identical dataset rows**.
- Zero synthetic interpolation: every recalculated TP, FP, TN, and FN is derived from actual observed rows.

---

## 7. Adversarial Verification & Falsification Engine

Located in `src/core/falsification/`, this engine embodies the scientific method:

```
               ┌────────────────────────────────────────────────────────┐
               │              FORMULATED HYPOTHESIS                     │
               │   "Accuracy masks minority class omission failure"    │
               └───────────────────────────┬────────────────────────────┘
                                           │
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │           5-BATTERY ADVERSARIAL CHALLENGE              │
               ├────────────────────────────────────────────────────────┤
               │ 1. Prevalence Shift Stress Test (5% ➔ 50% shift)       │
               │ 2. Subgroup Disparity Gap Test (Slice disparities)     │
               │ 3. Noise & Perturbation Tolerance (Score stability)    │
               │ 4. Calibration & Confidence Audit (Brier score)        │
               │ 5. Threshold Operating Margin (101-point sweep)        │
               └───────────────────────────┬────────────────────────────┘
                                           │
                     ┌─────────────────────┼─────────────────────┐
                     ▼                     ▼                     ▼
              [ SUPPORTED ]          [ WEAKENED ]          [ REJECTED ]
         Confirmed root cause.   Partial evidence;      Falsified by
         Promote to Repair Lab.  run slice evaluation.  empirical data.
```

### The Hypothesis State Machine (`falsification-engine.ts`)
Hypotheses advance through strict empirical verification criteria:
- `proposed`: Stated by Astra based on initial evidence.
- `supported`: Passed adversarial counterfactual tests with empirical proof.
- `weakened`: Partially challenged; evidence indicates effect may be localized to specific slices.
- `rejected`: Disproven by empirical metrics.
- `confirmed`: Verified as the primary root cause and integrated into the final incident report.

---

## 8. Astra Autonomous Orchestrator & Multi-Turn Loop

Located in `src/server/orchestrator/`, Astra drives the investigation:

### 8.1 The Autonomous Loop (`investigator.ts`)
The orchestrator runs an asynchronous generator yielding real-time NDJSON event messages:
```typescript
export async function* runAutonomousInvestigation(
  dataset: EvaluationDataset,
  options: InvestigatorOptions = {}
): AsyncGenerator<InvestigationEventMessage, Investigation, void>
```

#### Event Stream Protocol:
1. `started`: Emits session ID and objective.
2. `progress`: Current round number, maximum rounds (default 16), active stage.
3. `directive_injected`: Acknowledges user steering instructions.
4. `tool_call`: Dispatched tool name, input arguments, and rationale.
5. `tool_result`: Tool output status and execution metrics.
6. `evidence_added`: Immutable evidence item added to graph.
7. `hypothesis_added`: New hypothesis entered into falsification DAG.
8. `experiment_added`: Adversarial verification experiment result.
9. `repair_added`: Proposed threshold optimization candidate.
10. `comparison_added`: Before-vs-after identical-row re-evaluation.
11. `diagnosis_finalized`: Root cause diagnosis confirmed.
12. `completed`: Investigation finalized, saved to disk, and certified.

### 8.2 Dual Provider Architecture
1. **Offline Deterministic Provider (`provider-offline.ts`):**
   - Implements a rule-based decision tree that analyzes actual dataset metadata and evidence.
   - Requires zero API keys and incurs zero token costs.
   - Powers continuous integration and automated test suites.
2. **OpenAI Astra Provider (`provider-openai.ts`):**
   - Uses OpenAI Responses API with structured tool schemas.
   - Operates when `OPENAI_API_KEY` is configured.

### 8.3 Mid-Turn User Steering
While Astra is executing in the background, users can inject natural-language directives (e.g., *"Check calibration and Brier score"* or *"Evaluate disparity across hospital sites"*). Astra ingests these directives on the next turn, seamlessly adjusting its tool dispatch without losing previously gathered evidence.

---

## 9. Investigation Lifecycle & State Machine

The investigation state transitions deterministically through 6 formal stages managed by `src/core/investigation/state-machine.ts`:

```
[01 INGEST] ───► [02 PROFILE] ───► [03 INVESTIGATE] ───► [04 VERIFY] ───► [05 REPAIR] ───► [06 REPORT]
 Upload CSV/LOG    Class Imbalance   Astra Tool Loop       Falsification DAG   101 Sweep + Cost   Certified PDF
 Schema Mapping    Missingness %     NDJSON Streaming      Hypothesis Rank     Policy Export      Audit Attestation
```

### Dynamic Stage Derivation (`deriveInvestigationStage`)
Stage progression is computed functionally from the state of the `Investigation` aggregate:
- If `diagnosis` exists &rarr; **`report` (Stage 06)**
- Else if `repairs.length > 0` &rarr; **`repair` (Stage 05)**
- Else if `experiments.length > 0` &rarr; **`verify` (Stage 04)**
- Else if `hypotheses.length > 0` &rarr; **`investigate` (Stage 03)**
- Else if `toolResults.length > 0` &rarr; **`profile` (Stage 02)**
- Else &rarr; **`ingest` (Stage 01)**

---

## 10. Session Persistence & Storage Architecture

Implemented in `src/core/investigation/store.ts`:

### 10.1 Dual-Layer Storage Engine
1. **In-Memory Cache:** Fast `Map<string, Investigation>` for zero-latency retrieval during active user sessions.
2. **Filesystem Persistence:**
   - Saved under `.whylab/investigations/`:
     - `${id}.json`: The complete serialized `Investigation` aggregate.
     - `${id}.csv`: The raw dataset CSV text uploaded by the user.
     - `${id}_artifacts.json`: Multi-artifact metadata and file inventory.

### 10.2 Fixture Fallback
When a benchmark investigation is requested (e.g., `inv_melanoma`), the store automatically resolves missing raw CSVs by falling back to `public/fixtures/`, ensuring seamless reproducibility across dev and production.

---

## 11. The Six-Stage Investigation Workflow (User Journey)

### Stage 01: Ingest (`/investigate`)
- **Upload Dropzone:** Drag and drop single files or multi-artifact collections (`.CSV`, `.TSV`, `.JSON`, `.JSONL`, `.LOG`). Max 2.0 MB per file.
- **Role Assignment:** Set artifact roles (`Evaluation`, `Model Predictions`, `Reference Baseline`, `Training Log`, etc.).
- **Column Mapping:** Map Ground Truth (Actual), Discrete Model Prediction, Continuous Probability Score, and Subgroup Slice columns.
- **Partial Evidence Handling:** If a dataset has labels but no predictions (e.g., Kaggle disaster tweets), WhyLab detects this honestly, presents a `-- None (Data Profiling & Quality Only) --` option, and enables Stage 02 Data Profiling without crashing.
- **Capability Checklist:** Live assessment of 9 capabilities with beginner-to-expert explanations.

### Stage 02: Profile (`/investigate` - Tab 02)
- Inspect high-level metrics: total rows, feature count, positive class prevalence.
- Column statistics table: missingness percentages, distinct counts, min/mean/max bounds.
- Severe imbalance warnings triggered when minority prevalence $<35\%$.

### Stage 03: Investigate (`/investigate` - Tab 03)
- Click **"Launch Autonomous Investigation"**.
- Astra Telemetry Console expands into a 2-column split.
- Live NDJSON terminal displays real-time tool calls, outputs, and hypothesis formulations.
- Mid-turn steering input allows users to redirect the investigation in flight.

### Stage 04: Verify (`/investigations/[id]/hypotheses`)
- Review ranked hypotheses categorized into **Supported**, **Weakened**, and **Rejected**.
- 5-Battery Adversarial Verification Workbench:
  - Prevalence Shift Stress Test (degrades under synthetic prevalence shift).
  - Subgroup Disparity Gap (measures performance delta across slice partitions).

### Stage 05: Repair Lab (`/investigations/[id]/repair`)
- **101-Point Threshold Sensitivity Curve:** Interactive SVG chart displaying Precision, Recall, TP, and FN across all cutoffs from $0.00$ to $1.00$.
- **Domain Cost Matrix:** Sliders for Cost of False Negative ($FN), Cost of False Positive ($FP), etc.
- **Before-vs-After Table:** Recalculated on identical rows (e.g., Recall lifts from 22.4% &rarr; 84.8%, False Negatives plummet from 776 &rarr; 152).
- **Export Decision Policy:** 1-click download of production Python decision functions and JSON rules.

### Stage 06: Report (`/investigations/[id]/report`)
- Executive incident summary with verified root cause.
- Cryptographic SHA-256 data digest ensuring audit immutability.
- Multi-Artifact Evidence Inventory table.
- Recommended automated CI/CD Quality Gate assertions.
- **One-Click Download Certified PDF:** Direct download of light-theme vector PDF.

---

## 12. User Interface, Theme System & Responsive Design

### 12.1 Developer-First Dark Grid Design System
WhyLab's visual interface is built with pure Vanilla CSS in `src/ui/styles/`:
- `tokens.css`: Strict design tokens for typography, spacing, border radii, and WCAG AAA colors.
- `dark-grid.css`: Subtle matrix grid background (`var(--bg-canvas)` with 24px grid overlay).
- `components.css`: Form inputs, selects with dark option dropdowns, cards, sticky tables, and responsive grids.

### 12.2 Dual-Theme System Parity (`src/ui/context/theme-context.tsx`)
- First-class support for both **Dark Theme** (`data-theme="dark"`) and **Light Theme** (`data-theme="light"`).
- Synchronizes seamlessly across `localStorage`, custom user events, and system preferences.
- **Zero-FOUC (Flash of Unstyled Content):** Guaranteed by an inline synchronous script in `src/app/layout.tsx`.
- All charts (`ThresholdSweepChart`) dynamically adjust axis colors, grid borders, and canvas surfaces based on active theme variables.

### 12.3 Responsive Layouts (<768px Mobile to >1440px Ultrawide)
- Fluid layout architecture replacing rigid pixel widths with `minmax(0, 1fr)` and `overflow-x: auto`.
- Header navigation features an interactive mobile hamburger drawer menu supporting all subroutes.

---

## 13. Export Engine: Light-Theme Vector PDF & Markdown

Located in `src/server/export/`:

### 13.1 Dedicated Pure-TypeScript Vector PDF Engine (`pdf-generator.ts`)
- **Zero Dependencies:** Emits valid PDF 1.4 binary streams directly without Chromium or Puppeteer.
- **Professional Light Theme:** Pure white/light canvas (`#FFFFFF` / `#F8FAFC`), deep navy headers (`#0F172A`), slate typography, bordered tables, and color-coded status badges (Critical `#DC2626`, Warning `#D97706`, Success `#16A34A`, Info `#2563EB`).
- **Dynamic Multi-Line Text Wrapping:** Cells automatically word-wrap within column bounds (`colWidth - 12pt`), dynamically expanding row heights to eliminate text collision.
- **Table Pagination Engine:** Tables crossing page boundaries cleanly split, automatically re-rendering table headers on subsequent pages.
- **Running Headers & Footers:** Features running title, cryptographic verification seal, and exact page numbering (`Page X of Y`).
- **Filename Standardization:** Downloaded as `WhyLab_Incident_Report_<investigation_id>.pdf`.

### 13.2 Markdown Export (`markdown-export.ts`)
- Exports clean GitHub-flavored markdown with embedded multi-artifact inventories, metric cards, and remediation policies.

---

## 14. Security, Sanitization & Resource Quotas

Located in `src/server/security/`:

1. **Path Traversal Protection (`sanitizer.ts`):**
   - Strictly sanitizes all user-supplied investigation IDs and filenames (`sanitizeId`, `sanitizePath`).
   - Prevents `../` directory escapes and path traversal attacks.
2. **HTML & Script Sanitization:**
   - Strips malicious HTML and `<script>` tags from user directives and metadata strings.
3. **Safe Model Binary Rejection (`model-metadata.ts`):**
   - Detects unsafe serialized model files (`.pkl`, `.joblib`, `.pt`, `.h5`) and rejects execution to prevent arbitrary code execution vulnerabilities (CWE-502).
   - Instructs users to export safe predictions CSVs and metric logs instead.
4. **Rate Limiting (`rate-limiter.ts`):**
   - In-memory token-bucket rate limiter enforcing request thresholds across all API routes.
5. **Payload Size Boundaries:**
   - 2.0 MB per-file upload boundary enforced at both client dropzone and server route layers.

---

## 15. All Application Routes & API Endpoints

### 15.1 Frontend Application Routes
| Route | Component | Purpose |
| :--- | :--- | :--- |
| `/` | `src/app/page.tsx` | Platform introduction, interactive architecture overview, quick-start links. |
| `/workspace` | `src/app/workspace/page.tsx` | Dynamic recent investigations grid, golden benchmark catalog launcher. |
| `/investigate` | `src/app/investigate/page.tsx` | Studio: Ingest, Profile, Investigate, live Astra telemetry, steering. |
| `/investigations/[id]` | `src/app/investigations/[id]/page.tsx` | Investigation executive overview, metric tension cards, repair lift summary. |
| `/investigations/[id]/evidence` | `src/app/investigations/[id]/evidence/page.tsx` | Evidence measurement inventory, provenance drawer, visual DAG. |
| `/investigations/[id]/hypotheses`| `src/app/investigations/[id]/hypotheses/page.tsx`| Ranked hypotheses, 5-battery adversarial review workbench. |
| `/investigations/[id]/repair` | `src/app/investigations/[id]/repair/page.tsx` | 101-point threshold sweep chart, cost matrix controls, policy export. |
| `/investigations/[id]/report` | `src/app/investigations/[id]/report/page.tsx` | Cryptographically attested report, CI/CD gates, direct PDF download. |
| `/learn` | `src/app/learn/page.tsx` | Educational guide to ML failures (Accuracy Paradox, Miscalibration, Leakage). |
| `/settings` | `src/app/settings/page.tsx` | Visual appearance controls, OpenAI API keys, telemetry preferences. |

### 15.2 REST & Streaming API Endpoints
| HTTP Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Returns service health status and timestamp. |
| `POST` | `/api/investigate` | Dispatches Astra autonomous investigator; streams live NDJSON events. |
| `GET` | `/api/investigations` | Returns summary list of all stored investigations. |
| `POST` | `/api/investigations` | Persists a completed investigation aggregate and raw CSV to disk. |
| `GET` | `/api/investigations/[id]` | Retrieves single investigation aggregate by ID. |
| `DELETE` | `/api/investigations/[id]` | Deletes investigation aggregate and unlinks disk files. |
| `GET` | `/api/investigations/[id]/csv`| Downloads raw dataset CSV associated with the investigation. |
| `GET` | `/api/investigations/[id]/pdf`| Generates and downloads binary `application/pdf` incident report. |
| `POST` | `/api/repair` | Computes 101-point threshold sweep and cost optimization. |
| `POST` | `/api/adversarial` | Executes adversarial verification experiments on specified dataset. |

---

## 16. Test Suite, Benchmarks & Quality Assurance

WhyLab 2.0 maintains a 100% passing test suite across 112 automated tests:

### 16.1 Test Execution Command
```bash
npm test
# Equivalent to: node --test tests/**/*.test.mjs
```

### 16.2 Quality Verification Gates
- **112/112 Automated Tests Pass** (0 failed, 0 skipped, execution duration ~18s).
- **TypeScript Strict Check:** `npm run typecheck` (`tsc --noEmit`) passes with **0 errors**.
- **ESLint Validation:** `npm run lint` passes with **0 errors**.
- **Next.js Production Build:** `npm run build` succeeds cleanly across all 19 routes.

### 16.3 Built-in Golden Benchmark Fixtures
| Fixture Filename | Domain & Task | Rows | Documented Failure Mode |
| :--- | :--- | :--- | :--- |
| `melanoma-synthetic.csv` | Clinical Dermatology | 20,000 | 94.2% Accuracy masks 22.4% Malignant Recall (Accuracy Paradox). |
| `kaggle_icu_sepsis_benchmark.csv` | ICU Critical Care | 10,000 | 91.8% Accuracy masks 18.2% Sepsis Recall; 20x False Negative cost. |
| `kaggle_stroke_dataset.csv` | Patient EHR | 5,110 | Extreme imbalance (1.8% positive prevalence); 4.3% Sensitivity. |
| `overconfident-classifier.csv` | Clinical Predictor | 8,400 | Brier score 0.182, ECE 0.141; confidence near 0.95 vs 60% accuracy. |
| `site-failure.csv` | Multi-Site Radiology | 12,500 | Site A accuracy 96% vs Site B accuracy 61% (Scanner hardware shift). |
| `kaggle_disaster_tweets.csv` | Emergency NLP | 7,613 | Vocabulary covariate drift (KS 0.38, PSI 0.29); labels without predictions. |
| `icu_model_training.log` | Deep Learning Training | 50 Epochs | PyTorch training log displaying diverging validation loss (Overfitting). |

---

## 17. Implementation History & Milestone Progression

The evolution of WhyLab 2.0 occurred across two major phases and 20 distinct milestones:

### Phase 1: Rebuild & Custom Dataset Parity (Milestones A &rarr; G)
- **Milestone A (Audit & Root Cause Analysis):** Purged 12,202 lines of legacy CSS, eliminated obsolete `cases.ts` state, and banned hardcoded fallback scores.
- **Milestone B (Unified Dataset Architecture & Ingestion):** Implemented `capability.ts`, generalized `evaluation-ingestion.ts`, and built the Dropzone and Column Mapper.
- **Milestone C (Session Persistence & Recent Investigations):** Created `.whylab/` disk store, REST persistence endpoints, and dynamic workspace cards.
- **Milestone D (Unified 6-Stage Execution):** Generalized the offline Astra orchestrator to dynamically ingest user-mapped datasets.
- **Milestone E (Visualization Parity & Dynamic Subroutes):** Dynamically bound all measurements across `overview`, `evidence`, `hypotheses`, and `repair` pages.
- **Milestone F (Professional Direct-Download PDF Export):** Created the pure TypeScript vector PDF generator with light theme and download action.
- **Milestone G (Comprehensive Hardening):** Validated end-to-end custom dataset lifecycle and benchmark regression safety.

### Phase 2: Universal ML Investigation Platform (Milestones 1 &rarr; 13)
- **Milestones 1–3 (Multi-Artifact Hierarchy & Parsers):** Implemented `artifacts.ts`, multi-format parsing (CSV, TSV, JSONL), PyTorch/Keras/XGBoost log parsers, and CWE-502 model binary security checks.
- **Milestones 4–5 (Expanded Capabilities & Diagnostics):** Added regression metrics (MAE/MSE/RMSE/R²), training diagnostics (overfitting gaps), and split contamination detectors.
- **Milestones 6–9 (Orchestrator, Repair & Multi-Artifact Persistence):** Integrated multi-artifact payloads into Astra streaming and persisted artifact inventories to disk.
- **Milestones 11–13 (Device Fitting, Theme Parity & PDF Polish):** Implemented mobile navigation drawers, light/dark theme system parity, multi-line PDF text wrapping, and page-split table headers.

---

## 18. Developer Guide: How to Make Changes Safely

When modifying or extending WhyLab 2.0, adhere strictly to the following workflows:

### 18.1 Adding a New Diagnostic Tool
1. **Define the Schema Contract:**
   - In `src/core/domain/tool-contracts.ts`, add your tool's input and output schema to `toolSchemas`.
2. **Implement Pure Mathematics:**
   - In `src/core/diagnostics/`, create `your-tool.ts`.
   - Ensure the function is 100% pure TypeScript, deterministic, and returns explicit `Measurement` objects.
3. **Register in Dispatcher:**
   - In `src/server/orchestrator/dispatcher.ts`, add the execution branch in `dispatchDiagnosticTool`.
4. **Update Capabilities Engine:**
   - In `src/core/diagnostics/capability.ts`, add your capability identifier to `evaluateCapabilities`.
5. **Add Automated Unit Tests:**
   - In `tests/unit/`, create `your-tool.test.mjs` verifying boundary cases, zero division, and mathematical correctness.

### 18.2 Adding or Modifying UI Components
1. **Adhere to the Vanilla CSS Design System:**
   - Use design tokens from `src/ui/styles/tokens.css` (e.g., `var(--bg-surface)`, `var(--text-primary)`, `var(--space-4)`).
   - Avoid inline hex codes or arbitrary pixel margins.
   - Do NOT introduce Tailwind CSS.
2. **Ensure Dual-Theme Parity:**
   - Verify all surfaces look crisp in both Dark Theme and Light Theme.
   - Ensure WCAG AAA text contrast.
3. **Ensure Responsive Fitting:**
   - Wrap data tables in `overflow-x: auto` containers.
   - Use CSS Grid with `minmax(0, 1fr)`.

### 18.3 Pre-Commit Quality Checklist
Before committing any changes, run the full verification pipeline:
```bash
# 1. Run all 112 unit, integration, and security tests
npm test

# 2. Verify strict TypeScript compliance
npm run typecheck

# 3. Verify ESLint compliance
npm run lint

# 4. Verify Next.js production build
npm run build
```

---

*WhyLab 2.0 Architectural Manual — Maintained by the Core Engineering Team.*

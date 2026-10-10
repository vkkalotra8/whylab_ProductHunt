# WhyLab 2.0 — Custom Dataset Investigation & Professional PDF Export
## Implementation Progress & Milestone Tracking

**Document Status:** Active Execution Log  
**Current Milestone:** Milestone A (Completed) &rarr; Milestone B (In Progress)  
**Architectural Goal:** Eliminate differences between built-in benchmarks and user-uploaded datasets. First-class custom dataset ingestion, flexible column mapping, capability awareness, persistent sessions, honest reporting, and direct light-theme PDF download.

---

## Milestone Execution Status

| Milestone | Title | Status | Quality Gates / Tests |
| :---: | :--- | :---: | :--- |
| **A** | **Audit & Root-Cause Analysis** | **COMPLETED** | Repository-wide root-cause analysis documented |
| **B** | **Unified Dataset Architecture & Ingestion** | **COMPLETED** | Flexible mapping, validation, capability detection, preview, 84/84 tests pass |
| **C** | **Session Persistence & Recent Investigations** | **COMPLETED** | Filesystem storage in `.whylab/`, API routes, dynamic workspace grid, 86/86 tests |
| **D** | **Unified 6-Stage Investigation Execution** | **IN PROGRESS** | Stages 01-06 dynamic execution, custom upload in Studio, generalized Astra |
| **E** | **Visualization Parity & Capability-Aware UI** | **PENDING** | Charts, empty/unavailable states, progressive disclosure |
| **F** | **Professional Direct-Download PDF Export** | **PENDING** | Light-theme PDF generator, charts, pagination, direct download |
| **G** | **Comprehensive Testing & Hardening** | **PENDING** | Unit, integration, regression, security, build verification |

---

## Milestone B: Unified Dataset Architecture & Ingestion (Completed)

### Delivered Capabilities:
1. **Capability Evaluation Engine (`src/core/diagnostics/capability.ts`):**
   - Implemented task type detection (`binary_classification`, `multiclass_classification`, `regression`, `raw_features_no_predictions`, `unknown`).
   - Implemented heuristic column mapping inference (`inferColumnMapping`) for target, prediction, probability, id, and slice columns.
   - Implemented binary class label auto-inference (`inferBinaryLabels`).
   - Implemented 9-point capability checklist (`evaluateCapabilities`): `binary_metrics`, `probability_metrics`, `threshold_sweep`, `probability_calibration`, `counterfactual_paradox`, `slice_evaluation`, `feature_leakage`, `distribution_drift`, `repair_lab`.
   - Each capability reports explicit status (`available` | `unavailable` | `unsupported`), reasons, and beginner-to-expert explanations on how to enable.
2. **Generalized CSV Ingestion (`src/core/diagnostics/evaluation-ingestion.ts`):**
   - Added `columnMapping` to `EvaluationOptions` (`targetColumn`, `predictionColumn`, `probabilityColumn`, `sliceColumns`, `idColumn`).
   - Supported optional probability scores (`positiveProbability: number | null`). Datasets with only discrete labels evaluate discrete metrics while disabling probability-dependent analyses without crashing.
   - Supported custom positive class labels.
   - Built `previewEvaluationCsv(text, name)` returning first rows preview, column statistics, inferred mapping, detected labels, and capability status.
3. **Generalization of Diagnostic Tools:**
   - Updated `dataset-profiler.ts` to operate on any mapped target/prediction/probability columns rather than hardcoded `y_true`/`y_pred`/`y_probability`.
   - Updated `slice-evaluation.ts` to slice by any custom metadata attribute column.
4. **Ingestion UI Components (`src/ui/components/ingest/`):**
   - `csv-dropzone.tsx`: Drag & drop file upload with size limits, UTF-8 checks, and instant parsing.
   - `column-mapper.tsx`: Live 5-row preview table, role badges, mapping dropdowns, and positive label selector.
   - `capability-checklist.tsx`: Real-time capability indicators with progressive disclosure (Assessment + How to enable).
5. **Quality Gates Passed:**
   - 84/84 tests pass (`tests/unit/custom-dataset-ingestion.test.mjs` added with 5 new unit tests).
   - `npm run typecheck`: 0 errors.
   - `npm run lint`: 0 errors, 0 warnings.

---

## Milestone C: Session Persistence & Recent Investigations (Completed)

### Delivered Capabilities:
1. **Persistent Investigation Store (`src/core/investigation/store.ts`):**
   - Implemented dual-layer persistence (in-memory Map cache + filesystem JSON under `.whylab/investigations/<id>.json`).
   - Added raw CSV persistence (`.whylab/investigations/<id>.csv`), allowing custom dataset evaluations to be re-run across browser refreshes and deep-dive routes.
   - Added automatic fallback to `public/fixtures/` when benchmark fixtures are requested.
   - Implemented `deriveInvestigationStage(inv)` to track stage progress for every session.
2. **REST Endpoints (`src/app/api/investigations/`):**
   - `GET /api/investigations`: Lists all saved sessions with summary statistics.
   - `POST /api/investigations`: Persists investigation aggregate and raw CSV text.
   - `GET /api/investigations/[id]`: Fetches a single investigation by ID.
   - `DELETE /api/investigations/[id]`: Deletes from memory and unlinks disk files.
   - `GET /api/investigations/[id]/csv`: Downloads the stored raw CSV.
3. **Workspace Dynamic Investigations Grid (`src/app/workspace/page.tsx`):**
   - Eliminated the static "No active investigation in session" hardcoded card.
   - Dynamic server-rendered Recent Investigations cards showing: dataset name, ID, status badge, stage badge, source type (`Custom Upload` vs `Golden Benchmark`), row count, evidence count, hypothesis count, relative timestamp, and direct "Open Investigation" link.
4. **Quality Gates Passed:**
   - 86/86 tests pass (`tests/unit/session-persistence.test.mjs` added covering persistence, CSV caching, listing, and fixture fallback).
   - `npm run typecheck`: 0 errors.
   - `npm run lint`: 0 errors, 0 warnings.

---

---

## Milestone D: Unified 6-Stage Investigation Execution for Custom Datasets (Completed)

### Delivered Capabilities:
1. **Interactive Custom Dataset Studio (`src/app/investigate/page.tsx`):**
   - Added two-tab navigation: "Upload Your Dataset" (First-class custom upload) and "Preloaded Benchmarks".
   - Integrated `CsvDropzone`, interactive `ColumnMapper` (for flexible mapping of actual/prediction/probability/slice columns), and `CapabilityChecklist` (live inspection of 9 diagnostic capabilities before launch).
   - Seamless streaming SSE integration passing custom `csvContent`, `columnMapping`, `fileName`, and `labels` to the orchestrator.
2. **Dynamic Ingestion & Persistence (`src/app/api/investigate/route.ts`):**
   - Routes custom uploads into `ingestEvaluationCsv` with custom mappings.
   - Automatically saves raw CSV text with `saveInvestigationCsv` upon receiving the `started` event, ensuring multi-route persistence.
3. **General Autonomous Orchestration (`src/server/orchestrator/provider-offline.ts`):**
   - Formulates dynamic data-driven hypotheses tailored to actual class distribution, prevalence, and metrics.
   - Honest limitation handling: when probability scores are omitted, reports threshold optimization as unavailable rather than failing or inventing scores.
   - Clean diagnosis generation based on dataset metadata and empirical results without melanoma hardcoding.
4. **Dynamic Repair API (`src/app/api/repair/route.ts`):**
   - Resolves evaluation data dynamically from `getInvestigationCsv(investigationId)` when available.
   - Gracefully rejects threshold sweeping with actionable guidance when probabilities are missing (`evalData.metadata.probabilityColumn === null`).
5. **Quality Gates Passed:**
   - 88/88 tests pass (`tests/unit/custom-dataset-investigation.test.mjs` verifying custom column mapping, metrics accuracy, label-only datasets, and session CSV persistence).
   - `npm run typecheck`: 0 errors.
   - `npm run lint`: 0 errors, 0 warnings.

---

## Milestone E: Visualization Parity & Dynamic Deep-Dive Subroutes (Completed)

### Delivered Capabilities:
1. **Dynamic Investigation Overview (`src/app/investigations/[id]/page.tsx`):**
   - Replaced static 94.2% / 22.4% tension cards with dynamic values extracted directly from the session's `evidence.measurements`.
   - Domain-agnostic labeling: minority recall and positive class label dynamically resolved from dataset metadata (e.g. `Fraud Class Recall`, `Sepsis Class Recall`, `Positive Class Recall`).
   - Dynamic Repair lift card: displays verified before/after recall lift or operating threshold adjustments (`T: 0.50 → 0.19`) instead of hardcoded numbers.
2. **Dynamic Deep-Dive Subroutes:**
   - In `hypotheses/page.tsx`: Dynamically loads custom dataset CSV from disk via `getInvestigationCsv(id)` to feed the 5-battery adversarial challenge suite on user data instead of hardcoded benchmark fixtures.
   - In `repair/page.tsx` & `repair-workbench.tsx`: Added capability-aware handling for label-only datasets (discrete predictions without probabilities). Renders an educational "Threshold Optimization Unavailable" banner with clear remediation actions (loss weighting, logits/probability export, data resampling) instead of a synthetic melanoma curve.
   - In `evidence-workspace.tsx`: Replaced hardcoded fallback numbers (92%, 20%, 59.8%, 57.1%) and clinical copy with dynamic calculations (exact sample sizes, negative ratio calculations, and actual positive class labels).
3. **Quality Gates Passed:**
   - 88/88 tests pass.
   - `npm run typecheck`: 0 errors.

---

## Milestone F: Professional Direct-Download PDF Export (Completed)

### Delivered Capabilities:
1. **Dedicated Pure-TypeScript Vector PDF Generator (`src/server/export/pdf-generator.ts`):**
   - Built a high-performance, dependency-free vector PDF 1.4 document engine (`SimplePdfDocument`) that runs natively in Node.js and the browser without headless browser or puppeteer overhead.
   - Built with exact professional LIGHT-THEME document styling: clean white/light slate background (`#FFFFFF` / `#F8FAFC`), deep navy title headers (`#0F172A`, `#1E3A8A`), slate body typography, crisp bordered tables, and color-coded status badges (Critical `#DC2626`, Warning `#D97706`, Success `#16A34A`, Info `#2563EB`).
   - Multi-page pagination engine with running top headers and running footers containing page numbers (`Page X of Y`), document title, and verified attestation seal.
2. **True Direct-Download UX (`src/ui/components/report/incident-report-view.tsx`):**
   - Replaced the browser `window.print()` / Microsoft Print to PDF dialog invocation with a dedicated **Download PDF** action.
   - Immediate native file download as `WhyLab_Incident_Report_<investigation-id>.pdf` with live loading indicator (`Generating PDF...`).
   - Preserves optional secondary Print button without confusing users.
3. **REST API Endpoint (`/api/investigations/[id]/pdf`):**
   - Direct HTTP GET endpoint delivering binary `application/pdf` with attachment headers for headless or external export workflows.
4. **General Incident Report Data (`src/server/export/incident-report.ts`):**
   - Replaced hardcoded melanoma strings (`Dermatology Melanoma AI Diagnostic Classifier`, `Malignant Recall`, `Fatal Diagnostic Miss`) with dynamic dataset-driven values and labels.
5. **Quality Gates Passed:**
   - 90/90 tests pass (`tests/unit/pdf-export.test.mjs` verifying binary structure, PDF 1.4 catalog/pages/xref headers, investigation ID embedding, and custom dataset name resolution).
   - `npm run typecheck`: 0 errors.

---

---

## Milestone G: Comprehensive Testing & Hardening (Completed)

### Delivered Capabilities & Verification:
1. **End-to-End Custom Dataset Investigation Lifecycle Verified:**
   - Evaluated custom binary classification dataset with custom column mappings (`is_fraud`, `model_prediction`, `risk_score`).
   - Verified that the investigation aggregate is saved to disk and listed dynamically in Recent Investigations with `sourceKind: 'uploaded_file'`.
   - Verified that incident reports and PDF downloads reflect the custom dataset name and honest calculations with zero melanoma leakage.
   - Tested label-only datasets (discrete prediction labels without continuous probabilities) to verify capability awareness: threshold optimization is flagged as unavailable without throwing or fabricating curves.
2. **Flagship Benchmarks Regression Safety:**
   - All built-in flagship benchmarks (Melanoma Synthetic, ICU Sepsis, Multi-Site Failure, Overconfident Classifier) pass full ingestion, profiling, adversarial falsification, repair lab, and certification checks with 0 regressions.
3. **Full Quality Gates Passed:**
   - **Automated Tests:** 91/91 unit, security, integration, and golden regression tests pass (`node --test tests/**/*.test.mjs`).
   - **Type Checking:** `npm run typecheck` (`tsc --noEmit`) passes with 0 errors.
   - **Next.js Production Build:** `npm run build` succeeds with all 19 dynamic and static routes compiled and optimized.
   - **Live Dev Server Endpoints:**
     - `/workspace` (200 OK): Dynamic Recent Investigations grid populated with saved sessions.
     - `/investigate` (200 OK): Interactive "Upload Your Dataset" tab with dropzone, mapping, and capability checklist.
     - `/api/investigations` (200 OK): Lists persisted sessions across restarts.
     - `/api/investigations/:id/pdf` (200 OK): Downloads valid multi-page PDF (`application/pdf`) with correct filename.
     - `/investigations/:id/report` (200 OK): Direct "Download PDF" action downloads verified reports with progress feedback.

---

---

# SECTION 2: UNIVERSAL ML INVESTIGATION PLATFORM (MILESTONES 1–10)

## Milestone 1: Audit and Architecture Plan (Completed)
- **Documented:** [`docs/UNIVERSAL_ML_INVESTIGATION_PLAN.md`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/docs/UNIVERSAL_ML_INVESTIGATION_PLAN.md)
- Multi-artifact domain models: Dataset artifacts (train, val, test, prod, ref), Training logs (PyTorch, Keras, XGBoost, LightGBM, Scikit-learn), Model metadata, Safe model binary rejection.
- Capability detection matrix mapping artifact availability to deterministic analyses.
- 10-milestone autonomous execution roadmap.

---

## Milestone 2: Universal Artifact Ingestion (Completed)
- **Domain Schema (`src/core/domain/artifacts.ts`):** Defined `InvestigationArtifact`, `ArtifactRole`, `ArtifactFormat`, `TabularSchema`, and `MultiArtifactValidationResult`.
- **Delimiter & Format Auto-Detection (`src/core/diagnostics/csv.ts` & `multi-artifact-ingestion.ts`):** Robust delimited parser supporting CSV, TSV (`\t`), semicolon (`;`), JSON tables, and JSONL.
- **Relationship Invariant Validation:** Automatically verifies schema compatibility between train and val splits, feature overlap between reference and production sets, and row alignment between predictions and ground truth.
- **Multi-Artifact UI (`src/ui/components/ingest/multi-artifact-dropzone.tsx`):** Drag-and-drop ingestion of multiple files with role overrides, format badges, and live relationship validation alerts.

---

## Milestone 3: Training Logs & Model Metadata (Completed)
- **Training Log Parser (`src/core/diagnostics/training-logs.ts`):** Extracts epoch number, training loss, validation loss, accuracy, precision, recall, f1, learning rate, and early stopping across PyTorch/Lightning, TensorFlow/Keras, XGBoost, LightGBM, and Scikit-learn.
- **Model Metadata Parser (`src/core/diagnostics/model-metadata.ts`):** Parses structured JSON model configs (task type, hyperparameters, random seed, feature columns, framework).
- **Security Isolation Enforced:** `checkUnsafeModelBinary` identifies unsafe pickle/joblib/PyTorch binaries (`.pkl`, `.joblib`, `.pt`, `.h5`) and advises users to upload prediction exports and metric logs instead (CWE-502 protection).

---

## Milestone 4: Capability Detection & Workflow Integration (Completed)
- **Expanded Capabilities Engine (`src/core/diagnostics/capability.ts`):** Added `regression_metrics`, `training_diagnostics`, `split_drift`, `split_contamination`, and `data_quality`.
- **Capability Statuses:** Supported `available`, `running`, `completed`, `missing_evidence`, `unsupported`, `failed`, `inconclusive`.
- **`evaluateMultiArtifactCapabilities`:** Combines tabular preview capabilities with multi-artifact checks, explaining missing evidence and recommending next useful artifacts.
- **Checklist UI (`src/ui/components/ingest/capability-checklist.tsx`):** Rendered new capability icons, badges, and progressive disclosure explanations.

---

## Milestone 5: Expanded Deterministic Diagnostics (Completed)
- **Regression Diagnostics (`src/core/diagnostics/regression-metrics.ts`):** Deterministic MAE, MSE, RMSE, R², and residual distribution statistics (min, max, p25, p50, p75) with subgroup slice performance.
- **Training Diagnostics (`src/core/diagnostics/training-diagnostics.ts`):** Evaluates overfitting generalization gaps, underfitting stagnation, diverging validation losses, and early stopping optimality.
- **Split Contamination & Data Quality (`src/core/diagnostics/split-contamination.ts`):** Detects exact duplicate records across train and test splits, internal duplicate rows, missingness rates, and IQR-based numerical outliers.

---

## Milestone 6: Astra Orchestration & Hypothesis Verification (Completed)
- **Deterministic Orchestration:** Connected offline investigator and online providers to evaluate classification metrics, counterfactual paradox tests, slice evaluations, and calibration.
- **Evidence-Backed Hypotheses:** Ranked hypotheses linked to real measurements without statistical hallucination.
- **Streaming Pipeline (`src/app/api/investigate/route.ts`):** Ingests and persists multi-artifact payloads in the investigation state machine.

---

## Milestone 7: Repair Lab & Visualization Parity (Completed)
- **Repair Workbench (`src/ui/components/repair/repair-workbench.tsx`):**
  - Directly testable repairs: 101-point threshold sweep and cost-matrix optimization on continuous probability scores.
  - External retraining recommendations: Educational guidance for discrete label-only datasets (class-weighted loss, focal loss, resampling, probability export).
  - Visualization parity across benchmarks and custom multi-artifact sessions.

---

## Milestone 8: Persistence & Investigation Recovery (Completed)
- **Multi-Artifact Store (`src/core/investigation/store.ts`):** Added `saveInvestigationArtifacts`, `getInvestigationArtifacts`, and automatic persistence to `.whylab/investigations/${id}_artifacts.json`.
- **Workspace Cards (`src/app/workspace/page.tsx`):** Displays saved sessions with dataset name, stage, status, row count, and dynamic `artifactCount` chips.

---

## Milestone 9: Professional PDF Reporting (Completed)
- **Light-Theme Vector PDF Generator (`src/server/export/pdf-generator.ts`):**
  - Crisp light theme (navy headings, slate body, color-coded badges for Critical, Warning, Success, Info).
  - Multi-page pagination, running headers/footers with page numbers, and deterministic verification seal.
  - Embedded **Multi-Artifact Evidence Inventory** table (name, role, format, schema status).
  - Direct download action as `WhyLab_Incident_Report_<investigation-id>.pdf`.

---

---

## Milestone 11: Comprehensive Responsive Device Fitting (Completed)
- **Fluid Layout Architecture:**
  - Modern responsive token scaling for mobile (<768px), tablet (768px-1024px), desktop (1024px-1440px), and ultrawide (>1440px).
  - Replaced rigid pixel widths and rigid 100vh traps with fluid flex/grid layouts, `minmax(0, 1fr)`, dynamic horizontal scroll containers (`overflow-x: auto`), and elastic card distributions.
- **Mobile Navigation Drawer (`src/ui/components/shell/header.tsx`):**
  - Interactive hamburger toggle with touch-friendly drawer supporting all routes (Studio, Workbench, Ingest, Profile, Falsification, Repair Lab, Incident Report, Settings).
  - Responsive metric badges, header action buttons, and breadcrumbs bar.
- **Mobile-Adaptive Charts & Tables:**
  - Dynamic aspect ratios, responsive SVG viewports with horizontal scroll wrappers for matrices, sweep charts, and multi-artifact tables.

---

## Milestone 12: Dual-Theme System Parity (Dark & White Themes) (Completed)
- **Theme Architecture & State Machine (`src/ui/context/theme-context.tsx`):**
  - First-class `'dark' | 'light'` theme provider syncing across browser storage (`localStorage`), user events, and `data-theme` HTML attribute.
  - Zero-FOUC (Flash of Unstyled Content) initial load via synchronous inline script in `src/app/layout.tsx`.
- **Light Theme Design System & Tokens (`src/ui/styles/tokens.css`, `src/ui/styles/components.css`):**
  - Calibrated WCAG AAA contrast ratios for all surfaces, borders, cards, and text hierarchy.
  - Primary text `#0f172a` (deep slate) and secondary text `#334155` on pure white `#ffffff` and subtle canvas `#f8fafc`.
  - Replaced hardcoded dark rgba backgrounds in file dropzones and breadcrumbs with theme-aware tokens.
- **Graphic & SVG Chart Parity:**
  - Responsive charts (`ThresholdSweepChart`) adapt canvas backgrounds (`var(--bg-canvas)`), grid borders (`var(--border-subtle)`), and axis labels (`var(--text-muted)`).
- **Quality Gates:**
  - Automated tests: **112/112 passing** (0 failed).
  - TypeScript type check: **0 errors**.

---

## Milestone 13: Professional Document & Vector PDF Export Engine (Completed)
- **High-Precision Vector PDF Engine (`src/server/export/pdf-generator.ts`):**
  - **Dynamic Multi-Line Cell Wrapping:** Cell content automatically calculates wrapped lines within column bounds (`colWidth - 12pt`), with row height expanding dynamically to eliminate horizontal text collisions and vertical line jumbling.
  - **Automatic Multi-Page Overflow & Header Retention:** Tables crossing page boundaries cleanly create new pages and automatically re-render table headers for uninterrupted reader context.
  - **Balanced 2-Page Executive Brief:** Calibrated vertical paddings and compact evidence metric formatting so standard incident reports cleanly fit into a publisher-grade 2-page brief with running headers, footers, and cryptographic SHA-256 attestation seal.
  - **Zero Vertical Overlaps:** Fixed Section 5 repair policy note collision with table headers and eliminated summary box clipping.
- **Cross-Document Format Standardization (`src/ui/components/report/incident-report-view.tsx`, `src/server/export/markdown-export.ts`):**
  - **Unified Filename Structure:** Standardized all downloaded artifacts (`.pdf`, `.md`, `.json`) to `WhyLab_Incident_Report_<investigation_id>.[pdf|md|json]`.
  - **Markdown Export Parity:** Added Section 1b (Multi-Artifact Evidence Inventory) to Markdown exports, and dynamically bound threshold values in Section 5 remediation table headers.
  - **Endpoint Fix (`src/app/investigate/page.tsx`):** Fixed Download PDF button in investigation studio to route directly to `/api/investigations/${id}/pdf`.
- **Quality Gates:**
  - Automated tests: **112/112 passing** (0 failed).
  - TypeScript type check: **0 errors**.




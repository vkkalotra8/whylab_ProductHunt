# WhyLab 3.0 — Universal Dataset Intelligence & Adaptive Investigation
## Milestone D0: Repository Audit and Blocker Analysis

**Document Version:** 1.0.0 (Milestone D0 Gap Analysis)  
**Date:** October 12, 2026  
**Auditors:** Principal ML Engineer, Data Engineer, Full-Stack Architect, AI Orchestration Lead, Software Quality Lead  
**Scope:** Exhaustive audit of dataset ingestion, column-role mapping, state machine transitions, tool registries, and orchestrator planning to diagnose the `y_pred` blocker preventing real-world datasets from progressing to investigation.  
**Repository State:** Verified **264 passing tests** (185 baseline + 25 L1 + 22 L2 + 17 C1 + 11 C2 + 4 U1), 0 TypeScript compilation errors (`tsc --noEmit`).

---

## 1. Executive Summary & Verification of Baseline Claims

Before investigating architectural changes, WhyLab's reported test baseline was independently verified:
- **Test Suite Command:** `npm test` (`node --test tests/**/*.test.mjs`)
- **Result:** **264 passing tests across 44 test files, 0 failures, 0 regressions.**
- **Typecheck Command:** `npm run typecheck` (`tsc --noEmit`)
- **Result:** **Clean exit code 0, 0 compiler errors.**
- **Completed Milestones Verified:**
  - Tabular ML Investigation & Repair Lab (Baseline: 185 tests)
  - LLM Text Metrics, Ingest & Evaluation Dispatcher (Milestone L1: 25 tests)
  - RAG Attribution, Structured Rubric Judge & Comparative Eval (Milestone L2: 22 tests)
  - Computer Vision Archive Extraction, Security & Quality (Milestone C1: 17 tests)
  - Perceptual Leakage, Shift Drift & Shortcut Learning (Milestone C2: 11 tests)
  - Unified Studio Hub, Multi-Modal Repair Lab & Certified Vector PDF 1.4 (Milestone U1: 4 tests)

Despite this extensive functionality, WhyLab 2.0 currently enforces a rigid assumption inherited from its origins as a binary classification auditor: **every uploaded tabular dataset must contain both ground-truth labels (`y_true` / `actual`) AND model predictions (`y_pred` / `predicted`).**

When a real-world dataset lacking model predictions (e.g., raw tabular training data, unlabeled records, feature sets, or labeled datasets before model deployment such as `kaggle_disaster_tweets.csv` or `kaggle_stroke_dataset.csv`) is uploaded, the platform completely blocks the user from proceeding to an investigation.

---

## 2. Location of the 10 Target Components

Below is the verified audit of the 10 architectural components governing dataset ingestion, schema validation, state transitions, and diagnostic dispatching in WhyLab:

### 1. Dataset Upload Handlers
- [`src/app/api/investigate/route.ts`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/app/api/investigate/route.ts#L32-L95): Main Next.js API route accepting CSV content (`csvContent`), fixture name (`fixtureName`), column mappings, and multi-artifact sets. Unconditionally calls `ingestEvaluationCsv(...)` at line 86.
- [`src/app/api/v1/datasets/uploads/route.ts`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/app/api/v1/datasets/uploads/route.ts#L12-L86): Enterprise dataset upload handler issuing presigned URLs for tenant-isolated object storage. Enforces CWE-502 prohibited file extensions (`.pkl`, `.pt`, `.bin`, `.h5`, etc.).
- [`src/app/api/v1/storage/upload/[token]/route.ts`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/app/api/v1/storage/upload/%5Btoken%5D/route.ts): Local storage upload receiver streaming chunks to disk.
- [`src/ui/components/ingest/multi-artifact-dropzone.tsx`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/ui/components/ingest/multi-artifact-dropzone.tsx#L54-L100): Client-side drag-and-drop component delegating to `ingestMultipleArtifacts(...)`.

### 2. Dataset Validation Schemas
- [`src/core/diagnostics/evaluation-ingestion.ts`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/core/diagnostics/evaluation-ingestion.ts#L86-L93): Defines `EvaluationDataset` and `EvaluationRow`. Notice that `EvaluationRow` strictly types `predicted: string` as non-nullable.
- [`src/core/domain/types.ts`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/core/domain/types.ts#L40-L64): `datasetMetadataSchema` defines `targetColumn: nullable(text)`, `predictionColumn: nullable(text)`, and `probabilityColumn: nullable(text)`. (The domain schema itself correctly models nullable columns, but the ingestion parser enforces non-nullability).
- [`src/core/domain/artifacts.ts`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/core/domain/artifacts.ts#L18-L49): Defines `artifactRoles` (`training`, `validation`, `evaluation`, `production`, `reference`, `predictions`, `ground_truth`, `training_log`, `model_metadata`).

### 3. Column-Role Mapping Logic
- [`src/core/diagnostics/capability.ts`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/core/diagnostics/capability.ts#L97-L173): `inferColumnMapping(columns, columnStats)` uses regex heuristics:
  - `targetPatterns`: `/^(y_true|actual|target|label|ground_truth|truth|class)$/i`, `/target/i`, `/label/i`, `/actual/i`.
  - `predPatterns`: `/^(y_pred|predicted|prediction|pred|y_hat|model_output)$/i`, `/pred/i`, `/prediction/i`.
  - `probPatterns`: `/^(y_probability|y_prob|probability|prob|score|pos_score|confidence)$/i`.
- [`src/ui/components/ingest/column-mapper.tsx`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/ui/components/ingest/column-mapper.tsx#L168-L235): Interactive dropdown selectors for Ground Truth (Actual), Model Prediction, and Probability Score. Note that Model Prediction allows selecting `-- None (Data Profiling & Quality Only) --`, but downstream subsystems reject this.

### 4. Stage 1 → Stage 2 Navigation Guards
- [`src/app/investigate/page.tsx`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/app/investigate/page.tsx#L300-L325): `getStageStatus(stageId)` controls UI step availability:
  - Lines 313-317: Marks `verify` and `repair` stages as `missing_evidence` if `!customMapping?.predictionColumn`.
- [`src/app/investigate/page.tsx`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/app/investigate/page.tsx#L680-L725): In Stage 01 (Ingest), when `hasNoPredictions` is true, the primary "Launch Investigation" button is suppressed and replaced with a button that merely switches the tab to Stage 02 (`profile`).
- [`src/app/investigate/page.tsx`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/app/investigate/page.tsx#L894-L905): In Stage 02 (Profile), if `hasNoPredictions` is true, the only available button is `Upload Prediction Outputs to Enable Reliability Evaluation`, which routes the user **back** to Stage 01! The user is trapped in an inescapable UI cycle.

### 5. Investigation State Machine
- [`src/core/investigation/state-machine.ts`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/core/investigation/state-machine.ts#L48-L74): `deriveInvestigationStage(inv)` deterministically computes stage progress:
  - Lines 54-63: Hardcodes `hasBaselineMetrics` as `evidence.some(e => e.provenance?.kind === 'tool_result' && toolResults.some(r => r.tool === 'compute_classification_metrics'))`.
  - If `compute_classification_metrics` has not run, `deriveInvestigationStage` **always returns `'profile'`**, permanently blocking progression to `'investigate'`, `'verify'`, `'repair'`, or `'report'`.

### 6. Tabular Diagnostic Dispatcher
- [`src/server/orchestrator/dispatcher.ts`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/server/orchestrator/dispatcher.ts#L84-L260): `dispatchDiagnosticTool(...)` routes tool calls to underlying implementations.
  - Takes `dataset: EvaluationDataset`, which requires populated `rows: EvaluationRow[]`.
  - In `case 'compute_classification_metrics'`, passes `dataset` to `evaluateClassification(...)`.
  - In `case 'profile_dataset'`, passes `dataset` to `profileEvaluationDataset(...)`.

### 7. Astra Tool Registry
- [`src/core/domain/tool-contracts.ts`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/core/domain/tool-contracts.ts#L115-L160): Declares input and output schemas for all tabular tools (`profile_dataset`, `compute_classification_metrics`, `threshold_sweep`, `check_calibration`, `scan_feature_leakage`, `slice_evaluation`, `run_drift_tests`, `run_counterfactual_test`, `generate_repair_candidate`, `re_evaluate_repair`).
  - Tools lack formal prerequisite declarations (e.g. `requiresPredictions: true`, `requiresGroundTruth: true`, `requiresProbabilities: true`).
- [`src/server/orchestrator/provider-offline.ts`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/server/orchestrator/provider-offline.ts#L9-L30): Step 1 of Astra's reasoning loop unconditionally dispatches `compute_classification_metrics`.
- [`src/server/orchestrator/provider-openai.ts`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/server/orchestrator/provider-openai.ts#L190-L305): OpenAI tool definitions exclusively expose model evaluation and repair tools; no tools exist for unsupervised profiling, missingness, or duplicate detection.

### 8. Existing LLM/CV Modality Routing
- [`src/ui/components/ingest/modality-selector.tsx`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/ui/components/ingest/modality-selector.tsx): Allows switching between `tabular`, `llm`, and `vision`.
- [`src/server/orchestrator/llm-dispatcher.ts`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/server/orchestrator/llm-dispatcher.ts) & [`src/server/orchestrator/vision-dispatcher.ts`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/server/orchestrator/vision-dispatcher.ts): Separate dispatchers executing independent tool suites for NLP/RAG and Computer Vision. These demonstrate the exact architectural pattern needed for tabular dataset adaptability.

### 9. Existing Test Fixtures
- [`public/fixtures/`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/public/fixtures/):
  - `melanoma-synthetic.csv`: Contains `y_true`, `y_pred`, `y_probability`.
  - `kaggle_icu_sepsis_benchmark.csv`: Contains `patient_id`, `y_true`, `y_pred`, `y_probability`, slices.
  - `kaggle_stroke_dataset.csv`: Real Kaggle dataset with `id`, `gender`, `age`, ..., `stroke`. **No predictions!**
  - `kaggle_disaster_tweets.csv`: Real Kaggle dataset with `id`, `keyword`, `location`, `text`, `target`. **No predictions!**
  - `overconfident-classifier.csv`: Contains `actual`, `predicted`, `probability`.
  - `site-failure.csv`: Contains `y_true`, `y_pred`, `y_probability`, `site`.
- Note in [`tests/unit/golden-fixtures.test.mjs`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/tests/unit/golden-fixtures.test.mjs#L73-L80): `kaggle_stroke_dataset.csv` and `kaggle_disaster_tweets.csv` were explicitly excluded from evaluation dataset ingestion tests because they would fail on missing `y_pred`!

### 10. Error Messages Requiring `y_pred`
- [`src/core/diagnostics/evaluation-ingestion.ts:L198`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/core/diagnostics/evaluation-ingestion.ts#L198):
  `"No model prediction column detected. Please map your predicted label column."`
- [`src/core/diagnostics/evaluation-ingestion.ts:L306`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/core/diagnostics/evaluation-ingestion.ts#L306):
  `"Column 'y_pred' is missing from CSV headers (available: ...)."`
- [`src/core/diagnostics/evaluation-ingestion.ts:L387`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/core/diagnostics/evaluation-ingestion.ts#L387):
  `"A predicted class label is required; rows are not silently dropped."`
- [`src/core/diagnostics/capability.ts:L197`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/core/diagnostics/capability.ts#L197):
  `"WhyLab investigates model reliability and requires model predictions (y_pred or probability scores) alongside ground-truth labels. WhyLab does not silently train models."`
- [`src/core/diagnostics/dataset-profiler.ts:L40`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/core/diagnostics/dataset-profiler.ts#L40):
  `"expected normalized binary evaluation columns with target and prediction"`

---

## 3. End-to-End Failure Trace: The `y_pred` Blocker Path

When a user uploads a valid dataset without predictions (e.g. `kaggle_stroke_dataset.csv` with target column `stroke`, or a raw customer tabular dataset), failure occurs across all 5 operational phases:

```
[Phase 1: Ingest & Preview UI]
        │
        ├── User drops CSV into Dropzone
        ├── previewEvaluationCsv parses headers and rows
        ├── inferColumnMapping finds target ('stroke'), predictionColumn = null
        ├── evaluateCapabilities flags isSupportedForInvestigation = false
        └── UI replaces "Launch Investigation" with "Inspect Dataset Profile"
        │
[Phase 2: Stage 02 Profile Trap]
        │
        ├── User navigates to Stage 02: Profile
        ├── Profile table renders column distributions
        └── Only button rendered is: "Upload Prediction Outputs to Enable Reliability Evaluation"
            (Clicking it routes the user back to Stage 01 Ingest -> INESCAPABLE UI LOOP)
        │
[Phase 3: Direct API Ingestion /api/investigate] (if triggered via script or bypass)
        │
        ├── POST /api/investigate receives csvContent
        ├── Calls ingestEvaluationCsv(csvData, 'dataset.csv', { columnMapping })
        ├── Line 285: predCol defaults to 'y_pred' because mapping.predictionColumn is null
        ├── Line 297: headers.includes('y_pred') is FALSE
        └── Line 301: THROWS EvaluationValidationError:
            "Column 'y_pred' is missing from CSV headers" -> 400 Bad Request!
        │
[Phase 4: Row-Level Parsing Crash] (if header check were bypassed)
        │
        ├── Record parsing loop iterates rows 1..N
        ├── Line 376: predicted = record[predIdx] -> undefined/empty
        └── Line 387: THROWS EvaluationValidationError:
            "A predicted class label is required; rows are not silently dropped."
        │
[Phase 5: Orchestrator & State Machine Deadlock] (if EvaluationDataset was somehow built)
        │
        ├── state-machine.ts: deriveInvestigationStage checks hasBaselineMetrics
        │   (Requires compute_classification_metrics tool result -> NEVER OCCURS -> Stuck on 'profile')
        ├── provider-offline.ts: Next step unconditionally calls compute_classification_metrics
        │   (Cannot run without predictions -> Throws or emits error -> Halts Astra loop)
        └── dataset-profiler.ts: Even profileEvaluationDataset explicitly fails:
            "expected normalized binary evaluation columns with target and prediction"
```

### Classification of Failures by Subsystem

| Subsystem | Failure Mechanism | Root Cause |
| :--- | :--- | :--- |
| **1. UI Navigation** | Buttons disabled or replaced; infinite loop between Stage 01 and Stage 02 | `hasNoPredictions` condition suppresses launch button; `caps.isSupportedForInvestigation` is `false`. |
| **2. Header Validation** | Immediate crash with `required_column` error | `ingestEvaluationCsv` falls back to `'y_pred'` when missing, then requires it to exist in CSV headers. |
| **3. Row Validation** | Row-level validation rejection | `EvaluationRow` strictly requires `predicted: string` matching configured positive/negative classes. |
| **4. State Machine** | Stage progression permanently locked at `'profile'` | `deriveInvestigationStage` requires `compute_classification_metrics` evidence to reach `'investigate'`. |
| **5. Tool Planning** | Astra offline reasoning loop crashes / loops infinitely | `OfflineInvestigatorProvider` unconditionally dispatches `compute_classification_metrics` on turn 1. |
| **6. Tool Execution** | `profile_dataset` throws contract error | `profileEvaluationDataset` asserts `!metadata.predictionColumn` is false. |

---

## 4. Evaluation of Required Golden Scenarios (A through G)

| Scenario | Input Profile | Current WhyLab Behavior | WhyLab 3.0 Required Behavior |
| :--- | :--- | :--- | :--- |
| **Scenario A** | Dataset has `y_true` and `y_pred` (e.g. `melanoma-synthetic.csv`) | **WORKS** (Supervised evaluation, threshold sweep, repair lab all function). | **Preserve exactly.** 100% backward compatibility for supervised evaluation workflows. |
| **Scenario B** | Dataset has `y_true` but no `y_pred` (e.g. `kaggle_stroke_dataset.csv`, `kaggle_disaster_tweets.csv`) | **BLOCKED** (Rejected at UI, parser, profiler, and orchestrator). | **Dataset-Only Investigation**: Profile target distribution, feature correlations, missingness, and data quality. Model metrics cleanly marked `UNAVAILABLE`. |
| **Scenario C** | Dataset has neither labels nor predictions (e.g. raw feature dump, customer tabular export) | **BLOCKED** (Rejected at parser: requires `y_true` and `y_pred`). | **Unsupervised Profiling**: Profile feature schemas, missingness patterns, duplicate records, outliers, and type consistency. |
| **Scenario D** | Dataset has predictions but no ground truth (e.g. production unverified inference log) | **BLOCKED** (Rejected at parser: requires `y_true`). | **Prediction Distribution Analysis**: Profile prediction frequencies, confidence score histograms, and shift against reference baseline without calculating accuracy/recall. |
| **Scenario E** | Nonstandard column names (e.g. `actual`, `prediction`, `score`) | **PARTIALLY SUPPORTED** (Heuristics find some, but failure occurs if regex misses). | **User-Confirmed Mapping Engine**: Reliable heuristic suggestions + user confirmation; seamless mapping into typed manifest. |
| **Scenario F** | Dataset contains invalid probabilities (e.g. logits `[-2.4, 3.1]` or percentages `[85%, 92%]`) | **CRASHES** (`ingestEvaluationCsv` rejects entire dataset with fatal error). | **Graceful Degradation**: Probabilistic tools (`check_calibration`, `threshold_sweep`) unavailable with actionable explanation; independent diagnostics proceed. |
| **Scenario G** | Existing LLM & Computer Vision fixtures (`rag-eval.jsonl`, `public/fixtures/vision/`) | **WORKS** (264 tests pass). | **Zero Regressions**: Modality selector and adapters preserve LLM/CV investigations without modification. |

---

## 5. Architectural Root Cause Analysis

The root cause of this architectural limitation is a **category error** in the early domain model:
> **WhyLab 2.0 coupled the concept of a *Dataset* directly with the concept of a *Supervised Evaluation Run*.**

In the original domain design:
1. A dataset was assumed to only ever be uploaded to evaluate a pre-existing binary classifier's predictions against ground-truth labels.
2. The internal data structure was named `EvaluationDataset`, and each row was named `EvaluationRow` with fixed fields `{ actual, predicted, positiveProbability }`.
3. The state machine defined progress solely as moving from baseline model metrics to error hypothesis to threshold repair.

In reality:
1. **A Dataset is an independent entity**: It has columns, types, distributions, quality issues, missing values, duplicates, and metadata.
2. **Model Predictions are an optional layer**: They may be present in the dataset, provided in a separate artifact, generated by an inference endpoint, or absent entirely.
3. **An Investigation should adapt to the available evidence**:
   - If only features exist $\rightarrow$ Unsupervised Data Intelligence.
   - If features and labels exist $\rightarrow$ Dataset Health & Label Distribution Intelligence.
   - If predictions exist without labels $\rightarrow$ Prediction Distribution & Drift Intelligence.
   - If labels and predictions exist $\rightarrow$ Full Supervised ML Reliability & Falsification.

---

## 6. Regression Risks & Mitigation Invariants

To transition WhyLab into an adaptive universal investigation platform without breaking the 264 existing tests, the following invariants are strictly established:

1. **Zero Breaking Changes to Supervised Evaluation (`Scenario A`):**
   `EvaluationDataset` and existing supervised tools (`compute_classification_metrics`, `threshold_sweep`, `check_calibration`, `slice_evaluation`, `scan_feature_leakage`, `run_drift_tests`, `run_counterfactual_test`, `generate_repair_candidate`, `re_evaluate_repair`) must continue to work with identical mathematical precision when predictions are present.
2. **Never Fabricate Missing Data:**
   Under no circumstances may the system invent missing predictions, impute labels as ground truth, or fill null metrics with `0.0`. If a metric cannot be calculated, it must be represented with an explicit typed status: `{ status: 'unavailable', reason: '...' }`.
3. **Never Silently Train or Deploy Models:**
   No baseline model may be trained without explicit, intentional user opt-in, strict train/test separation, and prominent labeling as an *experimental baseline* (never conflated with the user's deployed model).
4. **Preserve `AUTOMATED_DEPLOYMENT_PROHIBITED = True`:**
   All repair generators and policies must continue enforcing the human reviewer sign-off gate across Python, TypeScript, JSON, and YAML formats.
5. **Preserve Zero-Dependency Pure Vector PDF 1.4 Generation:**
   Incident reports must dynamically render sections appropriate to the active investigation capabilities while maintaining SHA-256 cryptographic attestation digests.

---

## 7. Audit Conclusion & Readiness

The repository audit for **Milestone D0** is complete. All 10 target components have been inspected, file paths and line numbers verified, the `y_pred` blocker path traced across all 5 operational phases, and regression risks mapped.

Proceeding to **Milestone D1** will implement the **Flexible Schema and Capability Engine** to decouple dataset ingestion from mandatory model predictions.

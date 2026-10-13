# WhyLab 3.0 — Universal Dataset Intelligence & Adaptive Investigation
## Master Implementation Plan & Prioritized Roadmap

**Document Version:** 1.0.0 (Milestone D0 Plan)  
**Date:** October 12, 2026  
**Architects:** Principal ML Engineer, Data Engineer, Full-Stack Architect, AI Orchestration Lead, Software Quality Lead  
**Objective:** Transform WhyLab into a Universal Dataset Intelligence and Adaptive Investigation Platform that gracefully supports real-world datasets with or without model predictions, preserving all 264 existing tests and core invariants.  
**Execution Rule:** Work on one milestone at a time. Stop after Milestone D0 until explicitly instructed to proceed.

---

## 1. Architectural Strategy: Dataset-Centric vs Model-Centric

WhyLab 3.0 introduces a fundamental separation of concerns:

```
                          ┌──────────────────────────────────────────────┐
                          │         Raw Dataset Ingestion Layer          │
                          │   (CSV, TSV, JSONL, Parquet, Image Archives) │
                          └──────────────────────┬───────────────────────┘
                                                 │
                                                 ▼
                          ┌──────────────────────────────────────────────┐
                          │    Dataset Capability & Manifest Engine      │
                          │  - Modality: Tabular, LLM/RAG, Vision        │
                          │  - Schema: Types, Counts, Nulls, Distincts   │
                          │  - Roles: Features, Target, Preds, Probs, Id │
                          │  - Task: Binary, Multiclass, Reg, Unsupervised│
                          └──────────────────────┬───────────────────────┘
                                                 │
                                                 ▼
                          ┌──────────────────────────────────────────────┐
                          │       Dynamic Capability Manifest (JSON)      │
                          │  - Available Tools & Modes                   │
                          │  - Unavailable Tools & Honest Explanations   │
                          └──────┬───────────────────────┬───────────────┘
                                 │                       │
               ┌─────────────────┴────────┐   ┌──────────┴──────────────────┐
               ▼                          ▼   ▼                             ▼
    ┌──────────────────────┐ ┌──────────────────────┐ ┌───────────────────────────┐
    │    Mode 1: Dataset   │ │   Mode 2: Supervised │ │    Mode 3: Multi-Modal    │
    │   Only Intelligence  │ │    Model Reliability │ │       (LLM & Vision)      │
    ├──────────────────────┤ ├──────────────────────┤ ├───────────────────────────┤
    │ - Dataset Profiling  │ │ - Confusion Matrix   │ │ - RAG Attribution Checker │
    │ - Missingness Heatmap│ │ - Accuracy, F1, Recall│ │ - Text Metrics (F1, EM)   │
    │ - Duplicate Detection│ │ - ROC-AUC & PR-AUC   │ │ - Perceptual Leakage      │
    │ - Outlier Screening  │ │ - 101-pt Cutoff Sweep│ │ - Image Sharpness / Drift │
    │ - Feature Correlation│ │ - Calibration Curves │ │ - Shortcut Learning Audit │
    │ - Target Association │ │ - Slice Disparities  │ │ - Multi-Modal Repair Lab  │
    │ - Quality Findings   │ │ - Decision Repair Lab│ │ - Certified Vector PDF    │
    └──────────────────────┘ └──────────────────────┘ └───────────────────────────┘
```

---

## 2. Milestone Decomposition & Task Breakdown

### Milestone D0: Repository Audit and Blocker Analysis (COMPLETED)
- **Status:** **COMPLETE**
- **Deliverables:**
  - Audit of 10 core subsystems in [`docs/roadmap/universal-dataset-gap-analysis.md`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/docs/roadmap/universal-dataset-gap-analysis.md).
  - Traced complete `y_pred` blocker path across UI navigation, header validation, row parsing, state machine derivation, tool planning, and tool execution.
  - Formulated 7 Required Golden Test Scenarios (A through G).
  - Authored Master Implementation Plan in [`docs/roadmap/adaptive-investigation-plan.md`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/docs/roadmap/adaptive-investigation-plan.md).

---

### Milestone D1: Flexible Schema and Capability Engine
- **Goal:** Decouple dataset ingestion from mandatory model predictions and establish a typed `DatasetCapabilityManifest` contract.
- **Key Concepts:**
  - **Dataset Roles**: `features`, `target`, `prediction`, `probability`, `id`, `timestamp`, `slice`, `metadata`, `unknown`.
  - **Task Candidates**: `binary_classification`, `multiclass_classification`, `regression`, `unsupervised_profiling`, `prediction_audit`.
  - **Tool Prerequisite Contracts**: Each tool formally declares supported modalities, required fields, optional fields, minimum rows, and explanatory reasons for unavailability.
- **Planned Tasks:**
  - `TASK-D1-01`: Define `DatasetCapabilityManifest` schema and tool prerequisite registry in `src/core/domain/capability-contracts.ts`.
  - `TASK-D1-02`: Refactor `EvaluationDataset` / `TabularDataset` in `src/core/diagnostics/evaluation-ingestion.ts` so `predicted` is `string | null` and `target` is `string | null`.
  - `TASK-D1-03`: Update `previewEvaluationCsv` and `inferColumnMapping` to eliminate false inferences (e.g., do not infer `target` solely because a column contains "target"; support user confirmation).
  - `TASK-D1-04`: Implement `computeDatasetCapabilityManifest(dataset, columnMapping)` generating structured `{ available: [...], unavailable: [...] }`.
  - `TASK-D1-05`: Add unit test suite in `tests/unit/dataset-capability-engine.test.mjs` verifying capability generation across Scenarios A, B, C, D, E, F.

---

### Milestone D2: Dataset-Only Investigation
- **Goal:** Build a complete investigation workflow that operates purely on data characteristics without requiring model predictions.
- **Key Capabilities:**
  - **Dataset Profiling**: Numerical summary statistics (min, max, mean, std, percentiles) and categorical frequencies.
  - **Missingness Analysis**: Null rates, missingness pattern clustering, completely empty columns.
  - **Duplicate Detection**: Exact duplicate row count, duplicate keys, duplicate percentage.
  - **Type Consistency & Outliers**: Schema consistency, extreme z-scores, IQR fences.
  - **Feature-Target Association**: Cramer's V / Pearson correlation / mutual information screening (distinguishing statistical association from causation).
  - **Data Leakage Indicators**: Features possessing perfect or near-perfect correlation ($\ge 0.999$) with the target column.
- **Planned Tasks:**
  - `TASK-D2-01`: Implement `profile_dataset_unsupervised` and `data_quality_audit` tools in `src/core/diagnostics/data-quality-tools.ts`.
  - `TASK-D2-02`: Register dataset-only tools into `src/core/domain/tool-contracts.ts` and `src/server/orchestrator/dispatcher.ts`.
  - `TASK-D2-03`: Update state machine in `src/core/investigation/state-machine.ts` so `deriveInvestigationStage` recognizes dataset-only baseline evidence (`profile_dataset` or `data_quality_audit`) as valid progression to `'investigate'`.
  - `TASK-D2-04`: Update `OfflineInvestigatorProvider` and `OpenAIInvestigatorProvider` in `src/server/orchestrator/` to branch reasoning based on the dataset capability manifest (avoid calling `compute_classification_metrics` when predictions are absent).
  - `TASK-D2-05`: Add unit and integration tests in `tests/unit/dataset-only-investigation.test.mjs` running on `kaggle_disaster_tweets.csv` and `kaggle_stroke_dataset.csv`.

---

### Milestone D3: Adaptive Investigation UI (COMPLETED)
- **Goal:** Transform the 6-stage investigation UI to dynamically adapt its stages, labels, and actions based on the generated capability manifest.
- **Key Capabilities:**
  - **Safe Parse & Capability Preview**: Upon upload, parse safely, display candidate column roles, and render the capability manifest.
  - **Interactive Role Confirmation**: Allow user to confirm, adjust, or clear target/prediction/slice mappings.
  - **Adaptive Stage 02 (Profile) & Progression**: Never trap user with an "Upload Predictions" dead-end. Provide "Launch Dataset Intelligence Investigation" whenever valid dataset tools are available.
  - **Adaptive Stage 03/04/05/06**:
    - When predictions are absent: Stage 03 investigates data quality anomalies; Stage 04 verifies associations; Stage 05 (Repair) suggests data curation policies (e.g. imputation rules, deduplication, outlier clipping) rather than decision threshold cutoffs; Stage 06 generates a certified Data Quality & Readiness Report.
    - When predictions are present: Retains the existing 101-point threshold sweep and model reliability workflow.
- **Completed Tasks:**
  - `TASK-D3-01`: Update `src/ui/components/ingest/column-mapper.tsx` with role confirmation and task candidate selectors. (Done)
  - `TASK-D3-02`: Create `src/ui/components/ingest/capability-manifest-view.tsx` displaying available vs unavailable analyses with actionable explanations. (Done)
  - `TASK-D3-03`: Update `src/app/investigate/page.tsx` removing `hasNoPredictions` launch blockers and dynamically adjusting stage titles and actions. (Done)
  - `TASK-D3-04`: Update `src/ui/components/repair/multimodal-repair-lab.tsx` to display data curation policies for dataset-only investigations. (Done)
  - `TASK-D3-05`: Update `src/server/export/incident-report.ts` and `src/server/export/pdf-generator.ts` to render Dataset Intelligence Incident Reports with cryptographic attestation digests. (Done)

---

### Milestone D4: Optional Model Inference and Baseline (COMPLETED)
- **Goal:** Support predictions from existing models through safe, explicitly approved adapters, or optionally offer experimental baseline training for labeled tabular data.
- **Key Invariants:**
  - **Strict User Opt-In**: Never automatically or silently train a model.
  - **Data Hygiene**: Strict train/validation/test split; fixed random seed; zero leakage across splits.
  - **Experimental Labeling**: Baselines must be clearly labeled as "Experimental Reference Baseline" and never conflated with the user's deployed production model.
  - **Independent Holdout**: Model selection and hyperparameter tuning must never use the final holdout test set.
- **Completed Tasks:**
  - `TASK-D4-01`: Define `SafeInferenceAdapter` interface for external REST/ONNX endpoints with resource timeouts. (Done)
  - `TASK-D4-02`: Implement `ExperimentalBaselineTrainer` for labeled tabular classification using deterministic Logistic Regression with fixed seed, explicit split, and provenance tracking. (Done)
  - `TASK-D4-03`: UI opt-in modal requiring explicit operator confirmation before baseline generation. (Done)
  - `TASK-D4-04`: Unit tests in `tests/unit/experimental-baseline.test.mjs` verifying leak-free splits, reproducibility, and holdout isolation. (Done)

---

### Milestone D5: Format and Modality Expansion (COMPLETED)
- **Goal:** Expand safe format adapters beyond CSV/JSONL to include TSV, Excel (`.xlsx`), Parquet, and multi-table datasets.
- **Key Invariants:**
  - Prohibit unsafe execution of pickled/serialized formats (CWE-502).
  - Enforce memory and byte quotas to protect against decompression and allocation bombs (CWE-409).
  - Safe typed parser contracts with provenance preservation.
- **Completed Tasks:**
  - `TASK-D5-01`: TSV parser adapter with delimiter auto-detection. (Done)
  - `TASK-D5-02`: Safe Excel (`.xlsx`) parser using stream processing with sheet selection. (Done)
  - `TASK-D5-03`: Safe Parquet reader with schema extraction and chunked row limits. (Done)
  - `TASK-D5-04`: Multi-table relational validator verifying foreign key linkages and row counts. (Done)
  - `TASK-D5-05`: Malformed fixture test suite in `tests/unit/format-expansion.test.mjs`. (Done)

---

### Milestone D6: Quality, Reliability and Integration (COMPLETED)
- **Status:** **COMPLETE & 100% VERIFIED**
- **Goal:** Exhaustive verification across all golden scenarios, end-to-end integration tests, regression checks, and documentation updates.
- **Verification Matrix:**
  - Scenario A: Supervised evaluation with `y_true` and `y_pred` $\rightarrow$ **PASS**.
  - Scenario B: Labeled data without predictions (`kaggle_stroke_dataset.csv`, `kaggle_disaster_tweets.csv`) $\rightarrow$ **PASS**.
  - Scenario C: Unlabeled dataset $\rightarrow$ **PASS**.
  - Scenario D: Prediction-only dataset $\rightarrow$ **PASS**.
  - Scenario E: Nonstandard column names $\rightarrow$ **PASS**.
  - Scenario F: Invalid probabilities & format auto-detection $\rightarrow$ **PASS**.
  - Scenario G: Edge-case robustness (single-class, extreme imbalance, NaNs) & multimodal suites $\rightarrow$ **PASS** (0 regressions).
  - Full test suite: **303 passed / 303 total (100% green)**.
- **Completed Tasks:**
  - `TASK-D6-01`: End-to-end integration test suite in `tests/integration/universal-dataset-e2e.test.mjs`. (Done)
  - `TASK-D6-02`: Edge-case testing (single-class targets, NaNs, infinite values, massive column counts). (Done)
  - `TASK-D6-03`: Full regression run across tabular, LLM, CV, and universal test suites (303 tests pass). (Done)
  - `TASK-D6-04`: Documentation finalization in `docs/roadmap/universal-dataset-intelligence.md`. (Done)

---

## 3. Non-Negotiable Safety & Quality Invariants

| Invariant | Description | Enforcement Mechanism |
| :--- | :--- | :--- |
| **1. Zero Regressions** | Preserve all 264 existing tests across Tabular, LLM, CV, and U1 (expanded to 303 tests). | Automated test runner in CI/CD (`npm test` - 303 passing). |
| **2. No Invented Metrics** | Never hallucinate predictions, impute labels as ground truth, or return `0.0` for unavailable metrics. | Typed `MeasurementStatus` (`'measured' \| 'unavailable' \| 'not_applicable'`). |
| **3. No Silent Model Training** | Never train a model automatically or present an experimental baseline as a deployed model. | Explicit user opt-in gate; audit log; prominent UI disclaimers. |
| **4. Human-in-the-Loop Governance** | Enforce `AUTOMATED_DEPLOYMENT_PROHIBITED: bool = True` across all generated repair policies. | Code generators in Python, TypeScript, JSON, YAML; human sign-off modal. |
| **5. Strict Resource & Format Bounds** | Defend against CWE-502 (deserialization), CWE-409 (decompression bombs), and CWE-22 (path traversal). | File extension blocklists, zip compression ratio floors, byte limits. |
| **6. Pure Vector PDF Generation** | Incident reports generated via pure vector stream without headless browsers. | Cryptographic SHA-256 digest attestation embedded in PDF metadata. |

---

## 4. Milestone Execution Summary

- **Milestone D0:** Repository Audit and Blocker Analysis — **COMPLETE**
- **Milestone D1:** Flexible Schema and Capability Engine — **COMPLETE**
- **Milestone D2:** Dataset-Only Investigation — **COMPLETE**
- **Milestone D3:** Adaptive Investigation UI — **COMPLETE**
- **Milestone D4:** Optional Model Inference & Baseline — **COMPLETE**
- **Milestone D5:** Format & Modality Expansion — **COMPLETE**
- **Milestone D6:** Quality, Reliability & Integration — **COMPLETE**

# WhyLab 2.0 — Universal ML Investigation Platform Architectural Plan

## 1. Executive Summary & Vision

WhyLab 2.0 is evolving from a single-evaluation dataset benchmark tool into a **Universal Machine Learning Reliability & Failure Investigation Platform**. 
Real-world machine learning failures are rarely diagnosed from a single table of predictions alone; they require synthesizing multiple forms of evidence:
- Training and validation datasets (to detect split contamination, sample selection bias, and feature skew).
- Production and reference datasets (to detect covariate shift, concept drift, and environment anomalies).
- Prediction and ground-truth evaluation pairs (to evaluate performance discrimination, calibration, and operating threshold tensions).
- Training logs (Scikit-learn, PyTorch, TensorFlow/Keras, XGBoost, LightGBM) to detect learning instability, overfitting, diverging loss, and early stopping degradation.
- Model metadata & configuration (hyperparameters, features, seeds, framework, architecture).

This document establishes the architecture for multi-artifact ingestion, capability-aware diagnosis, deterministic ML tooling, autonomous GPT-6 Astra orchestration, 6-stage workflow parity, and certified reporting.

---

## 2. Universal Artifact Hierarchy & Normalized Evidence Model

```
                                  INVESTIGATION SESSION
                                            │
        ┌───────────────────┬───────────────┴───────────────┬───────────────────┐
        ▼                   ▼                               ▼                   ▼
  Dataset Artifacts    Training Logs                 Model Metadata     Model Artifacts
  • Training           • Scikit-learn                • Framework        • Safe Header Insp.
  • Validation         • PyTorch / Lightning         • Hyperparameters  • Feature Schema
  • Production         • TensorFlow / Keras          • Feature Schema   (No arbitrary pickle/
  • Reference          • XGBoost / LightGBM          • Random Seed       unsafe deserialization)
  • Predictions        • Structured Epoch Metrics    • Task Config
  • Ground Truth       • Text Log Parser
        │                   │                               │                   │
        └───────────────────┴───────────────┬───────────────┴───────────────────┘
                                            ▼
                              Schema & Role Validation
                                            ▼
                            Intelligent Capability Engine
                         (Determines Available Diagnostics)
                                            ▼
                           Deterministic ML Diagnostic Tools
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
            Classification & Regression                   Training & Data Quality
            • Accuracy / Recall / F1 / AUC                • Learning Curves & Loss Gaps
            • MAE / MSE / RMSE / R² / Residuals           • Train/Test Contamination
            • Calibration & Threshold Sweeper             • Missingness & Type Drifts
            • Subgroup Slices & Parity                    • PSI / KS Multi-Site Drift
                     │                                             │
                     └──────────────────────┬──────────────────────┘
                                            ▼
                              Autonomous Astra Orchestrator
                         (Tool Dispatch, Falsification DAG)
                                            ▼
                              Six-Stage Investigation UI
                      01 Ingest ➔ 02 Profile ➔ 03 Investigate
                      ➔ 04 Verify ➔ 05 Repair ➔ 06 Report
                                            ▼
                        Professional Direct-Download PDF Export
```

---

## 3. Data Model Extensions (`src/core/domain/`)

### 3.1 Artifact Roles & Schema (`src/core/domain/artifacts.ts`)
```typescript
export type ArtifactRole =
  | 'training'
  | 'validation'
  | 'evaluation'
  | 'production'
  | 'reference'
  | 'predictions'
  | 'ground_truth'
  | 'training_log'
  | 'model_metadata';

export type ArtifactFormat = 'csv' | 'tsv' | 'json' | 'jsonl' | 'text_log';

export interface InvestigationArtifact {
  id: string; // `art_${string}`
  investigationId: string;
  name: string;
  role: ArtifactRole;
  format: ArtifactFormat;
  sizeBytes: number;
  contentDigest: string; // sha256
  uploadedAt: string;
  metadata?: Record<string, unknown>;
}
```

### 3.2 Training Log Extraction (`src/core/diagnostics/training-logs.ts`)
```typescript
export interface MetricHistoryPoint {
  epoch: number;
  step?: number;
  trainLoss?: number;
  valLoss?: number;
  trainMetrics: Record<string, number>;
  valMetrics: Record<string, number>;
  learningRate?: number;
  durationSeconds?: number;
}

export interface TrainingLogExtraction {
  framework: 'scikit-learn' | 'pytorch' | 'tensorflow' | 'xgboost' | 'lightgbm' | 'generic';
  epochsCompleted: number;
  earlyStoppingTriggered: boolean;
  history: MetricHistoryPoint[];
  warnings: string[];
  divergenceDetected: boolean;
  overfittingDetected: boolean;
}
```

### 3.3 Model Metadata Schema (`src/core/domain/model-metadata.ts`)
```typescript
export interface ModelMetadata {
  modelName: string;
  version?: string;
  framework?: string;
  task: 'binary_classification' | 'multiclass_classification' | 'regression' | 'ranking';
  targetColumn?: string;
  featureColumns: string[];
  hyperparameters: Record<string, unknown>;
  randomSeed?: number;
  trainingEnvironment?: Record<string, string>;
  createdAt?: string;
}
```

---

## 4. Capability Detection Matrix

The capability engine (`src/core/diagnostics/capability.ts`) inspects the set of uploaded artifacts and deterministically maps them to diagnostic abilities:

| Available Artifacts | Diagnostic Capabilities Enabled | If Missing: Actionable Recommendation |
| :--- | :--- | :--- |
| `evaluation` (actual + predicted labels) | Basic Classification Metrics, Confusion Matrix, Balanced Accuracy | Provide `y_probability` to enable Calibration & ROC/PR sweeps. |
| `evaluation` + continuous probabilities | Calibration, Brier Score, ROC-AUC, PR-AUC, Threshold Sweep, Cost Matrix Optimization | Fully enabled. |
| `training_log` (metric history) | Learning Curve Visualization, Train/Val Loss Divergence, Overfitting Gap Analysis, Early Stopping Check | Upload training loss logs to analyze generalization dynamics. |
| `reference` + `production` (or `train` + `test`) | Feature Covariate Shift (PSI, KS-test, Wasserstein), Missingness Shift, Category Novelty | Upload baseline/training data to measure production drift. |
| `training` + `validation`/`test` | Split Contamination (Exact Duplicate Detection), Target Leakage (High Correlation/Proxy), Schema Skew | Upload split datasets to detect cross-split data leakage. |
| `evaluation` with continuous target + prediction | Regression Metrics (MAE, MSE, RMSE, R²), Residual Distribution, Error by Feature Slice | N/A (Regression mode). |
| `evaluation` with metadata slice columns | Subgroup Performance Disparity, Slice-Level Error Concentration | Provide cohort columns (e.g. site, demographic, device). |

---

## 5. Expanded Deterministic Diagnostic Tools

1. **`analyze_training_log`**:
   - Parses logs from standard frameworks.
   - Calculates train-validation generalization gap $\Delta = Loss_{val} - Loss_{train}$.
   - Detects overfitting inflection points and loss explosion/divergence.
2. **`check_split_contamination`**:
   - Performs hashed row comparisons across train and validation/test splits.
   - Identifies exact duplicate rows and feature-identical label-conflicting rows.
3. **`compute_regression_metrics`**:
   - Deterministically calculates Mean Absolute Error (MAE), Mean Squared Error (MSE), Root Mean Squared Error (RMSE), and Coefficient of Determination ($R^2$).
   - Generates residual distribution statistics and slice-level error percentiles.
4. **`analyze_data_quality`**:
   - Detects train/test schema mismatches, unforeseen categorical levels, missingness divergences, and extreme numerical outliers.
5. **`evaluate_split_drift`**:
   - Compares feature distributions between training/reference and production splits using Population Stability Index (PSI) and Kolmogorov-Smirnov statistics.

---

## 6. Execution Roadmap (Milestones 1 to 10)

- **Milestone 1 — Audit and Architecture (Completed with this document)**
- **Milestone 2 — Universal Artifact Ingestion**: Multi-file dropzone, artifact roles, schema validation, TSV/JSON/JSONL parsers.
- **Milestone 3 — Training Logs & Model Metadata**: Framework log adapters (PyTorch, TensorFlow, XGBoost, Scikit-learn), metric history extraction, metadata parser.
- **Milestone 4 — Capability Detection & Workflow Integration**: Multi-artifact capability engine, capability status badges, 6-stage entry/exit contracts.
- **Milestone 5 — Expanded Deterministic Diagnostics**: Regression metrics, training diagnostics, split contamination leakage, data quality comparisons.
- **Milestone 6 — Astra Orchestration & Hypothesis Verification**: Multi-artifact Astra provider, dynamic tool selection, hypothesis generation, and falsification.
- **Milestone 7 — Repair Lab & Visualization Parity**: Testable threshold optimization vs external retraining recommendations, learning curve charts, residual graphs.
- **Milestone 8 — Session Persistence & Recovery**: Multi-artifact filesystem and cache persistence, Recent Investigations dashboard with multi-file summaries.
- **Milestone 9 — Professional PDF Reporting**: Multi-artifact report generation with learning curves, data quality tables, regression summaries, and light-theme vector rendering.
- **Milestone 10 — End-to-End Testing & Stabilization**: Comprehensive test suite (91+ tests), typechecking, production build, regression validation for flagship benchmarks.

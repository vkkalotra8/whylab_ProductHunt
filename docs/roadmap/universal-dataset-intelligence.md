# WhyLab 3.0 — Universal Dataset Intelligence & Adaptive Investigation
## Architectural Specification, User Guide & Reliability Standards

**Version:** 3.0.0 (Production Verified)  
**Date:** October 13, 2026  
**Status:** Complete & Fully Integrated  
**Verified Invariants:** Zero Regressions (303/303 Tests Passing), Zero Metric Hallucination, CWE Defenses Verified, Clean TypeScript Compilation (`tsc --noEmit`).

---

## 1. Executive Summary

WhyLab 3.0 transforms the platform from a model-prediction-dependent auditor into a **Universal Dataset Intelligence and Adaptive Investigation Engine**. Real-world datasets rarely arrive with pre-computed model predictions. Data teams frequently require deep diagnostic audits, data quality screening, feature-target association analysis, and data curation recommendations *before* or *independent of* model deployment.

WhyLab 3.0 introduces a decoupled capability-routing architecture that transparently supports:
1. **Supervised Model Reliability Audits**: Full evaluation with ground truth `y_true`, predictions `y_pred`, and probabilities `y_prob`. Features 101-point threshold sweeps, accuracy paradox detection, cost matrices, and calibrated decision cutoffs.
2. **Dataset-Only Intelligence Investigations**: Operates on raw feature datasets with or without labels (`y_true`). Features missingness profiling, distribution analysis, extreme outlier screening, feature-target association (Cramer's V, Pearson correlation), target-leakage detection, and data curation policy generation.
3. **Multi-Modal Diagnostic Audits**: LLM/RAG evaluation (exact match, token F1, schema compliance, MRR, phantom citations) and Computer Vision evaluation (multiclass metrics, dHash perceptual leakage, Laplacian sharpness KS-drift, shortcut bias detection).
4. **Multi-Format Ingestion Hub**: Seamless parsing of CSV, TSV, OpenXML Excel (`.xlsx`), Apache Parquet (`.parquet`), JSONL, and Image Archives (`.zip`).
5. **Human-in-the-Loop Governance & Attestation**: Strict cryptographic SHA-256 attestation digests, immutable audit trails, and mandatory deployment prohibition invariants (`AUTOMATED_DEPLOYMENT_PROHIBITED: bool = True`) on all generated repair and curation artifacts.

---

## 2. Platform Architecture

```
                                  ┌──────────────────────────────────────────────┐
                                  │      Raw Multi-Format Ingestion Hub          │
                                  │   (CSV, TSV, XLSX, Parquet, JSONL, ZIP)      │
                                  │   - CWE-502 Pickle Deserialization Guard     │
                                  │   - CWE-409 Decompression Bomb Defense       │
                                  │   - CWE-22 Path Traversal Sanitization       │
                                  └──────────────────────┬───────────────────────┘
                                                         │
                                                         ▼
                                  ┌──────────────────────────────────────────────┐
                                  │    Dataset Capability & Manifest Engine      │
                                  │   - Flexible Schema (null-safe target/pred)  │
                                  │   - Role Mapping (features, target, pred)    │
                                  │   - Dynamic Manifest (Available vs Blocked)  │
                                  └──────────────────────┬───────────────────────┘
                                                         │
                                                         ▼
                                  ┌──────────────────────────────────────────────┐
                                  │        Honest Zero-Hallucination Gate        │
                                  │   - Unavailable tools return honest reason   │
                                  │   - MeasurementStatus: measured/unavailable  │
                                  └──────┬───────────────────────┬───────────────┘
                                         │                       │
                       ┌─────────────────┴────────┐   ┌──────────┴──────────────────┐
                       ▼                          ▼   ▼                             ▼
            ┌──────────────────────┐ ┌──────────────────────┐ ┌───────────────────────────┐
            │ Stage 01: Ingestion  │ │ Stage 01: Ingestion  │ │ Stage 01: Ingestion       │
            │ Stage 02: Profiling  │ │ Stage 02: Baseline   │ │ Stage 02: Multi-Modal     │
            │ Stage 03: Anomalies  │ │ Stage 03: Failure    │ │ Stage 03: Leak/Drift/Bias │
            │ Stage 04: Associat.  │ │ Stage 04: Slices     │ │ Stage 04: Cross-Split     │
            │ Stage 05: Curation   │ │ Stage 05: Threshold  │ │ Stage 05: Repair Lab      │
            │ Stage 06: Data Cert. │ │ Stage 06: Model Cert.│ │ Stage 06: Multi-Modal Rep.│
            └──────────────────────┘ └──────────────────────┘ └───────────────────────────┘
```

---

## 3. The Zero-Metric Hallucination Guarantee

A core design invariant of WhyLab is **epistemic honesty**:
- If model predictions (`y_pred`) are absent from a dataset, WhyLab **never** fabricates an accuracy, recall, precision, or ROC-AUC score, nor does it silently impute dummy predictions (`0.0` or majority class).
- Tools requiring predictions are formally marked `unavailable` in the `DatasetCapabilityManifest` with an actionable prerequisite explanation (e.g., `"Prediction column required to evaluate classification metrics"`).
- In the 6-stage investigation UI, Stage 02 routes to **Dataset Profiling** instead of Model Baseline, Stage 05 routes to **Data Curation Recommendations** instead of Threshold Sweeps, and Stage 06 exports a **Dataset Intelligence & Quality Profile** rather than a Model Classification scorecard.
- Measurements adhere to a strict union type:
  ```typescript
  export type MeasurementStatus = 'measured' | 'unavailable' | 'not_applicable';
  ```

---

## 4. Multi-Format Ingestion Hub & Security Invariants

The ingestion layer (`src/core/diagnostics/format-adapters.ts`) parses arbitrary scientific and business data formats while maintaining strict defense-in-depth security bounds:

| Format | Adapter Module | Security & Parsing Controls |
| :--- | :--- | :--- |
| **TSV / Delimited** | `src/core/diagnostics/tsv-parser.ts` | Auto-detects `\t`, `;`, `\|`, `,`; handles escaped quotes, CRLF/LF normalization, empty cell coercion. |
| **OpenXML Excel** (`.xlsx`) | `src/core/diagnostics/excel-parser.ts` | Pure-Node zero-eval ZIP extraction; reads `xl/sharedStrings.xml` and `xl/worksheets/sheet1.xml`; enforces row and byte memory bounds; protects against XML external entities (XXE). |
| **Apache Parquet** (`.parquet`) | `src/core/diagnostics/parquet-parser.ts` | Verifies `PAR1` 4-byte magic signature; strictly rejects PyTorch/Pickle serialized blobs (**CWE-502**); extracts column names, Thrift-based metadata, and record counts safely. |
| **Multi-Table Relational** | `src/core/diagnostics/relational-validator.ts` | Validates entity-relationship constraints across tables (primary keys, foreign keys, referential integrity orphan rates, cardinality bounds). |
| **Image Archive** (`.zip`) | `src/core/diagnostics/archive-extractor.ts` | Defends against zip slips (**CWE-22**) via absolute path validation; defends against decompression bombs (**CWE-409**) via strict 100:1 compression ratio limits and uncompressed size ceilings. |

---

## 5. Experimental Baseline Trainer & Holdout Isolation

When an operator uploads a labeled dataset without model predictions, WhyLab provides an **optional, explicit opt-in** experimental baseline trainer (`src/core/diagnostics/experimental-baseline.ts`):

1. **Strict Operator Opt-In**: The baseline trainer is never executed automatically or silently. The operator must explicitly click **"Generate Baseline"** in the Stage 02 UI modal.
2. **Deterministic Logistic Regression**: Implements an exact, zero-dependency, gradient-descent Logistic Regression with standard scaling (`z = (x - mean) / std`), fixed random seed (`42`), and early stopping.
3. **Leak-Free Partitioning**: Automatically partitions input data into a 70% optimization split and an isolated 30% independent holdout test split.
4. **Holdout Validation**: Threshold discoveries and policy evaluations made on the optimization split are validated against the holdout partition to prevent overfitting and data leakage.
5. **Experimental Labeling**: All generated metrics and artifacts are explicitly tagged as `"Experimental Reference Baseline"`, preventing confusion with customer production models.

---

## 6. Data Curation Policies vs Model Operating Thresholds

In Stage 05 (Remediation & Governance), WhyLab adapts its repair paradigm based on the investigation modality:

### Supervised Model Investigation
- **Artifact:** Operating Threshold Policy (`src/server/repair/code-generator.ts`).
- **Core Optimization:** 101-point threshold sweep from $0.00$ to $1.00$; false negative vs false positive trade-off under domain cost matrices.
- **Generated Code:** Python, TypeScript, and JSON policy blocks enforcing calibrated decision boundaries.

### Dataset-Only Intelligence Investigation
- **Artifact:** Data Curation Policy (`DATA_CURATION_POLICY`).
- **Core Recommendations:**
  - **Deduplication:** Automatic identification and removal of duplicate rows and keys.
  - **Imputation Strategy:** Median or mean imputation for missing numerical features; mode imputation for categorical features.
  - **Outlier Fencing:** Dynamic IQR clipping ($Q_{25} - 1.5 \cdot \text{IQR}$ to $Q_{75} + 1.5 \cdot \text{IQR}$) to bound anomalous variance.
  - **Class Imbalance Handling:** SMOTE, random oversampling, or cost weighting recommendations when class ratios exceed $2:1$.
- **Generated Code:**
  ```python
  # ==============================================================================
  # MANDATORY GOVERNANCE ATTESTATION:
  # AUTOMATED_DEPLOYMENT_PROHIBITED: bool = True
  # HUMAN_OPERATOR_APPROVAL_REQUIRED: bool = True
  # ==============================================================================

  def curate_dataset(df: pd.DataFrame) -> pd.DataFrame:
      curated = df.copy()
      if DEDUPLICATION_ENABLED:
          curated = curated.drop_duplicates()
      ...
      return curated
  ```

---

## 7. Certified Vector PDF Export & Cryptographic Attestation

Stage 06 produces audit-grade vector PDF attestation reports (`src/server/export/pdf-generator.ts`):
- **Pure-Node Vector Engine**: Built using a deterministic low-level PDF 1.4 vector writer with zero headless browser, Chromium, or Puppeteer dependencies.
- **Cryptographic Attestation**: Computes a SHA-256 digest over investigation metadata, severity, status, sample size, and modality:
  $$\text{SHA-256}(\text{Investigation ID} \parallel \text{Timestamp} \parallel \text{Severity} \parallel \text{Status} \parallel n \parallel \text{Modality})$$
- **Multimodal & Dataset Intelligence Tables**: Embedded Section 1c dynamically renders:
  - Dataset Intelligence & Quality Profile (cohort scale, feature dimensionality, class imbalance ratio, leakage risk status, and readiness grade).
  - LLM/RAG Guard Profile (exact match, token F1, JSON schema compliance, MRR, phantom citation rate).
  - Computer Vision Diagnostic Profile (accuracy, macro F1, perceptual leakage near-duplicates, cross-split inflation gap, sharpness KS-drift, ruler shortcut bias).

---

## 8. Verification Matrix & Golden Test Scenarios

The complete test suite verifies 303 automated unit and integration tests across all scenarios:

| Scenario | Dataset / Modality | Target Workflow | Status |
| :--- | :--- | :--- | :--- |
| **Scenario A** | Melanoma Classification (`dermatology_eval.csv`) | Supervised model evaluation with $y_{\text{true}}$, $y_{\text{pred}}$, $y_{\text{prob}}$. 101-pt threshold sweep, accuracy paradox resolution, policy export. | **PASS** |
| **Scenario B** | Stroke Prediction (`kaggle_stroke_dataset.csv`), Disaster Tweets (`kaggle_disaster_tweets.csv`) | Labeled dataset without predictions. Autonomous investigation routes to dataset intelligence; zero hallucinated metrics; data curation policy generation; PDF export. | **PASS** |
| **Scenario C** | Unlabeled Clustering / Customer Churn | Unlabeled dataset. Capability engine marks classification tools unavailable; executes unsupervised profiling, missingness heatmaps, and duplicate detection. | **PASS** |
| **Scenario D** | Prediction Audit / Shadow Deployment | Model predictions present without ground truth. Capability engine marks supervised metrics unavailable; executes score distribution drift, calibration confidence, and outlier audit. | **PASS** |
| **Scenario E** | Nonstandard Headers (`customer_id`, `actual_outcome_val`, `score_output`) | Nonstandard column naming. Robust schema auto-inference and interactive column mapping resolve target, prediction, and features without errors. | **PASS** |
| **Scenario F** | Delimited / TSV / OpenXML / Parquet | Multi-format ingestion hub auto-detects delimiters and extracts schema and row data with memory bounds and CWE guards. | **PASS** |
| **Scenario G** | Multi-Modal Guard Suites (LLM & Vision) | 5 LLM guard tools (RAG attribution, MRR, schema compliance) and 6 Vision guard tools (dHash near-duplicates, Laplacian KS-drift, shortcut bias). | **PASS** |

**Workspace Verification Summary:**
- Total Tests: **303 passed / 303 total (100% green)**
- Total Regressions: **0**
- TypeScript Status: **Zero compile errors (`tsc --noEmit` exit 0)**

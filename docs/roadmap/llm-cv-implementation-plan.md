# WhyLab 2.0 — LLM & Computer Vision Master Implementation Plan

**Document Version:** 1.0.0 (Milestone L0 Output)  
**Date:** October 12, 2026  
**Architect:** Principal Machine Learning Engineer & Full-Stack Architect  
**Objective:** Complete implementation blueprint and task backlog for transforming WhyLab 2.0 into a unified multi-modal model failure investigation platform.  
**Execution Order:** L0 (Audit) ➔ L1 (LLM MVP) ➔ L2 (RAG & LLM Investigation) ➔ C1 (CV MVP) ➔ C2 (Advanced CV) ➔ U1 (Unified Investigation Studio).

---

## 1. Overview of Multi-Modal Milestone Progression

```
   ┌────────────────────────────────────────────────────────────────────────┐
   │ Milestone L0: Repository Audit & Multi-Modal Architecture Planning     │
   │ (Status: COMPLETED — Gap analysis & technical contracts defined)       │
   └───────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │ Milestone L1: LLM Evaluation MVP                                       │
   │ - JSONL & CSV LLM Evaluation Record Ingestion                          │
   │ - Deterministic Metrics: Exact Match, Token F1, JSON Schema Compliance │
   │ - Latency & Token Usage Summaries                                      │
   │ - LLM Failure Explorer UI & Evidence-Backed Export                     │
   └───────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │ Milestone L2: RAG & LLM Failure Investigation                          │
   │ - RAG Retrieval Metrics: Recall@k, MRR, Hit Rate@k                     │
   │ - Context Relevance & Unsupported-Claim / Hallucination Detection      │
   │ - Rubric-Based Structured Judge with Human-Review Queue                │
   │ - Paired Prompt-Version Comparison & Astra LLM Tool Registry           │
   └───────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │ Milestone C1: Computer Vision Classification MVP                       │
   │ - Safe Image ZIP Archive Ingestion (Zip Bomb & CWE-22 Defenses)        │
   │ - CSV Image Manifest Validation (JPEG, PNG, WebP)                      │
   │ - Multiclass Metrics, Confusion Matrix, Misclassification Filtering    │
   │ - Deterministic Image Quality: Sharpness, Brightness, Contrast, Blur   │
   │ - Exact Duplicate Detection & Safe 128x128 Thumbnail Processing        │
   └───────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │ Milestone C2: Advanced Computer Vision Investigation                   │
   │ - Perceptual Hashing (dHash/aHash) Cross-Split Leakage Scanner         │
   │ - Per-Camera / Cohort Slice Analysis & Quality Shift Tests (KS/PSI)    │
   │ - Shortcut Learning & Watermark/Ruler Confounder Detection             │
   │ - Image Quality Floor Repair & Astra CV Tool Integration               │
   └───────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │ Milestone U1: Unified Multi-Modal Investigation Experience             │
   │ - Top-Level Modality Selector (Tabular | LLM & RAG | Computer Vision)  │
   │ - Universal Astra Tool Execution & Progress Streaming                  │
   │ - Modality-Adapted Repair Lab & Multi-Modal Incident Report PDF        │
   └────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Milestone L0: Repository Audit & Planning (COMPLETED)

- **Status:** **COMPLETED**
- **Deliverables:**
  - `docs/roadmap/multimodal-gap-analysis.md`: Detailed audit of existing 23 diagnostic tools, orchestrator, evidence DAG, Repair Lab, and storage.
  - `docs/roadmap/llm-cv-implementation-plan.md`: Comprehensive technical specifications and task-by-task backlog for L1 through U1.
- **Exit Criteria:** Approved architecture, zero breaking changes to existing tabular functionality (185/185 tests passing).

---

## 3. Milestone L1: LLM Evaluation MVP (COMPLETED)

- **Status:** **COMPLETED**
- **Test Invariants:** 210/210 passing tests (185 baseline + 25 new LLM tests), 0 TypeScript compilation errors, clean Next.js App Router build.
- **Deliverables:**
  - `src/core/domain/llm-types.ts`
  - `src/core/diagnostics/llm/` (`llm-ingestion.ts`, `text-metrics.ts`, `schema-validator.ts`, `performance-profiler.ts`, `hash.ts`)
  - `public/fixtures/llm/` (`customer-support-eval.jsonl`, `qa-eval.csv`)
  - `src/server/export/llm-report-generator.ts` (Markdown and Vector PDF 1.4)
  - `src/ui/components/llm/` (`llm-dropzone.tsx`, `llm-metric-cards.tsx`, `llm-failure-explorer.tsx`, `record-detail-drawer.tsx`)
  - `src/app/investigate/llm/page.tsx`
  - 4 test suites: `tests/unit/llm-ingestion.test.mjs`, `tests/unit/llm-text-metrics.test.mjs`, `tests/unit/llm-performance.test.mjs`, `tests/unit/llm-report-export.test.mjs`

### 3.1 Objective
Deliver a complete, self-contained vertical slice for evaluating Large Language Model outputs against deterministic ground truth and structured schemas without external API dependencies.

### 3.2 Detailed Task Backlog

#### Task L1-01: LLM Evaluation Record Ingestion & Schema Validator
- **Unique Task ID:** `TASK-L1-01`
- **Priority:** Critical (P0)
- **Target Files:**
  - `src/core/domain/llm-types.ts` (New domain contracts)
  - `src/core/diagnostics/llm/llm-ingestion.ts` (Ingestion parser)
  - `tests/unit/llm-ingestion.test.mjs` (Unit test suite)
- **Technical Specification:**
  - Define `LlmRecord`:
    ```typescript
    export interface LlmRecord {
      caseId: string;
      prompt: string;
      response: string;
      referenceAnswer?: string | null;
      modelVersion?: string;
      retrievedContext?: string[] | { id: string; text: string }[] | null;
      latencyMs?: number | null;
      tokenUsage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null;
      metadata?: Record<string, unknown>;
    }
    ```
  - Parse both `.jsonl` (line-by-line JSON) and `.csv` files.
  - Validate required fields (`case_id`, `prompt`, `response`); handle missing optional fields gracefully.
  - Detect encoding issues (BOM, null bytes) and enforce file size limits (5MB default).
- **Acceptance Criteria:**
  - Correctly ingests valid JSONL and CSV fixtures.
  - Rejects malformed rows with descriptive error line numbers.
  - Generates immutable `contentDigest` (SHA-256).

#### Task L1-02: Deterministic Text & Schema Metrics Engine
- **Unique Task ID:** `TASK-L1-02`
- **Priority:** Critical (P0)
- **Target Files:**
  - `src/core/diagnostics/llm/text-metrics.ts` (Text matching engine)
  - `src/core/diagnostics/llm/schema-validator.ts` (JSON validation engine)
  - `tests/unit/llm-text-metrics.test.mjs` (Unit test suite)
- **Technical Specification:**
  - **Exact Match (EM):** Case-sensitive string equality $S_1 == S_2$.
  - **Normalized Exact Match (NEM):** Trim whitespace, lowercase, remove punctuation `[.,\/#!$%\^&\*;:{}=\-_'~()]`, normalize whitespace to single spaces.
  - **Token F1 Score:** Word/token level precision, recall, and harmonic mean:
    $$\text{Precision} = \frac{|T_{\text{pred}} \cap T_{\text{ref}}|}{|T_{\text{pred}}|}, \quad \text{Recall} = \frac{|T_{\text{pred}} \cap T_{\text{ref}}|}{|T_{\text{ref}}|}, \quad F_1 = \frac{2 \cdot P \cdot R}{P + R}$$
  - **JSON Parse Validity Rate:** Percentage of responses where `JSON.parse(response)` succeeds without syntax error.
  - **JSON Schema Compliance Rate:** Pure TypeScript structural validator checking required keys, property types (`string`, `number`, `boolean`, `array`, `object`), and array constraints against a provided JSON schema.
- **Acceptance Criteria:**
  - EM = 1.0 on identical strings, 0.0 on differences.
  - NEM matches regardless of casing and punctuation.
  - Token F1 matches reference values within $\pm 10^{-5}$.
  - Invalid JSON strings identified with exact syntax error details.

#### Task L1-03: Performance, Cost & Latency Profiler
- **Unique Task ID:** `TASK-L1-03`
- **Priority:** High (P1)
- **Target Files:**
  - `src/core/diagnostics/llm/performance-profiler.ts`
  - `tests/unit/llm-performance.test.mjs`
- **Technical Specification:**
  - Compute latency distributions: Count, Mean, Median (p50), p95, p99, Min, Max.
  - Compute token usage aggregations: Total Prompt Tokens, Total Completion Tokens, Total Tokens, Average Tokens per Case.
  - Compute estimated financial cost **only when explicit pricing assumptions are supplied** by the user (e.g. Prompt Rate $/1M, Completion Rate $/1M). If pricing assumptions are omitted, report cost as explicitly unconfigured.
- **Acceptance Criteria:**
  - Correct percentile calculations on sorted latency arrays.
  - Cost calculations mathematically exact when parameters provided.

#### Task L1-04: LLM Evaluation Studio UI & Failure Explorer
- **Unique Task ID:** `TASK-L1-04`
- **Priority:** High (P1)
- **Target Files:**
  - `src/ui/components/llm/llm-dropzone.tsx`
  - `src/ui/components/llm/llm-metric-cards.tsx`
  - `src/ui/components/llm/llm-failure-explorer.tsx`
  - `src/ui/components/llm/record-detail-modal.tsx`
  - `src/app/investigate/llm/page.tsx`
- **Technical Specification:**
  - Build dedicated LLM evaluation studio at `/investigate/llm` (or tab within `/investigate`).
  - Dropzone accepting `.jsonl` and `.csv` files with instant schema validation and record count preview.
  - High-level metric summary cards: Exact Match %, Normalized EM %, Token F1, JSON Validity %, Avg Latency ms, Total Tokens.
  - Failure Explorer Table: Filter by failure type (`Non-matching response`, `Invalid JSON`, `High Latency > threshold`, `Low Token F1 < 0.5`).
  - Record Inspection Drawer: Full prompt, response text, reference answer diff highlighting, metadata viewer, and error tags.
  - Empty states, loading spinners, and error alerts following WhyLab dark/light design tokens.
- **Acceptance Criteria:**
  - Users can upload an evaluation file and inspect individual failed cases in under 3 clicks without page refresh.

#### Task L1-05: LLM Incident Report & Evidence Export
- **Unique Task ID:** `TASK-L1-05`
- **Priority:** High (P1)
- **Target Files:**
  - `src/server/export/llm-report-generator.ts`
  - `src/server/export/pdf-generator.ts` (Extend with LLM section)
  - `tests/unit/llm-report-export.test.mjs`
- **Technical Specification:**
  - Export LLM evaluation results to certified Markdown and native Vector PDF 1.4.
  - Report includes: Dataset name, SHA-256 digest, evaluation timestamp, metric scorecard, top 5 worst-performing failure cases with prompt/response snippets, and latency/cost summary.
- **Acceptance Criteria:**
  - Generated PDF 1.4 binary stream opens cleanly in Acrobat/browser.
  - Markdown report includes copy-pasteable summary tables.

---

## 4. Milestone L2: RAG and LLM Failure Investigation (COMPLETED)

- **Status:** **COMPLETED**
- **Test Invariants:** 232/232 passing tests (185 baseline + 25 L1 tests + 22 L2 tests), 0 TypeScript errors, clean Next.js 16.3.5 App Router build.
- **Deliverables:**
  - `src/core/diagnostics/llm/retrieval-metrics.ts` (Recall@k, MRR, Hit Rate@k, explicit UNAVAILABLE status)
  - `src/core/diagnostics/llm/attribution-checker.ts` (Sentence segmentation, content token overlap, phantom citation detection)
  - `src/core/diagnostics/llm/structured-judge.ts` (1-5 rubrics, epistemic disclaimers, human review routing)
  - `src/core/diagnostics/llm/prompt-comparison.ts` (McNemar test of paired discordant changes, regression alerts)
  - `src/core/domain/llm-tool-contracts.ts` (Allowlisted typed contracts for Astra)
  - `src/server/orchestrator/llm-dispatcher.ts` (Deterministic dispatch yielding immutable Evidence)
  - `src/server/orchestrator/llm-investigator.ts` (Multi-turn autonomous investigation reasoning loop)
  - `src/ui/components/llm/` (`rag-retrieval-card.tsx`, `attribution-inspector.tsx`, `human-review-queue.tsx`, `prompt-comparison-view.tsx`)
  - `public/fixtures/llm/rag-eval.jsonl` (Golden RAG evaluation fixture)
  - 5 test suites: `tests/unit/rag-retrieval-metrics.test.mjs`, `tests/unit/rag-attribution.test.mjs`, `tests/unit/structured-judge.test.mjs`, `tests/unit/prompt-comparison.test.mjs`, `tests/integration/llm-investigation-orchestrator.test.mjs`

### 4.1 Objective
Equip WhyLab with comprehensive Retrieval-Augmented Generation (RAG) diagnostic capabilities, deterministic attribution checks, structured evaluation rubrics, and paired prompt-version comparative testing.

### 4.2 Detailed Task Backlog

#### Task L2-01: RAG Retrieval Evaluation Engine (Recall@k, MRR, Hit Rate)
- **Unique Task ID:** `TASK-L2-01`
- **Priority:** Critical (P0)
- **Target Files:**
  - `src/core/diagnostics/llm/retrieval-metrics.ts`
  - `tests/unit/rag-retrieval-metrics.test.mjs`
- **Technical Specification:**
  - Support evaluation records containing `retrieved_doc_ids: string[]` and `relevant_doc_ids: string[]`.
  - **Recall@k:**
    $$\text{Recall}@k = \frac{|\text{retrieved}_{1..k} \cap \text{relevant}|}{|\text{relevant}|}$$
  - **Mean Reciprocal Rank (MRR):**
    $$\text{MRR} = \frac{1}{|Q|} \sum_{i=1}^{|Q|} \frac{1}{\text{rank}_i}$$
    where $\text{rank}_i$ is the rank of the first relevant document in the retrieved list (or 0 if none found).
  - **Hit Rate@k:** Proportion of queries where at least one relevant document appears in the top $k$.
  - **Safety Rule:** Explicitly report metrics as **UNAVAILABLE** if ground-truth relevance labels (`relevant_doc_ids`) are absent, avoiding fabricated retrieval claims.
- **Acceptance Criteria:**
  - Reference calculation tests matching textbook IR benchmarks.
  - Handled edge cases: $k >$ retrieved count, empty relevant list, duplicate document IDs.

#### Task L2-02: Deterministic Context Relevance & Unsupported-Claim Detection
- **Unique Task ID:** `TASK-L2-02`
- **Priority:** High (P1)
- **Target Files:**
  - `src/core/diagnostics/llm/attribution-checker.ts`
  - `tests/unit/rag-attribution.test.mjs`
- **Technical Specification:**
  - Segment model response into sentences/claims.
  - Compute word/entity n-gram overlap between each response claim and the retrieved context passages.
  - Flag claims with low context support ($< 25\%$ token overlap) as `UNSUPPORTED_CLAIM_SUSPICION`.
  - Validate citation tags (e.g. `[1]`, `[doc_3]`) against actual retrieved chunk IDs to identify phantom citations.
- **Acceptance Criteria:**
  - Flags responses containing facts not present in provided context.
  - Verifies valid citations without generating false alarms on generic transition phrases.

#### Task L2-03: Rubric-Based Structured Judge with Human Review Queue
- **Unique Task ID:** `TASK-L2-03`
- **Priority:** High (P1)
- **Target Files:**
  - `src/core/diagnostics/llm/structured-judge.ts`
  - `src/ui/components/llm/human-review-queue.tsx`
  - `tests/unit/structured-judge.test.mjs`
- **Technical Specification:**
  - Provide typed rubric definitions (e.g. correctness 1-5, groundedness, conciseness, tone).
  - Generate structured evaluation JSON with reasoning and confidence score.
  - **Epistemic Labeling:** Clearly designate model-judge outputs as **Simulated / Model Judgment**, not verified ground truth.
  - When judge confidence is $< 0.70$ or criteria conflict, automatically route case to the **Human Review Queue** for manual clinician/engineer sign-off.
- **Acceptance Criteria:**
  - Structured output strictly validates against JSON schema.
  - Cases tagged `NEEDS_HUMAN_REVIEW` render in review interface with one-click approve/override actions.

#### Task L2-04: Paired Prompt-Version Comparative Evaluation
- **Unique Task ID:** `TASK-L2-04`
- **Priority:** High (P1)
- **Target Files:**
  - `src/core/diagnostics/llm/prompt-comparison.ts`
  - `tests/unit/prompt-comparison.test.mjs`
- **Technical Specification:**
  - Ingest paired evaluation cases where Prompt A and Prompt B were run on the same test cases.
  - Compute paired statistical significance: McNemar test for exact match success/failure pairs, paired t-test / Wilcoxon signed-rank for token F1 and latency.
  - Generate before/after win/loss/tie matrix:
    - Cases improved by Prompt B.
    - Cases regressed by Prompt B.
    - Invariant cases.
- **Acceptance Criteria:**
  - Correct contingency table and McNemar p-value calculation.
  - Flags prompt regressions where Prompt B fixed case X but broke case Y.

#### Task L2-05: Astra LLM Tool Registry & Orchestrator Integration
- **Unique Task ID:** `TASK-L2-05`
- **Priority:** Critical (P0)
- **Target Files:**
  - `src/core/domain/tool-contracts.ts` (Add LLM tools to `toolSchemas`)
  - `src/server/orchestrator/dispatcher.ts` (Register LLM tools)
  - `src/server/orchestrator/provider-offline.ts` (Add LLM investigation planner)
  - `tests/integration/llm-investigation-orchestrator.test.mjs`
- **Technical Specification:**
  - Register new tools in Astra's typed allowlist:
    - `compute_llm_text_metrics`
    - `validate_json_schema`
    - `evaluate_rag_retrieval`
    - `check_context_attribution`
    - `compare_prompt_versions`
  - Update `OfflineInvestigatorProvider` to plan LLM failure investigations:
    - Round 1: Baseline text & schema metrics.
    - Round 2: Categorize failure mode (`SCHEMA_CORRUPTION`, `RETRIEVAL_FAILURE`, `HALLUCINATION`).
    - Round 3: Counterfactual/comparative verification.
    - Round 4: Formulate prompt repair recommendation.
  - Require immutable Evidence IDs for all generated findings.
- **Acceptance Criteria:**
  - Astra autonomously completes a multi-turn LLM failure investigation yielding hypotheses and a final diagnosis.

---

## 5. Milestone C1: Computer Vision Classification MVP (COMPLETED)

- **Status:** **COMPLETED**
- **Test Invariants:** 249/249 passing tests (185 baseline + 25 L1 + 22 L2 + 17 C1 tests), 0 TypeScript compilation errors, clean Next.js 16.3.5 App Router build.
- **Deliverables:**
  - `src/core/domain/vision-types.ts`
  - `src/server/vision/archive-extractor.ts` (Zip bomb CWE-409 & path traversal CWE-22 defenses)
  - `src/server/vision/image-validator.ts` (Magic bytes header validation for JPEG, PNG, WebP)
  - `src/core/diagnostics/vision/image-quality.ts` (Luminance, RMS contrast, Laplacian sharpness variance, clipping)
  - `src/core/diagnostics/vision/multiclass-metrics.ts` (K x K confusion matrix, per-class F1, failure categorization)
  - `src/core/diagnostics/vision/exact-duplicates.ts` (SHA-256 byte clustering, cross-split leakage detection)
  - `src/server/vision/thumbnail-generator.ts` (128x128 thumbnails & synthetic lesion visualization)
  - `src/ui/components/vision/` (`vision-metric-cards.tsx`, `misclassification-filter.tsx`, `image-gallery.tsx`, `image-detail-modal.tsx`, `confusion-matrix-view.tsx`, `duplicate-scanner-view.tsx`, `quality-drift-view.tsx`)
  - `src/app/investigate/vision/page.tsx`
  - 4 test suites: `tests/unit/vision-archive-ingestion.test.mjs`, `tests/unit/vision-image-quality.test.mjs`, `tests/unit/vision-multiclass-metrics.test.mjs`, `tests/unit/vision-exact-duplicates.test.mjs`

### 5.1 Objective
Enable secure, memory-safe ingestion of image archives and CSV manifests, compute rigorous classification metrics, extract deterministic image quality indicators, and identify misclassifications with a progressive thumbnail gallery.

### 5.2 Detailed Task Backlog

#### Task C1-01: Safe Image Archive Ingestion & Manifest Validator
- **Unique Task ID:** `TASK-C1-01`
- **Priority:** Critical (P0)
- **Target Files:**
  - `src/server/vision/archive-extractor.ts`
  - `src/server/vision/image-validator.ts`
  - `src/core/domain/vision-types.ts`
  - `tests/unit/vision-archive-ingestion.test.mjs`
- **Technical Specification:**
  - Accept `.zip` archive containing images + companion `.csv` manifest mapping `image_id` / `filename` to `y_true`, `y_pred`, and optional `confidence`.
  - **Security Defenses:**
    - Decompression bomb defense: Max 250MB extracted size, max 5,000 files, compression ratio ceiling 10:1.
    - Path traversal defense: Reject any zip entry containing `..` or leading slashes.
    - Magic byte verification: Only allow JPEG (`0xFF 0xD8 0xFF`), PNG (`0x89 0x50 0x4E 0x47`), and WebP (`RIFF....WEBP`).
  - Match manifest rows with extracted image filenames; flag missing or unreferenced images.
- **Acceptance Criteria:**
  - Rejects malicious zip bombs and traversal archives safely.
  - Matches 100% of valid manifest rows to images.

#### Task C1-02: Deterministic Image Quality & Statistical Profile Extractor
- **Unique Task ID:** `TASK-C1-02`
- **Priority:** High (P1)
- **Target Files:**
  - `src/core/diagnostics/vision/image-quality.ts`
  - `tests/unit/vision-image-quality.test.mjs`
- **Technical Specification:**
  - Pure TypeScript/Buffer feature extraction (zero native C++ or headless browser dependencies):
    - **Dimensions & Aspect Ratio:** Parse width, height from image headers (SOF0 for JPEG, IHDR for PNG).
    - **Mean Luminance / Brightness:** Average grayscale intensity in $[0, 255]$: $Y = 0.299R + 0.587G + 0.114B$.
    - **RMS Contrast:** Standard deviation of luminance values across image pixels.
    - **Blur / Sharpness Indicator:** Discrete Laplacian kernel variance or high-frequency gradient magnitude estimator.
    - **Clipping Metrics:** Percentage of clipped highlight pixels ($Y > 250$) and crushed black pixels ($Y < 5$).
- **Acceptance Criteria:**
  - Correctly extracts dimensions, luminance, and sharpness indicators.
  - Deterministic and identical results across executions on standard test images.

#### Task C1-03: Multiclass Classification & Per-Class Metrics Engine
- **Unique Task ID:** `TASK-C1-03`
- **Priority:** High (P1)
- **Target Files:**
  - `src/core/diagnostics/vision/multiclass-metrics.ts`
  - `tests/unit/vision-multiclass-metrics.test.mjs`
- **Technical Specification:**
  - Construct $K \times K$ multiclass confusion matrix from manifest `y_true` and `y_pred`.
  - Calculate per-class metrics: True Positives, False Positives, False Negatives, Precision, Recall, F1, and Class Prevalence.
  - Calculate aggregate metrics: Overall Accuracy, Macro-averaged F1, Micro-averaged F1, Weighted F1.
  - Report undefined metrics (e.g. 0 true positive instances) explicitly as `null` with descriptive limitation notices rather than zero or NaN.
- **Acceptance Criteria:**
  - Matches Scikit-Learn `classification_report` output within $\pm 10^{-5}$ on multiclass fixtures.

#### Task C1-04: Exact Image Duplicate Scanner
- **Unique Task ID:** `TASK-C1-04`
- **Priority:** Medium (P2)
- **Target Files:**
  - `src/core/diagnostics/vision/exact-duplicates.ts`
  - `tests/unit/vision-exact-duplicates.test.mjs`
- **Technical Specification:**
  - Compute SHA-256 hash of each uncompressed image byte stream.
  - Identify duplicate image clusters.
  - Flag any duplicate pairs spanning different splits (e.g. Image A in `train` identical to Image B in `val`).
- **Acceptance Criteria:**
  - Detects duplicate images even if filenames differ.
  - Emits split contamination warning on cross-split matches.

#### Task C1-05: Safe Gallery UI, Misclassification Explorer & Thumbnails
- **Unique Task ID:** `TASK-C1-05`
- **Priority:** High (P1)
- **Target Files:**
  - `src/server/vision/thumbnail-generator.ts`
  - `src/ui/components/vision/image-gallery.tsx`
  - `src/ui/components/vision/misclassification-filter.tsx`
  - `src/ui/components/vision/image-detail-modal.tsx`
  - `src/app/investigate/vision/page.tsx`
- **Technical Specification:**
  - Generate lightweight 128x128 thumbnails during upload storage.
  - Display paginated image grid (max 48 per page) to prevent browser DOM memory bloat.
  - Filter by error type: False Positives, False Negatives, Low Confidence Correct, High Confidence Incorrect.
  - Image card shows thumbnail, ground truth badge, predicted badge, confidence bar, and quality indicators (sharpness, luminance).
  - Modal view displays full image, zoom, histogram, and metadata attributes.
- **Acceptance Criteria:**
  - Renders 500+ image dataset smoothly without UI stutter or memory leaks.

---

## 6. Milestone C2: Advanced Computer Vision Investigation (COMPLETED)

- **Status:** **COMPLETED**
- **Test Invariants:** 260/260 passing tests (185 baseline + 25 L1 + 22 L2 + 17 C1 + 11 C2 tests), 0 TypeScript compilation errors, clean Next.js 16.3.5 App Router build.
- **Deliverables:**
  - `src/core/diagnostics/vision/perceptual-hash.ts` (64-bit dHash & aHash, bitwise Hamming distance popcount)
  - `src/core/diagnostics/vision/leakage-detector.ts` (Near-duplicate cross-split leakage with 95% Wilson CIs)
  - `src/core/diagnostics/vision/quality-drift.ts` (Two-sample KS, 10-bin PSI, Wasserstein-1 distance)
  - `src/core/diagnostics/vision/shortcut-detector.ts` (Scale ruler confounder diagnostic, odds ratio, recall collapse)
  - `src/core/diagnostics/vision/robustness-evaluator.ts` (Zero Code Execution invariant with offline generation guidance)
  - `src/core/domain/vision-tool-contracts.ts` (Typed allowlist contracts for Astra)
  - `src/server/orchestrator/vision-dispatcher.ts` (Deterministic tool dispatcher producing typed Evidence)
  - `src/server/orchestrator/vision-investigator.ts` (Autonomous multi-turn reasoning loop discovering all 3 planted defects)
  - `src/ui/components/vision/` (`perceptual-leakage-view.tsx`, `shortcut-analysis-view.tsx`, `autonomous-investigation-view.tsx`)
  - `src/app/investigate/vision/page.tsx` (Expanded with all 6 diagnostic tabs)
  - 5 test suites: `tests/unit/vision-perceptual-leakage.test.mjs`, `tests/unit/vision-quality-drift.test.mjs`, `tests/unit/vision-shortcut-detector.test.mjs`, `tests/unit/vision-robustness.test.mjs`, `tests/integration/vision-investigation-orchestrator.test.mjs`

### 6.1 Objective
Diagnose complex computer vision failure modes including perceptual duplicate leakage across splits, image quality distribution shifts, shortcut learning (confounding artifacts), and integrate CV diagnostics into Astra.

### 6.2 Detailed Task Backlog

#### Task C2-01: Perceptual Hashing (dHash/aHash) Cross-Split Leakage Engine
- **Unique Task ID:** `TASK-C2-01`
- **Priority:** Critical (P0)
- **Target Files:**
  - `src/core/diagnostics/vision/perceptual-hash.ts`
  - `src/core/diagnostics/vision/leakage-detector.ts`
  - `tests/unit/vision-perceptual-leakage.test.mjs`
- **Technical Specification:**
  - Implement 64-bit Difference Hash (dHash) and Average Hash (aHash) in pure TypeScript:
    1. Resize image to $9 \times 8$ grayscale.
    2. Compute horizontal gradient: bit = 1 if pixel[x] > pixel[x+1], else 0.
    3. Output 64-bit hex hash string.
  - Scan training vs validation/production splits:
    - Compute pairwise Hamming distance.
    - Pairs with Hamming distance $\le 1$ bit are flagged as **Perceptual Near-Duplicates**.
  - Quantify performance gap: Compare accuracy on leaked near-duplicates vs clean images with 95% Wilson CI.
- **Acceptance Criteria:**
  - Successfully identifies the 3 planted near-duplicates in `public/fixtures/vision/` (`derm_val_004`, `derm_val_018`, `derm_val_032`) matching `README.md`.
  - Proves the +36.2 percentage point leakage inflation gap.

#### Task C2-02: Image Quality Distribution Shift & Cohort Drift
- **Unique Task ID:** `TASK-C2-02`
- **Priority:** High (P1)
- **Target Files:**
  - `src/core/diagnostics/vision/quality-drift.ts`
  - `tests/unit/vision-quality-drift.test.mjs`
- **Technical Specification:**
  - Compare image quality metric distributions between splits (e.g. `train` vs `val` vs `production`) or acquisition sites (`site_A` vs `site_B`):
    - Two-sample Kolmogorov-Smirnov (KS) distance.
    - Population Stability Index (PSI) with 10 equal-width bins.
    - Wasserstein-1 distance on sharpness and luminance.
  - Slice evaluation over sharpness quintiles: Detect performance collapse on blurry images.
- **Acceptance Criteria:**
  - Detects severe distribution shift between Tripod Dermascope (`site_A`, sharpness: 277) and Handheld Mobile (`site_B`, sharpness: 112).

#### Task C2-03: Shortcut Learning & Watermark/Ruler Confounder Diagnostic
- **Unique Task ID:** `TASK-C2-03`
- **Priority:** High (P1)
- **Target Files:**
  - `src/core/diagnostics/vision/shortcut-detector.ts`
  - `tests/unit/vision-shortcut-detector.test.mjs`
- **Technical Specification:**
  - Analyze correlation between metadata tags / visual artifacts (e.g. `has_ruler`, border watermark) and target/predicted class.
  - Compute prevalence disparity: Shortcut prevalence in training positives (78%) vs production positives (5%).
  - Compute model recall collapse when shortcut is absent (e.g. recall drops to 22%).
  - Formulate evidence-backed finding proving model learned spurious correlation.
- **Acceptance Criteria:**
  - Accurately proves planted ruler shortcut defect in flagship vision fixture.

#### Task C2-04: Controlled Robustness Tests (Zero Code Execution Invariant)
- **Unique Task ID:** `TASK-C2-04`
- **Priority:** Medium (P2)
- **Target Files:**
  - `src/core/diagnostics/vision/robustness-evaluator.ts`
  - `tests/unit/vision-robustness.test.mjs`
- **Technical Specification:**
  - **Security Invariant:** Strictly prohibit arbitrary uploaded model Python/PyTorch code execution.
  - For robustness evaluation:
    - If precomputed perturbed predictions exist in the dataset (e.g. `pred_gaussian_noise`, `pred_motion_blur`), evaluate accuracy decay curves.
    - If no perturbation predictions are supplied, explicitly mark robustness evaluation as **UNAVAILABLE** with an educational guide on how to export test batches.
- **Acceptance Criteria:**
  - Zero arbitrary code execution risk.
  - Transparently separates verified data from unavailable capabilities.

#### Task C2-05: Astra Vision Tool Registry & Orchestrator Integration
- **Unique Task ID:** `TASK-C2-05`
- **Priority:** Critical (P0)
- **Target Files:**
  - `src/core/domain/tool-contracts.ts` (Add Vision tools)
  - `src/server/orchestrator/dispatcher.ts` (Register Vision tools)
  - `src/server/orchestrator/provider-offline.ts` (Add Vision investigation planner)
  - `tests/integration/vision-investigation-orchestrator.test.mjs`
- **Technical Specification:**
  - Register CV tools in Astra allowlist:
    - `compute_multiclass_metrics`
    - `profile_image_quality`
    - `scan_perceptual_leakage`
    - `detect_quality_drift`
    - `scan_shortcut_bias`
  - Implement automated vision reasoning loop in `OfflineInvestigatorProvider`:
    - Round 1: Multiclass confusion matrix & baseline per-class recall.
    - Round 2: Scan for cross-split perceptual near-duplicates.
    - Round 3: Evaluate image quality quintiles (sharpness/luminance).
    - Round 4: Formulate `SHORTCUT_BIAS` or `ACQUISITION_SHIFT` hypothesis.
    - Round 5: Propose quality floor filtering repair.
- **Acceptance Criteria:**
  - End-to-end autonomous investigation on `public/fixtures/vision/` discovers and confirms all three planted defects.

---

## 7. Milestone U1: Unified Multi-Modal Investigation Experience (COMPLETED)

- **Status:** **COMPLETED**
- **Test Invariants:** 264/264 passing tests (185 baseline + 25 L1 + 22 L2 + 17 C1 + 11 C2 + 4 U1 integration tests), 0 TypeScript compilation errors (`tsc --noEmit`), clean Next.js 16.3.5 build.
- **Deliverables:**
  - `src/ui/components/ingest/modality-selector.tsx` (Unified modality selector with active pill styling and capability highlights)
  - `src/app/investigate/page.tsx` (Dynamic multi-modal studio adapting Stage 01 Ingest across Tabular, LLM, and CV with query string state preservation)
  - `src/ui/components/repair/multimodal-repair-lab.tsx` (Stage 05 Multi-Modal Repair Lab for Tabular sweep, LLM prompt/schema guards, and CV sharpness/confounder filters)
  - `src/server/repair/types.ts` & `src/server/repair/code-generator.ts` (Multi-modal repair policies embedding `AUTOMATED_DEPLOYMENT_PROHIBITED = True` across Python, TypeScript, JSON, and YAML)
  - `src/server/repair/repair-registry.ts` (Multi-modal policy registration, human reviewer sign-off, and audit event tracking)
  - `src/server/export/incident-report.ts` (Multi-modal incident reporting extracting modality-specific audits and cryptographic SHA-256 digest)
  - `src/server/export/pdf-generator.ts` (Dynamic vector PDF 1.4 stream embedding Section 1c Multi-Modal Diagnostic Profile and SHA-256 digest attestation)
  - `tests/integration/multimodal-e2e.test.mjs` (Comprehensive multi-modal E2E integration test suite covering Tabular, LLM, CV, and Repair workflows)

### 7.1 Objective
Synthesize Tabular, LLM, and Computer Vision modalities into a coherent, seamless SaaS user journey with unified Astra orchestration, progressive disclosure, multimodal repair lab, and PDF reporting.

### 7.2 Detailed Task Backlog

#### Task U1-01: Modality Switcher & Dynamic Studio Architecture (COMPLETED)
- **Unique Task ID:** `TASK-U1-01`
- **Priority:** High (P1)
- **Status:** **COMPLETED**
- **Target Files:**
  - `src/ui/components/ingest/modality-selector.tsx`
  - `src/app/investigate/page.tsx`
- **Technical Specification:**
  - Add unified modality selection pills at `/investigate`:
    - **Tabular ML** (Default / Preserved)
    - **LLM & RAG**
    - **Computer Vision**
  - Adapts Stage 01 (Ingest) dropzone, sample previews, and capability checklists dynamically to the active modality.
  - Preserves investigation URL state (`?modality=tabular`, `?modality=llm`, `?modality=vision`).
- **Acceptance Criteria:**
  - Switching modalities swaps dropzone and preview without page reload.
  - Tabular workflow remains 100% regression-free.

#### Task U1-02: Multi-Modal Repair Lab (COMPLETED)
- **Unique Task ID:** `TASK-U1-02`
- **Priority:** High (P1)
- **Status:** **COMPLETED**
- **Target Files:**
  - `src/ui/components/repair/multimodal-repair-lab.tsx`
  - `src/server/repair/repair-registry.ts`
  - `src/server/repair/types.ts`
  - `src/server/repair/code-generator.ts`
- **Technical Specification:**
  - Tailor Stage 05 (Repair Lab) by modality:
    - **Tabular:** 101-point threshold sweep and domain cost matrix.
    - **LLM:** System prompt refinement, schema validation retry rule, and retrieval $k$ tuning before-after matrix.
    - **Vision:** Image quality threshold filter (e.g. reject images with sharpness $< 150$ to human inspection) and rejection cost trade-offs.
  - All modalities strictly enforce human review gatekeeper with mandatory comments and `AUTOMATED_DEPLOYMENT_PROHIBITED = True` code exports.
- **Acceptance Criteria:**
  - Before-after matrix clearly illustrates trade-offs across all 3 modalities.

#### Task U1-03: Multi-Modal Incident Report & PDF Vector Generator (COMPLETED)
- **Unique Task ID:** `TASK-U1-03`
- **Priority:** High (P1)
- **Status:** **COMPLETED**
- **Target Files:**
  - `src/server/export/incident-report.ts`
  - `src/server/export/pdf-generator.ts`
- **Technical Specification:**
  - Dynamic PDF 1.4 vector generator layout:
    - Tabular: Render confusion matrix, ROC/PR curves, threshold sweep table.
    - LLM: Render prompt-response breakdown, token/latency scorecard, retrieval MRR, citation attribution.
    - Vision: Render multiclass confusion matrix, image quality shift curves, shortcut correlation findings.
  - Cryptographic SHA-256 attestation header on all exports.
- **Acceptance Criteria:**
  - Generates publication-ready vector PDF for all 3 modalities without third-party rendering bloat.

#### Task U1-04: Full Multi-Modal E2E Test Suite & Documentation (COMPLETED)
- **Unique Task ID:** `TASK-U1-04`
- **Priority:** Critical (P0)
- **Status:** **COMPLETED**
- **Target Files:**
  - `tests/integration/multimodal-e2e.test.mjs`
  - `docs/roadmap/milestone-status.md`
- **Technical Specification:**
  - Automated integration test executing:
    1. Tabular investigation on `melanoma-synthetic.csv`.
    2. LLM investigation on structured prompt-response fixture.
    3. Computer Vision investigation on `public/fixtures/vision/`.
  - Verify all 3 complete end-to-end with evidence, hypotheses, repairs, and PDF reports.
  - Ensure 100% test pass rate across the workspace.
- **Acceptance Criteria:**
  - All test suites passing, zero TypeScript errors, clean Next.js build.

---

## 8. Summary of Milestones & Quality Gates

| Milestone | Target Scope | Key Acceptance Criteria | Status |
| :---: | :--- | :--- | :---: |
| **L0** | **Repository Audit & Architecture** | Gap analysis & implementation plan delivered; zero tabular regressions. | **COMPLETED** |
| **L1** | **LLM Evaluation MVP** | JSONL/CSV ingestion, Exact Match, Token F1, JSON Schema, Failure Explorer UI. | **COMPLETED** |
| **L2** | **RAG & LLM Investigation** | Recall@k, MRR, Attribution check, Structured Judge, Paired Prompt comparison, Astra loop. | **COMPLETED** |
| **C1** | **CV Classification MVP** | Safe ZIP ingestion, Multiclass metrics, Sharpness/Luminance, Duplicate check, Gallery UI. | **COMPLETED** |
| **C2** | **Advanced CV Investigation** | dHash Near-Duplicate scan, Quality shift KS/PSI, Shortcut ruler bias, Astra CV loop. | **COMPLETED** |
| **U1** | **Unified Multi-Modal Studio** | Top-level modality switcher, Multimodal Repair Lab, Unified PDF report generator. | **COMPLETED** |

# WhyLab 2.0 — Frontend Refinement Progress

## Overview
This document tracks the execution of the 7-milestone professional frontend refinement of WhyLab 2.0, focusing on the Investigation Studio (`/investigate`), multi-artifact ingestion, column mapping, sample data preview, workflow navigation, and Astra telemetry.

---

## Milestone Status Summary

| Milestone | Title | Status | Completion Date |
|-----------|-------|--------|-----------------|
| **Milestone 1** | Frontend Audit & Architecture Review | Completed | 2026-10-08 |
| **Milestone 2** | Design System & Form Control Refinement | Completed | 2026-10-08 |
| **Milestone 3** | Upload & Multi-Artifact Management UI | Completed | 2026-10-08 |
| **Milestone 4** | Column Mapping & Dataset-Aware Guidance | Completed | 2026-10-08 |
| **Milestone 5** | Data Table Preview & Workflow Stepper | Completed | 2026-10-08 |
| **Milestone 6** | Astra Telemetry Console & Responsive Layout | Completed | 2026-10-08 |
| **Milestone 7** | Regression Verification & Build Testing | Completed | 2026-10-08 |

---

## Milestone 1: Frontend Audit & Architecture Review
- **Completed:** 2026-10-08
- **Scope:** Inspected CSS architecture (`tokens.css`, `dark-grid.css`, `components.css`), Studio layout (`src/app/investigate/page.tsx`), dropzone component (`multi-artifact-dropzone.tsx`), column mapping (`column-mapper.tsx`), and capability checklist (`capability-checklist.tsx`).
- **Defects Cataloged:**
  - Form selects suffered from poor contrast in dark mode browsers.
  - Rigid 50/50 layout permanently squeezed the workbench even while Astra was idle.
  - Disaster-tweets dataset (labels without predictions) had no honest partial-evidence handling.
  - Data preview table lacked sticky headers, text cell expansion for NLP text, and null badges.
  - Multi-artifact cards had cramped vertical spacing, unstyled role dropdowns, and tiny remove buttons.

---

## Milestone 2: Design System & Form Control Refinement
- **Completed:** 2026-10-08
- **Files Modified:** `src/ui/styles/components.css`
- **Key Enhancements:**
  - Standardized `.form-group`, `.form-label`, `.form-helper`, `.form-error` classes.
  - Added `.select-control` with dark background (`var(--bg-surface-elevated)`), high-contrast text (`#f8fafc`), custom SVG down-chevron, visible focus ring (`var(--border-focus)`), and dark-styled `<option>` and `<optgroup>` elements (`#0b101c`).
  - Added `.input-control` matching component heights (34px) and focus transitions.
  - Created `.upload-dropzone` with drag-active states, dashed borders, and keyboard focus rings.
  - Added `.artifact-card`, `.artifact-card-name` (truncated mono with tooltip), `.artifact-card-meta`, and `.btn-icon-danger`.
  - Added `.table-modern` with sticky headers (`position: sticky`), `.table-cell-text` with click-to-expand state, and `.badge-null` for missing value representation.
  - Added responsive grid utilities: `.studio-grid-split`, `.studio-grid-full`, and `.telemetry-minimized-bar`.

---

## Milestone 3: Upload & Multi-Artifact Management UI
- **Completed:** 2026-10-08
- **Files Modified:** `src/ui/components/ingest/multi-artifact-dropzone.tsx`
- **Key Enhancements:**
  - Replaced unstyled native file input with a professional drag-and-drop zone.
  - Added keyboard accessibility (`role="button"`, `tabIndex={0}`, Enter / Space keydown handlers).
  - Explicit supported format badges (`.CSV`, `.TSV`, `.JSON`, `.JSONL`, `.LOG`) and `Max 2.0 MB per file` badge.
  - Polished artifact cards with format icons (`FileSpreadsheet`, `FileCode`, `FileText`), truncated monospace filenames with full native tooltips, row/column/epoch metadata pills.
  - Dark-mode styled role dropdown using `.select-control` with human-readable labels (`Evaluation`, `Model Predictions`, `Reference Baseline`, `Training Split`, etc.).
  - Validation status icons (`CheckCircle2`, `AlertTriangle`, `XCircle`) and accessible remove icon button (`.btn-icon-danger`).
  - Professional "Add Another File" button in the section header.

---

## Milestone 4: Column Mapping & Dataset-Aware UX
- **Completed:** 2026-10-08
- **Files Modified:**
  - `src/ui/components/ingest/column-mapper.tsx`
  - `src/ui/components/ingest/capability-checklist.tsx`
  - `src/app/investigate/page.tsx`
- **Dataset-Awareness Requirement (e.g., Disaster-Tweets Scenario):**
  - Dataset with `id`, `keyword`, `location`, `text`, `target` has labeled ground truth but no model predictions.
  - Recognized this scenario gracefully without showing red validation errors or forcing users to pick an unrelated column.
  - Added prominent informative alert:
    > *"This dataset contains labels but no model predictions. WhyLab can profile the dataset, inspect data quality, and audit feature distributions. Upload prediction outputs to enable model performance evaluation and threshold tuning."*
  - Added dropdown option `-- None (Data Profiling & Quality Only) --`.
  - In `CapabilityChecklist`, updated `raw_features_no_predictions` to render an amber `PARTIAL EVIDENCE: LABELS ONLY` badge instead of a failure state.
  - In `InvestigatePage`, enabled a dedicated "Inspect Dataset Profile & Data Quality" action that seamlessly transitions to the Profile stage.

---

## Milestone 5: Sample Data Preview & Workflow Stepper
- **Completed:** 2026-10-08
- **Files Modified:**
  - `src/ui/components/ingest/column-mapper.tsx`
  - `src/app/investigate/page.tsx`
- **Key Enhancements:**
  - Sticky table headers on the preview table (`.table-modern th`) with column role badges (`Target`, `Pred`, `Prob`, `Slice`).
  - Expandable long text values: text longer than 40 characters (e.g. disaster-tweet strings) truncates gracefully with an inline `[+]` toggle to expand full text without breaking table layout.
  - Distinct `<span className="badge-null">null</span>` indicator for missing values.
  - Refined the 6-stage workflow stepper (`01 Ingest → 06 Report`):
    - Real-time status indicators: active (primary highlight), completed (green checkmark), partial / missing evidence (amber badge), and locked (muted opacity).
    - Functional stage tabs: switching to `02 Profile` presents a dedicated Dataset Profile dashboard displaying column summary statistics, missingness percentages, distinct counts, and sample values.
    - Subsequent stages (`03 Investigate`, `04 Verify`, `05 Repair`, `06 Report`) provide clear guidance and direct links to generated workspaces.

---

## Milestone 6: Astra Telemetry Console & Responsive Layout
- **Completed:** 2026-10-08
- **Files Modified:**
  - `src/app/investigate/page.tsx`
  - `src/ui/styles/components.css`
- **Key Enhancements:**
  - Made the Astra Telemetry console collapsible:
    - When idle, telemetry defaults to collapsed (`studio-grid-full`), granting the Workbench 100% of the screen width for spacious data preview and column configuration.
    - When collapsed, a sleek minimized status bar displays connection status (`○ IDLE`), event counts, and click-to-expand control.
    - When launching an investigation, the console automatically expands into a 2-column split (`studio-grid-split`).
    - Added header toggle button and close (`X`) icon inside the terminal header.
  - Auto-scrolling terminal logs using `terminalEndRef.scrollIntoView({ behavior: 'smooth' })`.
  - Monospace dark terminal theme (`#05070c`) with color-coded log entries (blue for tool calls, green for results, purple for hypotheses, amber for experiments, rose for repairs, red for errors).

---

## Milestone 7: Testing & Regression Verification
- **Completed:** 2026-10-08
- **Verifications Executed:**
  1. **TypeScript Typecheck (`npx tsc --noEmit`):**
     - Exited with code 0 (zero errors, zero warnings).
  2. **Automated Unit & Integration Test Suite (`node --test tests/**/*.test.mjs`):**
     - Total Tests: 110
     - Passed: 110
     - Failed: 0
     - Skipped: 0
     - Duration: ~14.5s
  3. **Next.js Production Build (`npm run build`):**
     - Compiled successfully in 13.1s with Next.js 16.3.5 (Turbopack).
     - Static & dynamic route optimization passed across all 19 application routes:
       - `/` (Home)
       - `/investigate` (Investigation Studio)
       - `/investigations/[id]` (Workspace)
       - `/investigations/[id]/evidence`
       - `/investigations/[id]/hypotheses`
       - `/investigations/[id]/repair`
       - `/investigations/[id]/report`
       - `/learn`, `/settings`, `/workspace`
       - All 9 API endpoints (`/api/investigate`, `/api/investigations/[id]/pdf`, `/api/repair`, etc.)

---

## Architectural & Integration Summary

### Partial-Evidence Integration Note
WhyLab's autonomous multi-turn falsification loop (`runAutonomousInvestigation`) is specialized for model reliability evaluation and requires paired `actual` (ground-truth) and `predicted` columns to compute confusion matrices, threshold sweeps, and accuracy paradox experiments. For partial-evidence datasets containing ground truth but no model predictions (such as the Kaggle disaster-tweets benchmark):
1. The frontend honestly identifies the absence of predictions and avoids pressuring the user into assigning unrelated columns.
2. The user is empowered to run descriptive profiling and data quality checks immediately in Stage 02.
3. Once prediction outputs (e.g. inference predictions from a model) are uploaded as a companion artifact, WhyLab seamlessly links the multi-artifact workspace and unlocks full autonomous investigation.

---

### Typography & Readability Scaling
- Enhanced the project's root typography scale in [`tokens.css`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/ui/styles/tokens.css):
  - `--text-xs`: scaled from `12px` to `13.5px` (`0.84375rem`)
  - `--text-sm`: scaled from `13px` to `15px` (`0.9375rem`)
  - `--text-base`: scaled from `14px` to `16px` (`1rem`)
  - `--text-md`: scaled from `15px` to `17px` (`1.0625rem`)
  - `--text-lg`: scaled from `16px` to `19px` (`1.1875rem`)
  - `--text-xl`: scaled from `18px` to `21px` (`1.3125rem`)
  - `--text-2xl`: scaled from `22px` to `26px` (`1.625rem`)
  - `--text-3xl`: scaled from `28px` to `34px` (`2.125rem`)
  - `--text-4xl`: scaled from `36px` to `42px` (`2.625rem`)
- Adjusted component controls in [`components.css`](file:///c:/Users/varun/OneDrive/Desktop/WhyLab%202.0/src/ui/styles/components.css) to comfortably accommodate the larger typography:
  - Form inputs (`.input-control`) and dropdowns (`.select-control`): font size increased to `15px`, height to `38px`.
  - Buttons (`.btn`): height scaled to `38px` (`.btn-sm` to `32px`).
  - Form labels (`.form-label`): font size increased from `11px` to `13px`.
  - Data preview table (`.table-modern`): table cell text increased to `15px`, headers to `13px`, null badges to `12px`.
  - Multi-artifact cards & badges: scaled from `10px-11px` to `12px-13.5px`.


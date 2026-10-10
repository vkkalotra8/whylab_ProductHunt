# WhyLab 2.0 — Production Quality Assurance & Test Strategy

**Document Version:** 1.0.0 (M0 Baseline)  
**Date:** October 10, 2026  
**Status:** Approved Testing Strategy Baseline (112/112 Current Tests Passing)  

---

## 1. Testing Pyramid & Verification Tiers

WhyLab 2.0 employs a strict 4-tier testing hierarchy to guarantee scientific accuracy, operational reliability, and security compliance:

```
                      ┌──────────────────────────┐
                      │    TIER 4: E2E & LOAD    │
                      │  Playwright Browser / K6 │
                      └────────────┬─────────────┘
                                   │
                      ┌────────────┴─────────────┐
                      │  TIER 3: SECURITY & GOLD │
                      │ 7 Benchmarks / OWASP Top │
                      └────────────┬─────────────┘
                                   │
                      ┌────────────┴─────────────┐
                      │   TIER 2: INTEGRATION    │
                      │ 6 Stages / Store / Worker│
                      └────────────┬─────────────┘
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         │             TIER 1: UNIT & MATH (100%)            │
         │ Deterministic Math, Confusion Matrix, AUC, Sweeps │
         └───────────────────────────────────────────────────┘
```

---

## 2. Test Execution Commands & Environment

| Test Scope | Command | Current Baseline | Target Gate |
| :--- | :--- | :--- | :--- |
| **All Automated Tests** | `npm test` | **112 / 112 PASS (~18s)** | 100% pass, 0 regressions |
| **Strict Type Checking** | `npm run typecheck` | **0 errors** | Zero `any` escapes, clean build |
| **Linter Compliance** | `npm run lint` | **PASS** | Zero unused vars or warnings |
| **Production Build** | `npm run build` | **PASS (53s Turbopack)** | 19 routes successfully built |

---

## 3. Mathematical & Diagnostic Edge Cases Tested

The unit test suite (`tests/unit/`) validates critical statistical edge cases:
1. **Single-Class Datasets:** Datasets containing only 0s or only 1s gracefully return `{ status: 'undefined' }` for AUC and specificity without throwing `NaN` or dividing by zero.
2. **Zero Positive Predictions:** When a model predicts only negative outcomes ($TP = FP = 0$), Precision is explicitly marked as undefined rather than fabricated as 0.0 or 1.0.
3. **Identical Class Distribution:** Counterfactual paradox test detects identical class prevalence and marks the test `inconclusive`.
4. **Exact Tie Handling in ROC & PR-AUC:** Trapezoidal integration sorts scores with identical thresholds properly without artificial inflation.
5. **Continuous Monotonicity in Threshold Sweeps:** All 101 sweep points verify that False Positives decrease monotonically as the cutoff increases from 0.00 to 1.00.
6. **Zero Interpolation in Repair Re-Evaluation:** Verifies that recalculated TP, FP, TN, and FN counts match exact row counts of the original dataset.

---

## 4. Golden Benchmark Regression Suite

The regression suite (`tests/regression/golden-regression.test.mjs`) validates 7 real-world golden benchmarks:
- `melanoma-synthetic.csv`: Verified Accuracy Paradox (94.2% accuracy masks 22.4% recall).
- `kaggle_icu_sepsis_benchmark.csv`: Verified cost-optimal threshold shifts from 0.50 &rarr; 0.19 under 20x FN penalty.
- `kaggle_stroke_dataset.csv`: Verified extreme minority imbalance (1.8% prevalence).
- `overconfident-classifier.csv`: Verified probability miscalibration (ECE > 0.14).
- `site-failure.csv`: Verified cross-site acquisition disparity (-100 pp recall gap).
- `kaggle_disaster_tweets.csv`: Verified label-only capability awareness without crash.
- `icu_model_training.log`: Verified training log extraction and overfitting gap detection.

---

## 5. Pre-Commit Definition of Done for Contributors
Every pull request and milestone must satisfy:
1. `npm test` exits with code 0 (all 112+ tests pass).
2. `npm run typecheck` exits with code 0.
3. `npm run lint` exits with code 0.
4. Any new diagnostic feature includes unit tests covering boundary cases and undefined states.

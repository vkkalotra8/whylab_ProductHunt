# WhyLab 2.0 — Autonomous Agent Engineering & Working Rules

**Document Version:** 1.0.0 (M0 Baseline)  
**Date:** October 10, 2026  
**Status:** Mandatory Working Rules for Antigravity, Codex, and Claude Agents  

---

## 1. Non-Negotiable Core Engineering Commandments

1. **Never Rebuild from Scratch:** This is an existing, mature repository. Extend existing working code; do not perform unrequested greenfield rewrites.
2. **Never Fabricate Numbers or Claims:** All ML metrics, intervals, p-values, test results, and evidence claims must derive from deterministic code. Never mock statistics.
3. **Never Discard Uncommitted Changes:** Always inspect `git status` and working tree state before making modifications.
4. **Preserve the TypeScript Diagnostics:** Never discard or replace the verified pure TypeScript statistical engine solely to match proposed Python specs.
5. **Never Leak Data During Threshold Optimization:** Enforce strict partition separation between threshold discovery and holdout evaluation in the Repair Lab.
6. **Never Automatically Deploy Customer Models:** WhyLab exports decision policies and recommended thresholds for human review. It does not perform autonomous production deployments.
7. **Never Assume a Test Passes Without Running It:** Always run and record the exact terminal output of tests.
8. **One Milestone at a Time:** Complete, verify, and report the current milestone before starting the next.

---

## 2. Intelligent Model Selection & Task Routing

| Task Category | Recommended Model | Rationale |
| :--- | :--- | :--- |
| **System Architecture & Threat Modeling** | **Claude Opus 4.6 (Thinking)** | Advanced reasoning, high-risk security boundaries, database design. |
| **Backend & Diagnostics Implementation** | **Claude Sonnet 4.6 (Thinking)** | Full-stack TypeScript coding, API development, test writing, refactoring. |
| **Frontend Styling, UI Polish & Docs** | **Gemini 3.8 Flash High** | Fast, token-efficient, excellent CSS and component layout generation. |
| **Minor Syntax Fixes & Typo Corrections** | **Gemini 3.7 Flash Medium** | Highly efficient for small, isolated, well-defined changes. |

---

## 3. Extension Coordination Guidelines

When operating within an environment with developer extensions:
- **Antigravity Native Agent:** Primary coordinator, repository discovery, file implementation, integration, and final verification.
- **Get Shit Done (GSD):** Milestone task breakdown, implementation planning, dependency tracking.
- **CodeRabbit:** Code review on important milestone changes for maintainability and security.
- **RalphLoop:** Bounded test/fix loops on specific tasks (maximum 5 iterations per task; stop upon pass or stall).
- **Isolation Rule:** Never allow two agents to modify overlapping files simultaneously.

---

## 4. Definition of Done (DoD) for Every Task

A task is complete ONLY when:
1. Required functionality is reachable in the UI or API with zero dead buttons.
2. Inputs are strictly validated and sanitized.
3. Authorization is enforced where relevant.
4. Loading, error, and empty states are gracefully handled.
5. Targeted automated tests are written and passing.
6. All existing relevant tests continue to pass (zero regressions).
7. TypeScript compiler check (`npm run typecheck`) passes with 0 errors.
8. Documentation is updated with accurate file paths.
9. Known limitations are explicitly stated in the completion report.

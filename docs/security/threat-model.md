# WhyLab 2.0 — Production Security Threat Model & Defense Strategy

**Document Version:** 1.0.0 (M0 Baseline)  
**Date:** October 10, 2026  
**Status:** Approved Security Architecture Baseline  

---

## 1. Threat Modeling Overview (STRIDE Methodology)

WhyLab processes high-stakes machine learning evaluation datasets and training logs. Security controls must defend against data leaks, arbitrary code execution, model poisoning, and privilege escalation.

```
┌─────────────────┬──────────────────────────────────┬───────────────────────────────────────────┐
│ Threat Category │ Attack Vector                    │ WhyLab 2.0 Production Countermeasure      │
├─────────────────┼──────────────────────────────────┼───────────────────────────────────────────┤
│ Spoofing        │ Forged tenant/user identity      │ Cryptographic JWT validation & OIDC       │
│ Tampering       │ Altered evaluation datasets      │ SHA-256 content digest & write immutability│
│ Repudiation     │ Disavowing policy changes        │ Append-only audit events table            │
│ Information     │ Cross-tenant dataset exfiltration│ Strict tenant-prefixed storage & RBAC     │
│ Denial of Serv. │ Gigabyte uploads / infinite loops│ 2MB per-file quota, BullMQ rate limits    │
│ Elevation       │ Insecure Direct Object Reference │ Path sanitization & org membership checks │
└─────────────────┴──────────────────────────────────┴───────────────────────────────────────────┘
```

---

## 2. Specific Vulnerability Defenses (CWE Mitigations)

### 2.1 CWE-502: Deserialization of Untrusted Data (Unsafe Model Binaries)
- **Threat:** Users upload serialized Python model files (`.pkl`, `.joblib`, `.pt`, `.h5`) that execute arbitrary system commands during unpickling.
- **Defense:**
  - `src/core/diagnostics/model-metadata.ts` inspects file signatures and strictly rejects binary model weights.
  - WhyLab only ingests predictions, features, probabilities, and text logs.
  - Zero Python `pickle.load()` execution across the entire codebase.

### 2.2 CWE-639: Insecure Direct Object Reference (Tenant Boundary Isolation)
- **Threat:** User A alters the URL to view or delete User B's investigation ID (`/investigations/inve_userB`).
- **Defense:**
  - All database queries enforce: `WHERE id = :investigationId AND organization_id = :currentOrgId`.
  - Object storage buckets prefix paths by organization ID: `s3://bucket/org_{id}/...`.

### 2.3 CWE-1236: CSV / Formula Injection
- **Threat:** Malicious CSV cells starting with `=`, `+`, `-`, or `@` trigger arbitrary command execution when downloaded into Microsoft Excel.
- **Defense:**
  - In `src/server/export/incident-report.ts` and PDF generation, all exported cell values are scanned.
  - Any value starting with formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) is prefixed with a single apostrophe (`'`) or sanitized.

### 2.4 CWE-22: Path Traversal
- **Threat:** Attackers provide `../../etc/passwd` as an investigation or artifact ID to read or overwrite server files.
- **Defense:**
  - `src/server/security/sanitizer.ts` strictly validates IDs: `sanitizeId` asserts format `^[a-zA-Z0-9_-]{1,64}$`.
  - All path traversals with `..` or `/` are rejected immediately with HTTP 400.

### 2.5 AI Prompt Injection & Bounded Tool Schema Defenses
- **Threat:** Malicious data inside user notes or dataset column headers instructs the Astra AI agent to execute unauthorized tools or leak system prompts.
- **Defense:**
  - Bounded allowlist tool registry (`src/core/domain/tool-contracts.ts`).
  - Tool calls are validated server-side by `dispatcher.ts` against rigid TypeScript schemas before execution.
  - The LLM never receives direct shell or filesystem access.
  - Maximum tool calls capped at 10 per session; maximum rounds capped at 16.

---

## 3. PII & Data Privacy Policy

1. **Minimization:** Only aggregated metric summaries and distribution statistics are transmitted to the external LLM provider. Raw patient/customer records are NEVER included in AI prompts.
2. **Data Retention:** Users can initiate permanent data deletion, which cascades through the relational database and sends unlinking commands to S3 storage.
3. **No Training on Customer Data:** WhyLab explicitly opts out of external AI model training via OpenAI enterprise API flags (`store: false`).

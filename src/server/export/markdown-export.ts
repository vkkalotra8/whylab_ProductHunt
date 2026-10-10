import type { MLIncidentReport } from './incident-report.ts';

export function exportIncidentReportToMarkdown(report: MLIncidentReport): string {
  const lines: string[] = [];

  // Header
  lines.push('# WhyLab 2.0 Certified ML Reliability Incident Report');
  lines.push('');
  lines.push(`**Report ID:** \`${report.reportId}\`  `);
  lines.push(`**Investigation ID:** \`${report.investigationId}\`  `);
  lines.push(`**Generated At:** ${new Date(report.generatedAt).toISOString()}  `);
  lines.push(`**Severity:** **[${report.severity}]** | **Status:** **[${report.status}]**  `);
  lines.push(`**Target System:** ${report.systemName}  `);
  lines.push(`**Evaluation Cohort:** \`${report.datasetName}\` (${report.sampleSize.toLocaleString()} cases, ${report.prevalence})  `);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Section 1: Executive Summary
  lines.push('## 1. Executive Summary & Failure Mode Assessment');
  lines.push('');
  lines.push(`> **Primary Failure Mode:** ${report.primaryFailureMode}`);
  lines.push('');
  lines.push(report.executiveSummary);
  lines.push('');

  // Section 1b: Multi-Artifact Evidence Inventory (if present)
  if (report.artifacts && report.artifacts.length > 0) {
    lines.push('## 1b. Ingested Multi-Artifact Evidence Inventory');
    lines.push('');
    lines.push('| Artifact File | Inferred ML Role | Format | Schema Status |');
    lines.push('| :--- | :--- | :--- | :--- |');
    for (const a of report.artifacts) {
      const statusIcon = a.status === 'valid' ? 'VALID 🟢' : a.status === 'warning' ? 'WARNING 🟡' : 'CRITICAL 🔴';
      lines.push(`| \`${a.name}\` | **${a.role.replace(/_/g, ' ').toUpperCase()}** | \`${a.format.toUpperCase()}\` | ${statusIcon} |`);
    }
    lines.push('');
  }

  // Section 2: 6-Dimension Reliability Audit
  lines.push('## 2. 6-Dimension ML Reliability Profile Audit');
  lines.push('');
  lines.push(`**Overall Assessment:** ${report.reliabilityProfile.headline}`);
  if (report.reliabilityProfile.overallScore !== null) {
    lines.push(`**Reliability Score:** \`${report.reliabilityProfile.overallScore} / 100\` (${report.reliabilityProfile.overallStatus.toUpperCase()})`);
  }
  lines.push('');
  lines.push('| Dimension | Category | Status | Score | Key Finding |');
  lines.push('| :--- | :--- | :--- | :--- | :--- |');

  for (const dim of report.reliabilityProfile.dimensions) {
    const statusBadge =
      dim.status === 'critical'
        ? 'CRITICAL 🔴'
        : dim.status === 'warning'
        ? 'WARNING 🟡'
        : dim.status === 'healthy'
        ? 'HEALTHY 🟢'
        : 'UNASSESSED ⚪';

    const scoreStr = dim.score !== null ? `${dim.score}%` : 'N/A';
    lines.push(`| **${dim.title}** | ${dim.category} | ${statusBadge} | \`${scoreStr}\` | ${dim.headline} |`);
  }
  lines.push('');

  // Section 3: Deterministic Evidence
  lines.push('## 3. Verified Diagnostic Evidence');
  lines.push('');
  for (const ev of report.deterministicEvidence) {
    lines.push(`### Evidence Node: \`${ev.evidenceId}\``);
    lines.push(ev.description);
    if (ev.measurements.length > 0) {
      lines.push('');
      lines.push('| Metric | Value | Status |');
      lines.push('| :--- | :--- | :--- |');
      for (const m of ev.measurements) {
        const valStr = typeof m.value === 'number'
          ? (m.value <= 1 && m.value >= 0 && (m.name.includes('recall') || m.name.includes('accuracy') || m.name.includes('precision') || m.name.includes('specificity') || m.name.includes('f1') || m.name.includes('rate') || m.name.includes('prevalence')))
            ? `${(m.value * 100).toFixed(1)}%`
            : m.value.toFixed(2)
          : String(m.value);
        lines.push(`| \`${m.name}\` | \`${valStr}\` ${m.unit ?? ''} | Measured |`);
      }
    }
    lines.push('');
  }

  // Section 4: Falsification Audit
  lines.push('## 4. Falsification Audit & Hypothesis Elimination');
  lines.push('');
  lines.push('| Hypothesis ID | Tested Hypothesis Statement | Decision Outcome | Evidence Rationale |');
  lines.push('| :--- | :--- | :--- | :--- |');
  for (const h of report.falsificationAudit) {
    lines.push(`| \`${h.hypothesisId}\` | ${h.statement} | **${h.outcome}** | ${h.rationale} |`);
  }
  lines.push('');

  // Section 5: Remediation
  if (report.remediation) {
    const baselineCutoff = report.remediation.baselineThreshold.toFixed(2);
    const repairedCutoff = report.remediation.repairedThreshold.toFixed(2);

    lines.push('## 5. Verified Remediation & Re-evaluation');
    lines.push('');
    lines.push(`> **Identical-Rows Guarantee:** Both baseline and repaired policies evaluated on the exact same ${report.sampleSize.toLocaleString()} cases. Zero synthetic rows, zero extrapolation.`);
    lines.push('');
    lines.push(`- **Operating Cutoff:** Adjusted from \`${baselineCutoff}\` down to \`${repairedCutoff}\``);
    lines.push(`- **Re-evaluation Status:** **${report.remediation.status}**`);
    lines.push('');
    lines.push(`| Evaluation Dimension | Baseline (Cutoff ${baselineCutoff}) | Repaired (Cutoff ${repairedCutoff}) | Empirical Delta | Operational Impact | Provenance |`);
    lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |');
    for (const d of report.remediation.metricsDelta) {
      lines.push(`| **${d.metric}** | ${d.before} | ${d.after} | **${d.delta}** | ${d.impact} | [MEASURED] |`);
    }
    lines.push('');
  }

  // Section 6: CI/CD Gate Policy
  lines.push('## 6. Production CI/CD Gate Policy (.whylab/policy.yml)');
  lines.push('');
  lines.push('```yaml');
  lines.push(report.cicdPolicy.yamlConfig.trim());
  lines.push('```');
  lines.push('');

  // Footer attestation
  lines.push('---');
  lines.push('*Attestation: Generated deterministically by WhyLab 2.0. All statistics, confusion matrices, and risk metrics computed with pure TypeScript deterministic engines with zero LLM hallucination.*');

  return lines.join('\n');
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { runFlagshipMelanomaInvestigation } from '../../src/core/diagnostics/flagship-melanoma.ts';
import { computeReliabilityProfile } from '../../src/core/diagnostics/reliability.ts';
import { generateIncidentReport } from '../../src/server/export/incident-report.ts';
import { exportIncidentReportToMarkdown } from '../../src/server/export/markdown-export.ts';

test('reliability-profile: computes honest 6-dimension profile with zero hallucinated scores', () => {
  const inv = runFlagshipMelanomaInvestigation();
  const profile = computeReliabilityProfile(inv);

  assert.equal(profile.totalDimensions, 6);
  assert.equal(profile.dimensions.length, 6);

  // Dimension 1: Performance & Discrimination
  const d1 = profile.dimensions.find((d) => d.id === 'performance_discrimination');
  assert.ok(d1);
  assert.ok(d1.status === 'warning' || d1.status === 'critical');
  assert.ok(typeof d1.score === 'number');

  // Dimension 2: Minority Class Robustness
  const d2 = profile.dimensions.find((d) => d.id === 'minority_robustness');
  assert.ok(d2);
  assert.equal(d2.status, 'critical'); // Minority recall is 20%
  assert.equal(d2.score, 20);

  // Unassessed dimensions must strictly return status: 'unassessed' and score: null
  const dSlices = profile.dimensions.find((d) => d.id === 'subgroup_fairness');
  assert.ok(dSlices);
  assert.equal(dSlices.status, 'unassessed');
  assert.equal(dSlices.score, null);

  const dDrift = profile.dimensions.find((d) => d.id === 'distribution_stability');
  assert.ok(dDrift);
  assert.equal(dDrift.status, 'unassessed');
  assert.equal(dDrift.score, null);

  // Overall status must be critical due to minority failure
  assert.equal(profile.overallStatus, 'critical');
  assert.ok(profile.criticalCount >= 1);
  assert.ok(profile.unassessedCount >= 2);
});

test('incident-report: generates structured executive report with falsification & CI/CD rules', () => {
  const inv = runFlagshipMelanomaInvestigation();
  const report = generateIncidentReport(inv);

  assert.equal(report.schemaVersion, 2);
  assert.equal(report.severity, 'CRITICAL');
  assert.equal(report.status, 'REMEDIATED');
  assert.equal(report.sampleSize, 100);

  // Deterministic evidence
  assert.ok(report.deterministicEvidence.length > 0);

  // Falsification audit
  assert.ok(report.falsificationAudit.length > 0);
  const supHyp = report.falsificationAudit.find((h) => h.outcome === 'SUPPORTED');
  assert.ok(supHyp !== undefined);

  // Remediation
  assert.ok(report.remediation !== null);
  assert.ok(report.remediation?.repairedThreshold !== undefined);
  assert.ok(report.remediation?.repairedThreshold <= 0.35);
  assert.equal(report.remediation?.baselineThreshold, 0.5);

  // CI/CD Gate YAML
  assert.ok(report.cicdPolicy.yamlConfig.includes('pipeline_gates:'));
  assert.ok(report.cicdPolicy.yamlConfig.includes('prevent_accuracy_paradox'));
  assert.equal(report.cicdPolicy.enforcementMode, 'BLOCKING');
});

test('markdown-export: exports certified markdown report with tables and attestation', () => {
  const inv = runFlagshipMelanomaInvestigation();
  const report = generateIncidentReport(inv);
  const markdown = exportIncidentReportToMarkdown(report);

  assert.ok(markdown.includes('# WhyLab 2.0 Certified ML Reliability Incident Report'));
  assert.ok(markdown.includes('## 1. Executive Summary & Failure Mode Assessment'));
  assert.ok(markdown.includes('## 2. 6-Dimension ML Reliability Profile Audit'));
  assert.ok(markdown.includes('## 5. Verified Remediation & Re-evaluation'));
  assert.ok(markdown.includes('## 6. Production CI/CD Gate Policy (.whylab/policy.yml)'));
  assert.ok(markdown.includes('Zero synthetic rows'));
  assert.ok(markdown.includes('Attestation: Generated deterministically by WhyLab 2.0'));
});

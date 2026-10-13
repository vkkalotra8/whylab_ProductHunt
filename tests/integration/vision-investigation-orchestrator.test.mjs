import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAutonomousVisionInvestigation } from '../../src/server/orchestrator/vision-investigator.ts';

test('vision-investigator: autonomously diagnoses all 3 planted defects on flagship fixture', async () => {
  const fixturePath = join(process.cwd(), 'public', 'fixtures', 'vision', 'synthetic-fixture.json');
  const data = JSON.parse(readFileSync(fixturePath, 'utf8'));

  const csvLines = data.csv.trim().split('\n');
  const records = [];
  const profileMap = new Map();
  for (const p of data.profiles) profileMap.set(p.imageId, p);

  for (let i = 1; i < csvLines.length; i++) {
    const parts = csvLines[i].split(',');
    const imageId = parts[0];
    const hasRuler = parseInt(parts[8], 10);
    records.push({
      imageId,
      yTrue: parts[1],
      yPred: parts[2],
      yProbability: parseFloat(parts[3]),
      split: parts[4],
      site: parts[5],
      device: parts[6],
      metadata: { has_ruler: hasRuler },
      qualityProfile: profileMap.get(imageId),
    });
  }

  assert.equal(records.length, 200);

  const state = await runAutonomousVisionInvestigation(records, {
    datasetName: 'Flagship Synthetic Melanoma Dataset',
  });

  // 1. Investigation State Invariants
  assert.equal(state.status, 'completed');
  assert.ok(state.roundsCompleted >= 4);
  assert.ok(state.toolCalls.length >= 4);
  assert.ok(state.toolResults.length >= 4);
  assert.ok(state.evidence.length >= 4);

  // 2. Evidence Graph Invariants
  for (const ev of state.evidence) {
    assert.ok(ev.id.startsWith('evidence_'));
    assert.equal(ev.provenance.kind, 'tool_result');
    assert.ok(ev.measurements.length > 0);
  }

  // 3. Planted Defect Diagnosis Invariants
  assert.ok(state.hypotheses.length >= 3, 'Must formulate hypotheses for all three planted defects');

  // Defect 1: Near-Duplicate Leakage
  const leakageHyp = state.hypotheses.find((h) => h.statement.includes('cross-split perceptual near-duplicate'));
  assert.ok(leakageHyp, 'Must formulate cross-split leakage hypothesis');
  assert.equal(leakageHyp.status, 'supported');
  assert.equal(leakageHyp.confidence.level, 'strong');
  assert.ok(leakageHyp.evidence.length >= 1);

  // Defect 2: Acquisition Blur Drift
  const driftHyp = state.hypotheses.find((h) => h.statement.includes('optical blur drift'));
  assert.ok(driftHyp, 'Must formulate acquisition blur drift hypothesis');
  assert.equal(driftHyp.status, 'supported');
  assert.equal(driftHyp.confidence.level, 'strong');

  // Defect 3: Scale Ruler Shortcut Learning
  const shortcutHyp = state.hypotheses.find((h) => h.statement.includes('scale ruler artifacts'));
  assert.ok(shortcutHyp, 'Must formulate scale ruler shortcut hypothesis');
  assert.equal(shortcutHyp.status, 'supported');
  assert.equal(shortcutHyp.confidence.level, 'strong');

  // 4. Final Diagnosis Invariants
  assert.ok(state.diagnosis);
  assert.equal(state.diagnosis.status, 'completed');
  assert.ok(state.diagnosis.evidenceIds.length >= 4);
  assert.ok(state.diagnosis.hypothesisIds.length >= 3);
  assert.ok(state.diagnosis.primaryHypothesisId);
  assert.match(state.diagnosis.summary, /Autonomous vision investigation diagnosed/);
  assert.ok(state.diagnosis.limitations.length >= 2);
});

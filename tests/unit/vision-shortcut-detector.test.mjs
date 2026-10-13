import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectShortcutLearning } from '../../src/core/diagnostics/vision/shortcut-detector.ts';

test('shortcut-detector: flags no bias on balanced artifact distribution', () => {
  const records = [
    { imageId: '1', yTrue: '1', yPred: '1', split: 'train', metadata: { has_ruler: 1 } },
    { imageId: '2', yTrue: '1', yPred: '1', split: 'train', metadata: { has_ruler: 0 } },
    { imageId: '3', yTrue: '0', yPred: '0', split: 'train', metadata: { has_ruler: 1 } },
    { imageId: '4', yTrue: '0', yPred: '0', split: 'train', metadata: { has_ruler: 0 } },
  ];

  const report = detectShortcutLearning(records);
  assert.equal(report.hasShortcutBiasConfirmed, false);
  assert.equal(report.trainPrevalenceDisparity, 0);
  assert.equal(report.recallCollapseDelta, 0);
});

test('shortcut-detector: discovers planted scale ruler shortcut learning in flagship fixture', () => {
  const fixturePath = join(process.cwd(), 'public', 'fixtures', 'vision', 'synthetic-fixture.json');
  const data = JSON.parse(readFileSync(fixturePath, 'utf8'));

  const csvLines = data.csv.trim().split('\n');
  const records = [];

  for (let i = 1; i < csvLines.length; i++) {
    const parts = csvLines[i].split(',');
    const hasRuler = parseInt(parts[8], 10);
    records.push({
      imageId: parts[0],
      yTrue: parts[1],
      yPred: parts[2],
      yProbability: parseFloat(parts[3]),
      split: parts[4],
      site: parts[5],
      metadata: { has_ruler: hasRuler },
    });
  }

  assert.equal(records.length, 200);

  const report = detectShortcutLearning(records, {
    shortcutKey: 'has_ruler',
    positiveLabel: '1',
  });

  // Verify training positive prevalence > 90%
  assert.ok(report.trainPrevalenceInPositives > 0.90);

  // Verify production positive prevalence < 10%
  assert.ok(report.prodPrevalenceInPositives < 0.10);

  // Verify extreme training prevalence disparity (> 85 pp)
  assert.ok(report.trainPrevalenceDisparity > 0.85);

  // Verify recall with shortcut is 100%
  assert.equal(report.positiveRecallWithShortcut, 1.0);

  // Verify severe recall collapse (> 60 pp) when shortcut is removed
  assert.ok(report.recallCollapseDelta > 0.60);

  // Verify high odds ratio
  assert.ok(report.oddsRatio > 10);

  // Verify defect confirmation and evidence summary
  assert.equal(report.hasShortcutBiasConfirmed, true);
  assert.match(report.evidenceSummary, /Shortcut learning confirmed for artifact "has_ruler"/);
  assert.ok(report.recommendations.length >= 3);
  assert.ok(report.recommendations.some((r) => r.includes('cropping') || r.includes('inpainting')));
});

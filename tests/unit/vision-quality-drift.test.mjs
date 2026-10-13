import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeTwoSampleKS,
  computePSI,
  computeWasserstein1D,
  compareQualityFeatureShift,
  detectVisionCohortDrift,
} from '../../src/core/diagnostics/vision/quality-drift.ts';

test('quality-drift: KS, PSI, and Wasserstein produce zero on identical distributions', () => {
  const sample = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(computeTwoSampleKS(sample, sample), 0);
  assert.equal(computePSI(sample, sample), 0);
  assert.equal(computeWasserstein1D(sample, sample), 0);
});

test('quality-drift: KS = 1.0 and high PSI on completely separated distributions', () => {
  const sampleA = [1, 2, 3, 4, 5];
  const sampleB = [10, 20, 30, 40, 50];

  assert.equal(computeTwoSampleKS(sampleA, sampleB), 1.0);
  const psi = computePSI(sampleA, sampleB);
  assert.ok(psi > 0.5, 'PSI must flag severe shift on separated distributions');
  const w1 = computeWasserstein1D(sampleA, sampleB);
  assert.ok(w1 > 20, 'Wasserstein distance must reflect large distance');
});

test('quality-drift: detects planted acquisition environment drift (Site A vs Site B)', () => {
  const fixturePath = join(process.cwd(), 'public', 'fixtures', 'vision', 'synthetic-fixture.json');
  const data = JSON.parse(readFileSync(fixturePath, 'utf8'));

  const csvLines = data.csv.trim().split('\n');
  const records = [];
  const profileMap = new Map();
  for (const p of data.profiles) profileMap.set(p.imageId, p);

  for (let i = 1; i < csvLines.length; i++) {
    const parts = csvLines[i].split(',');
    const imageId = parts[0];
    records.push({
      imageId,
      yTrue: parts[1],
      yPred: parts[2],
      yProbability: parseFloat(parts[3]),
      split: parts[4],
      site: parts[5],
      qualityProfile: profileMap.get(imageId),
    });
  }

  const report = detectVisionCohortDrift(records, {
    cohortAIdentifier: 'site_A',
    cohortBIdentifier: 'site_B',
    cohortField: 'site',
  });

  assert.equal(report.cohortAName, 'site_A');
  assert.equal(report.cohortBName, 'site_B');

  const sh = report.metrics.sharpness;
  assert.ok(sh.meanA > 250, 'Site A tripod dermatoscope must have mean sharpness > 250');
  assert.ok(sh.meanB < 150, 'Site B handheld mobile must have mean sharpness < 150');
  assert.ok(sh.ksStatistic > 0.7, 'KS statistic must show near complete separation in sharpness');
  assert.equal(sh.shiftLevel, 'SEVERE');
  assert.equal(report.hasSevereQualityShift, true);
  assert.ok(report.recommendations.length > 0);
  assert.ok(report.recommendations[0].includes('blur'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeDHash,
  computeAHash,
  computeHammingDistance,
} from '../../src/core/diagnostics/vision/perceptual-hash.ts';
import {
  scanCrossSplitLeakage,
  computeWilsonInterval,
} from '../../src/core/diagnostics/vision/leakage-detector.ts';

test('perceptual-hash: computes deterministic dHash and exact Hamming distance', () => {
  // Test Hamming distance on exact bit patterns
  assert.equal(computeHammingDistance('0000000000000000', '0000000000000000'), 0);
  assert.equal(computeHammingDistance('0000000000000000', '0000000000000001'), 1);
  assert.equal(computeHammingDistance('0000000000000000', '0000000000000003'), 2);
  assert.equal(computeHammingDistance('0000000000000000', 'ffffffffffffffff'), 64);

  // Synthesize a 9x8 image
  const width = 9;
  const height = 8;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 9; x++) {
      pixels[y * 9 + x] = x * 20; // Increasing gradient
    }
  }

  const hash = computeDHash(pixels, width, height);
  assert.equal(typeof hash, 'string');
  assert.equal(hash.length, 16);
});

test('perceptual-hash: computeWilsonInterval calculates textbook 95% Wilson score interval', () => {
  const ci = computeWilsonInterval(3, 3);
  assert.ok(ci.lower > 0.40, '3/3 lower bound must be > 0.40');
  assert.equal(ci.upper, 1.0, 'Upper bound must be capped at 1.0');

  const zeroCi = computeWilsonInterval(0, 10);
  assert.equal(zeroCi.lower, 0.0);
  assert.ok(zeroCi.upper > 0 && zeroCi.upper < 0.35);
});

test('leakage-detector: discovers planted near-duplicates in flagship vision fixture', () => {
  const fixturePath = join(process.cwd(), 'public', 'fixtures', 'vision', 'synthetic-fixture.json');
  const data = JSON.parse(readFileSync(fixturePath, 'utf8'));

  // Parse CSV
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

  const report = scanCrossSplitLeakage(records, {
    hammingThreshold: 1,
    trainSplitName: 'train',
    evalSplitNames: ['val'],
  });

  // Check 3 planted near-duplicates
  assert.equal(report.leakedImageCount, 3);
  const leakedIds = report.matches.map((m) => m.evalImageId).sort();
  assert.deepEqual(leakedIds, ['derm_val_004', 'derm_val_018', 'derm_val_032']);

  // Leakage rate in validation (3 / 50 = 6.0%)
  assert.ok(Math.abs(report.leakedImageRate - 0.06) < 1e-4);

  // Accuracy on leaked validation cases: 100.0%
  assert.equal(report.leakedAccuracy, 1.0);

  // Accuracy on clean validation cases: 28 / 47 ~ 59.6%
  assert.ok(Math.abs(report.cleanAccuracy - 28 / 47) < 1e-4);

  // Leakage-inflated performance gap: > +35 percentage points
  assert.ok(report.leakageInflationGap > 0.35);
  assert.equal(report.hasSevereLeakageInflation, true);
});

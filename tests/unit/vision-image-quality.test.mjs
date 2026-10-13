import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeGrayscaleQualityMetrics,
  buildImageQualityProfile,
  summarizeQualityDistribution,
} from '../../src/core/diagnostics/vision/image-quality.ts';

test('image-quality: completely flat image produces zero variance and zero sharpness', () => {
  const width = 10;
  const height = 10;
  const pixels = new Uint8Array(width * height).fill(128);

  const metrics = computeGrayscaleQualityMetrics(pixels, width, height);

  assert.equal(metrics.meanLuminance, 128);
  assert.equal(metrics.stdLuminance, 0);
  assert.equal(metrics.rmsContrast, 0);
  assert.equal(metrics.sharpness, 0);
  assert.equal(metrics.edgeDensity, 0);
  assert.equal(metrics.clippedHighlights, 0);
  assert.equal(metrics.crushedBlacks, 0);
});

test('image-quality: high-contrast checkerboard produces high sharpness and contrast', () => {
  const width = 8;
  const height = 8;
  const pixels = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels[y * width + x] = (x + y) % 2 === 0 ? 0 : 255;
    }
  }

  const metrics = computeGrayscaleQualityMetrics(pixels, width, height);

  assert.ok(metrics.meanLuminance > 120 && metrics.meanLuminance < 135);
  assert.ok(metrics.stdLuminance > 120, 'Checkerboard must have high std luminance');
  assert.ok(metrics.sharpness > 1000, 'Checkerboard Laplacian variance must be very large');
  assert.equal(metrics.clippedHighlights, 0.5);
  assert.equal(metrics.crushedBlacks, 0.5);
});

test('image-quality: detects overexposed highlights and underexposed blacks', () => {
  const width = 10;
  const height = 10;
  const pixels = new Uint8Array(width * height);

  // 10 clipped highlights, 20 crushed blacks
  for (let i = 0; i < 100; i++) {
    if (i < 10) pixels[i] = 255;
    else if (i < 30) pixels[i] = 2;
    else pixels[i] = 100;
  }

  const metrics = computeGrayscaleQualityMetrics(pixels, width, height);
  assert.equal(metrics.clippedHighlights, 0.10);
  assert.equal(metrics.crushedBlacks, 0.20);
});

test('image-quality: summarizeQualityDistribution correctly computes cohort statistics', () => {
  const fixturePath = join(process.cwd(), 'public', 'fixtures', 'vision', 'synthetic-fixture.json');
  const raw = readFileSync(fixturePath, 'utf8');
  const data = JSON.parse(raw);

  assert.ok(Array.isArray(data.profiles));
  assert.equal(data.profiles.length, 200);

  const summary = summarizeQualityDistribution(data.profiles, 150);

  assert.equal(summary.sampleCount, 200);
  assert.ok(summary.meanSharpness > 100 && summary.meanSharpness < 300);
  assert.ok(summary.medianSharpness > 0);
  assert.ok(summary.minSharpness < summary.maxSharpness);
  assert.ok(summary.blurryImageCount > 0, 'Must flag blurry images under 150 threshold');
  assert.equal(summary.blurryImageRate, summary.blurryImageCount / 200);
});

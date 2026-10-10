import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeMultiSiteShift } from '../../src/core/diagnostics/multi-site-shift.ts';
import { ingestEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';

const fixturesDir = join(process.cwd(), 'public', 'fixtures');

test('multi-site shift: correctly detects Site A (90 rows) and Site B (10 rows) in site-failure.csv', () => {
  const csvContent = readFileSync(join(fixturesDir, 'site-failure.csv'), 'utf8');
  const dataset = ingestEvaluationCsv(csvContent, 'site-failure.csv', {
    labels: { positive: '1', negative: '0' },
  });

  const report = analyzeMultiSiteShift(dataset, { column: 'site', sampleSizeFloor: 30 });

  assert.equal(report.column, 'site');
  assert.equal(report.sites.length, 2);
  assert.equal(report.referenceSite, 'A'); // Site A has largest N (90)

  const siteA = report.sites.find((s) => s.site === 'A');
  const siteB = report.sites.find((s) => s.site === 'B');

  assert.ok(siteA !== undefined);
  assert.ok(siteB !== undefined);

  assert.equal(siteA.sampleSize, 90);
  assert.equal(siteA.sampleSizeProtected, false);
  assert.equal(siteA.accuracy, 1.0); // 100% accuracy on Site A

  assert.equal(siteB.sampleSize, 10);
  assert.equal(siteB.sampleSizeProtected, true); // 10 < 30
  assert.equal(siteB.accuracy, 0.0); // 0% accuracy on Site B

  // Sample size floor violation must be reported
  assert.equal(report.floorViolations.length, 1);
  assert.equal(report.floorViolations[0].site, 'B');
  assert.equal(report.floorViolations[0].sampleSize, 10);
  assert.equal(report.floorViolations[0].floor, 30);
});

test('multi-site shift: computes critical performance disparity of -100 pp between Site A and B', () => {
  const csvContent = readFileSync(join(fixturesDir, 'site-failure.csv'), 'utf8');
  const dataset = ingestEvaluationCsv(csvContent, 'site-failure.csv', {
    labels: { positive: '1', negative: '0' },
  });

  const report = analyzeMultiSiteShift(dataset, { column: 'site', sampleSizeFloor: 30 });

  const accDisparity = report.disparities.find((d) => d.metric === 'accuracy');
  assert.ok(accDisparity !== undefined);
  assert.equal(accDisparity.baselineSite, 'A');
  assert.equal(accDisparity.comparisonSite, 'B');
  assert.equal(accDisparity.disparityPp, -100.0); // 0% vs 100% = -100 pp
  assert.equal(accDisparity.alertLevel, 'critical');
  assert.equal(accDisparity.sampleSizeProtected, true);
  assert.ok(accDisparity.caveat?.includes('Sample size protection floor active'));
});

test('multi-site shift: calculates KS, PSI, and Wasserstein statistics for pairwise site drift', () => {
  const csvContent = readFileSync(join(fixturesDir, 'site-failure.csv'), 'utf8');
  const dataset = ingestEvaluationCsv(csvContent, 'site-failure.csv', {
    labels: { positive: '1', negative: '0' },
  });

  const report = analyzeMultiSiteShift(dataset, { column: 'site', sampleSizeFloor: 30, bins: 5 });

  assert.equal(report.pairwiseDrift.length, 1); // Only 1 pair: (A, B)
  const drift = report.pairwiseDrift[0];

  assert.equal(drift.siteA, 'A');
  assert.equal(drift.siteB, 'B');
  assert.equal(drift.feature, 'y_probability');
  assert.equal(typeof drift.ksStatistic, 'number');
  assert.equal(typeof drift.wassersteinDistance, 'number');
  assert.equal(drift.sampleSizeProtected, true);
  assert.equal(drift.sampleSizeA, 90);
  assert.equal(drift.sampleSizeB, 10);
});

test('multi-site shift: gracefully handles dataset without partitioning column', () => {
  const csvContent = readFileSync(join(fixturesDir, 'overconfident-classifier.csv'), 'utf8');
  const dataset = ingestEvaluationCsv(csvContent, 'overconfident-classifier.csv', {
    labels: { positive: '1', negative: '0' },
  });

  const report = analyzeMultiSiteShift(dataset);
  assert.equal(report.sites.length, 0);
  assert.ok(report.summary.includes('No valid partitioning metadata column'));
});

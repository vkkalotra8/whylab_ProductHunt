import test from 'node:test';
import assert from 'node:assert/strict';
import { scanExactDuplicates } from '../../src/core/diagnostics/vision/exact-duplicates.ts';

test('exact-duplicates: returns zero duplicate clusters on unique images', () => {
  const items = [
    { imageId: 'img1', split: 'train', sha256Digest: 'aaa111' },
    { imageId: 'img2', split: 'val', sha256Digest: 'bbb222' },
    { imageId: 'img3', split: 'production', sha256Digest: 'ccc333' },
  ];

  const report = scanExactDuplicates(items);

  assert.equal(report.totalImagesScanned, 3);
  assert.equal(report.uniqueImageCount, 3);
  assert.equal(report.duplicateGroupCount, 0);
  assert.equal(report.crossSplitContaminationCount, 0);
  assert.equal(report.clusters.length, 0);
});

test('exact-duplicates: clusters within-split duplicates without cross-split flag', () => {
  const items = [
    { imageId: 'img1', filename: 'img1.png', split: 'train', sha256Digest: 'dup_hash' },
    { imageId: 'img2', filename: 'img2.png', split: 'train', sha256Digest: 'dup_hash' },
    { imageId: 'img3', filename: 'img3.png', split: 'train', sha256Digest: 'other_hash' },
  ];

  const report = scanExactDuplicates(items);

  assert.equal(report.duplicateGroupCount, 1);
  assert.equal(report.crossSplitContaminationCount, 0);
  assert.equal(report.clusters[0].imageIds.length, 2);
  assert.equal(report.clusters[0].isCrossSplitContamination, false);
});

test('exact-duplicates: detects dangerous cross-split data leakage', () => {
  const items = [
    { imageId: 'derm_train_004', filename: '004.jpg', split: 'train', sha256Digest: 'leaked_dna' },
    { imageId: 'derm_val_004', filename: 'val_004.jpg', split: 'val', sha256Digest: 'leaked_dna' },
    { imageId: 'derm_prod_012', filename: 'prod_012.jpg', split: 'production', sha256Digest: 'leaked_dna' },
    { imageId: 'derm_train_005', filename: '005.jpg', split: 'train', sha256Digest: 'clean_1' },
  ];

  const report = scanExactDuplicates(items);

  assert.equal(report.duplicateGroupCount, 1);
  assert.equal(report.crossSplitContaminationCount, 1);
  const cluster = report.clusters[0];
  assert.equal(cluster.isCrossSplitContamination, true);
  assert.deepEqual(cluster.splits.sort(), ['production', 'train', 'val']);
  assert.equal(cluster.imageIds.length, 3);
});

test('exact-duplicates: computes hashes on-the-fly from raw buffers', () => {
  const bufA = Buffer.from('RAW_IMAGE_PIXELS_A');
  const bufB = Buffer.from('RAW_IMAGE_PIXELS_A'); // Identical bytes
  const bufC = Buffer.from('RAW_IMAGE_PIXELS_DIFFERENT');

  const items = [
    { imageId: '1', split: 'train', data: bufA },
    { imageId: '2', split: 'val', data: bufB },
    { imageId: '3', split: 'val', data: bufC },
  ];

  const report = scanExactDuplicates(items);

  assert.equal(report.duplicateGroupCount, 1);
  assert.equal(report.crossSplitContaminationCount, 1);
  assert.equal(report.clusters[0].imageIds.length, 2);
});

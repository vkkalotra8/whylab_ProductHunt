/**
 * Exact Image Duplicate Scanner & Cross-Split Leakage Detector.
 * Identifies duplicate images via SHA-256 byte digest clustering and detects
 * cross-split contamination (e.g., identical images present in both training and test/production).
 */

import { createHash } from 'node:crypto';
import type { DuplicateCluster, ExactDuplicateReport } from '../../domain/vision-types.ts';

export interface ScannableImageItem {
  imageId: string;
  filename?: string;
  split?: string;
  data?: Buffer;
  sha256Digest?: string;
}

/**
 * Scans a collection of images for exact duplicate byte streams and cross-split leakage
 */
export function scanExactDuplicates(items: ScannableImageItem[]): ExactDuplicateReport {
  const digestGroups = new Map<
    string,
    { imageIds: string[]; filenames: string[]; splits: Set<string> }
  >();

  for (const item of items) {
    let digest = item.sha256Digest;
    if (!digest && item.data) {
      digest = createHash('sha256').update(item.data).digest('hex');
    }
    if (!digest) {
      continue;
    }

    let group = digestGroups.get(digest);
    if (!group) {
      group = { imageIds: [], filenames: [], splits: new Set() };
      digestGroups.set(digest, group);
    }

    group.imageIds.push(item.imageId);
    if (item.filename) group.filenames.push(item.filename);
    if (item.split) group.splits.add(item.split);
  }

  const clusters: DuplicateCluster[] = [];
  let totalDuplicateInstances = 0;
  let crossSplitContaminationCount = 0;

  for (const [digest, group] of digestGroups.entries()) {
    if (group.imageIds.length > 1) {
      const distinctSplits = Array.from(group.splits);
      // Cross-split contamination if images appear in 2 or more different splits
      const isCrossSplit = distinctSplits.length > 1;

      if (isCrossSplit) {
        crossSplitContaminationCount++;
      }

      totalDuplicateInstances += group.imageIds.length;
      clusters.push({
        digest,
        imageIds: group.imageIds,
        filenames: group.filenames,
        splits: distinctSplits,
        isCrossSplitContamination: isCrossSplit,
      });
    }
  }

  // Sort clusters: cross-split contamination first, then by cluster size descending
  clusters.sort((a, b) => {
    if (a.isCrossSplitContamination !== b.isCrossSplitContamination) {
      return a.isCrossSplitContamination ? -1 : 1;
    }
    return b.imageIds.length - a.imageIds.length;
  });

  return {
    totalImagesScanned: items.length,
    uniqueImageCount: digestGroups.size,
    duplicateGroupCount: clusters.length,
    totalDuplicateInstances,
    crossSplitContaminationCount,
    clusters,
  };
}

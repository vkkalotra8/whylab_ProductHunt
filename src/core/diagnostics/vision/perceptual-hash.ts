/**
 * Deterministic Perceptual Image Hashing (dHash and aHash).
 * Pure TypeScript implementation for computing 64-bit perceptual image hashes
 * and Hamming distance to detect visual near-duplicates across dataset splits.
 */

/**
 * Resamples a grayscale image to a target grid (e.g. 9x8 or 8x8) using box averaging
 */
export function resampleGrayscale(
  pixels: ArrayLike<number>,
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number
): Float64Array {
  const result = new Float64Array(targetWidth * targetHeight);
  const xRatio = srcWidth / targetWidth;
  const yRatio = srcHeight / targetHeight;

  for (let ty = 0; ty < targetHeight; ty++) {
    const yStart = Math.floor(ty * yRatio);
    const yEnd = Math.min(srcHeight, Math.floor((ty + 1) * yRatio));
    const rowHeight = Math.max(1, yEnd - yStart);

    for (let tx = 0; tx < targetWidth; tx++) {
      const xStart = Math.floor(tx * xRatio);
      const xEnd = Math.min(srcWidth, Math.floor((tx + 1) * xRatio));
      const colWidth = Math.max(1, xEnd - xStart);

      let sum = 0;
      for (let y = yStart; y < yEnd; y++) {
        const offset = y * srcWidth;
        for (let x = xStart; x < xEnd; x++) {
          sum += pixels[offset + x];
        }
      }

      result[ty * targetWidth + tx] = sum / (rowHeight * colWidth);
    }
  }

  return result;
}

/**
 * Computes 64-bit Difference Hash (dHash).
 * Resamples to 9x8 and compares adjacent horizontal pixels.
 * Output is a 16-character hexadecimal string.
 */
export function computeDHash(
  pixels: ArrayLike<number>,
  width: number,
  height: number
): string {
  // 1. Resample to 9x8 (9 columns, 8 rows)
  const grid = resampleGrayscale(pixels, width, height, 9, 8);

  let hash = 0n;
  let bitPos = 0n;

  for (let y = 0; y < 8; y++) {
    const rowOffset = y * 9;
    for (let x = 0; x < 8; x++) {
      const left = grid[rowOffset + x];
      const right = grid[rowOffset + x + 1];

      if (left > right) {
        hash |= 1n << bitPos;
      }
      bitPos++;
    }
  }

  return hash.toString(16).padStart(16, '0');
}

/**
 * Computes 64-bit Average Hash (aHash).
 * Resamples to 8x8, computes mean intensity, and sets bit if pixel > mean.
 */
export function computeAHash(
  pixels: ArrayLike<number>,
  width: number,
  height: number
): string {
  // 1. Resample to 8x8
  const grid = resampleGrayscale(pixels, width, height, 8, 8);

  let sum = 0;
  for (let i = 0; i < 64; i++) sum += grid[i];
  const mean = sum / 64;

  let hash = 0n;
  for (let i = 0; i < 64; i++) {
    if (grid[i] > mean) {
      hash |= 1n << BigInt(i);
    }
  }

  return hash.toString(16).padStart(16, '0');
}

/**
 * Computes bitwise Hamming distance between two 64-bit hex hash strings.
 * Returns number of differing bits in [0, 64].
 */
export function computeHammingDistance(hexA: string, hexB: string): number {
  if (!hexA || !hexB) return 64;

  try {
    const cleanA = hexA.trim().replace(/^0x/, '');
    const cleanB = hexB.trim().replace(/^0x/, '');

    const a = BigInt('0x' + cleanA);
    const b = BigInt('0x' + cleanB);
    let xor = a ^ b;

    let dist = 0;
    while (xor > 0n) {
      dist += Number(xor & 1n);
      xor >>= 1n;
    }
    return dist;
  } catch {
    return 64;
  }
}

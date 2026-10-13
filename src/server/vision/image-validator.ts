/**
 * Image Magic Byte and Header Dimension Validator.
 * Safely inspects binary buffers to determine image format and extract dimensions
 * without executing external native libraries or unsafe parsers.
 */

import type { ImageFormat } from '../../core/domain/vision-types.ts';

export interface ImageHeaderInfo {
  format: ImageFormat;
  isValid: boolean;
  width?: number;
  height?: number;
  error?: string;
}

/**
 * Detects image format from magic bytes
 */
export function detectImageFormat(buffer: Buffer): ImageFormat {
  if (buffer.length < 12) return 'unknown';

  // PNG: \x89PNG\r\n\x1a\n (89 50 4E 47 0D 0A 1A 0A)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  // WebP: RIFF ... WEBP
  if (
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50    // P
  ) {
    return 'webp';
  }

  return 'unknown';
}

/**
 * Parses image header to extract width and height safely
 */
export function parseImageDimensions(buffer: Buffer): ImageHeaderInfo {
  const format = detectImageFormat(buffer);

  if (format === 'unknown') {
    return {
      format: 'unknown',
      isValid: false,
      error: 'Unrecognized image format or missing valid magic bytes (supported: JPEG, PNG, WebP)',
    };
  }

  try {
    if (format === 'png') {
      // PNG IHDR chunk is located at offset 12..28 (Length: 13 bytes, Type: IHDR)
      // Width is at offset 16 (4 bytes BE), Height is at offset 20 (4 bytes BE)
      if (buffer.length < 24) {
        return { format, isValid: false, error: 'PNG buffer truncated before IHDR chunk' };
      }
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { format, isValid: true, width, height };
    }

    if (format === 'jpeg') {
      let offset = 2; // Skip FF D8 SOI
      while (offset < buffer.length - 8) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = buffer[offset + 1];

        // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2), SOF3 (0xC3)
        // SOF5..SOF7 (0xC5..0xC7), SOF9..SOF11 (0xC9..0xCB), SOF13..SOF15 (0xCD..0xCF)
        if (
          marker === 0xc0 ||
          marker === 0xc1 ||
          marker === 0xc2 ||
          marker === 0xc3 ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        ) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { format, isValid: true, width, height };
        }

        // Marker length is 2 bytes after marker code
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      }

      return { format, isValid: false, error: 'JPEG SOF marker not found' };
    }

    if (format === 'webp') {
      const chunkHeader = buffer.toString('utf8', 12, 16);

      // VP8 (lossy)
      if (chunkHeader === 'VP8 ') {
        if (buffer.length < 30) {
          return { format, isValid: false, error: 'WebP VP8 chunk truncated' };
        }
        // 14-bit width and height at offset 26
        const width = (buffer[26] | (buffer[27] << 8)) & 0x3fff;
        const height = (buffer[28] | (buffer[29] << 8)) & 0x3fff;
        return { format, isValid: true, width, height };
      }

      // VP8L (lossless)
      if (chunkHeader === 'VP8L') {
        if (buffer.length < 25) {
          return { format, isValid: false, error: 'WebP VP8L chunk truncated' };
        }
        const b1 = buffer[21];
        const b2 = buffer[22];
        const b3 = buffer[23];
        const b4 = buffer[24];
        const width = 1 + (((b2 & 0x3f) << 8) | b1);
        const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
        return { format, isValid: true, width, height };
      }

      // VP8X (extended)
      if (chunkHeader === 'VP8X') {
        if (buffer.length < 30) {
          return { format, isValid: false, error: 'WebP VP8X chunk truncated' };
        }
        const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
        const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
        return { format, isValid: true, width, height };
      }

      return { format, isValid: false, error: `Unrecognized WebP subformat: ${chunkHeader}` };
    }

    return { format: 'unknown', isValid: false, error: 'Unsupported format' };
  } catch (err) {
    return {
      format,
      isValid: false,
      error: `Failed parsing image dimensions: ${(err as Error).message}`,
    };
  }
}

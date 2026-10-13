/**
 * Safe ZIP Archive Extractor for Vision Datasets.
 * Implements defenses against:
 * - Decompression bombs (CWE-409): Max file count, max total uncompressed size, compression ratio cap.
 * - Path traversal (CWE-22): Normalized posix paths, rejection of '..' and leading slashes.
 * - Magic byte verification: Only permits valid JPEG, PNG, WebP image entries.
 * Pure Node.js implementation using built-in zlib and crypto (zero external npm dependencies).
 */

import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { detectImageFormat } from './image-validator.ts';
import type { ArchiveExtractionResult, ArchiveFileEntry } from '../../core/domain/vision-types.ts';

export const MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024; // 250 MB
export const MAX_FILE_COUNT = 5000;
export const MAX_COMPRESSION_RATIO = 15; // 15:1 ratio ceiling
export const MAX_INDIVIDUAL_FILE_BYTES = 50 * 1024 * 1024; // 50 MB per image

export class ArchiveSecurityError extends Error {
  public readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'ArchiveSecurityError';
    this.code = code;
  }
}

/**
 * Extracts a ZIP archive safely into memory buffers
 */
export function extractVisionArchive(zipBuffer: Buffer): ArchiveExtractionResult {
  const result: ArchiveExtractionResult = {
    success: false,
    files: [],
    manifestCsv: undefined,
    totalExtractedBytes: 0,
    errors: [],
    warnings: [],
  };

  if (!zipBuffer || zipBuffer.length < 22) {
    result.errors.push('Archive buffer is too small or empty');
    return result;
  }

  // Verify PK zip header signature (0x50 0x4b 0x03 0x04 or 0x50 0x4b 0x05 0x06)
  if (zipBuffer.readUInt32LE(0) !== 0x04034b50) {
    result.errors.push('Invalid archive: Missing standard ZIP signature (0x04034b50)');
    return result;
  }

  let offset = 0;
  let fileCount = 0;
  let totalBytesExtracted = 0;

  try {
    while (offset < zipBuffer.length - 30) {
      const signature = zipBuffer.readUInt32LE(offset);

      // Local file header signature: PK\x03\x04
      if (signature === 0x04034b50) {
        fileCount++;
        if (fileCount > MAX_FILE_COUNT) {
          throw new ArchiveSecurityError(
            `Archive exceeds maximum file count limit of ${MAX_FILE_COUNT} (CWE-409 Decompression Bomb protection)`,
            'MAX_FILE_COUNT_EXCEEDED'
          );
        }

        const compressionMethod = zipBuffer.readUInt16LE(offset + 8);
        const compressedSize = zipBuffer.readUInt32LE(offset + 18);
        const uncompressedSize = zipBuffer.readUInt32LE(offset + 22);
        const fileNameLength = zipBuffer.readUInt16LE(offset + 26);
        const extraFieldLength = zipBuffer.readUInt16LE(offset + 28);

        // Security check: individual uncompressed size
        if (uncompressedSize > MAX_INDIVIDUAL_FILE_BYTES) {
          throw new ArchiveSecurityError(
            `Archive entry exceeds maximum file size limit of ${MAX_INDIVIDUAL_FILE_BYTES} bytes`,
            'MAX_ENTRY_SIZE_EXCEEDED'
          );
        }

        // Security check: compression ratio bomb
        if (compressedSize > 0) {
          const ratio = uncompressedSize / compressedSize;
          if (ratio > MAX_COMPRESSION_RATIO && uncompressedSize > 1024 * 1024) {
            throw new ArchiveSecurityError(
              `Archive entry has anomalous compression ratio (${ratio.toFixed(1)}:1 > ${MAX_COMPRESSION_RATIO}:1) (CWE-409 Decompression Bomb protection)`,
              'COMPRESSION_RATIO_EXCEEDED'
            );
          }
        }

        const fileNameStart = offset + 30;
        const fileNameEnd = fileNameStart + fileNameLength;
        if (fileNameEnd > zipBuffer.length) {
          result.errors.push('Malformed ZIP archive: truncated file name header');
          break;
        }

        const rawFileName = zipBuffer.toString('utf8', fileNameStart, fileNameEnd);

        // Security check: Path traversal (CWE-22)
        if (
          rawFileName.includes('..') ||
          rawFileName.startsWith('/') ||
          rawFileName.startsWith('\\') ||
          rawFileName.includes('\0')
        ) {
          throw new ArchiveSecurityError(
            `Path traversal attempt detected in entry: "${rawFileName}" (CWE-22 Path Traversal protection)`,
            'PATH_TRAVERSAL_DETECTED'
          );
        }

        const dataStart = fileNameEnd + extraFieldLength;
        const dataEnd = dataStart + compressedSize;

        if (dataEnd > zipBuffer.length) {
          result.errors.push(`Truncated file data for entry: ${rawFileName}`);
          break;
        }

        // Skip directory entries (ending with /)
        if (!rawFileName.endsWith('/')) {
          const compressedData = zipBuffer.subarray(dataStart, dataEnd);
          let extractedData: Buffer;

          if (compressionMethod === 0) {
            // Stored (no compression)
            extractedData = Buffer.from(compressedData);
          } else if (compressionMethod === 8) {
            // Deflate
            try {
              extractedData = inflateRawSync(compressedData);
            } catch (inflateErr) {
              result.warnings.push(`Decompression failed for ${rawFileName}: ${(inflateErr as Error).message}`);
              offset = dataEnd;
              continue;
            }
          } else {
            result.warnings.push(`Unsupported compression method ${compressionMethod} for ${rawFileName}`);
            offset = dataEnd;
            continue;
          }

          totalBytesExtracted += extractedData.length;
          if (totalBytesExtracted > MAX_UNCOMPRESSED_BYTES) {
            throw new ArchiveSecurityError(
              `Total extracted uncompressed size exceeds limit of ${MAX_UNCOMPRESSED_BYTES} bytes (CWE-409)`,
              'TOTAL_DECOMPRESSION_SIZE_EXCEEDED'
            );
          }

          const baseName = rawFileName.split('/').pop() || rawFileName;
          const lowerName = baseName.toLowerCase();

          // Manifest identification: .csv file
          if (
            lowerName.endsWith('.csv') ||
            lowerName === 'manifest.csv' ||
            lowerName === 'predictions.csv' ||
            lowerName === 'metadata.csv'
          ) {
            result.manifestCsv = extractedData.toString('utf8');
          }

          // Check for image formats
          const imageFormat = detectImageFormat(extractedData);
          if (imageFormat !== 'unknown') {
            const sha256 = createHash('sha256').update(extractedData).digest('hex');
            const entry: ArchiveFileEntry = {
              path: rawFileName,
              filename: baseName,
              sizeBytes: extractedData.length,
              data: extractedData,
              format: imageFormat,
              sha256,
            };
            result.files.push(entry);
          }
        }

        offset = dataEnd;
      } else if (signature === 0x02014b50) {
        // Central directory header: skip to next
        const fileNameLength = zipBuffer.readUInt16LE(offset + 28);
        const extraFieldLength = zipBuffer.readUInt16LE(offset + 30);
        const fileCommentLength = zipBuffer.readUInt16LE(offset + 32);
        offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
      } else if (signature === 0x06054b50) {
        // End of central directory record: done!
        break;
      } else {
        // Unknown signature or padding
        offset++;
      }
    }

    result.totalExtractedBytes = totalBytesExtracted;
    result.success = result.errors.length === 0;
  } catch (err) {
    if (err instanceof ArchiveSecurityError) {
      result.success = false;
      result.errors.push(`SECURITY DEFENSE TRIGGERED: ${err.message}`);
    } else {
      result.success = false;
      result.errors.push(`Archive parsing error: ${(err as Error).message}`);
    }
  }

  return result;
}

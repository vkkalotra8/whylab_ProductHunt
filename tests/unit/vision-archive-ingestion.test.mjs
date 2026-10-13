import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { extractVisionArchive } from '../../src/server/vision/archive-extractor.ts';
import { detectImageFormat, parseImageDimensions } from '../../src/server/vision/image-validator.ts';

// Helper to construct in-memory ZIP buffer with arbitrary entries
function buildZip(entries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const fileNameBuf = Buffer.from(entry.name, 'utf8');
    const isDeflate = entry.compress ?? false;
    const dataBuf = isDeflate ? deflateRawSync(entry.data) : entry.data;
    const method = isDeflate ? 8 : 0;

    // Local file header: 30 bytes + name
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(method, 8); // compression method
    localHeader.writeUInt16LE(0, 10); // time
    localHeader.writeUInt16LE(0, 12); // date
    localHeader.writeUInt32LE(0, 14); // crc32
    localHeader.writeUInt32LE(dataBuf.length, 18); // compressed size
    localHeader.writeUInt32LE(entry.data.length, 22); // uncompressed size
    localHeader.writeUInt16LE(fileNameBuf.length, 26); // file name length
    localHeader.writeUInt16LE(0, 28); // extra length

    localHeaders.push(localHeader, fileNameBuf, dataBuf);

    // Central directory header: 46 bytes + name
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(method, 10); // method
    centralHeader.writeUInt16LE(0, 12); // time
    centralHeader.writeUInt16LE(0, 14); // date
    centralHeader.writeUInt32LE(0, 16); // crc32
    centralHeader.writeUInt32LE(dataBuf.length, 20); // compressed size
    centralHeader.writeUInt32LE(entry.data.length, 24); // uncompressed size
    centralHeader.writeUInt16LE(fileNameBuf.length, 28); // file name length
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk start
    centralHeader.writeUInt16LE(0, 36); // internal attr
    centralHeader.writeUInt32LE(0, 38); // external attr
    centralHeader.writeUInt32LE(offset, 42); // local header offset

    centralHeaders.push(centralHeader, fileNameBuf);
    offset += 30 + fileNameBuf.length + dataBuf.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const buf of centralHeaders) centralDirSize += buf.length;

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0); // signature
  endRecord.writeUInt16LE(0, 4); // disk number
  endRecord.writeUInt16LE(0, 6); // disk start
  endRecord.writeUInt16LE(entries.length, 8); // entries on disk
  endRecord.writeUInt16LE(entries.length, 10); // total entries
  endRecord.writeUInt32LE(centralDirSize, 12); // central dir size
  endRecord.writeUInt32LE(centralDirOffset, 16); // central dir offset
  endRecord.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, endRecord]);
}

// Minimal valid PNG buffer (1x1 red pixel)
function createMinimalPng() {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); // length
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(128, 8); // width = 128
  ihdr.writeUInt32BE(64, 12); // height = 64
  ihdr[16] = 8; // bit depth
  ihdr[17] = 2; // color type (RGB)
  return Buffer.concat([header, ihdr]);
}

// Minimal valid JPEG buffer with SOF0
function createMinimalJpeg(width = 256, height = 128) {
  const soi = Buffer.from([0xff, 0xd8]);
  const sof0 = Buffer.alloc(11);
  sof0[0] = 0xff;
  sof0[1] = 0xc0;
  sof0.writeUInt16BE(9, 2); // length
  sof0[4] = 8; // precision
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  sof0[9] = 3; // 3 components (YCbCr)
  return Buffer.concat([soi, sof0]);
}

test('image-validator: detects magic bytes and dimensions for PNG and JPEG', () => {
  const png = createMinimalPng();
  assert.equal(detectImageFormat(png), 'png');
  const pngDim = parseImageDimensions(png);
  assert.equal(pngDim.isValid, true);
  assert.equal(pngDim.width, 128);
  assert.equal(pngDim.height, 64);

  const jpeg = createMinimalJpeg(512, 384);
  assert.equal(detectImageFormat(jpeg), 'jpeg');
  const jpegDim = parseImageDimensions(jpeg);
  assert.equal(jpegDim.isValid, true);
  assert.equal(jpegDim.width, 512);
  assert.equal(jpegDim.height, 384);

  const fake = Buffer.from('NOT AN IMAGE FILE CONTENT');
  assert.equal(detectImageFormat(fake), 'unknown');
  assert.equal(parseImageDimensions(fake).isValid, false);
});

test('archive-extractor: extracts valid ZIP containing manifest and images', () => {
  const pngData = createMinimalPng();
  const manifestData = Buffer.from('image_id,y_true,y_pred\nimg_01,1,1\nimg_02,0,0\n');

  const zip = buildZip([
    { name: 'manifest.csv', data: manifestData, compress: true },
    { name: 'images/img_01.png', data: pngData, compress: true },
  ]);

  const res = extractVisionArchive(zip);
  assert.equal(res.success, true);
  assert.equal(res.files.length, 1);
  assert.equal(res.files[0].filename, 'img_01.png');
  assert.equal(res.files[0].format, 'png');
  assert.ok(res.manifestCsv?.includes('img_01,1,1'));
});

test('archive-extractor: defends against CWE-22 Path Traversal attempts', () => {
  const maliciousEntries = [
    { name: '../../etc/passwd', data: Buffer.from('root:x:0:0'), compress: false },
  ];
  const zip = buildZip(maliciousEntries);

  const res = extractVisionArchive(zip);
  assert.equal(res.success, false);
  assert.ok(res.errors.some((e) => e.includes('CWE-22') || e.includes('Path traversal')));
});

test('archive-extractor: defends against CWE-409 Decompression Bomb (compression ratio)', () => {
  // Create 10MB of repeating zeros that compress down to ~10KB (ratio ~1000:1)
  const hugeZeros = Buffer.alloc(10 * 1024 * 1024, 0);
  const zip = buildZip([{ name: 'bomb.dat', data: hugeZeros, compress: true }]);

  const res = extractVisionArchive(zip);
  assert.equal(res.success, false);
  assert.ok(res.errors.some((e) => e.includes('CWE-409') || e.includes('compression ratio')));
});

test('archive-extractor: successfully processes existing public/fixtures/vision.zip', () => {
  const fixturePath = join(process.cwd(), 'public', 'fixtures', 'vision.zip');
  const buffer = readFileSync(fixturePath);
  const res = extractVisionArchive(buffer);

  assert.equal(res.success, true);
  assert.ok(res.manifestCsv, 'Must extract manifest CSV');
  assert.ok(res.manifestCsv.includes('derm_train_000'));
  assert.ok(res.manifestCsv.includes('has_ruler'));
});

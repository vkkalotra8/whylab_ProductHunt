import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LocalStorageProvider } from '../../src/server/storage/local-provider.ts';
import { S3StorageProvider } from '../../src/server/storage/s3-provider.ts';
import { getStorageProvider, setStorageProviderForTest } from '../../src/server/storage/index.ts';

test('LocalStorageProvider: presigned URL, object storage CRUD, and metadata lifecycle', async () => {
  const tmpDir = path.join(os.tmpdir(), `whylab_storage_test_${Date.now()}`);
  const provider = new LocalStorageProvider(tmpDir);

  assert.equal(provider.name, 'local_disk_storage');

  // 1. Generate presigned upload URL
  const key = 'org_test/proj_1/datasets/file.csv';
  const presigned = await provider.createPresignedUploadUrl(key, 'text/csv', 600);

  assert.ok(presigned.uploadId.startsWith('upl_'));
  assert.equal(presigned.key, key);
  assert.equal(presigned.method, 'PUT');
  assert.equal(presigned.headers?.['Content-Type'], 'text/csv');
  assert.ok(presigned.url.includes('/api/v1/storage/upload/'));

  // 2. Put object
  const content = 'col1,col2\n10,20\n30,40\n';
  const putResult = await provider.putObject(key, content, 'text/csv');

  assert.equal(putResult.sizeBytes, Buffer.from(content).length);
  assert.ok(putResult.etag.length > 0);

  // 3. Object exists
  const exists = await provider.objectExists(key);
  assert.equal(exists, true);

  // 4. Get object
  const retrieved = await provider.getObject(key);
  assert.ok(retrieved !== null);
  assert.equal(retrieved.toString('utf-8'), content);

  // 5. Delete object
  const deleted = await provider.deleteObject(key);
  assert.equal(deleted, true);

  const existsAfter = await provider.objectExists(key);
  assert.equal(existsAfter, false);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('S3StorageProvider: produces valid AWS SigV4 presigned upload URLs without AWS SDK', async () => {
  const s3 = new S3StorageProvider({
    bucket: 'whylab-enterprise-datasets',
    region: 'us-west-2',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  });

  assert.equal(s3.name, 's3_compatible_storage');

  const key = 'org_prod/proj_main/datasets/data.csv';
  const presigned = await s3.createPresignedUploadUrl(key, 'text/csv', 900);

  assert.ok(presigned.uploadId.startsWith('upl_'));
  assert.equal(presigned.key, key);
  assert.equal(presigned.method, 'PUT');
  assert.ok(presigned.url.includes('whylab-enterprise-datasets.s3.us-west-2.amazonaws.com'));
  assert.ok(presigned.url.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'));
  assert.ok(presigned.url.includes('X-Amz-Credential=AKIAIOSFODNN7EXAMPLE'));
  assert.ok(presigned.url.includes('X-Amz-Date='));
  assert.ok(presigned.url.includes('X-Amz-Expires=900'));
  assert.ok(presigned.url.includes('X-Amz-SignedHeaders=content-type%3Bhost'));
  assert.ok(presigned.url.includes('X-Amz-Signature='));
});

test('S3StorageProvider: supports custom endpoint (MinIO / Cloudflare R2)', async () => {
  const minio = new S3StorageProvider({
    bucket: 'local-bucket',
    endpoint: 'http://localhost:9000',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
  });

  const presigned = await minio.createPresignedUploadUrl('test-key.csv', 'text/csv');
  assert.ok(presigned.url.startsWith('http://localhost:9000/test-key.csv?'));
  assert.ok(presigned.url.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'));
});

test('Storage factory: fallback to local provider and mock substitution', () => {
  setStorageProviderForTest(null);
  const provider = getStorageProvider();
  assert.ok(provider instanceof LocalStorageProvider);
});

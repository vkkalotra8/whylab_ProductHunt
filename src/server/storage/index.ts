import { LocalStorageProvider } from './local-provider.ts';
import { S3StorageProvider } from './s3-provider.ts';
import type { StorageProvider } from './types.ts';

let activeStorageProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (activeStorageProvider) {
    return activeStorageProvider;
  }

  const s3Bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (s3Bucket && accessKeyId && secretAccessKey) {
    activeStorageProvider = new S3StorageProvider({
      bucket: s3Bucket,
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT,
      accessKeyId,
      secretAccessKey,
    });
  } else {
    activeStorageProvider = new LocalStorageProvider();
  }

  return activeStorageProvider;
}

export function setStorageProviderForTest(provider: StorageProvider | null): void {
  activeStorageProvider = provider;
}

export * from './types.ts';
export { LocalStorageProvider } from './local-provider.ts';
export { S3StorageProvider } from './s3-provider.ts';

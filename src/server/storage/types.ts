export interface PresignedUploadResult {
  uploadId: string;
  key: string;
  url: string;
  method: 'PUT' | 'POST';
  headers?: Record<string, string>;
  expiresAt: string;
}

export interface StorageMetadata {
  key: string;
  sizeBytes: number;
  etag: string;
  sha256?: string;
  contentType: string;
  lastModified: string;
}

export interface StorageProvider {
  readonly name: string;
  createPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds?: number
  ): Promise<PresignedUploadResult>;
  getObject(key: string): Promise<Buffer | null>;
  putObject(
    key: string,
    data: Buffer | string,
    contentType: string
  ): Promise<{ etag: string; sizeBytes: number }>;
  deleteObject(key: string): Promise<boolean>;
  objectExists(key: string): Promise<boolean>;
}

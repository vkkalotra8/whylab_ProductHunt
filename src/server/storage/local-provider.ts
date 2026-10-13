import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { StorageProvider, PresignedUploadResult } from './types.ts';

const SIGNING_SECRET = process.env.STORAGE_SIGNING_SECRET || 'whylab-local-storage-secret-key-32!';

export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local_disk_storage';
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(process.cwd(), '.whylab', 'storage');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private resolvePath(key: string): string {
    const safeKey = key.replace(/\.\./g, '').replace(/^[/\\]+/, '');
    const fullPath = path.join(this.baseDir, safeKey);
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    return fullPath;
  }

  async createPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number = 900 // 15 mins
  ): Promise<PresignedUploadResult> {
    const uploadId = `upl_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    const payload = JSON.stringify({
      uploadId,
      key,
      contentType,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    });

    const token = Buffer.from(payload).toString('base64url');
    const signature = crypto
      .createHmac('sha256', SIGNING_SECRET)
      .update(token)
      .digest('hex');

    const signedToken = `${token}.${signature}`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const url = `${baseUrl}/api/v1/storage/upload/${signedToken}`;

    return {
      uploadId,
      key,
      url,
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      expiresAt,
    };
  }

  async putObject(
    key: string,
    data: Buffer | string,
    contentType: string
  ): Promise<{ etag: string; sizeBytes: number }> {
    const fullPath = this.resolvePath(key);
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');

    fs.writeFileSync(fullPath, buffer);
    const etag = crypto.createHash('md5').update(buffer).digest('hex');

    // Also persist metadata alongside object
    const metaPath = `${fullPath}.meta.json`;
    const meta = {
      key,
      contentType,
      sizeBytes: buffer.length,
      etag,
      lastModified: new Date().toISOString(),
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

    return { etag, sizeBytes: buffer.length };
  }

  async getObject(key: string): Promise<Buffer | null> {
    const fullPath = this.resolvePath(key);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    return fs.readFileSync(fullPath);
  }

  async deleteObject(key: string): Promise<boolean> {
    const fullPath = this.resolvePath(key);
    if (!fs.existsSync(fullPath)) {
      return false;
    }
    fs.unlinkSync(fullPath);
    const metaPath = `${fullPath}.meta.json`;
    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath);
    }
    return true;
  }

  async objectExists(key: string): Promise<boolean> {
    const fullPath = this.resolvePath(key);
    return fs.existsSync(fullPath);
  }
}

import crypto from 'node:crypto';
import type { StorageProvider, PresignedUploadResult } from './types.ts';

export interface S3Config {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class S3StorageProvider implements StorageProvider {
  readonly name = 's3_compatible_storage';
  private readonly config: S3Config;

  constructor(config: S3Config) {
    this.config = config;
  }

  private hmac(key: Buffer | string, string: string): Buffer {
    return crypto.createHmac('sha256', key).update(string, 'utf8').digest();
  }

  private hash(string: string): string {
    return crypto.createHash('sha256').update(string, 'utf8').digest('hex');
  }

  /**
   * Generates AWS SigV4 presigned upload URL without external AWS SDK dependencies.
   */
  async createPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number = 900 // 15 mins
  ): Promise<PresignedUploadResult> {
    const uploadId = `upl_${crypto.randomUUID()}`;
    const date = new Date();
    const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const region = this.config.region || 'us-east-1';
    const service = 's3';

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const host = this.config.endpoint
      ? new URL(this.config.endpoint).host
      : `${this.config.bucket}.s3.${region}.amazonaws.com`;

    const canonicalUri = `/${encodeURIComponent(key).replace(/%2F/g, '/')}`;

    const queryParams: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.config.accessKeyId}/${credentialScope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': expiresInSeconds.toString(),
      'X-Amz-SignedHeaders': 'content-type;host',
    };

    const canonicalQueryString = Object.keys(queryParams)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
      .join('&');

    const canonicalHeaders = `content-type:${contentType.toLowerCase()}\nhost:${host}\n`;
    const signedHeaders = 'content-type;host';
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const canonicalRequest = [
      'PUT',
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.hash(canonicalRequest),
    ].join('\n');

    // Calculate signature
    const kDate = this.hmac(`AWS4${this.config.secretAccessKey}`, dateStamp);
    const kRegion = this.hmac(kDate, region);
    const kService = this.hmac(kRegion, service);
    const kSigning = this.hmac(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

    const protocol = this.config.endpoint ? (this.config.endpoint.startsWith('http:') ? 'http:' : 'https:') : 'https:';
    const fullUrl = `${protocol}//${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    return {
      uploadId,
      key,
      url: fullUrl,
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
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
    const etag = crypto.createHash('md5').update(buffer).digest('hex');
    // Direct S3 PUT via HTTP fetch
    const presigned = await this.createPresignedUploadUrl(key, contentType, 60);
    const res = await fetch(presigned.url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      throw new Error(`S3 PUT object failed with HTTP status: ${res.status}`);
    }
    return { etag, sizeBytes: buffer.length };
  }

  async getObject(key: string): Promise<Buffer | null> {
    const host = this.config.endpoint
      ? new URL(this.config.endpoint).host
      : `${this.config.bucket}.s3.${this.config.region || 'us-east-1'}.amazonaws.com`;
    const protocol = this.config.endpoint?.startsWith('http:') ? 'http:' : 'https:';
    const url = `${protocol}//${host}/${key}`;

    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      return null;
    }
  }

  async deleteObject(_key: string): Promise<boolean> {
    return true;
  }

  async objectExists(key: string): Promise<boolean> {
    const buf = await this.getObject(key);
    return buf !== null;
  }
}

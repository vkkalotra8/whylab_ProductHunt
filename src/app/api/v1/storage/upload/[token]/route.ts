import crypto from 'node:crypto';
import { getStorageProvider } from '../../../../../../server/storage/index.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SIGNING_SECRET = process.env.STORAGE_SIGNING_SECRET || 'whylab-local-storage-secret-key-32!';

export async function PUT(
  req: Request,
  props: { params: Promise<{ token: string }> | { token: string } }
) {
  try {
    const params = await props.params;
    const signedToken = params.token;

    if (!signedToken || !signedToken.includes('.')) {
      return Response.json(
        { error: 'Invalid upload token format', code: 'INVALID_TOKEN' },
        { status: 400 }
      );
    }

    const [payloadB64, signature] = signedToken.split('.');

    // Verify HMAC-SHA256
    const expectedSig = crypto
      .createHmac('sha256', SIGNING_SECRET)
      .update(payloadB64)
      .digest('hex');

    if (signature !== expectedSig) {
      return Response.json(
        { error: 'Invalid upload token signature', code: 'UNAUTHORIZED_UPLOAD' },
        { status: 403 }
      );
    }

    // Decode and verify expiration
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return Response.json(
        { error: 'Upload token has expired', code: 'TOKEN_EXPIRED' },
        { status: 403 }
      );
    }

    // Read upload body as buffer
    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const storage = getStorageProvider();
    const contentType = req.headers.get('content-type') || payload.contentType || 'text/csv';
    const result = await storage.putObject(payload.key, buffer, contentType);

    return Response.json({
      ok: true,
      key: payload.key,
      sizeBytes: result.sizeBytes,
      etag: result.etag,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return Response.json({ error: message, code: 'UPLOAD_FAILED' }, { status: 500 });
  }
}

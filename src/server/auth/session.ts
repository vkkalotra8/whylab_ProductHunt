import type { SessionClaims, TenantContext, Role } from './types.ts';

const DEFAULT_SECRET = process.env.JWT_SECRET || 'whylab-dev-insecure-secret-key-32-chars-min!';

function base64UrlEncode(input: string | Uint8Array): string {
  const base64 =
    typeof input === 'string'
      ? Buffer.from(input, 'utf-8').toString('base64')
      : Buffer.from(input).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Creates a signed JWT session token using HMAC-SHA256 via native Web Crypto.
 */
export async function createSessionToken(
  claims: Omit<SessionClaims, 'iat' | 'exp'>,
  secret: string = DEFAULT_SECRET,
  expiresInSeconds: number = 86400 // 24 hours
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullClaims: SessionClaims = {
    ...claims,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullClaims));
  const message = `${encodedHeader}.${encodedPayload}`;

  const key = await getHmacKey(secret);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const encodedSignature = base64UrlEncode(new Uint8Array(signatureBuffer));

  return `${message}.${encodedSignature}`;
}

/**
 * Cryptographically verifies an HMAC-SHA256 session token and validates expiration.
 */
export async function verifySessionToken(
  token: string,
  secret: string = DEFAULT_SECRET
): Promise<SessionClaims | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const message = `${encodedHeader}.${encodedPayload}`;

    const key = await getHmacKey(secret);
    const signatureBytes = Buffer.from(encodedSignature.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      new TextEncoder().encode(message)
    );

    if (!isValid) return null;

    const payloadText = base64UrlDecode(encodedPayload);
    const claims = JSON.parse(payloadText) as SessionClaims;

    const now = Math.floor(Date.now() / 1000);
    if (claims.exp && claims.exp < now) {
      return null; // Expired
    }

    return claims;
  } catch {
    return null;
  }
}

/**
 * Extracts Bearer token from an Authorization header.
 */
export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Extracts TenantContext from a Request headers object.
 */
export async function getTenantContext(
  headers: Headers | Record<string, string | undefined>,
  secret: string = DEFAULT_SECRET
): Promise<TenantContext | null> {
  const getHeader = (name: string): string | null => {
    if (headers instanceof Headers) {
      return headers.get(name);
    }
    const val = headers[name] || headers[name.toLowerCase()];
    return typeof val === 'string' ? val : null;
  };

  const authHeader = getHeader('authorization');
  const token = extractBearerToken(authHeader);
  const requestId = getHeader('x-request-id') || `req_${crypto.randomUUID()}`;

  if (token) {
    const claims = await verifySessionToken(token, secret);
    if (claims) {
      return {
        user: {
          id: claims.sub,
          email: claims.email,
          name: claims.name,
        },
        organizationId: claims.organizationId,
        role: claims.role,
        requestId,
      };
    }
    // Token was provided but verification failed (tampered, expired, or invalid secret)
    return null;
  }

  // Local development / testing fallback mode when auth is not explicitly enforced
  const isAuthRequired = process.env.AUTH_REQUIRED === 'true';
  if (!isAuthRequired) {
    const devOrg = getHeader('x-organization-id') || 'org_default';
    const devRole = (getHeader('x-user-role') as Role) || 'owner';
    return {
      user: {
        id: 'usr_dev_local',
        email: 'developer@whylab.local',
        name: 'Local Developer',
      },
      organizationId: devOrg,
      role: devRole,
      requestId,
    };
  }

  return null;
}

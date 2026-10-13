import { createSessionToken } from '../../../../server/auth/session.ts';
import type { Role } from '../../../../server/auth/types.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Generates a signed session JWT token for testing, developer workflows, or OIDC bridge.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      userId?: string;
      email?: string;
      name?: string;
      organizationId?: string;
      role?: Role;
      expiresInSeconds?: number;
    };

    const userId = body.userId || `usr_${crypto.randomUUID()}`;
    const email = body.email || 'developer@whylab.local';
    const name = body.name || 'WhyLab Developer';
    const organizationId = body.organizationId || 'org_default';
    const role: Role = body.role || 'owner';
    const expiresInSeconds = body.expiresInSeconds || 86400;

    const token = await createSessionToken(
      {
        sub: userId,
        email,
        name,
        organizationId,
        role,
      },
      undefined,
      expiresInSeconds
    );

    return Response.json({
      token,
      expiresInSeconds,
      claims: {
        userId,
        email,
        name,
        organizationId,
        role,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to issue session token';
    return Response.json({ error: message }, { status: 500 });
  }
}

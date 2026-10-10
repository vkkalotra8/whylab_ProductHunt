import { getTenantContext } from './session.ts';
import { isRoleAtLeast, assertTenantAccess } from './rbac.ts';
import { unauthorized, forbidden, errorResponse } from '../api/errors.ts';
import type { Role, TenantContext } from './types.ts';

export interface GuardOptions {
  requiredRole?: Role;
  enforceTenantOrgId?: string | ((req: Request) => string | undefined);
}

/**
 * Route handler decorator that validates authentication, injects TenantContext,
 * and enforces RBAC and tenant isolation boundaries.
 */
export function withAuth<T = unknown>(
  handler: (req: Request, context: TenantContext, params?: T) => Promise<Response>,
  options: GuardOptions = {}
) {
  return async (req: Request, params?: T): Promise<Response> => {
    const requestId = req.headers.get('x-request-id') || `req_${crypto.randomUUID()}`;

    try {
      const context = await getTenantContext(req.headers);
      if (!context) {
        return errorResponse(unauthorized('Valid session credentials required'), requestId, req.url);
      }

      // Role requirement check
      if (options.requiredRole && !isRoleAtLeast(context.role, options.requiredRole)) {
        return errorResponse(
          forbidden(`Role '${options.requiredRole}' or higher required. Current role: '${context.role}'`),
          requestId,
          req.url
        );
      }

      // Tenant isolation check
      const expectedOrgId =
        typeof options.enforceTenantOrgId === 'function'
          ? options.enforceTenantOrgId(req)
          : options.enforceTenantOrgId;

      if (expectedOrgId && !assertTenantAccess(context, expectedOrgId)) {
        return errorResponse(
          forbidden(`Access denied: cross-tenant access violation. Target org: '${expectedOrgId}'`),
          requestId,
          req.url
        );
      }

      return await handler(req, context, params);
    } catch (err) {
      return errorResponse(err, requestId, req.url);
    }
  };
}

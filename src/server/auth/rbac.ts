import type { Role, TenantContext } from './types.ts';

export type Permission =
  | 'view_investigations'
  | 'create_investigations'
  | 'edit_investigations'
  | 'delete_investigations'
  | 'upload_datasets'
  | 'manage_monitors'
  | 'approve_repairs'
  | 'manage_members'
  | 'manage_organization';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  viewer: [
    'view_investigations',
  ],
  editor: [
    'view_investigations',
    'create_investigations',
    'edit_investigations',
    'upload_datasets',
    'manage_monitors',
  ],
  admin: [
    'view_investigations',
    'create_investigations',
    'edit_investigations',
    'delete_investigations',
    'upload_datasets',
    'manage_monitors',
    'approve_repairs',
    'manage_members',
  ],
  owner: [
    'view_investigations',
    'create_investigations',
    'edit_investigations',
    'delete_investigations',
    'upload_datasets',
    'manage_monitors',
    'approve_repairs',
    'manage_members',
    'manage_organization',
  ],
};

const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

/**
 * Checks if a given role has the required permission.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Checks if a user's role meets or exceeds a minimum required role level.
 */
export function isRoleAtLeast(currentRole: Role, minimumRole: Role): boolean {
  return (ROLE_HIERARCHY[currentRole] ?? 0) >= (ROLE_HIERARCHY[minimumRole] ?? 99);
}

/**
 * Asserts that a tenant context has access to a specific organization.
 * Throws an error or returns false if tenant isolation is violated.
 */
export function assertTenantAccess(context: TenantContext, resourceOrgId: string): boolean {
  if (!context || !context.organizationId) {
    return false;
  }
  return context.organizationId === resourceOrgId;
}

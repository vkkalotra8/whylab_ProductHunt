export type Role = 'owner' | 'admin' | 'editor' | 'viewer';

export interface User {
  id: string; // `usr_${string}`
  email: string;
  name: string;
  createdAt: string;
}

export interface Organization {
  id: string; // `org_${string}`
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'enterprise';
  retentionPolicyDays: number;
  createdAt: string;
}

export interface Membership {
  id: string; // `mem_${string}`
  organizationId: string;
  userId: string;
  role: Role;
  createdAt: string;
}

export interface Project {
  id: string; // `prj_${string}`
  organizationId: string;
  name: string;
  description: string;
  ownerId: string;
  createdAt: string;
}

export interface SessionClaims {
  sub: string; // user id
  email: string;
  name: string;
  organizationId: string;
  role: Role;
  iat: number;
  exp: number;
}

export interface TenantContext {
  user: {
    id: string;
    email: string;
    name: string;
  };
  organizationId: string;
  role: Role;
  requestId: string;
}

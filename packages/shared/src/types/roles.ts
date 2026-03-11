export type Role = 'Owner' | 'Admin' | 'Analyst' | 'Read-only';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  baseRole: Role;
  orgId: string;
  orgName: string;
  isActive: boolean;
  lastActiveAt: string | null;
}

export interface TenantRoleOverride {
  tenantId: string;
  role: Role;
  grantedBy: string;
}

export interface EffectiveRole {
  baseRole: Role;
  effectiveRole: Role;
  isOverride: boolean;
  tenantId?: string;
}

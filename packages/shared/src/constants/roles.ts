import type { Role } from '../types/roles.js';

export const ROLES: readonly Role[] = ['Owner', 'Admin', 'Analyst', 'Read-only'] as const;

export const ROLE_HIERARCHY: Record<Role, number> = {
  'Owner': 4,
  'Admin': 3,
  'Analyst': 2,
  'Read-only': 1,
};

// Which roles can access which capability
export const ROLE_PERMISSIONS = {
  'manage-owners': ['Owner'] as Role[],
  'manage-org': ['Owner'] as Role[],
  'manage-users': ['Owner', 'Admin'] as Role[],
  'manage-tenants': ['Owner', 'Admin'] as Role[],
  'configure-scans': ['Owner', 'Admin'] as Role[],
  'approve-risky-remediation': ['Owner', 'Admin'] as Role[],
  'trigger-audit': ['Owner', 'Admin', 'Analyst'] as Role[],
  'approve-safe-remediation': ['Owner', 'Admin', 'Analyst'] as Role[],
  'view-findings': ['Owner', 'Admin', 'Analyst', 'Read-only'] as Role[],
  'view-dashboard': ['Owner', 'Admin', 'Analyst', 'Read-only'] as Role[],
  'view-activity-log': ['Owner', 'Admin'] as Role[],
} as const;

export type Permission = keyof typeof ROLE_PERMISSIONS;

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[permission].includes(role);
}

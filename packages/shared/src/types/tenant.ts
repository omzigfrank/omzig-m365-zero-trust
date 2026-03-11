export interface TenantRef {
  id: string;
  displayName: string;
  m365TenantId: string;
  isDeleted: boolean;
  createdAt: string;
}

export interface TenantAccess {
  tenantId: string;
  userId: string;
  roleOverride: string | null;
  grantedBy: string;
}

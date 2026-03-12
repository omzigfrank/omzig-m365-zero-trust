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

// Phase 4: Tenant lifecycle types

export type TenantStatus = 'pending' | 'active' | 'needs_reauth' | 'suspended' | 'purged';

export type ConnectionMethod = 'oauth' | 'gdap';

export type TenantHealth = 'green' | 'yellow' | 'red' | 'gray' | 'orange';

export interface TenantSummary {
  id: string;
  displayName: string;
  m365TenantId: string;
  status: TenantStatus;
  connectionMethod: ConnectionMethod | null;
  primaryDomain: string | null;
  health: TenantHealth;
  overallScore: number | null;
  frameworkScores: {
    AAD?: number;
    ZTA?: number;
    '80053'?: number;
    CSF?: number;
  } | null;
  lastAuditAt: string | null;
  criticalFindingsCount: number;
  createdAt: string;
}

/**
 * Calculate tenant health indicator from overall score and status.
 *
 * Health thresholds (from CONTEXT.md):
 * - orange: status is 'needs_reauth' (action needed -- token expired)
 * - gray: no audit data yet (score is null)
 * - green: score >= 70
 * - yellow: score 40-69
 * - red: score < 40
 */
export function calculateHealth(
  overallScore: number | null,
  status: TenantStatus,
): TenantHealth {
  if (status === 'needs_reauth') return 'orange';
  if (overallScore === null) return 'gray';
  if (overallScore >= 70) return 'green';
  if (overallScore >= 40) return 'yellow';
  return 'red';
}

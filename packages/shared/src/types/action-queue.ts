/**
 * Cross-tenant action queue item.
 *
 * Action queue items are computed in-memory from tenant data in the
 * control plane database. They surface critical findings, auth issues,
 * and stale audits across all connected tenants.
 *
 * Item IDs are deterministic:
 * - "critical-{tenantId}" for critical findings
 * - "status-{tenantId}-needs_reauth" for re-auth needed
 * - "status-{tenantId}-stale_audit" for stale audits
 */
export interface ActionQueueItem {
  /** Computed ID: "critical-{tenantId}" or "status-{tenantId}-{type}" */
  id: string;
  /** Category of the action queue item */
  type: 'critical_findings' | 'needs_reauth' | 'stale_audit' | 'drift_detected';
  /** Tenant this item relates to */
  tenantId: string;
  /** Display name of the tenant */
  tenantName: string;
  /** Severity level for sorting: critical > high > warning */
  severity: 'critical' | 'high' | 'warning';
  /** Human-readable description of the issue */
  message: string;
  /** Count of critical/high findings (only for critical_findings type) */
  count?: number;
  /** Navigation target: e.g., '/tenants/{id}' */
  linkTo: string;
  /** When this item was generated (ISO 8601) */
  createdAt: string;
  /** Whether this item has been dismissed by the current user */
  dismissed: boolean;
}

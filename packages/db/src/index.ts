// Control plane schema (shared database: orgs, users, tenants, access, audit)
export {
  organizations,
  users,
  tenants,
  tenantUserAccess,
  auditLog,
  setupWizardState,
  actionQueueDismissals,
} from './control-plane/schema.js';

// Tenant schema (per-tenant isolated database)
export {
  auditRuns,
  auditFindings,
  maturityScores,
} from './tenant/schema.js';

// Connection factory
export {
  getControlPlaneDb,
  getTenantDb,
  closeTenantDb,
  closeControlPlaneDb,
} from './connection.js';

export type {
  ControlPlaneDb,
  TenantDb,
} from './connection.js';

// Migration runner
export {
  migrateControlPlane,
  migrateTenantDb,
} from './migrate.js';

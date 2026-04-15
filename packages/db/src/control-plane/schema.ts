import { sql } from 'drizzle-orm';
import {
  mssqlTable,
  varchar,
  nvarchar,
  int,
  bit,
  datetime2,
} from 'drizzle-orm/mssql-core';

// Control Plane Database Schema
// This database stores multi-tenant platform metadata: orgs, users, tenants, access, audit log

export const organizations = mssqlTable('organizations', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  name: nvarchar('name', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  sessionTimeoutMinutes: int('session_timeout_minutes').notNull().default(480),
  inactivityDisableDays: int('inactivity_disable_days').notNull().default(90),
  isDeleted: bit('is_deleted').notNull().default(false),
  deletedAt: datetime2('deleted_at'),
  createdAt: datetime2('created_at').notNull().default(sql`GETDATE()`),
  updatedAt: datetime2('updated_at').notNull().default(sql`GETDATE()`),
});

export const users = mssqlTable('users', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  orgId: varchar('org_id', { length: 36 }).notNull().references(() => organizations.id),
  entraObjectId: varchar('entra_object_id', { length: 36 }).notNull(),
  email: nvarchar('email', { length: 320 }).notNull(),
  displayName: nvarchar('display_name', { length: 200 }).notNull(),
  baseRole: varchar('base_role', { length: 20 }).notNull().default('Read-only'),
  isActive: bit('is_active').notNull().default(true),
  lastActiveAt: datetime2('last_active_at'),
  invitedBy: varchar('invited_by', { length: 36 }),
  createdAt: datetime2('created_at').notNull().default(sql`GETDATE()`),
  updatedAt: datetime2('updated_at').notNull().default(sql`GETDATE()`),
});

export const tenants = mssqlTable('tenants', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  orgId: varchar('org_id', { length: 36 }).notNull().references(() => organizations.id),
  displayName: nvarchar('display_name', { length: 200 }).notNull(),
  m365TenantId: varchar('m365_tenant_id', { length: 36 }).notNull(),
  databaseName: varchar('database_name', { length: 128 }),
  tokenSecretName: varchar('token_secret_name', { length: 128 }),
  isDeleted: bit('is_deleted').notNull().default(false),
  deletedAt: datetime2('deleted_at'),
  createdAt: datetime2('created_at').notNull().default(sql`GETDATE()`),
  updatedAt: datetime2('updated_at').notNull().default(sql`GETDATE()`),
  // Phase 4: Tenant lifecycle columns
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  connectionMethod: varchar('connection_method', { length: 10 }),
  primaryDomain: nvarchar('primary_domain', { length: 255 }),
  contactEmail: nvarchar('contact_email', { length: 320 }),
  lastAuditAt: datetime2('last_audit_at'),
  lastAuditScore: int('last_audit_score'),
  // Phase 5: Critical findings cache for action queue
  criticalFindingsCount: int('critical_findings_count').notNull().default(0),
  // Phase 6: Scan scheduling
  scheduleFrequency: varchar('schedule_frequency', { length: 10 }),
  scheduleNextRunAt: datetime2('schedule_next_run_at'),
});

export const tenantUserAccess = mssqlTable('tenant_user_access', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  roleOverride: varchar('role_override', { length: 20 }),
  grantedBy: varchar('granted_by', { length: 36 }).notNull(),
  createdAt: datetime2('created_at').notNull().default(sql`GETDATE()`),
});

export const auditLog = mssqlTable('audit_log', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  orgId: varchar('org_id', { length: 36 }).notNull().references(() => organizations.id),
  userId: varchar('user_id', { length: 36 }),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 50 }).notNull(),
  resourceId: varchar('resource_id', { length: 36 }),
  details: nvarchar('details', { length: 4000 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  correlationId: varchar('correlation_id', { length: 36 }),
  createdAt: datetime2('created_at').notNull().default(sql`GETDATE()`),
});

export const setupWizardState = mssqlTable('setup_wizard_state', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  orgId: varchar('org_id', { length: 36 }).notNull().references(() => organizations.id).unique(),
  currentStep: int('current_step').notNull().default(1),
  totalSteps: int('total_steps').notNull().default(6),
  stepsCompleted: nvarchar('steps_completed', { length: 500 }).notNull().default('[]'),
  isComplete: bit('is_complete').notNull().default(false),
  updatedAt: datetime2('updated_at').notNull().default(sql`GETDATE()`),
});

/**
 * Tenant remediation consents -- Phase 7 Plan 01.
 *
 * Tracks incremental consent grants for write scopes, keyed by
 * (tenant_id, scope_bundle). Populated by the OBO token broker when a user
 * first clicks "Remediate" on a control whose scope bundle has not yet been
 * consented in that tenant.
 *
 * refreshTokenSecretName points at the envelope-encrypted refresh token in
 * Key Vault. revokedAt = NULL means the grant is active; at most one active
 * row per (tenant_id, scope_bundle) is enforced via a filtered unique index
 * in the migration. When a grant is re-authorised (e.g., scopes expanded),
 * the prior row is marked revoked and a new row is inserted.
 */
export const tenantRemediationConsents = mssqlTable('tenant_remediation_consents', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  scopeBundle: varchar('scope_bundle', { length: 30 }).notNull(),
  consentedAt: datetime2('consented_at').notNull().default(sql`GETDATE()`),
  consentedByUserId: varchar('consented_by_user_id', { length: 36 }).notNull().references(() => users.id),
  refreshTokenSecretName: varchar('refresh_token_secret_name', { length: 128 }).notNull(),
  revokedAt: datetime2('revoked_at'),
  lastUsedAt: datetime2('last_used_at'),
  createdAt: datetime2('created_at').notNull().default(sql`GETDATE()`),
});

// Phase 5: Action queue dismissals (per-user dismiss state for action queue items)
// itemKey format: "critical-{tenantId}" or "status-{tenantId}-needs_reauth" or "status-{tenantId}-stale_audit"
export const actionQueueDismissals = mssqlTable('action_queue_dismissals', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  orgId: varchar('org_id', { length: 36 }).notNull().references(() => organizations.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  itemKey: varchar('item_key', { length: 200 }).notNull(),
  dismissedAt: datetime2('dismissed_at').notNull().default(sql`GETDATE()`),
});

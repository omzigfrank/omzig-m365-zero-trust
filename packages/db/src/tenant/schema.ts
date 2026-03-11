import { sql } from 'drizzle-orm';
import {
  mssqlTable,
  varchar,
  nvarchar,
  int,
  datetime2,
} from 'drizzle-orm/mssql-core';

// Tenant Database Schema (per-tenant, isolated database)

export const auditRuns = mssqlTable('audit_runs', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull(),
  triggeredBy: varchar('triggered_by', { length: 36 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  startedAt: datetime2('started_at'),
  completedAt: datetime2('completed_at'),
  totalChecks: int('total_checks').notNull().default(0),
  passedChecks: int('passed_checks').notNull().default(0),
  failedChecks: int('failed_checks').notNull().default(0),
  errorChecks: int('error_checks').notNull().default(0),
  summary: nvarchar('summary', { length: 4000 }),
  createdAt: datetime2('created_at').notNull().default(sql`GETDATE()`),
});

/**
 * Audit findings table -- one row per check result, FK to auditRuns.
 * Control metadata is denormalized into each finding row so historical
 * findings remain accurate even if control definitions change in future deploys.
 */
export const auditFindings = mssqlTable('audit_findings', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  auditRunId: varchar('audit_run_id', { length: 36 }).notNull(),
  controlId: varchar('control_id', { length: 30 }).notNull(),
  product: varchar('product', { length: 20 }).notNull(),
  description: nvarchar('description', { length: 500 }).notNull(),
  requirementLevel: varchar('requirement_level', { length: 15 }).notNull(),
  severity: varchar('severity', { length: 10 }).notNull(),
  rating: varchar('rating', { length: 10 }).notNull(),
  message: nvarchar('message', { length: 2000 }).notNull(),
  action: nvarchar('action', { length: 2000 }),
  settingName: nvarchar('setting_name', { length: 200 }),
  currentValue: nvarchar('current_value', { length: 1000 }),
  expectedValue: nvarchar('expected_value', { length: 1000 }),
  requiredPermission: varchar('required_permission', { length: 100 }),
  nist80053: varchar('nist_800_53', { length: 50 }),
  createdAt: datetime2('created_at').notNull().default(sql`GETDATE()`),
});

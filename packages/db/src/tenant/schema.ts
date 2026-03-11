import { sql } from 'drizzle-orm';
import {
  mssqlTable,
  varchar,
  nvarchar,
  int,
  datetime2,
} from 'drizzle-orm/mssql-core';

// Tenant Database Schema (per-tenant, isolated database)
// Stub for Phase 2 audit tables - proves per-tenant DB isolation pattern

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

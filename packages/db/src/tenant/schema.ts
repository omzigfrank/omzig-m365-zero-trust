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
  // Phase 8: Serialized AuditFacts JSON for drift detection baseline.
  // Migration SQL creates column as NVARCHAR(MAX); Drizzle length:4000 is the proxy pattern.
  factsSnapshot: nvarchar('facts_snapshot', { length: 4000 }),
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
  nistCsf: varchar('nist_csf', { length: 50 }),
  nist800207Tenet: varchar('nist_800_207_tenet', { length: 10 }),
  createdAt: datetime2('created_at').notNull().default(sql`GETDATE()`),
});

/**
 * Remediation jobs table -- Phase 7 Plan 01.
 *
 * One row per remediation attempt. Created when a user approves a remediation
 * in the UI (Plan 07-02/07-03). Picked up by the in-process remediation worker,
 * which resolves a write token via the OBO token broker, runs the executor,
 * captures before/after Graph snapshots, and transitions the row through:
 *   pending -> running -> completed | failed
 *                       -> report_only_deployed -> awaiting_enforce -> completed   (RISKY two-phase)
 *                       -> rolled_back | rollback_failed | rollback_partial         (rollback path)
 *
 * heartbeat_at + worker_id support the zombie sweeper: rows with
 * status=running and heartbeat older than 5 minutes are re-queued.
 *
 * FK to audit_findings so every remediation links to the finding it fixes.
 */
export const remediationJobs = mssqlTable('remediation_jobs', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull(),
  findingId: varchar('finding_id', { length: 36 }).notNull(),
  controlId: varchar('control_id', { length: 30 }).notNull(),
  classification: varchar('classification', { length: 10 }).notNull(),
  scopeBundle: varchar('scope_bundle', { length: 30 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('pending'),
  beforeSnapshot: nvarchar('before_snapshot', { length: 4000 }),
  afterSnapshot: nvarchar('after_snapshot', { length: 4000 }),
  targetResourceId: varchar('target_resource_id', { length: 256 }),
  approvedByUserId: varchar('approved_by_user_id', { length: 36 }).notNull(),
  approvedAt: datetime2('approved_at').notNull(),
  startedAt: datetime2('started_at'),
  completedAt: datetime2('completed_at'),
  heartbeatAt: datetime2('heartbeat_at'),
  workerId: varchar('worker_id', { length: 64 }),
  attemptCount: int('attempt_count').notNull().default(0),
  lastAttemptError: nvarchar('last_attempt_error', { length: 4000 }),
  createdAt: datetime2('created_at').notNull().default(sql`GETDATE()`),
});

/**
 * Drift alerts table -- Phase 8 Plan 01.
 *
 * Tenant-scoped table storing detected configuration drift events.
 * Each row captures the area that changed, severity classification,
 * before/after snapshots, actor UPN, and human-readable diff summary.
 * Undismissed alerts surface in the cross-tenant action queue.
 */
export const driftAlerts = mssqlTable('drift_alerts', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull(),
  area: varchar('area', { length: 50 }).notNull(),
  severity: varchar('severity', { length: 20 }).notNull(),
  activityType: nvarchar('activity_type', { length: 200 }),
  actorUpn: nvarchar('actor_upn', { length: 200 }),
  beforeSnapshot: nvarchar('before_snapshot', { length: 4000 }),
  afterSnapshot: nvarchar('after_snapshot', { length: 4000 }),
  diffSummary: nvarchar('diff_summary', { length: 4000 }),
  auditEventId: varchar('audit_event_id', { length: 100 }),
  detectedAt: datetime2('detected_at').notNull().default(sql`GETDATE()`),
  dismissedAt: datetime2('dismissed_at'),
  dismissedBy: nvarchar('dismissed_by', { length: 200 }),
  remediationJobId: varchar('remediation_job_id', { length: 36 }),
  createdAt: datetime2('created_at').notNull().default(sql`GETDATE()`),
});

/**
 * Maturity scores table -- one row per tenet per audit run.
 * Persists severity-weighted maturity snapshots for historical trending.
 */
export const maturityScores = mssqlTable('maturity_scores', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  auditRunId: varchar('audit_run_id', { length: 36 }).notNull(),
  tenet: varchar('tenet', { length: 10 }).notNull(),
  tenetName: nvarchar('tenet_name', { length: 100 }).notNull(),
  totalChecks: int('total_checks').notNull().default(0),
  passedChecks: int('passed_checks').notNull().default(0),
  failedChecks: int('failed_checks').notNull().default(0),
  passRate: int('pass_rate').notNull().default(0),
  weightedPassRate: int('weighted_pass_rate').notNull().default(0),
  maturityLevel: varchar('maturity_level', { length: 15 }).notNull(),
  createdAt: datetime2('created_at').notNull().default(sql`GETDATE()`),
});

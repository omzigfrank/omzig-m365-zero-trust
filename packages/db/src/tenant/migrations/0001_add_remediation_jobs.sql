-- Migration 0001 (tenant): Add remediation_jobs table.
-- Phase 7 Plan 01 -- Remediation Engine.
--
-- Creates the tenant-scoped queue of remediation attempts picked up by
-- the in-process remediation worker in apps/api/src/services/remediation-worker.ts.
--
-- Lifecycle:
--   pending          -- row inserted by API when user approves remediation
--   running          -- worker claimed it via row-level UPDATE ... WHERE status='pending'
--   completed        -- executor finished successfully
--   failed           -- executor failed and attempt_count >= MAX_ATTEMPTS
--   report_only_deployed -- RISKY flow: Report-Only CA policy deployed (Plan 07-03)
--   awaiting_enforce -- RISKY flow: user-gate between deploy and enforce
--   rolled_back      -- rollback succeeded (REMED-06)
--   rollback_failed  -- rollback threw an error
--   rollback_partial -- multi-step rollback partially succeeded
--
-- Indexes support:
--   - poll query:    (status, created_at)
--   - zombie sweep:  (status, heartbeat_at)
--   - UI lookups:    (finding_id) FK join to audit_findings

CREATE TABLE [remediation_jobs] (
    [id]                     VARCHAR(36)    NOT NULL,
    [tenant_id]              VARCHAR(36)    NOT NULL,
    [finding_id]             VARCHAR(36)    NOT NULL,
    [control_id]             VARCHAR(30)    NOT NULL,
    [classification]         VARCHAR(10)    NOT NULL,
    [scope_bundle]           VARCHAR(30)    NOT NULL,
    [status]                 VARCHAR(30)    NOT NULL CONSTRAINT [DF_remediation_jobs_status] DEFAULT 'pending',
    [before_snapshot]        NVARCHAR(MAX)  NULL,
    [after_snapshot]         NVARCHAR(MAX)  NULL,
    [target_resource_id]     VARCHAR(256)   NULL,
    [approved_by_user_id]    VARCHAR(36)    NOT NULL,
    [approved_at]            DATETIME2      NOT NULL,
    [started_at]             DATETIME2      NULL,
    [completed_at]           DATETIME2      NULL,
    [heartbeat_at]           DATETIME2      NULL,
    [worker_id]              VARCHAR(64)    NULL,
    [attempt_count]          INT            NOT NULL CONSTRAINT [DF_remediation_jobs_attempt_count] DEFAULT 0,
    [last_attempt_error]     NVARCHAR(MAX)  NULL,
    [created_at]             DATETIME2      NOT NULL CONSTRAINT [DF_remediation_jobs_created_at] DEFAULT GETDATE(),
    CONSTRAINT [PK_remediation_jobs] PRIMARY KEY ([id])
);

-- Poll query index: scheduler reads pending rows oldest-first.
CREATE INDEX [IX_remediation_jobs_status_created]
    ON [remediation_jobs] ([status], [created_at]);

-- Zombie sweeper index: find running rows whose heartbeat has expired.
CREATE INDEX [IX_remediation_jobs_status_heartbeat]
    ON [remediation_jobs] ([status], [heartbeat_at]);

-- UI lookup: all remediation attempts for a given finding.
CREATE INDEX [IX_remediation_jobs_finding]
    ON [remediation_jobs] ([finding_id]);

-- FK to the finding this remediation is fixing. Per-tenant FK is safe
-- because remediation_jobs lives in the same tenant DB as audit_findings.
ALTER TABLE [remediation_jobs]
    ADD CONSTRAINT [FK_remediation_jobs_finding]
    FOREIGN KEY ([finding_id]) REFERENCES [audit_findings]([id]);

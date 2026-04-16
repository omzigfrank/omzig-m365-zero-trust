-- Phase 8 Plan 01: Add drift detection support to tenant DB.

-- 1. Add factsSnapshot to audit_runs
ALTER TABLE [audit_runs] ADD [facts_snapshot] NVARCHAR(MAX) NULL;

-- 2. Create drift_alerts table
CREATE TABLE [drift_alerts] (
  [id]                   VARCHAR(36)    NOT NULL,
  [tenant_id]            VARCHAR(36)    NOT NULL,
  [area]                 VARCHAR(50)    NOT NULL,
  [severity]             VARCHAR(20)    NOT NULL,
  [activity_type]        NVARCHAR(200)  NULL,
  [actor_upn]            NVARCHAR(200)  NULL,
  [before_snapshot]      NVARCHAR(MAX)  NULL,
  [after_snapshot]       NVARCHAR(MAX)  NULL,
  [diff_summary]         NVARCHAR(MAX)  NULL,
  [audit_event_id]       VARCHAR(100)   NULL,
  [detected_at]          DATETIME2      NOT NULL CONSTRAINT [DF_drift_alerts_detected_at] DEFAULT GETDATE(),
  [dismissed_at]         DATETIME2      NULL,
  [dismissed_by]         NVARCHAR(200)  NULL,
  [remediation_job_id]   VARCHAR(36)    NULL,
  [created_at]           DATETIME2      NOT NULL CONSTRAINT [DF_drift_alerts_created_at] DEFAULT GETDATE(),
  CONSTRAINT [PK_drift_alerts] PRIMARY KEY ([id])
);

-- Index: undismissed alerts for action queue count
CREATE INDEX [IX_drift_alerts_undismissed]
  ON [drift_alerts] ([tenant_id], [dismissed_at])
  WHERE [dismissed_at] IS NULL;

-- Index: by area for deduplication checks
CREATE INDEX [IX_drift_alerts_area]
  ON [drift_alerts] ([tenant_id], [area], [detected_at] DESC);

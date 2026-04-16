-- Phase 8 Plan 01: Add drift polling columns to tenants table.
ALTER TABLE [tenants] ADD [last_drift_poll_at] DATETIME2 NULL;
ALTER TABLE [tenants] ADD [drift_check_interval_minutes] INT NULL CONSTRAINT [DF_tenants_drift_interval] DEFAULT 15;

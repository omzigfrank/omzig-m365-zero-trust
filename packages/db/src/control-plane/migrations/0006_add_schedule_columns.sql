-- Migration 0006: Add scan scheduling columns
-- Phase 6 Plan 01: Scheduled Scans
-- Adds schedule_frequency ('daily' | 'weekly' | NULL) and schedule_next_run_at
-- to the tenants table to support automated scan scheduling per tenant.

ALTER TABLE [tenants] ADD [schedule_frequency] VARCHAR(10) NULL;
ALTER TABLE [tenants] ADD [schedule_next_run_at] DATETIME2 NULL;

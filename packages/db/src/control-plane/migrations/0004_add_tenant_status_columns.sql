-- Migration 0004: Add tenant lifecycle columns
-- Phase 4: Tenant Onboarding and Management
-- Adds status, connectionMethod, primaryDomain, contactEmail, lastAuditAt, lastAuditScore
-- Also makes databaseName and tokenSecretName nullable (null during pending state)

-- Add new lifecycle columns
ALTER TABLE [tenants] ADD [status] VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE [tenants] ADD [connection_method] VARCHAR(10) NULL;
ALTER TABLE [tenants] ADD [primary_domain] NVARCHAR(255) NULL;
ALTER TABLE [tenants] ADD [contact_email] NVARCHAR(320) NULL;
ALTER TABLE [tenants] ADD [last_audit_at] DATETIME2 NULL;
ALTER TABLE [tenants] ADD [last_audit_score] INT NULL;

-- Make databaseName and tokenSecretName nullable (they start null during pending state)
ALTER TABLE [tenants] ALTER COLUMN [database_name] VARCHAR(128) NULL;
ALTER TABLE [tenants] ALTER COLUMN [token_secret_name] VARCHAR(128) NULL;

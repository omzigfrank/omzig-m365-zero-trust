-- Migration 0007 (control plane): Add tenant_remediation_consents table.
-- Phase 7 Plan 01 -- Remediation Engine.
--
-- Tracks incremental consent grants for write scope bundles per tenant,
-- populated by the OBO token broker the first time a user remediates a
-- control whose scope bundle has not yet been consented.
--
-- Schema:
--   refresh_token_secret_name -> envelope-encrypted RT in Key Vault
--   revoked_at IS NULL        -> grant is active (at most one per tenant+bundle)
--   revoked_at IS NOT NULL    -> grant superseded or revoked (kept for audit)
--
-- The filtered UNIQUE index enforces at-most-one-active grant per
-- (tenant_id, scope_bundle) while allowing historical rows to remain.

CREATE TABLE [tenant_remediation_consents] (
    [id]                         VARCHAR(36)    NOT NULL,
    [tenant_id]                  VARCHAR(36)    NOT NULL,
    [scope_bundle]               VARCHAR(30)    NOT NULL,
    [consented_at]               DATETIME2      NOT NULL CONSTRAINT [DF_tenant_remediation_consents_consented_at] DEFAULT GETDATE(),
    [consented_by_user_id]       VARCHAR(36)    NOT NULL,
    [refresh_token_secret_name]  VARCHAR(128)   NOT NULL,
    [revoked_at]                 DATETIME2      NULL,
    [last_used_at]               DATETIME2      NULL,
    [created_at]                 DATETIME2      NOT NULL CONSTRAINT [DF_tenant_remediation_consents_created_at] DEFAULT GETDATE(),
    CONSTRAINT [PK_tenant_remediation_consents] PRIMARY KEY ([id]),
    CONSTRAINT [FK_tenant_remediation_consents_tenant]
        FOREIGN KEY ([tenant_id]) REFERENCES [tenants]([id]),
    CONSTRAINT [FK_tenant_remediation_consents_user]
        FOREIGN KEY ([consented_by_user_id]) REFERENCES [users]([id])
);

-- Filtered unique index: at most one active grant per (tenant, bundle).
-- Historical rows with revoked_at IS NOT NULL are excluded from uniqueness.
CREATE UNIQUE INDEX [UX_consent_tenant_bundle_active]
    ON [tenant_remediation_consents] ([tenant_id], [scope_bundle])
    WHERE [revoked_at] IS NULL;

-- Secondary index to support token-broker lookups during execution.
CREATE INDEX [IX_tenant_remediation_consents_tenant]
    ON [tenant_remediation_consents] ([tenant_id]);

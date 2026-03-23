# V2 Upgrade Guide: Adding PowerShell Workload Coverage

**Prerequisite:** V1 is functional with Entra ID (29 CISA controls) + NIST ZTA (31 checks) auditing, multi-tenant dashboard, remediation, and drift detection all working via Graph API.

**Goal:** Expand from 22 evaluators (17% CISA coverage) to 128 evaluators (100% CISA coverage) by adding Exchange Online, Defender, SharePoint, Teams, Power Platform, and Power BI.

---

## Architecture Overview

V1 uses a single auth method — delegated Graph API token — for all auditing:

```
Browser → TypeScript API (Container Apps) → Graph API → Tenant Data
```

V2 adds a PowerShell sidecar for workloads Graph doesn't cover:

```
Browser → TypeScript API (Container Apps) → Azure Function (PowerShell) → Exchange/Teams/SharePoint/Defender → Tenant Data
                                          → Graph API → Entra ID Data (unchanged)
                                          → REST API → Power Platform/Power BI Data (direct from TypeScript)
```

The existing `functions/Run-Audit/run.ps1` already demonstrates this pattern. V2 extends it.

---

## Step 1: PowerShell Connector Infrastructure

### 1a. Create a multi-tenant Entra ID app registration

This app handles certificate-based auth for all PowerShell modules.

```powershell
# Create the app registration
$app = New-MgApplication -DisplayName "Omzig Auditor - PowerShell Connector" -SignInAudience "AzureADMultipleOrgs"

# Required API permissions (application type):
# - Exchange: Exchange.ManageAsApp (Office 365 Exchange Online API)
# - SharePoint: Sites.FullControl.All (Microsoft Graph)
# - Teams: managed via Teams admin role assignment (no Graph permission needed)
# - Defender: uses same Exchange connection (Security & Compliance endpoint)
```

### 1b. Certificate generation and Key Vault storage

Each client tenant needs a certificate uploaded to the app registration. Use Azure Key Vault to store and rotate them.

```powershell
# Generate a self-signed cert (or use a CA)
$cert = New-SelfSignedCertificate `
    -Subject "CN=OmzigAuditor-{tenantId}" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyExportPolicy Exportable `
    -KeySpec Signature `
    -NotAfter (Get-Date).AddYears(2)

# Export and upload to Key Vault
$pfxBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $password)
Import-AzKeyVaultCertificate -VaultName "kv-omzig-auditor" -Name "cert-{tenantId}" -CertificateBytes $pfxBytes
```

### 1c. Per-tenant consent and role assignment

When onboarding a tenant for v2 coverage, the client admin must:

1. **Grant consent** to the multi-tenant app registration
2. **Assign Exchange Administrator role** to the app's service principal (required for ExchangeOnlineManagement)
3. **Assign Teams Administrator role** (required for MicrosoftTeams module)
4. **Upload the certificate** to the app registration in their tenant

```powershell
# In the client's tenant — assign Exchange Administrator role
$sp = Get-MgServicePrincipal -Filter "appId eq '{appId}'"
$exchangeAdminRole = Get-MgDirectoryRole -Filter "displayName eq 'Exchange Administrator'"
New-MgDirectoryRoleMember -DirectoryRoleId $exchangeAdminRole.Id -DirectoryObjectId $sp.Id

# Assign Teams Administrator role
$teamsAdminRole = Get-MgDirectoryRole -Filter "displayName eq 'Teams Administrator'"
New-MgDirectoryRoleMember -DirectoryRoleId $teamsAdminRole.Id -DirectoryObjectId $sp.Id
```

### 1d. Build the tenant onboarding UI flow

Update the web UI tenant onboarding page to add a "v2 coverage" step:

1. Show which workloads are available (Graph-only vs. full coverage)
2. If MSP wants full coverage, guide them through:
   - Admin consent for the PowerShell connector app
   - Role assignment verification
   - Certificate upload confirmation
3. Store certificate reference (Key Vault URI) in the tenant's database record

---

## Step 2: Azure Functions PowerShell Sidecar

### 2a. Create new data collection functions

Add one Azure Function per workload that collects raw configuration data and returns JSON:

```
functions/
├── Collect-ExchangeConfig/     # NEW — connects via ExchangeOnlineManagement
│   ├── run.ps1
│   └── function.json
├── Collect-DefenderConfig/     # NEW — connects via S&C endpoint
│   ├── run.ps1
│   └── function.json
├── Collect-SharePointConfig/   # NEW — connects via PnP.PowerShell
│   ├── run.ps1
│   └── function.json
├── Collect-TeamsConfig/        # NEW — connects via MicrosoftTeams
│   ├── run.ps1
│   └── function.json
├── Run-Audit/                  # EXISTING — keep as-is for Graph-based auditing
```

### 2b. Example: Collect-ExchangeConfig/run.ps1

Each collector follows the same pattern — connect, collect, return JSON:

```powershell
param($Request, $TriggerMetadata)

$tenantId = $Request.Body.tenantId
$certThumbprint = $Request.Body.certThumbprint
$appId = $Request.Body.appId
$organization = $Request.Body.organization

try {
    # Connect to Exchange Online using certificate
    Connect-ExchangeOnline `
        -CertificateThumbprint $certThumbprint `
        -AppId $appId `
        -Organization $organization `
        -ShowBanner:$false

    # Collect all configuration data needed for CISA SCuBA EXO controls
    $facts = @{
        transportRules       = Get-TransportRule | Select-Object Name, State, Priority, Description, Conditions, Actions
        remoteDomains        = Get-RemoteDomain | Select-Object DomainName, AutoForwardEnabled, AllowedOOFType
        dkimSigningConfig    = Get-DkimSigningConfig | Select-Object Domain, Enabled, Status
        hostedOutboundSpam   = Get-HostedOutboundSpamFilterPolicy | Select-Object Name, BccSuspiciousOutboundMail, AutoForwardingMode
        malwareFilterPolicy  = Get-MalwareFilterPolicy | Select-Object Name, EnableInternalSenderAdminNotifications, ZapEnabled
        antiPhishPolicy      = Get-AntiPhishPolicy | Select-Object Name, Enabled, PhishThresholdLevel, EnableSpoofIntelligence
        safeAttachmentPolicy = Get-SafeAttachmentPolicy -ErrorAction SilentlyContinue | Select-Object Name, Enable, Action
        safeLinkPolicy       = Get-SafeLinksPolicy -ErrorAction SilentlyContinue | Select-Object Name, EnableSafeLinksForEmail, DoNotTrackUserClicks
        auditConfig          = Get-AdminAuditLogConfig | Select-Object UnifiedAuditLogIngestionEnabled
        sharingPolicy        = Get-SharingPolicy | Select-Object Name, Domains, Enabled
        mailboxes            = @{
            sharedMailboxes  = (Get-Mailbox -RecipientTypeDetails SharedMailbox -ResultSize 100 | Measure-Object).Count
            totalMailboxes   = (Get-Mailbox -ResultSize 100 | Measure-Object).Count
        }
    }

    Disconnect-ExchangeOnline -Confirm:$false

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = 200
        Body       = ($facts | ConvertTo-Json -Depth 10 -Compress)
    })
}
catch {
    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = 500
        Body       = (@{ error = $_.Exception.Message } | ConvertTo-Json -Compress)
    })
}
```

### 2c. Update requirements.psd1

Add the PowerShell modules needed:

```powershell
# In functions/requirements.psd1 — add these for v2:
@{
    'ExchangeOnlineManagement' = '3.*'    # Exchange + Security & Compliance
    'MicrosoftTeams'           = '6.*'    # Teams admin policies
    'PnP.PowerShell'           = '2.*'    # SharePoint Online admin
}
```

---

## Step 3: Write Evaluators for Each Workload

### 3a. Extend CisaEvaluatorRegistry.ps1

Add evaluator script blocks for each control that currently returns "na". The pattern is identical to existing evaluators — they receive `$facts` and return `{ rating, message, action }`.

**Exchange Online (37 evaluators needed):**

```powershell
# Example: MS.EXO.1.1v1 — Auto-forwarding to external domains SHALL be disabled
$registry["MS.EXO.1.1v1"] = {
    param($facts)
    if (-not $facts.exchangeConfig) {
        return @{ rating = "na"; message = "Exchange Online data not collected. Enable v2 connector." }
    }
    $remoteDomains = $facts.exchangeConfig.remoteDomains
    $autoForwardEnabled = $remoteDomains | Where-Object { $_.AutoForwardEnabled -eq $true }
    if ($autoForwardEnabled.Count -eq 0) {
        return @{ rating = "pass"; message = "Auto-forwarding disabled on all remote domains." }
    }
    $domains = ($autoForwardEnabled | ForEach-Object { $_.DomainName }) -join ", "
    return @{
        rating  = "fail"
        message = "Auto-forwarding enabled on: $domains"
        action  = "Set-RemoteDomain -Identity <domain> -AutoForwardEnabled `$false"
    }
}
```

**Where to find what each evaluator should check:**
- CISA publishes baseline documents per product: https://github.com/cisagov/ScubaGear/tree/main/PowerShell/ScubaGear/baselines
- Each baseline doc specifies the exact setting and expected value per control ID
- The `CisaCatalogFetcher.ps1` already pulls control metadata (ID, description, requirement level)

### 3b. Evaluator count per workload

| Workload | Controls | Existing | To Build | Reference Baseline |
|----------|----------|----------|----------|-------------------|
| Exchange Online | 38 | 1 | 37 | `exo.md` |
| Defender | 18 | 4 | 14 | `defender.md` |
| SharePoint | 8 | 0 | 8 | `sharepoint.md` |
| Teams | 20 | 0 | 20 | `teams.md` |
| Power Platform | 8 | 0 | 8 | `powerplatform.md` |
| Power BI | 7 | 0 | 7 | `powerbi.md` |
| Entra ID (remaining) | 29 | 17 | 12 | `aad.md` |
| **Total** | **128** | **22** | **106** | |

---

## Step 4: Integrate Collectors with the Audit Pipeline

### 4a. Update the TypeScript API to call PowerShell collectors

The TypeScript API (Container Apps) calls each collector function, merges the results with Graph API data, and runs all evaluators:

```typescript
// In the audit engine service
async function collectTenantFacts(tenantId: string): Promise<TenantFacts> {
  // v1 — Graph API (always runs)
  const graphFacts = await collectGraphFacts(tenantId);

  // v2 — PowerShell collectors (only if tenant has v2 connector configured)
  const tenant = await getTenantConfig(tenantId);
  let exchangeFacts = null;
  let defenderFacts = null;
  let sharePointFacts = null;
  let teamsFacts = null;

  if (tenant.hasV2Connector) {
    const certInfo = await getKeyVaultCert(tenantId);

    // Call PowerShell Azure Functions in parallel
    [exchangeFacts, defenderFacts, sharePointFacts, teamsFacts] = await Promise.all([
      callCollector('Collect-ExchangeConfig', tenantId, certInfo),
      callCollector('Collect-DefenderConfig', tenantId, certInfo),
      callCollector('Collect-SharePointConfig', tenantId, certInfo),
      callCollector('Collect-TeamsConfig', tenantId, certInfo),
    ]);
  }

  return {
    ...graphFacts,
    exchangeConfig: exchangeFacts,
    defenderConfig: defenderFacts,
    sharePointConfig: sharePointFacts,
    teamsConfig: teamsFacts,
  };
}
```

### 4b. Evaluators gracefully handle missing data

All new evaluators check for the workload data first. If a tenant doesn't have v2 connectors configured, controls return "na" with a message explaining how to enable coverage — exactly how it works today:

```powershell
$registry["MS.EXO.1.1v1"] = {
    param($facts)
    if (-not $facts.exchangeConfig) {
        return @{ rating = "na"; message = "Enable Exchange Online connector for this tenant to evaluate." }
    }
    # ... evaluation logic
}
```

---

## Step 5: Power Platform and Power BI (REST API — no PowerShell needed)

These 15 controls use REST APIs callable directly from TypeScript:

```typescript
// Power Platform — api.bap.microsoft.com
const powerPlatformFacts = await fetch('https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments', {
  headers: { Authorization: `Bearer ${powerPlatformToken}` }
});

// Power BI — api.powerbi.com
const powerBiFacts = await fetch('https://api.powerbi.com/v1.0/myorg/admin/tenantSettings', {
  headers: { Authorization: `Bearer ${powerBiToken}` }
});
```

No PowerShell sidecar needed for these — they can be added to the TypeScript API directly.

---

## Step 6: Update the Dashboard

### 6a. Show coverage level per tenant

Add a coverage indicator showing which workloads are connected:

```
Tenant: Contoso Ltd
Coverage: Entra ID ✓ | Exchange ✓ | Defender ✓ | SharePoint ✗ | Teams ✗
CISA Score: 74% (of 85 assessable controls)
```

### 6b. "Upgrade to full coverage" prompt

For tenants with only Graph API coverage, show a prompt:

```
You're auditing 29 of 128 CISA controls (23%).
Enable the PowerShell connector for Exchange, Defender, SharePoint, and Teams
to reach 100% coverage. [Set Up Connector →]
```

---

## Recommended v2 Build Order

Build workloads in this order based on impact and complexity:

| Order | Workload | Controls Added | Cumulative Coverage | Why This Order |
|-------|----------|---------------|-------------------|----------------|
| 1 | Exchange Online | +37 | 59/128 (46%) | Biggest gap, highest attack surface |
| 2 | Defender | +14 | 73/128 (57%) | Same PowerShell module as Exchange (S&C endpoint) |
| 3 | Teams | +20 | 93/128 (73%) | Separate module but well-documented |
| 4 | SharePoint | +8 | 101/128 (79%) | Small scope, PnP is mature |
| 5 | Entra ID (remaining 12) | +12 | 113/128 (88%) | Deeper Graph queries, no new auth |
| 6 | Power Platform | +8 | 121/128 (95%) | REST API, no PowerShell |
| 7 | Power BI | +7 | 128/128 (100%) | REST API, no PowerShell |

**Exchange + Defender share the same module**, so solving Exchange auth gives you Defender for free (different endpoint, same connection method).

---

## Certificate Lifecycle Checklist

For production, implement these before going live with v2:

- [ ] Automated certificate generation during tenant onboarding
- [ ] Key Vault storage with access policies scoped to the Function App's managed identity
- [ ] Certificate expiration monitoring (alert 30 days before expiry)
- [ ] Automated rotation (generate new cert, upload to tenant app, update Key Vault)
- [ ] Revocation procedure for tenant offboarding (remove cert, revoke app consent)
- [ ] Audit logging of all certificate operations

---

## Key Files to Modify

| File | Change |
|------|--------|
| `functions/requirements.psd1` | Add ExchangeOnlineManagement, MicrosoftTeams, PnP.PowerShell |
| `scripts/audit/CisaEvaluatorRegistry.ps1` | Add 106 new evaluator script blocks |
| `scripts/audit/TenantFactCollector.ps1` | Accept and merge PowerShell collector results |
| `functions/Run-Audit/run.ps1` | Call PowerShell collectors when v2 connector is configured |
| Web UI: tenant onboarding page | Add v2 connector setup flow |
| Web UI: dashboard | Add per-tenant coverage indicator |
| `.planning/REQUIREMENTS.md` | Move EXTCOV items from v2 to v1 when ready |

---

## How to Start V2 with Claude Code

When v1 is stable and you're ready to build v2, use this section as your prompt. Copy the block below into a new Claude Code conversation.

### Pre-flight Checklist

Before starting, make sure:

- [ ] V1 is deployed and working (Entra ID + NIST ZTA audits, multi-tenant dashboard, remediation, drift detection)
- [ ] You have an Azure subscription with permissions to create Function Apps and Key Vault resources
- [ ] You have an Entra ID tenant where you can create app registrations
- [ ] You have at least one test tenant to validate Exchange/Teams/SharePoint/Defender connections

### Prompt to Give Claude Code

```
I need to build v2 of the Omzig M365 Zero Trust Auditor. V1 is complete and working.

V2 adds PowerShell-based audit coverage for Exchange Online, Defender, SharePoint,
Teams, Power Platform, and Power BI — expanding from 22 CISA SCuBA evaluators (17%)
to 128 (100%).

Read these files for full context:
- .planning/PROJECT.md (project overview)
- .planning/REQUIREMENTS.md (v2 requirements section)
- .planning/V2-UPGRADE-GUIDE.md (technical implementation guide)
- .planning/research/FEATURES.md (feature research and competitor analysis)
- .planning/research/PITFALLS.md (known risks — especially Graph throttling and cert lifecycle)
- docs/AUDIT-COVERAGE.md (current coverage gaps per workload)
- scripts/audit/CisaEvaluatorRegistry.ps1 (existing evaluator patterns to follow)
- scripts/audit/TenantFactCollector.ps1 (existing data collection patterns)
- functions/Run-Audit/run.ps1 (existing Azure Function audit endpoint)

Build order (from V2-UPGRADE-GUIDE.md):
1. PowerShell connector infrastructure (cert auth, Key Vault, sidecar functions)
2. Exchange Online collector + 37 evaluators (biggest gap)
3. Defender collector + 14 evaluators (same module as Exchange)
4. Teams collector + 20 evaluators
5. SharePoint collector + 8 evaluators
6. Remaining 12 Entra ID evaluators (deeper Graph queries)
7. Power Platform + Power BI (REST APIs, no PowerShell)
8. Dashboard updates (coverage indicators, connector setup UI)

Key constraints:
- Each workload needs certificate-based auth per tenant (not Graph tokens)
- PowerShell modules run in Azure Functions (PowerShell runtime), not in TypeScript
- TypeScript API calls PowerShell Functions as a sidecar for data collection
- All evaluators must follow the existing pattern in CisaEvaluatorRegistry.ps1
- Power Platform and Power BI use REST APIs directly from TypeScript (no PowerShell)
- Graph API throttling: 1 req/sec for CA APIs — rate limiting is critical
- CISA ScubaGear baselines define expected values per control:
  https://github.com/cisagov/ScubaGear/tree/main/PowerShell/ScubaGear/baselines

Use /gsd:new-milestone to initialize the v2 milestone and plan phases.
```

### Reference Documents to Provide

If Claude Code asks for more context, point it to these:

| Question | File to Reference |
|----------|-------------------|
| "What evaluators exist?" | `scripts/audit/CisaEvaluatorRegistry.ps1` |
| "What data does the collector gather?" | `scripts/audit/TenantFactCollector.ps1` |
| "What controls need evaluators?" | `docs/AUDIT-COVERAGE.md` |
| "What does each CISA control check?" | CISA baselines: `exo.md`, `defender.md`, `sharepoint.md`, `teams.md`, `powerplatform.md`, `powerbi.md` at https://github.com/cisagov/ScubaGear/tree/main/PowerShell/ScubaGear/baselines |
| "What are the pitfalls?" | `.planning/research/PITFALLS.md` |
| "What's the architecture?" | `.planning/research/ARCHITECTURE.md` |
| "How does the existing audit work?" | `functions/Run-Audit/run.ps1` |
| "What PowerShell modules are needed?" | `functions/requirements.psd1` |
| "What's the cert auth pattern?" | This guide, Steps 1a-1d |
| "What's the v2 build order?" | This guide, "Recommended v2 Build Order" section |

### Expected V2 Outcome

When v2 is complete:

- 128/128 CISA SCuBA controls have active evaluators (100% coverage)
- All 7 M365 workloads auditable (Entra ID, Exchange, Defender, SharePoint, Teams, Power Platform, Power BI)
- Per-tenant PowerShell connector with certificate lifecycle management
- Dashboard shows per-tenant coverage level and "upgrade to full coverage" prompts
- Auto-remediation extended to Exchange and Defender settings
- Batch remediation across tenants for common findings

---

*Created: 2026-03-10*
*Use this guide when v1 is stable and you're ready to expand CISA SCuBA coverage from 17% to 100%.*

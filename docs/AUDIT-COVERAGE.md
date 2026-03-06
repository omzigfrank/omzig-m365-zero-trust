# Audit Framework Coverage

Last updated: 2026-03-06

This document describes the current evaluation coverage for the CISA SCuBA and NIST Zero Trust audit frameworks implemented in `scripts/audit/`.

---

## CISA SCuBA (Secure Cloud Business Applications)

The audit catalog contains **128 controls** across 7 Microsoft 365 products, dynamically fetched from the [cisagov/ScubaGear](https://github.com/cisagov/ScubaGear) GitHub repository. Every control appears in the scorecard with its ID, description, and requirement level (SHALL/SHOULD/MAY).

However, only a subset of controls have active evaluators that return pass/fail/warn. The rest are marked "na" because the underlying M365 settings are not accessible via Microsoft Graph API.

### Coverage by Product

| Product | Total Controls | Active Evaluators | Marked "na" | Required Module |
|---------|---------------|-------------------|-------------|-----------------|
| AAD (Entra ID) | 29 | 17 | 12 | Microsoft Graph (connected) |
| Exchange Online | 38 | 1 | 37 | `ExchangeOnlineManagement` |
| Defender | 18 | 4 | 14 | Security & Compliance PowerShell |
| SharePoint | 8 | 0 | 8 | `PnP.PowerShell` |
| Teams | 20 | 0 | 20 | `MicrosoftTeams` |
| Power Platform | 8 | 0 | 8 | Power Platform Admin API |
| Power BI | 7 | 0 | 7 | Power BI Admin API |
| **Total** | **128** | **22 (17%)** | **106 (83%)** | |

### Active AAD Evaluators

| Control ID | Check |
|------------|-------|
| MS.AAD.1.1v1 | Legacy authentication blocked via CA policy |
| MS.AAD.2.1v1 | High-risk users blocked (requires P2) |
| MS.AAD.2.3v1 | High-risk sign-ins blocked (requires P2) |
| MS.AAD.3.1v1 | Phishing-resistant MFA for all users |
| MS.AAD.3.2v1 | Alternative MFA method configured |
| MS.AAD.3.4v1 | Authentication methods migration complete |
| MS.AAD.3.5v1 | SMS/voice not used for MFA |
| MS.AAD.3.6v1 | Phishing-resistant MFA for privileged roles |
| MS.AAD.3.7v1 | Managed devices required |
| MS.AAD.5.1v1 | Only admins can register applications |
| MS.AAD.5.3v1 | Admin consent workflow enabled |
| MS.AAD.6.1v1 | Passwords set to never expire (NIST guidance) |
| MS.AAD.7.1v1 | 2-8 Global Administrators |
| MS.AAD.7.2v1 | Privileged users assigned via PIM |
| MS.AAD.8.1v1 | Guest user access restricted |
| MS.AAD.8.2v1 | Guest invitations restricted to admin roles |

### Active EXO / Defender Evaluators

| Control ID | Check |
|------------|-------|
| MS.EXO.4.1v1 | Defender for Office 365 licensed |
| MS.DEFENDER.1.1v1 | Preset security policies (license check) |
| MS.DEFENDER.1.2v1 | All users covered by EOP |
| MS.DEFENDER.1.3v1 | All users covered by Defender for O365 |
| MS.DEFENDER.6.1v1 | Purview unified audit logging |

### Why 83% of Controls Show "na"

Microsoft Graph API does not expose configuration settings for most M365 workloads. Each product requires its own PowerShell module or admin API with separate authentication:

- **Exchange Online** (37 controls) - Mail flow rules, DKIM/DMARC, transport config, anti-spam, journaling, and mailbox auditing all require `Connect-ExchangeOnline` with certificate-based authentication.
- **Teams** (20 controls) - Meeting policies, messaging policies, external access, app permissions, and federation settings all require `Connect-MicrosoftTeams`.
- **SharePoint** (8 controls) - Sharing policies, access control, site classification, and DLP integration require `Connect-PnPOnline` or the SharePoint Admin API.
- **Defender** (14 remaining controls) - Safe Attachments, Safe Links, anti-phishing policies, and preset security policy details require the Security & Compliance PowerShell module.
- **Power Platform** (8 controls) - Environment policies, DLP connectors, and tenant isolation require the Power Platform Admin API, which has no Graph equivalent.
- **Power BI** (7 controls) - Tenant settings, external sharing, and export controls require the Power BI Admin API, which has no Graph equivalent.

---

## NIST Zero Trust Architecture (SP 800-207)

The audit implements **31 checks** across all 7 tenets of NIST SP 800-207. Every check has real evaluation logic that inspects tenant data from Microsoft Graph - there are no stubs.

### Coverage by Tenet

| Tenet | Description | Checks | Status |
|-------|-------------|--------|--------|
| T1 | All data sources and computing services are resources (Asset Awareness) | 4 | All active |
| T2 | All communication is secured regardless of network location (Encryption Everywhere) | 4 | All active |
| T3 | Access to individual resources is granted on a per-session basis (No Implicit Trust) | 2 | All active |
| T4 | Access is determined by dynamic policy (Policy Engine) | 6 | All active |
| T5 | Enterprise monitors and measures integrity and security posture (Visibility) | 4 | All active |
| T6 | All authentication and authorization are dynamic and strictly enforced (Strong Auth) | 7 | All active |
| T7 | Enterprise collects as much information as possible to improve security (Continuous Improvement) | 4 | All active |
| **Total** | | **31** | **100% active** |

### Check Details

**Tenet 1 - Asset Awareness (4 checks)**
- Device Inventory - Intune-enrolled devices exist
- Application Inventory - App registrations tracked
- Data Classification - Sensitivity labels deployed
- Domain Inventory - Verified custom domains

**Tenet 2 - Encryption Everywhere (4 checks)**
- Legacy Auth Blocked - CA policy blocks legacy protocols
- Security Baseline Strategy - CA policies vs. security defaults
- Network Trust Posture - Named location trust configuration
- Modern Auth Enforcement - CA policies with qualifying licenses

**Tenet 3 - No Implicit Trust (2 checks)**
- Per-Session Evaluation - Sufficient CA policies enforce session checks
- Session Controls - Sign-in frequency and persistent browser restrictions

**Tenet 4 - Policy Engine (6 checks)**
- Risk-Based Access - User risk and sign-in risk CA policies (requires P2)
- Device Compliance Required - CA policy requires compliant devices
- Location-Based Restrictions - Geo-blocking via CA policies
- Application-Specific Policies - Per-app CA policies beyond "All Apps"
- MFA Coverage - MFA registration percentage across users
- Admin Access Controls - CA policies targeting admin roles

**Tenet 5 - Visibility & Monitoring (4 checks)**
- Audit Logging - License tier supports unified audit
- Endpoint Detection - Defender for Endpoint licensed
- Email Threat Protection - Defender for Office 365 licensed
- Telemetry Coverage - Count of available data sources

**Tenet 6 - Strong Authentication (7 checks)**
- MFA Registration - Registration percentage thresholds
- Privileged Role Control - Global Admin count in safe range (2-5)
- Emergency Access - Break-glass group with members
- Auth Methods Modernized - Migration state complete
- Weak Auth Methods Disabled - SMS/voice authentication disabled
- PIM Configured - Eligible (time-bound) role assignments exist
- Admin Consent Workflow - Consent request policy enabled

**Tenet 7 - Continuous Improvement (4 checks)**
- Identity Protection Licensing - Entra ID P2 licensed
- Guest Access Governance - Guest invite policy restricted
- App Registration Governance - Users cannot register apps
- Password Policy Modernized - Non-expiring passwords per NIST guidance

### NIST 800-53 Cross-Reference

When both CISA and NIST frameworks are selected, the audit also generates a **NIST SP 800-53 Rev. 5** cross-reference report. This aggregates CISA control results by 800-53 control family (AC, AU, CM, IA, SC, SI, etc.) and produces a per-family pass rate. This is a reporting/aggregation function - it does not perform additional tenant evaluation.

---

## Expanding Coverage to 100%

To evaluate the remaining 106 CISA controls, the following service connections would need to be added:

| Service | Module | Auth Method | Controls Unlocked |
|---------|--------|-------------|-------------------|
| Exchange Online | `ExchangeOnlineManagement` v3+ | Certificate-based app auth | 37 |
| Microsoft Teams | `MicrosoftTeams` v5+ | Certificate or credential auth | 20 |
| SharePoint Online | `PnP.PowerShell` v2+ | Certificate-based app auth | 8 |
| Security & Compliance | `ExchangeOnlineManagement` (S&C endpoint) | Certificate-based app auth | 14 |
| Power Platform | REST API (`api.bap.microsoft.com`) | Service principal token | 8 |
| Power BI | REST API (`api.powerbi.com`) | Service principal token | 7 |

Each service requires its own app registration or certificate, adding complexity to the deployment. The current Graph-only approach works with a single managed identity and covers the highest-priority identity and access controls.

---

## Architecture

```
scripts/
  FrameworkAuditHelper.ps1        # Orchestration, dot-sources audit/ files
  audit/
    CisaCatalogFetcher.ps1        # Fetches 128 controls from ScubaGear GitHub
    TenantFactCollector.ps1       # Gathers 18 fact sections via Graph API
    CisaEvaluatorRegistry.ps1     # 22 active evaluators + auto-"na" for rest
    NistEvaluatorRegistry.ps1     # 31 ZTA checks + 800-53 cross-reference
```

The catalog fetcher pulls the latest control definitions from the `cisagov/ScubaGear` repository on GitHub and caches them in `framework-cache.json`. If GitHub is unreachable, built-in defaults for all 128 controls are used as a fallback.

# Omzig M365 Zero Trust

Azure Marketplace Managed Application for deploying Microsoft 365 Zero Trust security configurations aligned with NSA guidelines and HIPAA compliance requirements.

## Overview

This solution automates the deployment and configuration of M365 security controls across all seven NSA Zero Trust pillars:

| Pillar | Implementation |
|--------|----------------|
| **User (Identity)** | Conditional Access policies, MFA, password policies |
| **Device** | Intune compliance, Defender for Endpoint |
| **Network** | NSG baselines, private endpoints (future) |
| **Application** | Defender for Office 365, Cloud Apps |
| **Data** | DLP policies, sensitivity labels, encryption |
| **Visibility** | Log Analytics, alert rules, Sentinel |
| **Automation** | Azure Functions, Graph API orchestration |

## CRITICAL: Device Compliance Warning

> **CA004-Require-Compliant-Device can cause COMPLETE TENANT LOCKOUT if enabled incorrectly.**

Before enabling CA004 (device compliance), you MUST:

1. **Enroll at least one device in Intune** - Without enrolled devices, no device can be "compliant"
2. **Create a break-glass admin account** - Add it to the `ZeroTrust-BreakGlass-Admins` security group
3. **Test in Report-Only mode first** - Verify sign-in logs show expected behavior

### Safe Deployment Steps

```powershell
# Step 1: Deploy policies (creates them in Report-Only mode)
# The Deploy-Identity function automatically creates ZeroTrust-BreakGlass-Admins group

# Step 2: Add break-glass admin to exclusion group (via Entra ID portal)
# Navigate to: Entra ID > Groups > ZeroTrust-BreakGlass-Admins > Members

# Step 3: Enroll devices in Intune (via Settings > Accounts > Access work or school)

# Step 4: Enable policies (CA004 is SKIPPED by default)
.\enable-policies.ps1

# Step 5: After confirming devices are compliant, enable CA004
.\enable-policies.ps1 -IncludeCA004
```

### Recovery from Lockout

If you're locked out due to CA004:
1. Use Azure CLI with a service principal or different tenant admin
2. Delete CA004: `az rest --method DELETE --url 'https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies/{policy-id}'`
3. Clear browser cache and sign in again

## Features

- **Three Security Baselines**: Standard, Enhanced, Maximum
- **HIPAA Compliance Toggle**: Enables stricter controls (7-year retention, PHI labels, etc.)
- **7 Conditional Access Policies**: Block legacy auth, MFA enforcement, device compliance, risk-based access, geo-blocking
- **Defender Integration**: Safe Attachments, Safe Links, Anti-phishing, Anti-spam
- **Data Protection**: DLP with 10+ sensitive info types, 5 sensitivity labels
- **Centralized Logging**: Log Analytics with configurable retention and alert rules

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Azure Marketplace                             │
│                  createUiDefinition.json                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Bicep Templates                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ Identity │ │ Devices  │ │ Security │ │   Data   │ │Network │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘ │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Azure Functions                               │
│         (PowerShell 7 + Microsoft Graph API)                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  │ Orchestrator│ │Deploy-Identity│Deploy-Devices│Deploy-Security││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘│
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Microsoft 365 Tenant                           │
│    Entra ID │ Intune │ Defender │ Purview │ Exchange Online     │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Azure subscription with Contributor access
- M365 E3/E5 or Business Premium licenses
- Entra ID P1/P2 for Conditional Access
- Global Administrator or Security Administrator role

### Deploy via Azure CLI

```bash
# Clone the repository
git clone https://github.com/omzigfrank/omzig-m365-zero-trust.git
cd omzig-m365-zero-trust

# Login to Azure
az login

# Deploy
az deployment sub create \
  --location eastus \
  --template-file bicep/main.bicep \
  --parameters orgName=contoso \
               environmentName=prod \
               hipaaEnabled=true \
               securityBaseline=Enhanced
```

### Deploy via Azure Portal

1. Navigate to Azure Marketplace
2. Search for "Omzig M365 Zero Trust"
3. Follow the wizard to configure:
   - Organization details
   - M365 licensing tier
   - Security baseline (Standard/Enhanced/Maximum)
   - HIPAA compliance toggle

## Project Structure

```
omzig-m365-zero-trust/
├── bicep/                    # Infrastructure as Code
│   ├── main.bicep           # Entry point
│   ├── identity/            # Conditional Access, MFA
│   ├── devices/             # Intune, Defender for Endpoint
│   ├── security/            # Defender for Office 365, logging
│   ├── data/                # DLP, sensitivity labels
│   └── network/             # NSG baselines (future)
├── functions/               # Azure Functions (PowerShell)
│   ├── Orchestrator/        # Main orchestration
│   ├── Deploy-Identity/     # CA policy deployment
│   ├── Deploy-Devices/      # Intune configuration
│   ├── Deploy-Security/     # Defender configuration
│   ├── Deploy-Data/         # DLP and labels
│   └── Modules/             # Shared Graph API helpers
├── ui/                      # Marketplace wizard
│   └── createUiDefinition.json
├── pipelines/               # CI/CD
│   ├── azure-pipelines.yml
│   └── functions-pipeline.yml
├── managed-app/             # Marketplace packaging
└── docs/                    # Documentation
    ├── NSA-ZERO-TRUST.md
    ├── HIPAA-CONTROLS.md
    └── DEPLOYMENT-GUIDE.md
```

## Conditional Access Policies

| Policy | Description | Default | Notes |
|--------|-------------|---------|-------|
| CA001 | Block legacy authentication | Report-Only | Safe to enable |
| CA002 | Require MFA for all users | Report-Only | Safe to enable |
| CA003 | Require MFA for admin roles | Report-Only | Safe to enable |
| CA004 | Require compliant device | Report-Only | **DANGER** - See warning above |
| CA005 | Block high-risk users | Report-Only | Safe to enable |
| CA006 | MFA for risky sign-ins | Report-Only | Safe to enable |

All policies are created in **Report-Only mode** by default. Use `enable-policies.ps1` to enable them.

**CA004 Safety Features:**
- Excluded group: `ZeroTrust-BreakGlass-Admins` (created automatically)
- Skipped by default in `enable-policies.ps1`
- Pre-flight checks verify Intune enrollment before enabling

## Security Baselines

| Setting | Standard | Enhanced | Maximum |
|---------|----------|----------|---------|
| MFA Required | All users | All users | All users |
| Compliant Device | Optional | Required | Required |
| Risk Threshold | High | Medium | Low |
| ASR Rules | Audit | Audit | Block |
| DLP Mode | Audit | Warn | Block |
| Session Timeout | 12 hours | 12 hours | 8 hours |

## HIPAA Mode

When `hipaaEnabled=true`:

- Session timeout: 8 hours (reduced from 12)
- MFA remember device: Disabled
- Password minimum: 14 characters
- Log retention: 7 years (2555 days)
- DLP mode: Block (not Warn)
- PHI sensitivity label: Created with encryption
- Compliance grace period: 0 hours (immediate)

## Documentation

- [Deployment Guide](docs/DEPLOYMENT-GUIDE.md) - Step-by-step manual deployment instructions
- [Marketplace Publishing Guide](docs/MARKETPLACE-GUIDE.md) - Azure Marketplace monetization
- [NSA Zero Trust Pillar Mapping](docs/NSA-ZERO-TRUST.md)
- [HIPAA Control Mapping](docs/HIPAA-CONTROLS.md)

## Graph API Permissions

The managed identity requires these permissions:

| Permission | Purpose |
|------------|---------|
| Policy.ReadWrite.ConditionalAccess | Create CA policies |
| Policy.Read.All | Read existing policies |
| DeviceManagementConfiguration.ReadWrite.All | Intune policies |
| DeviceManagementManagedDevices.ReadWrite.All | Device management |
| SecurityEvents.ReadWrite.All | Security configuration |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- [GitHub Issues](https://github.com/omzigfrank/omzig-m365-zero-trust/issues)
- [Documentation](docs/)

---

Built with Azure Bicep, PowerShell, and Microsoft Graph API.

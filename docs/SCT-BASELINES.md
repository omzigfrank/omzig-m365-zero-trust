# Microsoft Security Compliance Toolkit (SCT) Baselines

## Overview

The Omzig M365 Zero Trust Managed Application includes pre-parsed Microsoft Security Compliance Toolkit 1.0 baselines, ready for automated deployment as Intune device configuration profiles via Microsoft Graph API. All baselines are mapped to NSA Zero Trust pillars and HIPAA security controls.

## Included Baselines

### Current (Recommended for New Deployments)

| Baseline | ID | Settings | Audit Policies | Category |
|----------|----|----------|----------------|----------|
| **Windows 11 v25H2** | `win11-25h2` | 335 | 23 | Workstation |
| **Windows 10 v22H2** | `win10-22h2` | 278 | 23 | Workstation |
| **Windows Server 2025** | `server-2025` | 382 | 54 | Server |
| **Microsoft Edge v139** | `edge-v139` | 20 | 0 | Browser |
| **Microsoft 365 Apps 2512** | `m365apps-2512` | 385 | 0 | Office |
| **Windows 10 Update** | `win10-update` | 78 | 0 | Update Mgmt |

### Legacy (For Existing Environments)

| Baseline | ID | Settings | Category |
|----------|----|----------|----------|
| Windows 11 v24H2 | `win11-24h2` | 335 | Workstation |
| Windows 11 v23H2 | `win11-23h2` | 304 | Workstation |
| Windows 11 v22H2 | `win11-22h2` | 292 | Workstation |
| Windows 10 v20H2 / Server v20H2 | `win10-20h2` | 417 | Workstation/Server |
| Windows 10 v1809 / Server 2019 | `win10-1809` | 420 | Workstation/Server |
| Windows 10 v1607 / Server 2016 | `win10-1607` | 383 | Workstation/Server |
| Windows Server 2022 | `server-2022` | 311 | Server |

## Deployment Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Azure Managed App                          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │             createUiDefinition.json                      │ │
│  │   ┌─────────────┐  ┌─────────────┐  ┌──────────────┐   │ │
│  │   │ OS Baseline │  │App Baseline │  │  Deploy Mode │   │ │
│  │   │ Selection   │  │ Selection   │  │ audit/enforce│   │ │
│  │   └──────┬──────┘  └──────┬──────┘  └──────┬───────┘   │ │
│  └──────────┼────────────────┼────────────────┼────────────┘ │
│             └────────────────┼────────────────┘              │
│                              ▼                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Deploy-Baselines Function                    │ │
│  │                                                          │ │
│  │  1. Load baseline catalog (catalog.json)                 │ │
│  │  2. Load profile JSON (baselines/profiles/*.json)        │ │
│  │  3. Convert to Intune OMA-URI settings                   │ │
│  │  4. Create device config profiles via Graph API          │ │
│  │  5. Assign to All Devices / Security Group               │ │
│  └──────────────────────┬──────────────────────────────────┘ │
│                         ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Microsoft Intune                             │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │ │
│  │  │ Computer │ │ Defender │ │BitLocker │ │  Audit    │  │ │
│  │  │ Profile  │ │ Profile  │ │ Profile  │ │  Profile  │  │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Per-Baseline Profile Breakdown

Each baseline generates multiple Intune profiles organized by GPO source:

### Windows 11 v25H2 Profiles
- **Computer** - Core OS hardening (250+ settings): UAC, services, network, crypto
- **Defender Antivirus** - Real-time protection, cloud protection, PUA, ASR rules
- **BitLocker** - Drive encryption requirements and recovery settings
- **Credential Guard** - Virtualization-based security for credentials
- **Domain Security** - Kerberos, password policy, account lockout
- **User** - User-side policies (Explorer, attachment manager)
- **Advanced Audit** - 23 audit subcategories (logon, privilege use, object access)

### Windows Server 2025 Profiles
- **Computer** - Server hardening (registry, services, crypto)
- **Member Server** - Domain member-specific settings
- **Domain Controller** - DC-specific hardening
- **Defender Antivirus** - Server-optimized AV settings
- **Credential Guard** - Server credential protection
- **Advanced Audit** - 54 audit subcategories (expanded server logging)

### Microsoft Edge v139
- **Computer** - Browser security (SmartScreen, extension control, site isolation)

### Microsoft 365 Apps 2512
- **Computer** - Application hardening (macros, ActiveX, trusted locations)
- **User** - User-level Office security settings

## NSA Zero Trust Pillar Mapping

Every setting is mapped to one or more NSA Zero Trust pillars:

| Pillar | Settings | Key Areas |
|--------|----------|-----------|
| **User** | Access control, UAC, logon policies, consent prompts |
| **Device** | Device Guard, Defender, BitLocker, code integrity, Secure Boot |
| **Network** | SMB hardening, LDAP signing, firewall, Wi-Fi, NetBIOS |
| **Application** | Autorun, script execution, PowerShell, installer policies |
| **Data** | Encryption, privacy, telemetry, data collection |
| **Visibility** | Audit policies, event logging, MAPS, ATP reporting |
| **Automation** | Windows Update, remediation, time sync |

## HIPAA Control Mapping

Settings are cross-referenced to HIPAA Security Rule technical safeguards:

| HIPAA Control | Section | Mapped Settings |
|---------------|---------|-----------------|
| **Access Control** | §164.312(a)(1) | Password, lockout, UAC, LSA |
| **Encryption** | §164.312(a)(2)(iv) | BitLocker, FVE, EFS, TLS |
| **Audit Controls** | §164.312(b) | Advanced audit, event logs |
| **Integrity** | §164.312(c)(1) | Code integrity, Device Guard, Defender |
| **Authentication** | §164.312(d) | Credential Guard, Kerberos, NTLM |
| **Transmission Security** | §164.312(e)(1) | SMB signing, LDAP, network crypto |

## API Reference

### Deploy Baselines

```
POST /api/deploy-baselines
Content-Type: application/json

{
    "baselineIds": ["win11-25h2", "edge-v139", "m365apps-2512"],
    "deploymentMode": "audit",
    "assignmentTarget": "allDevices",
    "groupId": "",
    "hipaaEnabled": true,
    "profilePrefix": "Omzig-SCT"
}
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `baselineIds` | string[] | Yes | — | Array of baseline IDs to deploy |
| `deploymentMode` | string | No | `audit` | `audit` (monitor) or `enforce` (active) |
| `assignmentTarget` | string | No | `none` | `allDevices`, `group`, or `none` |
| `groupId` | string | Conditional | — | Entra ID group ID (required if target=`group`) |
| `hipaaEnabled` | boolean | No | `false` | Tag profiles with HIPAA control mappings |
| `profilePrefix` | string | No | `Omzig-SCT` | Prefix for Intune profile names |

### Response

```json
{
    "status": "Success",
    "timestamp": "2026-02-17T22:30:00Z",
    "configuration": {
        "baselineIds": ["win11-25h2"],
        "deploymentMode": "audit",
        "assignmentTarget": "allDevices",
        "hipaaEnabled": true
    },
    "results": {
        "profiles": [
            {
                "profileId": "sct-win11-25h2-computer",
                "intuneId": "abc123...",
                "displayName": "Omzig-SCT - SCT - Windows 11 v25H2 - Computer",
                "settingsCount": 250,
                "status": "Created"
            }
        ],
        "summary": {
            "requested": 1,
            "deployed": 7,
            "skipped": 0,
            "failed": 0,
            "totalSettings": 335
        }
    }
}
```

## Recommended Deployment Combinations

### Healthcare Practice (HIPAA)
```json
{
    "baselineIds": ["win11-25h2", "edge-v139", "m365apps-2512"],
    "deploymentMode": "audit",
    "hipaaEnabled": true,
    "assignmentTarget": "allDevices"
}
```

### Law Firm
```json
{
    "baselineIds": ["win11-25h2", "edge-v139", "m365apps-2512"],
    "deploymentMode": "enforce",
    "hipaaEnabled": false,
    "assignmentTarget": "group",
    "groupId": "<attorney-devices-group-id>"
}
```

### Server Environment
```json
{
    "baselineIds": ["server-2025"],
    "deploymentMode": "audit",
    "assignmentTarget": "group",
    "groupId": "<server-group-id>"
}
```

### Mixed Environment (Windows 10 + 11)
```json
{
    "baselineIds": ["win11-25h2", "win10-22h2", "edge-v139", "m365apps-2512", "win10-update"],
    "deploymentMode": "audit",
    "assignmentTarget": "allDevices"
}
```

## File Structure

```
baselines/
├── catalog.json                          # Master index of all baselines and profiles
├── parsed/                               # Full parsed baseline data
│   ├── win11-25h2.json                   #   Windows 11 v25H2 (all GPOs)
│   ├── win10-22h2.json                   #   Windows 10 v22H2
│   ├── server-2025.json                  #   Windows Server 2025
│   ├── edge-v139.json                    #   Microsoft Edge v139
│   ├── m365apps-2512.json                #   Microsoft 365 Apps
│   └── ...                               #   (13 baselines total)
├── profiles/                             # Intune-ready deployment profiles
│   ├── sct-win11-25h2-computer.json      #   Win11 25H2 Computer settings
│   ├── sct-win11-25h2-defender.json      #   Win11 25H2 Defender AV
│   ├── sct-win11-25h2-bitlocker.json     #   Win11 25H2 BitLocker
│   ├── sct-win11-25h2-audit.json         #   Win11 25H2 Audit policies
│   └── ...                               #   (71 profiles total)
└── mappings/                             # Compliance framework mappings
    ├── nsa-zero-trust-pillars.json       #   NSA 7 pillar mapping
    └── hipaa-controls.json               #   HIPAA §164.312 mapping
```

## Source

All baselines are sourced from the [Microsoft Security Compliance Toolkit 1.0](https://www.microsoft.com/en-us/download/details.aspx?id=55319), parsed from GPO backup format (registry.pol, GptTmpl.inf, audit.csv) into Intune-compatible JSON.

### Included SCT Tools (Reference)
- **LGPO.exe** - Local Group Policy Object utility for applying/exporting GPO settings
- **PolicyAnalyzer** - Tool for comparing and analyzing GPO baselines
- **SetObjectSecurity** - Utility for configuring service and registry ACLs

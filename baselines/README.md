# SCT Baselines Integration - Claude Code Quick Reference

## What Was Added

The Microsoft Security Compliance Toolkit 1.0 (all 16 packages from the download page) has been parsed from GPO backup format into Intune-deployable JSON and integrated into the repo.

## New Files

### `baselines/` - Pre-Parsed Baseline Data (87 files)
- `catalog.json` - Master index. Load this first to discover available baselines and profiles.
- `parsed/*.json` - Full baseline data including all GPOs, registry settings, security settings, audit policies per baseline
- `profiles/*.json` - Individual Intune profiles ready for Graph API deployment (71 profiles)
- `mappings/nsa-zero-trust-pillars.json` - Every setting mapped to NSA pillars
- `mappings/hipaa-controls.json` - Settings mapped to HIPAA §164.312 controls

### `functions/Deploy-Baselines/` - Azure Function
- `run.ps1` - HTTP-triggered function that accepts baseline IDs and deploys them as Intune device config profiles via Graph API
- `function.json` - Azure Functions binding (POST /api/deploy-baselines)

### `functions/Modules/BaselineHelper.psm1`
Key exported functions:
- `Deploy-SettingsCatalogProfile` - Converts SCT profile → Intune custom OMA-URI profile
- `Deploy-EndpointSecurityProfile` - Deploys audit policies
- `Deploy-ChunkedProfile` - Splits large profiles (>900 settings) into multiple Intune profiles
- `Assign-IntuneProfile` - Assigns profiles to All Devices or specific Entra groups
- `Get-BaselineCatalog` / `Get-BaselineNsaMapping` / `Get-BaselineHipaaMapping` - Data access

### `functions/Tests/Deploy-Baselines.Tests.ps1` - Pester Tests
- Validates catalog structure, profile file integrity, NSA/HIPAA mapping completeness

### `docs/SCT-BASELINES.md` - Full Documentation

## Key Baseline IDs

Current (use for new deployments):
- `win11-25h2` - Windows 11 v25H2 (335 settings, 23 audit policies)
- `win10-22h2` - Windows 10 v22H2 (278 settings, 23 audit policies)
- `server-2025` - Windows Server 2025 (382 settings, 54 audit policies)
- `edge-v139` - Microsoft Edge v139 (20 settings)
- `m365apps-2512` - Microsoft 365 Apps (385 settings)
- `win10-update` - Windows Update baseline (78 settings)

## API Usage

```
POST /api/deploy-baselines
{
    "baselineIds": ["win11-25h2", "edge-v139", "m365apps-2512"],
    "deploymentMode": "audit",
    "assignmentTarget": "allDevices",
    "hipaaEnabled": true,
    "profilePrefix": "Omzig-SCT"
}
```

## Data Flow

```
SCT ZIP → parse_sct.py → baselines/parsed/*.json → baselines/profiles/*.json
                                                            ↓
                                              Deploy-Baselines/run.ps1
                                                            ↓
                                              Graph API → Intune profiles
```

## Statistics

- 13 baselines (6 current + 7 legacy)
- 97 GPOs parsed
- 3,940 registry settings extracted
- 1,266 security template settings
- 435 audit policy entries
- 71 Intune-ready profiles generated
- All mapped to 7 NSA Zero Trust pillars + 6 HIPAA controls

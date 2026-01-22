# Architecture

## Components

- `bicep/main.bicep`
  - Composes per-pillar modules:
    - `bicep/identity/`
    - `bicep/devices/`
    - `bicep/security/`
    - `bicep/data/`
    - `bicep/network/`
- `ui/createUiDefinition.json`
  - Azure Portal wizard:
    - Org details
    - Licensing
    - Security baseline
    - Compliance options (HIPAA, etc.)
    - Deployment options

- `functions/`
  - Orchestration Functions:
    - Kick off Bicep deployments
    - Call Microsoft Graph for M365 configuration not covered by ARM/Bicep
    - Write deployment logs

- `pipelines/`
  - Build: validate Bicep, package ARM + UI.
  - Release: deploy managed app definition to test/prod.

## NSA Zero Trust pillars mapping

- User (Identity): Entra ID, Conditional Access, MFA.
- Device: Intune policies, Defender for Endpoint.
- Network: Azure Firewall / NSG baselines (later phase).
- Application: M365 security configs, app policies.
- Data: DLP, labels, encryption defaults.
- Visibility: Log Analytics, Defender alerts routing.
- Automation: Functions, Policies, and pipelines.

This mapping is enforced in code and docs.

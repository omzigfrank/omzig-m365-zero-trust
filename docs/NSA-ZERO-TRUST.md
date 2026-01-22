# NSA Zero Trust Pillar Mapping

This document maps NSA Zero Trust pillars to the implementation in this solution.

## Overview

The NSA Zero Trust model consists of seven pillars. This solution implements controls across all pillars using Microsoft 365 and Azure services.

---

## 1. User (Identity) Pillar

**NSA Requirement**: Verify and continuously validate user identity with strong authentication.

### Implementation

| Control | Module | Configuration |
|---------|--------|---------------|
| Multi-Factor Authentication | `identity.bicep` | `requireMfa = true` (default) |
| Conditional Access Policies | `identity.bicep` | 6 policy templates (CA001-CA006) |
| Block Legacy Authentication | `identity.bicep` | `blockLegacyAuth = true` |
| Risk-Based Access | `identity.bicep` | Sign-in and user risk policies |
| Admin MFA Enforcement | `identity.bicep` | Separate CA policy for admin roles |
| Session Controls | `identity.bicep` | Configurable timeout, persistent session control |

### Baseline Levels

| Setting | Standard | Enhanced | Maximum |
|---------|----------|----------|---------|
| MFA Required | All users | All users | All users |
| Block High-Risk Users | Optional | Yes | Yes |
| Risk Threshold for MFA | High | Medium | Low |
| Compliant Device Required | No | Yes | Yes |
| Session Timeout | 12 hours | 12 hours | 8 hours |

### HIPAA Adjustments
- Session timeout reduced to 8 hours
- MFA "remember device" disabled
- Minimum password length: 14 characters

---

## 2. Device Pillar

**NSA Requirement**: Ensure devices meet security standards before granting access.

### Implementation

| Control | Module | Configuration |
|---------|--------|---------------|
| Device Compliance Policies | `devices.bicep` | Per-platform policies (Windows, macOS, iOS, Android) |
| Encryption Requirement | `devices.bicep` | `requireDeviceEncryption = true` |
| OS Version Minimums | `devices.bicep` | Configurable per platform |
| Jailbreak/Root Detection | `devices.bicep` | `blockJailbrokenDevices = true` |
| Defender for Endpoint | `devices.bicep` | Integration with MDE |

### Defender for Endpoint Features

| Feature | Standard | Enhanced | Maximum |
|---------|----------|----------|---------|
| Attack Surface Reduction | Audit | Audit | Block |
| Network Protection | Audit | Audit | Block |
| Controlled Folder Access | Off | Audit | Block |
| Web Protection | Enabled | Enabled | Enabled |

### HIPAA Adjustments
- No compliance grace period (immediate enforcement)
- Device password minimum: 8 characters
- Lock timeout: 5 minutes max
- Developer mode blocked

---

## 3. Network Pillar

**NSA Requirement**: Segment and control network access with micro-segmentation.

### Implementation

| Control | Module | Configuration |
|---------|--------|---------------|
| Network Segmentation | `network.bicep` | NSG baselines (future phase) |
| Private Endpoints | `network.bicep` | Optional for M365 services |
| Azure Firewall | `network.bicep` | Optional (future phase) |

> **Note**: Network controls are primarily configured at the Azure infrastructure level. M365-specific network controls (IP restrictions, VPN requirements) are configured via Conditional Access.

---

## 4. Application (Workload) Pillar

**NSA Requirement**: Secure applications and workloads with appropriate controls.

### Implementation

| Control | Module | Configuration |
|---------|--------|---------------|
| Defender for Office 365 | `security.bicep` | Safe Attachments, Safe Links, Anti-phishing |
| Defender for Cloud Apps | `security.bicep` | Session policies, anomaly detection |
| App Governance | `security.bicep` | OAuth app monitoring (Plan 2) |

### Defender for Office 365 Settings

| Setting | Standard | Enhanced | Maximum |
|---------|----------|----------|---------|
| Safe Attachments Action | Block | Block | Block |
| Safe Links Real-time Scan | Yes | Yes | Yes |
| Phishing Threshold | User-defined | 3 | 4 |
| Bulk Mail Threshold | 6 | 6 | 4 |

---

## 5. Data Pillar

**NSA Requirement**: Protect data with classification, encryption, and access controls.

### Implementation

| Control | Module | Configuration |
|---------|--------|---------------|
| Data Loss Prevention | `data.bicep` | Multi-location DLP policies |
| Sensitivity Labels | `data.bicep` | 4-5 label hierarchy |
| Encryption | `data.bicep` | AIP integration |
| Retention Policies | `data.bicep` | Configurable retention periods |

### Sensitivity Labels

| Label | Encryption | Watermark | Access |
|-------|------------|-----------|--------|
| Public | No | No | Anyone |
| General | No | No | Anyone |
| Confidential | Yes (Enhanced+) | Yes | Organization |
| Highly Confidential | Yes | Yes | Specific people |
| PHI (HIPAA only) | Yes | Yes | Specific people |

### HIPAA Adjustments
- DLP mode: Block (not Warn)
- Auto-labeling enabled
- PHI sensitivity label added
- 7-year retention minimum
- External sharing blocked for PHI

---

## 6. Visibility (Analytics) Pillar

**NSA Requirement**: Maintain comprehensive visibility into all security events.

### Implementation

| Control | Module | Configuration |
|---------|--------|---------------|
| Log Analytics Workspace | `security.bicep` | Centralized logging |
| Alert Rules | `security.bicep` | 4 pre-configured rules |
| Microsoft Sentinel | `security.bicep` | Optional SIEM integration |
| Audit Logging | All modules | Comprehensive audit trails |

### Pre-configured Alert Rules

1. **High-Severity Security Alert** - Any high-severity security alert
2. **Suspicious Sign-In Activity** - >10 failed sign-ins per user
3. **Malware Detection** - Malware or virus alerts
4. **Phishing Attempt** - Phishing threats detected

### Retention

| Scenario | Retention |
|----------|-----------|
| Standard | 365 days (default) |
| Enhanced | User-configurable |
| HIPAA | 2555 days (7 years) minimum |

---

## 7. Automation (Orchestration) Pillar

**NSA Requirement**: Automate security responses and policy enforcement.

### Implementation

| Control | Module | Configuration |
|---------|--------|---------------|
| Azure Functions | `functions/` | Orchestration and Graph API calls |
| Managed Identity | `identity.bicep` | Secure API authentication |
| CI/CD Pipelines | `pipelines/` | Automated deployment |
| Policy as Code | `bicep/` | Infrastructure as Code |

### Orchestration Flow

1. **Deployment**: Marketplace wizard → Bicep deployment → Resource creation
2. **Configuration**: Azure Functions → Graph API → M365 configuration
3. **Monitoring**: Log Analytics → Alert rules → Notifications
4. **Updates**: CI/CD pipeline → Validation → Deployment

---

## Compliance Matrix

| Pillar | Standard | Enhanced | Maximum | HIPAA |
|--------|----------|----------|---------|-------|
| User | ✓ | ✓✓ | ✓✓✓ | ✓✓✓ |
| Device | ✓ | ✓✓ | ✓✓✓ | ✓✓✓ |
| Network | ○ | ○ | ○ | ○ |
| Application | ✓ | ✓✓ | ✓✓✓ | ✓✓ |
| Data | ✓ | ✓✓ | ✓✓✓ | ✓✓✓ |
| Visibility | ✓ | ✓✓ | ✓✓ | ✓✓✓ |
| Automation | ✓ | ✓ | ✓ | ✓ |

**Legend**: ○ = Placeholder/Future | ✓ = Basic | ✓✓ = Enhanced | ✓✓✓ = Maximum

---

## References

- [NSA Zero Trust Security Model](https://media.defense.gov/2021/Feb/25/2002588479/-1/-1/0/CSI_EMBRACING_ZT_SECURITY_MODEL_UOO115131-21.PDF)
- [Microsoft Zero Trust Deployment Guide](https://learn.microsoft.com/en-us/security/zero-trust/deploy/overview)
- [CISA Zero Trust Maturity Model](https://www.cisa.gov/zero-trust-maturity-model)

# HIPAA Control Mapping

This document describes how HIPAA-aligned controls are implemented when `hipaaEnabled = true`.

> **Disclaimer**: This solution provides configuration aligned with HIPAA requirements but does not constitute HIPAA certification or compliance attestation. Organizations must conduct their own compliance assessments.

---

## HIPAA Security Rule Categories

### 1. Administrative Safeguards (§164.308)

| Requirement | Implementation |
|-------------|----------------|
| Security Management Process | Automated deployment with audit trails |
| Workforce Security | Conditional Access policies, role-based access |
| Information Access Management | Sensitivity labels, DLP policies |
| Security Awareness Training | *(Out of scope - organizational responsibility)* |
| Security Incident Procedures | Alert rules, Sentinel integration |
| Contingency Plan | *(Out of scope - organizational responsibility)* |
| Evaluation | Continuous monitoring via Log Analytics |

### 2. Physical Safeguards (§164.310)

| Requirement | Implementation |
|-------------|----------------|
| Facility Access Controls | *(Azure/Microsoft responsibility)* |
| Workstation Use | Device compliance policies |
| Workstation Security | Encryption, lock timeout, Defender for Endpoint |
| Device and Media Controls | DLP for removable media, controlled folder access |

### 3. Technical Safeguards (§164.312)

| Requirement | Implementation |
|-------------|----------------|
| Access Control | MFA, Conditional Access, session controls |
| Audit Controls | 7-year log retention, comprehensive logging |
| Integrity | Sensitivity labels, watermarks, prevent modification |
| Person/Entity Authentication | MFA required, no remember device |
| Transmission Security | TLS encryption, Safe Links |

---

## HIPAA-Specific Configurations

### Identity (`identity.bicep`)

```
When hipaaEnabled = true:
├── Session timeout: 8 hours (reduced from 12)
├── MFA remember device: Disabled (0 days)
├── Minimum password length: 14 characters
├── Persistent browser session: Disabled
└── Compliant device: Required
```

### Security (`security.bicep`)

```
When hipaaEnabled = true:
├── Log retention: 2555 days (7 years)
├── Quarantine retention: 30 days
├── All audit logging: Enabled
└── Alert notifications: Required
```

### Devices (`devices.bicep`)

```
When hipaaEnabled = true:
├── Compliance grace period: 0 hours (immediate)
├── Device password minimum: 8 characters
├── Lock timeout: 5 minutes maximum
├── Developer mode: Blocked
├── Password expiration: 90 days
├── Password history: 12 passwords
└── Managed email required (iOS)
```

### Data (`data.bicep`)

```
When hipaaEnabled = true:
├── DLP mode: Block (not Warn)
├── Auto-labeling: Enabled
├── PHI sensitivity label: Created
│   ├── Encryption: Required
│   ├── Watermark: Enabled
│   ├── Prevent forwarding: Yes
│   ├── Prevent copy: Yes
│   ├── Prevent print: Yes
│   └── Audit access: Yes
├── Retention: 2555 days (7 years) minimum
├── External sharing (PHI): Blocked
├── Offline access: Disabled
└── HIPAA-specific info types monitored:
    ├── U.S. Social Security Number
    ├── U.S. Health Insurance Claim Number (HICN)
    ├── ICD-9-CM codes
    ├── ICD-10-CM codes
    ├── DEA Number
    └── [additional healthcare identifiers]
```

---

## Audit Requirements

### Minimum Audit Events

The following events are logged when HIPAA mode is enabled:

| Event Category | Examples |
|----------------|----------|
| Authentication | Sign-ins, MFA challenges, failures |
| Authorization | Access grants, denials, privilege changes |
| Data Access | File opens, downloads, shares |
| Data Modification | Edits, deletions, label changes |
| Administrative | Policy changes, user management |
| Security | Alerts, threats, remediation |

### Retention Requirements

| Data Type | Retention |
|-----------|-----------|
| Security logs | 7 years (2555 days) |
| Audit logs | 7 years (2555 days) |
| Email (PHI-labeled) | 7 years (2555 days) |
| Documents (PHI-labeled) | 7 years (2555 days) |

---

## Sensitive Information Types

HIPAA mode monitors these additional sensitive information types:

| Type | Description |
|------|-------------|
| HICN | Health Insurance Claim Number |
| ICD-9-CM | Diagnosis codes (legacy) |
| ICD-10-CM | Diagnosis codes (current) |
| DEA Number | Drug Enforcement Administration numbers |
| NPI | National Provider Identifier |
| Medical Record Number | Patient identifiers |

---

## Business Associate Considerations

When deploying for a Business Associate:

1. **Ensure BAA with Microsoft** - Microsoft has executed BAAs for M365 services
2. **Downstream BAs** - Configure DLP to prevent unauthorized sharing
3. **Access Controls** - Use sensitivity labels to restrict PHI access
4. **Audit Trail** - Enable comprehensive logging with 7-year retention

---

## Gap Analysis

The following HIPAA requirements are **not** fully addressed by this solution:

| Requirement | Status | Notes |
|-------------|--------|-------|
| Risk Analysis | Partial | Provides controls but not formal analysis |
| Security Training | Out of scope | Organizational responsibility |
| Contingency Planning | Out of scope | Organizational responsibility |
| Physical Security | Shared | Microsoft/Azure responsibility |
| Policies & Procedures | Partial | Technical controls only |
| Documentation | Partial | Provides deployment logs |

---

## Verification Checklist

After deployment, verify:

- [ ] All Conditional Access policies active (not report-only)
- [ ] DLP policies in Block mode
- [ ] PHI sensitivity label created and published
- [ ] Log retention set to 7 years
- [ ] Alert notifications configured
- [ ] Device compliance policies assigned
- [ ] No compliance grace period
- [ ] Session timeout ≤ 8 hours

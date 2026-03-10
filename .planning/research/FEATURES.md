# Feature Research

**Domain:** M365 Zero Trust Security Auditing Platform for MSPs
**Researched:** 2026-03-10
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = MSPs will not adopt the product.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Multi-framework compliance audit (CISA SCuBA + NIST) | Every competitor (ScubaGear, Maester, CoreView) audits against at least one framework. MSPs need standards-based assessments to justify security spend to clients. | HIGH | Must cover all 5 CISA SCuBA products (Entra ID, Exchange Online, SharePoint/OneDrive, Teams, Defender). NIST 800-207 + 800-53 + CSF 2.0 mapping is additive. Currently 22 of 128 CISA controls have evaluators (17%). |
| Pass/fail per-control results with severity scoring | ScubaGear produces HTML/JSON/CSV pass/fail reports. Maester provides 300+ checks with interactive drill-down. Clients and auditors expect granular control-level results, not just an aggregate score. | MEDIUM | Need Critical/High/Medium/Low severity and SHALL/SHOULD/MAY requirement levels aligned with CISA. |
| Multi-tenant dashboard | CoreView, Augmentt, Octiga, Senserva all provide single-pane-of-glass across client tenants. MSPs managing 20-200 tenants cannot use per-tenant tools. This is the entry requirement for MSP tooling. | HIGH | Tenant health grid with red/yellow/green status, aggregate scores, and drill-down to individual tenant findings. |
| Tenant onboarding via OAuth consent or GDAP | Microsoft mandates GDAP for partner access. Every MSP tool supports delegated admin. OAuth consent flow is the alternative for non-partner access. | MEDIUM | Must support both GDAP/Lighthouse delegated access AND direct OAuth app consent. GDAP is preferred for MSPs with CSP relationships. |
| Exportable compliance reports (PDF/CSV) | ScubaGear exports HTML/JSON/CSV. ManageEngine, CoreView, MSP Easy Tools all export PDF. Auditors and compliance officers need printable evidence. | MEDIUM | PDF for client-facing executive summaries, CSV for detailed control data, JSON for programmatic consumption. |
| Role-based access control | Every SaaS product has RBAC. MSPs need Admin (full access), Analyst (audit + remediate), and Read-only (client view) roles at minimum. | LOW | Use Entra ID app roles. Standard pattern. |
| Historical compliance trending | Maester, CoreView, and Augmentt all track scores over time. MSPs need to show clients "you were at 62% last quarter, now you're at 78%." | MEDIUM | Store audit snapshots per tenant. Time-series data for compliance scores per framework and per category. |
| Remediation guidance per finding | ScubaGear links to baseline documents. Maester provides configuration guidance and remediation details per test. Every tool at minimum tells you HOW to fix each finding. | MEDIUM | Step-by-step instructions, links to relevant admin portal pages, and PowerShell commands where applicable. |
| Entra ID (AAD) audit coverage | All M365 security tools audit Entra ID as the foundation: CA policies, MFA, privileged roles, app registrations, guest access. This is the most auditable workload via Graph API. | MEDIUM | Currently 17 of 29 CISA AAD controls have evaluators. Remaining 12 need evaluation logic. Graph API covers most Entra ID settings. |
| Exchange Online audit coverage | 38 CISA SCuBA controls cover Exchange Online (mail flow, DKIM/DMARC, anti-spam, forwarding rules, mailbox auditing). Exchange is the largest attack surface in M365. | HIGH | Requires `ExchangeOnlineManagement` PowerShell module with certificate-based auth. Cannot be done via Graph API alone. Currently only 1 of 38 controls has an evaluator. |
| Scheduled/on-demand audit scans | Augmentt, CoreView, and Octiga all run scheduled baselines. MSPs need both ad-hoc assessments and recurring scans (daily/weekly). | MEDIUM | Timer-triggered Azure Functions for scheduled scans. HTTP-triggered for on-demand. Per-tenant scan scheduling. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not every competitor has these; doing them well creates competitive advantage.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Auto-remediation with safety classification | Senserva and CoreView offer auto-remediation but without clear safe/risky distinction. Octiga auto-blocks compromised accounts. Our approach: classify every remediation as SAFE (auto-fix with approval) or RISKY (guided steps only). This prevents the CA policy lockout disasters that plague M365 deployments. | HIGH | Safe changes: enable DKIM, block legacy auth, enable mailbox auditing. Risky changes: device compliance CA policies, admin MFA enforcement. Requires per-control risk classification, rollback capability, and MSP approval workflow. |
| Real-time configuration drift detection | CoreView detects drift but on nightly backups. Maester's commercial version monitors drift. Microsoft's UTCM APIs (public preview Jan 2026) run at 6-hour intervals. True near-real-time drift detection for security-critical configs (CA policies, admin roles) is rare. | HIGH | Critical caveat: Graph API webhooks do NOT support conditional access policies, Intune config, Defender settings, or Exchange settings. Must use hybrid approach: Azure Audit Log webhooks for change events + periodic polling via Graph API for configuration state verification. UTCM APIs are in preview and have limits (800 resources/day, 30 monitors/tenant, 6-hour intervals). |
| Cross-framework control mapping | No competitor maps a single finding to NIST 800-207 + NIST 800-53 + NIST CSF 2.0 + CISA SCuBA simultaneously. Most tools audit against one framework. Showing "this CA policy finding maps to NIST 800-207 Tenet 4, NIST 800-53 AC-7, CSF 2.0 PR.AA, and CISA MS.AAD.1.1v1" gives MSPs a single remediation that satisfies multiple auditors. | MEDIUM | Framework mapping is a data problem, not an engineering one. Build a mapping table that links CISA control IDs to NIST SP references. CISA already provides 800-53 and MITRE ATT&CK mappings for ScubaGear. |
| Guided remediation with impact preview | Most tools say "fix this." None show "if you enable CA004, these 47 users on non-compliant devices will be blocked." Pre-remediation impact analysis prevents lockouts and builds MSP confidence. | HIGH | Requires querying current user/device state and simulating policy impact. For CA policies, use the Conditional Access "What If" API. For device compliance, cross-reference Intune device state. |
| Branded client-facing reports | MSP Easy Tools, ConnectSecure, and Augmentt offer white-label/branded reports. Most open-source tools (ScubaGear, Maester) produce generic reports. MSPs want their logo and branding on client deliverables. | MEDIUM | PDF generation with customizable header/footer, MSP branding, executive summary section with plain-English findings, and detailed appendix. |
| Unified action queue across all tenants | Most tools show per-tenant findings. An MSP managing 50 tenants needs a cross-tenant priority queue: "17 tenants have legacy auth enabled, 8 tenants lack DKIM, 3 tenants have no break-glass accounts." This surfaces systemic issues. | MEDIUM | Aggregate findings across tenants, deduplicate by control, rank by severity and tenant count. Enables "fix this across all 17 tenants" batch operations. |
| Microsoft SCT (Security Compliance Toolkit) device baseline auditing | No competitor integrates Microsoft's own SCT GPO baselines for device configuration auditing via Intune. The repo already has 3,940 registry settings, 1,266 security settings, and 435 audit policies parsed from SCT. This covers the device pillar of Zero Trust at a depth no SaaS competitor matches. | HIGH | Already parsed in `baselines/` directory. Need to compare SCT expected values against actual Intune device configuration profiles. Requires Intune Graph API beta endpoints. |
| NIST 800-207 Zero Trust maturity assessment | No tool provides a structured ZTA maturity assessment mapped to NIST 800-207's seven tenets. CISA's Zero Trust Maturity Model defines Traditional/Initial/Advanced/Optimal stages. Mapping tenant state to maturity levels gives MSPs a roadmap narrative. | MEDIUM | Already have 31 NIST ZTA checks. Extend with maturity level scoring (Traditional through Optimal) per tenet. Output a maturity radar chart. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems. Deliberately NOT building these.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Custom compliance framework authoring | MSPs want to add their own controls beyond NIST/CISA. | Exponential complexity: custom control engines, custom evaluator logic, custom scoring models. Every custom framework is a maintenance burden. The four supported frameworks (CISA SCuBA, NIST 800-207, 800-53, CSF 2.0) cover 99% of real audit needs. | Ship with comprehensive framework coverage. If a control is missing, add it to the built-in frameworks. Allow control exclusions/annotations (ScubaGear already models this with exclusions and risk acceptance). |
| Full auto-remediation without approval | MSPs want "fix everything automatically." | A single misconfigured CA policy can lock out an entire organization. Auto-enabling device compliance requirements without enrolled devices bricks user access. Exchange transport rule changes can break mail flow. The blast radius of automated M365 changes is catastrophic. | Two-tier remediation: SAFE changes auto-apply with one-click MSP approval. RISKY changes present guided wizard with impact preview. Never auto-apply risky changes without human review. |
| Real-time webhook-based drift for all M365 workloads | "We need instant alerts when anything changes." | Graph API webhooks do not support CA policies, Intune configuration, Defender settings, Exchange settings, SharePoint admin settings, or Teams admin settings. These are the exact resources an auditing tool monitors. Building a "real-time" promise on unsupported APIs leads to polling disguised as real-time. | Audit log webhook subscription (directoryAudit) for detecting admin changes, combined with configurable polling intervals (15min/1hr/6hr) for configuration state verification. Be transparent about latency. UTCM APIs add native 6-hour drift detection when they GA. |
| On-premises Active Directory auditing | MSPs with hybrid environments want AD auditing alongside M365. | Requires agent deployment on domain controllers, LDAP queries, on-prem connectivity. Completely different architecture. Scope creep from cloud-native to hybrid doubles engineering effort. | Clearly scope to M365/cloud-only. Recommend partner tools (Netwrix, Quest) for on-prem AD. Audit the Entra ID Connect sync configuration via Graph API instead. |
| Non-Microsoft cloud platform support (AWS, GCP) | MSPs managing multi-cloud want a single tool. | Each cloud platform has entirely different APIs, permission models, and security configuration surfaces. AWS has ~300 services, GCP ~100+. Supporting even basic AWS auditing doubles the engineering scope with zero M365 synergy. | Stay focused on Microsoft 365 and Azure. The value proposition is depth on M365, not breadth across clouds. |
| Agent-based endpoint scanning | "We need to scan what's actually on the devices, not just what Intune says." | Agent deployment across client endpoints is a fundamentally different product (EDR/RMM). Requires endpoint software distribution, update management, and endpoint-level permissions. MSPs already have RMM tools for this. | Audit Intune compliance state and device configuration profiles via Graph API. Cross-reference with Microsoft Defender for Endpoint data via the Security API. No agents needed. |
| Tenant deployment/provisioning from the audit tool | "If we find a gap, deploy the fix as a new resource." | Mixing audit (read) and deployment (write) creates permission scope creep and blast radius concerns. An audit tool with write access to deploy new CA policies, Intune profiles, and Exchange rules is a high-privilege attack surface. | Remediation modifies existing misconfigured settings, it does not create new infrastructure. For greenfield deployment, use the existing deployment modules in this repo (bicep/, functions/Deploy-*). |

## Feature Dependencies

```
[Tenant Onboarding (OAuth/GDAP)]
    |
    +--requires--> [Graph API Authentication + Token Management]
    |                  |
    |                  +--requires--> [Per-tenant Encrypted Token Storage]
    |
    +--enables--> [Entra ID Audit Engine]
    |                 |
    |                 +--enables--> [Exchange Online Audit Engine]
    |                 |                 (requires separate ExchangeOnline auth)
    |                 |
    |                 +--enables--> [Defender Audit Engine]
    |                 |                 (requires Security & Compliance auth)
    |                 |
    |                 +--enables--> [SharePoint/Teams Audit Engine]
    |                                   (requires PnP/Teams auth)
    |
    +--enables--> [Compliance Scoring Engine]
                      |
                      +--requires--> [Framework Control Definitions]
                      |                  (CISA SCuBA catalog, NIST mappings)
                      |
                      +--enables--> [Historical Trending]
                      |                 (requires audit snapshot storage)
                      |
                      +--enables--> [Cross-Framework Mapping]
                      |
                      +--enables--> [Multi-Tenant Dashboard]
                                        |
                                        +--enables--> [Unified Action Queue]
                                        |
                                        +--enables--> [Branded Reports]

[Remediation Guidance]
    |
    +--requires--> [Compliance Scoring Engine] (to know what failed)
    |
    +--enables--> [Auto-Remediation (Safe)]
    |                 |
    |                 +--requires--> [Write permissions to tenant]
    |                 |
    |                 +--requires--> [Rollback capability]
    |
    +--enables--> [Guided Remediation (Risky)]
                      |
                      +--requires--> [Impact Preview / What-If]
                                         |
                                         +--requires--> [User/Device state queries]

[Configuration Drift Detection]
    |
    +--requires--> [Audit Log Webhook Subscription]
    |                  (directoryAudit resource)
    |
    +--requires--> [Periodic Polling Scheduler]
    |                  (Graph API + workload-specific modules)
    |
    +--requires--> [Baseline Snapshot Storage]
    |                  (previous known-good state)
    |
    +--enables--> [Drift Alert Queue]
    |
    +--enables--> [Before/After Comparison View]
```

### Dependency Notes

- **Exchange Online Audit requires separate auth**: Graph API does not expose Exchange Online configuration (mail flow rules, DKIM, transport config). The `ExchangeOnlineManagement` PowerShell module with certificate-based auth is required. This is the single largest coverage gap (37 of 128 CISA controls).
- **Drift detection cannot use Graph webhooks for security configs**: Conditional access policies, Intune profiles, Defender settings, Exchange settings, and SharePoint admin settings do NOT support Graph API change notification subscriptions. Must use Azure Audit Log events + polling.
- **Auto-remediation requires write permissions**: The audit tool needs read-only permissions for scanning but write permissions for remediation. These should be separate permission grants, requested only when remediation is activated.
- **Historical trending requires snapshot storage**: Each audit run must persist results. Without snapshots, trending and drift detection both fail.
- **Impact preview requires user/device state**: Showing "47 users will be blocked" for a CA policy change requires querying all users, their device compliance state, and simulating policy application.
- **Cross-framework mapping enhances scoring engine**: A single finding mapped to 4 frameworks makes the scoring engine more valuable but does not change the underlying evaluation logic. This is a data layer addition, not an engine change.

## MVP Definition

### Launch With (v1)

Minimum viable product -- what's needed to validate with real MSPs.

- [ ] **Entra ID audit engine (full CISA SCuBA AAD coverage)** -- 29 controls, currently 17 active. This is the most achievable workload and covers the identity pillar, which is the foundation of Zero Trust.
- [ ] **NIST 800-207 Zero Trust audit (all 7 tenets)** -- 31 checks already have evaluators. Package these into the web UI with scoring.
- [ ] **Pass/fail results with severity scoring** -- Per-control results with Critical/High/Medium/Low severity and overall compliance percentage.
- [ ] **Single-tenant audit execution** -- Before multi-tenant, prove the audit engine works for one tenant end-to-end.
- [ ] **OAuth consent tenant onboarding** -- Simplest onboarding path. GDAP can come later.
- [ ] **Basic compliance report export (PDF/CSV)** -- Auditors need printable evidence. MVP-quality reports are fine; branded reports are v1.x.
- [ ] **Remediation guidance per finding** -- Step-by-step text instructions and admin portal links. No auto-remediation in v1.
- [ ] **Web-based results dashboard** -- Interactive drill-down from framework to category to finding. The existing Next.js foundation supports this.

### Add After Validation (v1.x)

Features to add once core audit is working and MSPs confirm value.

- [ ] **Exchange Online audit engine** -- 38 controls, requires ExchangeOnlineManagement module integration. Add once auth pattern is proven.
- [ ] **Defender audit engine** -- 18 controls, extends existing 4 evaluators. Requires Security & Compliance PowerShell.
- [ ] **Multi-tenant dashboard** -- Tenant health grid. Requires tenant list management, per-tenant scan orchestration, aggregate scoring.
- [ ] **GDAP/Lighthouse tenant onboarding** -- Partner Center API integration for delegated admin relationships.
- [ ] **Historical compliance trending** -- Store snapshots, show score changes over time per tenant.
- [ ] **Scheduled scans** -- Timer-triggered Azure Functions for daily/weekly audits per tenant.
- [ ] **Auto-remediation for SAFE changes** -- One-click fix for low-risk findings (enable DKIM, block legacy auth, etc.) with MSP approval.
- [ ] **NIST 800-53 + CSF 2.0 cross-framework mapping** -- Map CISA findings to additional NIST frameworks.
- [ ] **Unified action queue** -- Cross-tenant finding aggregation sorted by severity.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **SharePoint/OneDrive audit engine** -- 8 CISA controls. Requires PnP.PowerShell. Lower priority than Exchange/Defender.
- [ ] **Teams audit engine** -- 20 CISA controls. Requires MicrosoftTeams module. Lower priority.
- [ ] **Power Platform / Power BI audit** -- 15 combined controls. Niche admin APIs. Low priority for most MSPs.
- [ ] **Guided remediation with impact preview** -- "What If" analysis showing affected users before applying changes. HIGH complexity.
- [ ] **Configuration drift detection** -- Audit log webhooks + polling. Requires significant infrastructure (webhook endpoints, polling scheduler, baseline storage, alert routing).
- [ ] **Branded/white-label PDF reports** -- MSP logo, custom branding, executive summary. Nice-to-have on top of basic PDF export.
- [ ] **SCT device baseline auditing via Intune** -- Compare 3,940+ registry settings against Intune profiles. Unique differentiator but HIGH complexity.
- [ ] **PSA/ITSM integration** -- Auto-create tickets in ConnectWise, Autotask, ServiceNow when findings detected. MSP workflow integration.
- [ ] **ZTA maturity radar chart** -- Visual maturity assessment (Traditional/Initial/Advanced/Optimal) per NIST 800-207 tenet.
- [ ] **Batch remediation across tenants** -- "Enable DKIM across all 17 tenants that are failing this control."
- [ ] **CIS Microsoft 365 Benchmark support** -- CIS v6.0.0 has 140 controls. Significant overlap with CISA SCuBA but some MSPs specifically need CIS attestation.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Entra ID audit (full CISA AAD) | HIGH | MEDIUM | P1 |
| NIST 800-207 ZTA audit | HIGH | LOW (already built) | P1 |
| Pass/fail results + severity scoring | HIGH | LOW | P1 |
| Single-tenant audit execution | HIGH | MEDIUM | P1 |
| OAuth tenant onboarding | HIGH | MEDIUM | P1 |
| Basic report export (PDF/CSV) | HIGH | MEDIUM | P1 |
| Remediation guidance text | HIGH | MEDIUM | P1 |
| Web dashboard with drill-down | HIGH | MEDIUM | P1 |
| Exchange Online audit | HIGH | HIGH | P2 |
| Defender audit | HIGH | MEDIUM | P2 |
| Multi-tenant dashboard | HIGH | HIGH | P2 |
| GDAP tenant onboarding | HIGH | MEDIUM | P2 |
| Historical trending | MEDIUM | MEDIUM | P2 |
| Scheduled scans | MEDIUM | LOW | P2 |
| Auto-remediation (safe) | HIGH | HIGH | P2 |
| NIST 800-53 + CSF 2.0 mapping | MEDIUM | LOW | P2 |
| Unified action queue | MEDIUM | MEDIUM | P2 |
| SharePoint/OneDrive audit | MEDIUM | MEDIUM | P3 |
| Teams audit | MEDIUM | MEDIUM | P3 |
| Power Platform/BI audit | LOW | HIGH | P3 |
| Drift detection | HIGH | HIGH | P3 |
| Guided remediation (impact preview) | HIGH | HIGH | P3 |
| Branded PDF reports | MEDIUM | MEDIUM | P3 |
| SCT device baseline audit | MEDIUM | HIGH | P3 |
| PSA/ITSM integration | MEDIUM | MEDIUM | P3 |
| CIS Benchmark support | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch (MVP)
- P2: Should have, add in v1.x after validation
- P3: Nice to have, defer to v2+

## Competitor Feature Analysis

| Feature | ScubaGear (CISA) | Maester | CoreView | Augmentt | Octiga | Senserva | Our Approach |
|---------|-------------------|---------|----------|----------|--------|----------|--------------|
| **Framework coverage** | CISA SCuBA only | CISA + Microsoft baselines (300+ checks) | CIS, best practices | CIS, NIS2, ISO, NIST, SOC2 | Proprietary baselines | Microsoft + custom | CISA SCuBA + NIST 800-207 + 800-53 + CSF 2.0 (deepest NIST coverage) |
| **Multi-tenant** | No (single tenant PowerShell) | No (OSS); Yes (commercial) | Yes | Yes | Yes | Yes | Yes (P2) |
| **Auto-remediation** | No | No | Yes (drift rollback) | Yes (one-click baselines) | Yes (auto-block + one-click) | Yes (automated) | Yes with safe/risky classification (P2) |
| **Drift detection** | No | Yes (commercial: before/after) | Yes (nightly backup comparison) | Yes (detect + correct) | Yes (real-time monitoring) | Yes (continuous) | Yes via audit log + polling (P3) |
| **Report export** | HTML, JSON, CSV | Interactive HTML | PDF, CSV, Excel | Yes | Yes | Yes | PDF, CSV, JSON (P1) |
| **Branded reports** | No | No | No (or limited) | No | No | No | Yes (P3) |
| **NIST 800-207 ZTA mapping** | No | No | No | No | No | No | Yes -- unique differentiator (P1) |
| **Impact preview** | No | No | No | No | No | No | Yes -- unique differentiator (P3) |
| **Open source / Free** | Yes (free) | Yes (OSS core) | No (commercial) | No (commercial) | No (commercial) | No (commercial) | No (commercial SaaS) |
| **Pricing** | Free | Free core / paid commercial | Per-user/month | Per-user/month | Per-tenant/month | Per-tenant/month | TBD |
| **Target user** | IT/security admins | IT/security admins | Enterprise IT | MSPs | MSPs | MSPs/MSSPs | MSPs |
| **Device config auditing** | No | No | No | Limited | No | Limited (Intune) | Yes via SCT baselines (P3) |
| **Cross-framework mapping** | NIST 800-53 + MITRE ATT&CK | No | No | No | No | No | NIST 800-207 + 800-53 + CSF 2.0 + CISA SCuBA (P2) |

### Key Competitive Insights

1. **ScubaGear is the elephant in the room.** It is free, government-backed, and has 30,000+ downloads. We cannot compete on price or institutional authority. We compete on: multi-tenant management, web UI (vs PowerShell), historical trending, auto-remediation, and cross-framework mapping. ScubaGear is a point-in-time assessment tool. We are a continuous compliance platform.

2. **Maester is the closest technical competitor.** 300+ checks, interactive reports, drift detection (commercial). But Maester does not do NIST 800-207 mapping, does not provide auto-remediation, and targets IT admins rather than MSPs with multi-tenant needs.

3. **CoreView, Augmentt, Octiga, Senserva are the commercial competitors.** They are established, well-funded, and have MSP channel relationships. Our advantage must be deeper compliance coverage (NIST + CISA combined), transparent framework mapping, and the safe/risky remediation classification that prevents lockouts.

4. **No competitor maps findings to NIST 800-207 Zero Trust Architecture.** This is a genuine whitespace. Federal and enterprise customers increasingly require ZTA assessments. Being the only tool that maps M365 config to NIST ZTA tenets is defensible positioning.

5. **The Exchange Online coverage gap is the biggest technical risk.** 38 of 128 CISA controls require ExchangeOnlineManagement PowerShell. This module requires certificate-based auth (not managed identity), which complicates the architecture. Every competitor that supports Exchange Online has solved this problem. We must too for credibility.

## Sources

### Official Documentation (HIGH confidence)
- [Microsoft Graph API Change Notifications - Supported Resources](https://learn.microsoft.com/en-us/graph/change-notifications-overview) -- Verified that CA policies, Intune config, Defender settings, and Exchange settings are NOT supported for webhooks
- [Microsoft UTCM APIs Overview (Preview)](https://learn.microsoft.com/en-us/graph/unified-tenant-configuration-management-concept-overview) -- Preview APIs for drift monitoring, 6-hour interval, 800 resources/day limit
- [CISA SCuBA Project](https://www.cisa.gov/resources-tools/services/secure-cloud-business-applications-scuba-project) -- Official baselines and ScubaGear tool
- [ScubaGear GitHub](https://github.com/cisagov/ScubaGear) -- 30,000+ downloads, open source, 128+ controls
- [CIS Microsoft 365 Foundations Benchmark v6](https://www.cisecurity.org/benchmark/microsoft_365) -- 140 controls across 6 services (Oct 2025)
- [Microsoft365DSC](https://microsoft.github.io/Microsoft365DSC/) -- DSC-based configuration monitoring with 15-minute polling

### Competitor Analysis (MEDIUM confidence)
- [CoreView](https://www.coreview.com/) -- Configuration drift management, nightly backups, one-click rollback
- [Augmentt](https://www.augmentt.com/) -- MSP-focused, CIS/NIST/SOC2 baselines, one-click template deployment
- [Octiga](https://www.octiga.io/) -- MSP-focused, real-time monitoring, auto-remediation, PSA integration
- [Senserva](https://www.senserva.com/) -- Automated drift detection + remediation, UTCM-ready, ticketing integration
- [Maester](https://maester.dev/) -- 300+ security checks, interactive reports, commercial drift monitoring
- [ConnectSecure](https://connectsecure.com/white-label-reports) -- White-label/branded compliance reports for MSPs
- [MSP Easy Tools](https://www.mspeasytools.com/) -- White-labelled M365 security reports
- [Liongard](https://www.liongard.com/) -- Configuration change detection and response, CIS report templates

### Community/Analysis (LOW-MEDIUM confidence)
- [How to Actually Security Benchmark Your M365 Tenant](https://ourcloudnetwork.com/how-to-actually-security-benchmark-your-microsoft-365-tenant/) -- Tool comparison
- [Maester and UTCM Are Complementary Tools](https://office365itpros.com/2026/02/10/maester-and-utcm/) -- UTCM preview analysis
- [UTCM Beta Analysis](https://office365itpros.com/2026/02/03/utcm-beta/) -- UTCM limitations documented
- [Senserva on UTCM APIs](https://www.senserva.com/blog/microsofts-utcm-apis-a-massive-win-for-configuration-drift-management-and-why-senservas-already-ahead) -- UTCM limitations: 7-day retention, manual polling, no notifications yet

---
*Feature research for: M365 Zero Trust Security Auditing Platform for MSPs*
*Researched: 2026-03-10*

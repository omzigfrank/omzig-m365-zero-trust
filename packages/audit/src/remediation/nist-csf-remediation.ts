/**
 * 19 NIST CSF 2.0 remediation entries.
 * Each entry maps to a control in NIST_CSF_CONTROLS by controlId.
 * Guidance is framed in terms of NIST CSF functions (Protect, Detect, Identify, Respond, Govern, Recover).
 */

import type { RemediationEntry } from './types.js';

const CA_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess/ConditionalAccessBlade/~/Policies';
const AUTH_METHODS_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/AuthenticationMethodsMenuBlade/~/AdminAuthMethods';
const CONSENT_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ConsentPoliciesMenuBlade/~/UserSettings';
const PIM_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_Azure_PIMCommon/ResourceMenuBlade/~/roles';
const IDENTITY_PROTECTION_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentityProtectionMenuBlade';
const INTUNE_PORTAL = 'https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/overview';
const APPS_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview';
const LABELS_PORTAL = 'https://compliance.microsoft.com/informationprotection';
const LICENSES_PORTAL = 'https://admin.microsoft.com/#/licenses';

export const NIST_CSF_REMEDIATION: RemediationEntry[] = [
  // ===== Protect (PR) =====
  {
    controlId: 'NIST.CSF.PR.AA-1v1',
    steps: [
      'Per CSF Protect function (PR.AA-1): limit access to authorized users and services.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Verify CA policies enforce grant controls (MFA, compliant device) for all cloud apps.',
      'Ensure all users are covered by at least one CA policy.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Medium - Strengthens access enforcement',
  },
  {
    controlId: 'NIST.CSF.PR.AA-3v1',
    steps: [
      'Per CSF Protect function (PR.AA-3): manage remote access with MFA.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Create or verify a CA policy requiring MFA for all users on all cloud apps.',
      'Exclude break-glass accounts from the MFA requirement.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Medium - All users must complete MFA',
  },
  {
    controlId: 'NIST.CSF.PR.AA-5v1',
    steps: [
      'Per CSF Protect function (PR.AA-5): enforce least privilege.',
      'Navigate to Microsoft Entra admin center > Identity Governance > PIM.',
      'Convert permanent active role assignments to eligible assignments.',
      'Configure activation requirements (MFA, justification, time-limit).',
    ],
    adminPortalUrl: PIM_PORTAL,
    estimatedImpact: 'Medium - Admins must activate roles just-in-time',
  },
  {
    controlId: 'NIST.CSF.PR.DS-1v1',
    steps: [
      'Per CSF Protect function (PR.DS-1): protect data-at-rest.',
      'Navigate to Microsoft Purview compliance portal > Information protection > Labels.',
      'Create and publish sensitivity labels for data classification.',
      'Configure auto-labeling policies for sensitive content types.',
      'Ensure labels apply encryption and access restrictions as appropriate.',
    ],
    adminPortalUrl: LABELS_PORTAL,
    estimatedImpact: 'Medium - Requires data classification policy definition',
  },
  {
    controlId: 'NIST.CSF.PR.DS-2v1',
    steps: [
      'Per CSF Protect function (PR.DS-2): protect data-in-transit.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Block legacy authentication protocols that do not use TLS.',
      'Modern authentication (OAuth 2.0, OIDC) uses TLS by default.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'High - Blocks legacy authentication; ensures encrypted transit',
  },
  {
    controlId: 'NIST.CSF.PR.PS-1v1',
    steps: [
      'Per CSF Protect function (PR.PS-1): use proper configuration management.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Migrate from security defaults to Conditional Access policies for granular control.',
      'CA policies provide per-app, per-user, per-condition configuration.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Medium - Migration from security defaults to CA policies',
  },
  {
    controlId: 'NIST.CSF.PR.IR-1v1',
    steps: [
      'Per CSF Protect function (PR.IR-1): ensure technology infrastructure resilience.',
      'Verify at least 5 of 6 telemetry sources are accessible and reporting.',
      'Sources: CA policies, Auth Methods, Directory Roles, Devices, Licenses, Security Defaults.',
      'Broad telemetry supports resilient monitoring and incident detection.',
    ],
    adminPortalUrl: LICENSES_PORTAL,
    estimatedImpact: 'Low - Verification of telemetry access',
  },

  // ===== Detect (DE) =====
  {
    controlId: 'NIST.CSF.DE.CM-1v1',
    steps: [
      'Per CSF Detect function (DE.CM-1): monitor networks and services.',
      'Verify M365 licensing supports unified audit logging (E3/E5/P1/P2).',
      'Navigate to Microsoft 365 admin center > Billing > Licenses.',
      'Enable unified audit logging if not already active.',
    ],
    adminPortalUrl: LICENSES_PORTAL,
    estimatedImpact: 'Low - License verification',
  },
  {
    controlId: 'NIST.CSF.DE.CM-3v1',
    steps: [
      'Per CSF Detect function (DE.CM-3): monitor personnel activity.',
      'Achieve at least 95% MFA registration coverage.',
      'Navigate to Microsoft Entra admin center > Protection > Authentication methods > Activity.',
      'Identify unregistered users and run an enrollment campaign.',
    ],
    adminPortalUrl: AUTH_METHODS_PORTAL,
    estimatedImpact: 'Medium - Requires user MFA registration',
  },
  {
    controlId: 'NIST.CSF.DE.CM-6v1',
    steps: [
      'Per CSF Detect function (DE.CM-6): monitor external service provider activity.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Verify risk-based CA policies cover sign-in risk scenarios.',
      'This detects anomalous access patterns from external services.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Low - Monitoring configuration',
  },
  {
    controlId: 'NIST.CSF.DE.AE-2v1',
    steps: [
      'Per CSF Detect function (DE.AE-2): analyze adverse events.',
      'Verify Entra ID P2 licensing for Identity Protection.',
      'Navigate to Microsoft Entra admin center > Protection > Identity Protection.',
      'Review risky users and risky sign-in reports.',
      'Configure automated remediation actions.',
    ],
    adminPortalUrl: IDENTITY_PROTECTION_PORTAL,
    estimatedImpact: 'Low - Analysis and configuration',
  },
  {
    controlId: 'NIST.CSF.DE.AE-3v1',
    steps: [
      'Per CSF Detect function (DE.AE-3): correlate events from multiple sources.',
      'Verify at least 5 telemetry sources are accessible for correlation.',
      'Configure diagnostic settings to export logs to SIEM.',
      'Set up correlation rules for cross-source event analysis.',
    ],
    adminPortalUrl: LICENSES_PORTAL,
    estimatedImpact: 'Low - Telemetry access verification',
  },

  // ===== Identify (ID) =====
  {
    controlId: 'NIST.CSF.ID.AM-1v1',
    steps: [
      'Per CSF Identify function (ID.AM-1): maintain hardware asset inventory.',
      'Navigate to Microsoft Intune admin center > Devices > All devices.',
      'Verify corporate devices are enrolled and showing in inventory.',
      'Configure auto-enrollment for supported platforms.',
    ],
    adminPortalUrl: INTUNE_PORTAL,
    estimatedImpact: 'Medium - Device enrollment required',
  },
  {
    controlId: 'NIST.CSF.ID.AM-2v1',
    steps: [
      'Per CSF Identify function (ID.AM-2): maintain software asset inventory.',
      'Navigate to Microsoft Entra admin center > Applications > App registrations.',
      'Review and maintain the application registry.',
      'Remove stale or unused app registrations.',
    ],
    adminPortalUrl: APPS_PORTAL,
    estimatedImpact: 'Low - Inventory maintenance',
  },
  {
    controlId: 'NIST.CSF.ID.RA-1v1',
    steps: [
      'Per CSF Identify function (ID.RA-1): identify vulnerabilities.',
      'Verify Entra ID P2 licensing for risk detection.',
      'Navigate to Microsoft Entra admin center > Protection > Identity Protection.',
      'Enable and review risky users and risky sign-in detections.',
    ],
    adminPortalUrl: IDENTITY_PROTECTION_PORTAL,
    estimatedImpact: 'Low - Risk detection configuration',
  },

  // ===== Respond (RS) =====
  {
    controlId: 'NIST.CSF.RS.MA-1v1',
    steps: [
      'Per CSF Respond function (RS.MA-1): manage incidents with structured workflow.',
      'Navigate to Microsoft Entra admin center > Applications > Consent and permissions.',
      'Enable admin consent workflow for structured response to application requests.',
      'Assign reviewers to handle consent requests.',
    ],
    adminPortalUrl: CONSENT_PORTAL,
    estimatedImpact: 'Low - Enables structured consent workflow',
  },
  {
    controlId: 'NIST.CSF.RS.AN-1v1',
    steps: [
      'Per CSF Respond function (RS.AN-1): support notification capabilities.',
      'Verify Entra ID P2 licensing for risky user and sign-in alerts.',
      'Configure notification settings in Identity Protection.',
      'Set up email alerts for security teams.',
    ],
    adminPortalUrl: IDENTITY_PROTECTION_PORTAL,
    estimatedImpact: 'Low - Notification configuration',
  },

  // ===== Govern (GV) =====
  {
    controlId: 'NIST.CSF.GV.OC-1v1',
    steps: [
      'This is an organizational/advisory control.',
      'Per CSF Govern function (GV.OC-1): document organizational context.',
      'Define and document your organization\'s cybersecurity mission and strategic objectives.',
      'Ensure security policies are aligned with business objectives.',
      'This is a governance activity that cannot be verified via technical controls.',
    ],
    adminPortalUrl: LICENSES_PORTAL,
    estimatedImpact: 'Low - Governance documentation',
    notes: 'Advisory control - organizational governance documentation is not auditable via Graph API.',
  },

  // ===== Recover (RC) =====
  {
    controlId: 'NIST.CSF.RC.RP-1v1',
    steps: [
      'This is an organizational/advisory control.',
      'Per CSF Recover function (RC.RP-1): document recovery planning.',
      'Create and maintain an incident recovery plan.',
      'Define recovery time objectives (RTO) and recovery point objectives (RPO).',
      'Test recovery procedures regularly.',
      'This is a governance activity that cannot be verified via technical controls.',
    ],
    adminPortalUrl: LICENSES_PORTAL,
    estimatedImpact: 'Low - Recovery planning documentation',
    notes: 'Advisory control - recovery planning documentation is not auditable via Graph API.',
  },
];

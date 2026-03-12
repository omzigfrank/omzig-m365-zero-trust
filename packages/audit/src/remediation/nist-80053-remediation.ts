/**
 * 22 NIST 800-53 remediation entries.
 * Each entry maps to a control in NIST_80053_CONTROLS by controlId.
 * Guidance is framed in terms of NIST 800-53 control families.
 */

import type { RemediationEntry } from './types.js';

const CA_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess/ConditionalAccessBlade/~/Policies';
const AUTH_METHODS_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/AuthenticationMethodsMenuBlade/~/AdminAuthMethods';
const USER_SETTINGS_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_UsersManagementMenuBlade/~/UserSettings';
const PIM_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_Azure_PIMCommon/ResourceMenuBlade/~/roles';
const ROLES_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/RolesManagementMenuBlade/~/AllRoles';
const IDENTITY_PROTECTION_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentityProtectionMenuBlade';
const EXTERNAL_ID_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/CompanyRelationshipsMenuBlade/~/Settings';
const INTUNE_PORTAL = 'https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/overview';
const APPS_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview';
const LICENSES_PORTAL = 'https://admin.microsoft.com/#/licenses';
const PASSWORD_PORTAL = 'https://admin.microsoft.com/#/Settings/SecurityPrivacy/:/Settings/L1/PasswordPolicy';
const DEFENDER_PORTAL = 'https://security.microsoft.com/threatpolicy';

export const NIST_80053_REMEDIATION: RemediationEntry[] = [
  // ===== AC - Access Control =====
  {
    controlId: 'NIST.80053.AC-2v1',
    steps: [
      'Per NIST 800-53 AC-2 (Account Management), maintain 2-8 Global Administrators.',
      'Navigate to Microsoft Entra admin center > Identity > Roles > Global Administrator.',
      'Review the member list. Remove or reassign excess Global Admins to targeted roles.',
      'Ensure at least 2 break-glass accounts are maintained.',
    ],
    adminPortalUrl: ROLES_PORTAL,
    estimatedImpact: 'Medium - Role reassignment planning required',
  },
  {
    controlId: 'NIST.80053.AC-3v1',
    steps: [
      'Per NIST 800-53 AC-3 (Access Enforcement), enforce access via Conditional Access.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Verify that CA policies include grant controls (MFA, compliant device, etc.).',
      'Ensure policies cover all users and critical applications.',
      'Review policy effectiveness via the sign-in log and "What If" tool.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Medium - Strengthens access enforcement across the tenant',
  },
  {
    controlId: 'NIST.80053.AC-6v1',
    steps: [
      'Per NIST 800-53 AC-6 (Least Privilege), use PIM for just-in-time access.',
      'Navigate to Microsoft Entra admin center > Identity Governance > PIM > Entra roles.',
      'Convert permanent active assignments to eligible assignments.',
      'Configure activation requirements (MFA, justification, time-limit).',
      'Review and remove unnecessary role assignments.',
    ],
    adminPortalUrl: PIM_PORTAL,
    estimatedImpact: 'Medium - Admins must activate roles via PIM for privileged operations',
  },
  {
    controlId: 'NIST.80053.AC-7v1',
    steps: [
      'Per NIST 800-53 AC-7 (Unsuccessful Logon Attempts), block high-risk sign-ins.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Create CA policies targeting high sign-in risk and high user risk.',
      'Set grant control to "Block access" for high-risk conditions.',
      'Requires Entra ID P2 for Identity Protection risk evaluation.',
    ],
    adminPortalUrl: CA_PORTAL,
    powershell: `Connect-MgGraph -Scopes "Policy.ReadWrite.ConditionalAccess"
New-MgIdentityConditionalAccessPolicy -BodyParameter @{
  displayName = "80053-AC7-Block-High-Risk-SignIns"
  state = "enabledForReportingButNotEnforced"
  conditions = @{
    signInRiskLevels = @("high")
    users = @{ includeUsers = @("All") }
    applications = @{ includeApplications = @("All") }
  }
  grantControls = @{
    operator = "OR"
    builtInControls = @("block")
  }
}`,
    estimatedImpact: 'Medium - Blocks sign-ins flagged as high risk',
  },
  {
    controlId: 'NIST.80053.AC-11v1',
    steps: [
      'Per NIST 800-53 AC-11 (Session Lock), configure session controls.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Edit or create a CA policy. Under Session controls:',
      'Set sign-in frequency to enforce periodic re-authentication.',
      'Recommended: 8 hours for standard users, 1 hour for HIPAA environments.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Medium - Users re-authenticate at configured intervals',
  },
  {
    controlId: 'NIST.80053.AC-17v1',
    steps: [
      'Per NIST 800-53 AC-17 (Remote Access), require MFA for all remote access.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Create or verify a CA policy requiring MFA for all users on all cloud apps.',
      'Exclude break-glass accounts from the MFA requirement.',
      'Set to Report-only first, then enable after validation.',
    ],
    adminPortalUrl: CA_PORTAL,
    powershell: `Connect-MgGraph -Scopes "Policy.ReadWrite.ConditionalAccess"
New-MgIdentityConditionalAccessPolicy -BodyParameter @{
  displayName = "80053-AC17-Require-MFA-Remote"
  state = "enabledForReportingButNotEnforced"
  conditions = @{
    users = @{ includeUsers = @("All") }
    applications = @{ includeApplications = @("All") }
  }
  grantControls = @{
    operator = "OR"
    builtInControls = @("mfa")
  }
}`,
    estimatedImpact: 'Medium - All users must complete MFA for remote access',
  },

  // ===== IA - Identification and Authentication =====
  {
    controlId: 'NIST.80053.IA-2v1',
    steps: [
      'Per NIST 800-53 IA-2 (Identification and Authentication), achieve 95%+ MFA coverage.',
      'Navigate to Microsoft Entra admin center > Protection > Authentication methods > Activity.',
      'Review the MFA registration report.',
      'Identify users without MFA registration and run an enrollment campaign.',
      'Consider requiring MFA registration from compliant devices via CA policy.',
    ],
    adminPortalUrl: AUTH_METHODS_PORTAL,
    estimatedImpact: 'Medium - Unregistered users must enroll MFA methods',
  },
  {
    controlId: 'NIST.80053.IA-5v1',
    steps: [
      'Per NIST 800-53 IA-5 (Authenticator Management), align with NIST 800-63B.',
      'Navigate to Microsoft 365 admin center > Settings > Password expiration policy.',
      'Set passwords to never expire per NIST 800-63B guidance.',
      'Focus on password strength and MFA rather than forced rotation.',
    ],
    adminPortalUrl: PASSWORD_PORTAL,
    estimatedImpact: 'Low - Removes forced password rotation',
  },
  {
    controlId: 'NIST.80053.IA-8v1',
    steps: [
      'Per NIST 800-53 IA-8 (Non-Organizational User Authentication), restrict guest access.',
      'Navigate to Microsoft Entra admin center > External Identities > External collaboration settings.',
      'Set guest invitation restrictions to admin-only.',
      'Review existing guest users and remove stale accounts.',
    ],
    adminPortalUrl: EXTERNAL_ID_PORTAL,
    estimatedImpact: 'Medium - Regular users can no longer invite guest users',
  },

  // ===== SC - System and Communications Protection =====
  {
    controlId: 'NIST.80053.SC-7v1',
    steps: [
      'Per NIST 800-53 SC-7 (Boundary Protection), block legacy authentication at the boundary.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Create a CA policy blocking legacy authentication protocols.',
      'This enforces modern authentication at the service boundary.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'High - Blocks legacy authentication protocols at the boundary',
  },
  {
    controlId: 'NIST.80053.SC-8v1',
    steps: [
      'Per NIST 800-53 SC-8 (Transmission Confidentiality), enforce modern authentication.',
      'Verify legacy authentication is blocked via Conditional Access.',
      'Modern authentication protocols (OAuth 2.0, OpenID Connect) use TLS by default.',
      'Review applications for any using Basic authentication and plan migration.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Medium - Ensures all authentication uses encrypted channels',
  },
  {
    controlId: 'NIST.80053.SC-13v1',
    steps: [
      'Per NIST 800-53 SC-13 (Cryptographic Protection), use strong authentication.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Create a CA policy requiring phishing-resistant MFA authentication strength.',
      'Under Grant controls: select "Require authentication strength" > "Phishing-resistant MFA".',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'High - Requires phishing-resistant MFA methods (FIDO2, Windows Hello)',
  },

  // ===== AU - Audit and Accountability =====
  {
    controlId: 'NIST.80053.AU-2v1',
    steps: [
      'Per NIST 800-53 AU-2 (Event Logging), ensure audit logging capability.',
      'Verify M365 licensing supports unified audit log (E3/E5/P1/P2).',
      'Navigate to Microsoft 365 admin center > Billing > Licenses.',
      'If on a lower SKU, plan upgrade to include audit logging capabilities.',
    ],
    adminPortalUrl: LICENSES_PORTAL,
    estimatedImpact: 'Low - License verification',
  },
  {
    controlId: 'NIST.80053.AU-6v1',
    steps: [
      'Per NIST 800-53 AU-6 (Audit Review, Analysis, and Reporting), enable advanced audit.',
      'Verify Entra ID P2 licensing for advanced audit review capabilities.',
      'Navigate to Microsoft Entra admin center > Monitoring > Audit logs.',
      'Configure diagnostic settings to export logs to your SIEM.',
      'Set up alert rules for critical audit events.',
    ],
    adminPortalUrl: LICENSES_PORTAL,
    estimatedImpact: 'Low - License and configuration verification',
  },
  {
    controlId: 'NIST.80053.AU-12v1',
    steps: [
      'Per NIST 800-53 AU-12 (Audit Generation), maintain broad telemetry coverage.',
      'Verify at least 5 of 6 telemetry sources are accessible.',
      'Sources: CA policies, Auth Methods, Directory Roles, Devices, Licenses, Security Defaults.',
      'Ensure service principal or managed identity has read permissions for each area.',
      'Gaps indicate blind spots in your audit posture.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Low - Permission and access verification',
  },

  // ===== CM - Configuration Management =====
  {
    controlId: 'NIST.80053.CM-6v1',
    steps: [
      'Per NIST 800-53 CM-6 (Configuration Settings), use CA policies over security defaults.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'If security defaults are enabled, plan migration to Conditional Access policies.',
      'CA policies provide granular control that security defaults cannot offer.',
      'Create policies for MFA, legacy auth blocking, risk-based access, and device compliance.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Medium - Migration from security defaults requires policy creation',
  },
  {
    controlId: 'NIST.80053.CM-7v1',
    steps: [
      'Per NIST 800-53 CM-7 (Least Functionality), restrict application registration.',
      'Navigate to Microsoft Entra admin center > Identity > Users > User settings.',
      'Set "Users can register applications" to No.',
      'Only administrators should be able to register applications.',
    ],
    adminPortalUrl: USER_SETTINGS_PORTAL,
    estimatedImpact: 'Low - Restricts app registration to administrators',
  },
  {
    controlId: 'NIST.80053.CM-8v1',
    steps: [
      'Per NIST 800-53 CM-8 (Information System Component Inventory), maintain asset inventory.',
      'Verify device inventory in Microsoft Intune admin center > Devices.',
      'Verify application inventory in Microsoft Entra admin center > Applications > App registrations.',
      'Ensure both device and application inventories are maintained and current.',
    ],
    adminPortalUrl: INTUNE_PORTAL,
    estimatedImpact: 'Low - Inventory verification; no direct user impact',
  },

  // ===== SI - System and Information Integrity =====
  {
    controlId: 'NIST.80053.SI-2v1',
    steps: [
      'Per NIST 800-53 SI-2 (Flaw Remediation), enable Defender for Endpoint.',
      'Verify Defender for Endpoint licensing.',
      'Navigate to Microsoft Defender portal > Settings > Endpoints > Onboarding.',
      'Onboard devices and configure vulnerability management policies.',
    ],
    adminPortalUrl: DEFENDER_PORTAL,
    estimatedImpact: 'Medium - Requires endpoint agent deployment',
  },
  {
    controlId: 'NIST.80053.SI-3v1',
    steps: [
      'Per NIST 800-53 SI-3 (Malicious Code Protection), enable Defender for Office 365.',
      'Verify Defender for Office 365 licensing.',
      'Navigate to Microsoft Defender portal > Policies & rules > Threat policies.',
      'Configure Safe Links, Safe Attachments, and Anti-phishing policies.',
    ],
    adminPortalUrl: DEFENDER_PORTAL,
    estimatedImpact: 'Low - Email security; transparent to users',
  },
  {
    controlId: 'NIST.80053.SI-4v1',
    steps: [
      'Per NIST 800-53 SI-4 (System Monitoring), enable advanced monitoring.',
      'Verify Entra ID P2 licensing for Identity Protection.',
      'Navigate to Microsoft Entra admin center > Protection > Identity Protection.',
      'Enable risk detection and configure risk policies.',
      'Set up alerting for risky users and risky sign-ins.',
    ],
    adminPortalUrl: IDENTITY_PROTECTION_PORTAL,
    estimatedImpact: 'Low - Monitoring configuration; no direct user impact',
  },

  // ===== RA - Risk Assessment =====
  {
    controlId: 'NIST.80053.RA-5v1',
    steps: [
      'Per NIST 800-53 RA-5 (Vulnerability Scanning), enable Identity Protection.',
      'Verify Entra ID P2 licensing.',
      'Navigate to Microsoft Entra admin center > Protection > Identity Protection.',
      'Review risky users and risky sign-ins reports.',
      'Configure automated remediation actions for detected risks.',
    ],
    adminPortalUrl: IDENTITY_PROTECTION_PORTAL,
    estimatedImpact: 'Low - Risk assessment configuration',
  },
];

/**
 * 31 NIST 800-207 ZTA remediation entries.
 * Each entry maps to a control in NIST_ZTA_CONTROLS by controlId.
 * Guidance is framed in terms of NIST 800-207 Zero Trust tenets.
 */

import type { RemediationEntry } from './types.js';

const CA_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess/ConditionalAccessBlade/~/Policies';
const AUTH_METHODS_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/AuthenticationMethodsMenuBlade/~/AdminAuthMethods';
const USER_SETTINGS_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_UsersManagementMenuBlade/~/UserSettings';
const CONSENT_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ConsentPoliciesMenuBlade/~/UserSettings';
const EXTERNAL_ID_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/CompanyRelationshipsMenuBlade/~/Settings';
const PIM_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_Azure_PIMCommon/ResourceMenuBlade/~/roles';
const IDENTITY_PROTECTION_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentityProtectionMenuBlade';
const NAMED_LOCATIONS_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess/ConditionalAccessBlade/~/NamedLocations';
const INTUNE_PORTAL = 'https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/overview';
const APPS_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview';
const LABELS_PORTAL = 'https://compliance.microsoft.com/informationprotection';
const DOMAINS_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/DomainsManagementMenuBlade/~/CustomDomains';
const PASSWORD_PORTAL = 'https://admin.microsoft.com/#/Settings/SecurityPrivacy/:/Settings/L1/PasswordPolicy';
const LICENSES_PORTAL = 'https://admin.microsoft.com/#/licenses';

export const NIST_ZTA_REMEDIATION: RemediationEntry[] = [
  // ===== Tenet 1: All Resources (Asset Awareness) =====
  {
    controlId: 'NIST.ZTA.T1.1v1',
    steps: [
      'Per ZTA Tenet 1 (All Resources), maintain a comprehensive device inventory.',
      'Navigate to Microsoft Intune admin center > Devices > All devices.',
      'Verify that corporate devices are enrolled and showing compliance status.',
      'Configure auto-enrollment for Windows, iOS, macOS, and Android as appropriate.',
      'Review and remediate any non-compliant devices.',
    ],
    adminPortalUrl: INTUNE_PORTAL,
    estimatedImpact: 'Medium - Device enrollment requires endpoint agent deployment',
  },
  {
    controlId: 'NIST.ZTA.T1.2v1',
    steps: [
      'Per ZTA Tenet 1, track all application resources.',
      'Navigate to Microsoft Entra admin center > Applications > App registrations.',
      'Review the list of registered applications for completeness.',
      'Remove stale or unused app registrations.',
      'Ensure all business-critical apps are registered and properly permissioned.',
    ],
    adminPortalUrl: APPS_PORTAL,
    estimatedImpact: 'Low - Application inventory review; no direct user impact',
  },
  {
    controlId: 'NIST.ZTA.T1.3v1',
    steps: [
      'Per ZTA Tenet 1, classify all data resources.',
      'Navigate to Microsoft Purview compliance portal > Information protection > Labels.',
      'Create sensitivity labels for your organization\'s data classification scheme.',
      'Publish labels via a label policy targeting all users.',
      'Configure auto-labeling policies for sensitive content detection.',
    ],
    adminPortalUrl: LABELS_PORTAL,
    estimatedImpact: 'Medium - Requires data classification policy definition',
  },
  {
    controlId: 'NIST.ZTA.T1.4v1',
    steps: [
      'Per ZTA Tenet 1, maintain a domain inventory.',
      'Navigate to Microsoft Entra admin center > Settings > Domain names.',
      'Verify all custom domains are listed and verified.',
      'Add any missing custom domains used by your organization.',
      'Remove domains that are no longer in use.',
    ],
    adminPortalUrl: DOMAINS_PORTAL,
    estimatedImpact: 'Low - Domain management; no direct user impact',
  },

  // ===== Tenet 2: Secure Communication =====
  {
    controlId: 'NIST.ZTA.T2.1v1',
    steps: [
      'Per ZTA Tenet 2 (Secure Communication), block insecure authentication protocols.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Create a CA policy blocking legacy authentication (Exchange ActiveSync + Other clients).',
      'Target all users and all cloud apps.',
      'Set to Report-only first, validate, then enable.',
    ],
    adminPortalUrl: CA_PORTAL,
    powershell: `Connect-MgGraph -Scopes "Policy.ReadWrite.ConditionalAccess"
New-MgIdentityConditionalAccessPolicy -BodyParameter @{
  displayName = "ZTA-T2-Block-Legacy-Auth"
  state = "enabledForReportingButNotEnforced"
  conditions = @{
    clientAppTypes = @("exchangeActiveSync", "other")
    users = @{ includeUsers = @("All") }
    applications = @{ includeApplications = @("All") }
  }
  grantControls = @{
    operator = "OR"
    builtInControls = @("block")
  }
}`,
    estimatedImpact: 'High - Blocks legacy authentication protocols',
  },
  {
    controlId: 'NIST.ZTA.T2.2v1',
    steps: [
      'Per ZTA Tenet 2, enforce a security baseline strategy.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Verify that Conditional Access policies are active (preferred over security defaults).',
      'If using security defaults: plan migration to Conditional Access for granular control.',
      'Ensure at minimum: MFA for all users, block legacy auth, and risk-based policies.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Medium - Policy enforcement; critical for baseline security',
  },
  {
    controlId: 'NIST.ZTA.T2.3v1',
    steps: [
      'Per ZTA Tenet 2, do not grant blanket trust based on network location.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access > Named locations.',
      'Review all named locations. Ensure none are used to bypass MFA or other controls.',
      'Zero Trust principle: verify explicitly, regardless of network location.',
      'If named locations bypass security controls, remove the bypass or add compensating controls.',
    ],
    adminPortalUrl: NAMED_LOCATIONS_PORTAL,
    estimatedImpact: 'Medium - May require additional MFA prompts for previously trusted locations',
  },
  {
    controlId: 'NIST.ZTA.T2.4v1',
    steps: [
      'Per ZTA Tenet 2, enforce modern authentication across all workloads.',
      'Verify that legacy authentication is blocked via Conditional Access.',
      'Ensure all applications use OAuth 2.0 / OpenID Connect.',
      'Review any applications still using Basic authentication and plan migration.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Medium - Application modernization may be required',
  },

  // ===== Tenet 3: Per-Session Access =====
  {
    controlId: 'NIST.ZTA.T3.1v1',
    steps: [
      'Per ZTA Tenet 3 (Per-Session Access), enforce per-session evaluation.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Verify at least 3 active CA policies enforce different access conditions.',
      'Recommended minimum: MFA for all users, block legacy auth, risk-based blocking.',
      'Each policy evaluates conditions at sign-in time (no persistent trust).',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Medium - Ensures per-session evaluation of access conditions',
  },
  {
    controlId: 'NIST.ZTA.T3.2v1',
    steps: [
      'Per ZTA Tenet 3, configure session controls to limit persistent sessions.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Edit or create a CA policy. Under Session controls:',
      'Set "Sign-in frequency" to an appropriate value (e.g., 8 hours for standard, 1 hour for HIPAA).',
      'Set "Persistent browser session" to "Never persistent" for sensitive applications.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Medium - Users may need to re-authenticate more frequently',
  },

  // ===== Tenet 4: Dynamic Policy =====
  {
    controlId: 'NIST.ZTA.T4.1v1',
    steps: [
      'Per ZTA Tenet 4 (Dynamic Policy), implement risk-based access decisions.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Create CA policies that evaluate both user risk and sign-in risk levels.',
      'Block or require MFA for high user risk. Block high sign-in risk.',
      'Requires Entra ID P2 licensing for Identity Protection.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Medium - Risk-based policies may block legitimate sessions flagged as risky',
  },
  {
    controlId: 'NIST.ZTA.T4.2v1',
    steps: [
      'Per ZTA Tenet 4, incorporate device health into access decisions.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Create a CA policy requiring device compliance for access.',
      'Under Grant controls: select "Require device to be marked as compliant".',
      'Ensure devices are enrolled in Intune with compliance policies BEFORE enabling.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'High - Can lock out users on non-compliant devices; deploy carefully',
  },
  {
    controlId: 'NIST.ZTA.T4.3v1',
    steps: [
      'Per ZTA Tenet 4, use location context in access decisions.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Create CA policies that reference named locations as conditions.',
      'Consider blocking access from high-risk countries or requiring additional verification.',
      'Note: Location should be an additional signal, not the sole access control.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Medium - Location-based restrictions may affect traveling users',
  },
  {
    controlId: 'NIST.ZTA.T4.4v1',
    steps: [
      'Per ZTA Tenet 4, target specific applications in CA policies for granular control.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Review existing CA policies. Ensure some target specific apps (not only "All cloud apps").',
      'Create application-specific policies for sensitive workloads (e.g., Exchange Online, SharePoint).',
      'This allows differentiated security posture per application.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Low - Adds granularity to existing policies',
  },
  {
    controlId: 'NIST.ZTA.T4.5v1',
    steps: [
      'Per ZTA Tenet 4, ensure comprehensive MFA coverage.',
      'Review the MFA registration report in Microsoft Entra admin center.',
      'Navigate to Identity > Users > All users > Per-user MFA (or Authentication methods activity).',
      'Target: at least 95% of all users should have MFA methods registered.',
      'Run a campaign to register remaining users. Consider requiring MFA registration via CA policy.',
    ],
    adminPortalUrl: AUTH_METHODS_PORTAL,
    estimatedImpact: 'Medium - Requires user action to register MFA methods',
  },
  {
    controlId: 'NIST.ZTA.T4.6v1',
    steps: [
      'Per ZTA Tenet 4, apply stronger controls to administrative roles.',
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access.',
      'Create CA policies that specifically target directory roles (Global Admin, Security Admin, etc.).',
      'Require phishing-resistant MFA or additional grant controls for admin roles.',
      'This implements differentiated policy for highly privileged access.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Medium - Admins face additional authentication requirements',
  },

  // ===== Tenet 5: Integrity Monitoring =====
  {
    controlId: 'NIST.ZTA.T5.1v1',
    steps: [
      'Per ZTA Tenet 5 (Integrity Monitoring), ensure audit logging capability.',
      'Verify your M365 licensing includes unified audit log support (E3/E5/P1/P2).',
      'Navigate to Microsoft 365 admin center > Billing > Licenses to confirm SKU.',
      'Enable unified audit logging if not already enabled.',
    ],
    adminPortalUrl: LICENSES_PORTAL,
    estimatedImpact: 'Low - License verification; no operational change',
  },
  {
    controlId: 'NIST.ZTA.T5.2v1',
    steps: [
      'Per ZTA Tenet 5, enable device threat detection.',
      'Verify Defender for Endpoint licensing in Microsoft 365 admin center.',
      'If licensed, onboard devices via the Defender for Endpoint portal.',
      'Configure detection and response policies.',
    ],
    adminPortalUrl: 'https://security.microsoft.com/preferences/onboarding',
    estimatedImpact: 'Medium - Requires endpoint agent deployment',
  },
  {
    controlId: 'NIST.ZTA.T5.3v1',
    steps: [
      'Per ZTA Tenet 5, enable email threat protection.',
      'Verify Defender for Office 365 licensing.',
      'Navigate to Microsoft Defender portal > Policies & rules > Threat policies.',
      'Configure Safe Links and Safe Attachments policies.',
      'Enable anti-phishing policies with impersonation protection.',
    ],
    adminPortalUrl: 'https://security.microsoft.com/threatpolicy',
    estimatedImpact: 'Low - Email scanning; transparent to users',
  },
  {
    controlId: 'NIST.ZTA.T5.4v1',
    steps: [
      'Per ZTA Tenet 5, maintain broad telemetry coverage.',
      'Verify accessibility of at least 5 of 6 telemetry sources: Conditional Access, Authentication Methods, Directory Roles, Devices, Licenses, Security Defaults.',
      'Ensure the managed identity or service principal has read permissions for each area.',
      'Gaps in telemetry coverage indicate blind spots in your Zero Trust posture.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Low - Permission and configuration verification',
  },

  // ===== Tenet 6: Dynamic Authentication =====
  {
    controlId: 'NIST.ZTA.T6.1v1',
    steps: [
      'Per ZTA Tenet 6 (Dynamic Authentication), achieve high MFA registration.',
      'Target: at least 95% of users registered for MFA.',
      'Navigate to Microsoft Entra admin center > Protection > Authentication methods > Activity.',
      'Review the registration report. Identify unregistered users.',
      'Require MFA registration via CA policy or direct communication campaign.',
    ],
    adminPortalUrl: AUTH_METHODS_PORTAL,
    estimatedImpact: 'Medium - Requires user action to register MFA',
  },
  {
    controlId: 'NIST.ZTA.T6.2v1',
    steps: [
      'Per ZTA Tenet 6, limit Global Administrator scope.',
      'Navigate to Microsoft Entra admin center > Identity > Roles > Global Administrator.',
      'Ensure between 2 and 5 Global Administrators (stricter than CISA 2-8 range).',
      'Convert excess Global Admins to more targeted roles.',
      'Maintain at least 2 break-glass accounts.',
    ],
    adminPortalUrl: 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/RolesManagementMenuBlade/~/AllRoles',
    estimatedImpact: 'Medium - Role reassignment required for excess Global Admins',
  },
  {
    controlId: 'NIST.ZTA.T6.3v1',
    steps: [
      'This is an organizational/advisory control.',
      'Per ZTA Tenet 6, configure emergency break-glass accounts.',
      'Create 2 cloud-only accounts excluded from all Conditional Access policies.',
      'Use strong passwords (32+ characters) stored in a physical safe.',
      'Exclude these accounts from all CA policies by group membership.',
      'Test access quarterly and monitor sign-in logs for any unexpected usage.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Low - Emergency account configuration',
    notes: 'Advisory control - break-glass account management is an organizational procedure.',
  },
  {
    controlId: 'NIST.ZTA.T6.4v1',
    steps: [
      'Per ZTA Tenet 6, complete authentication methods migration.',
      'Navigate to Microsoft Entra admin center > Protection > Authentication methods > Settings.',
      'Verify migration state is "Migration Complete".',
      'If still in progress, migrate remaining legacy MFA/SSPR policies to Authentication methods.',
    ],
    adminPortalUrl: AUTH_METHODS_PORTAL,
    estimatedImpact: 'Low - Administrative change; consolidates policy management',
  },
  {
    controlId: 'NIST.ZTA.T6.5v1',
    steps: [
      'Per ZTA Tenet 6, disable weak authentication methods.',
      'Navigate to Microsoft Entra admin center > Protection > Authentication methods > Policies.',
      'Disable SMS and Voice authentication methods.',
      'Ensure users have alternative methods (Authenticator app, FIDO2 key) before disabling.',
    ],
    adminPortalUrl: AUTH_METHODS_PORTAL,
    estimatedImpact: 'High - Users relying on SMS/Voice must switch to stronger methods',
  },
  {
    controlId: 'NIST.ZTA.T6.6v1',
    steps: [
      'Per ZTA Tenet 6, use just-in-time privileged access.',
      'Navigate to Microsoft Entra admin center > Identity Governance > PIM.',
      'Configure eligible role assignments (not permanent active) for privileged roles.',
      'Set appropriate activation duration and require justification.',
    ],
    adminPortalUrl: PIM_PORTAL,
    estimatedImpact: 'Medium - Admins must activate roles before performing privileged actions',
  },
  {
    controlId: 'NIST.ZTA.T6.7v1',
    steps: [
      'Per ZTA Tenet 6, enable structured application authorization.',
      'Navigate to Microsoft Entra admin center > Applications > Enterprise applications > Consent and permissions.',
      'Enable the admin consent workflow.',
      'Assign reviewers to approve/deny application consent requests.',
    ],
    adminPortalUrl: CONSENT_PORTAL,
    estimatedImpact: 'Low - Enables structured consent workflow',
  },

  // ===== Tenet 7: Continuous Improvement =====
  {
    controlId: 'NIST.ZTA.T7.1v1',
    steps: [
      'Per ZTA Tenet 7 (Continuous Improvement), enable advanced identity protection.',
      'Verify Entra ID P2 licensing for Identity Protection capabilities.',
      'Navigate to Microsoft Entra admin center > Protection > Identity Protection.',
      'Configure risk policies for user risk and sign-in risk.',
      'Enable risky user and risky sign-in reports.',
    ],
    adminPortalUrl: IDENTITY_PROTECTION_PORTAL,
    estimatedImpact: 'Low - License verification and configuration',
  },
  {
    controlId: 'NIST.ZTA.T7.2v1',
    steps: [
      'Per ZTA Tenet 7, restrict guest invitation to authorized personnel.',
      'Navigate to Microsoft Entra admin center > External Identities > External collaboration settings.',
      'Set guest invite restrictions to "Only users assigned to specific admin roles can invite guest users".',
    ],
    adminPortalUrl: EXTERNAL_ID_PORTAL,
    estimatedImpact: 'Medium - Regular users can no longer invite guests directly',
  },
  {
    controlId: 'NIST.ZTA.T7.3v1',
    steps: [
      'Per ZTA Tenet 7, restrict application registration to administrators.',
      'Navigate to Microsoft Entra admin center > Identity > Users > User settings.',
      'Set "Users can register applications" to No.',
    ],
    adminPortalUrl: USER_SETTINGS_PORTAL,
    estimatedImpact: 'Low - Only affects users who were creating app registrations',
  },
  {
    controlId: 'NIST.ZTA.T7.4v1',
    steps: [
      'Per ZTA Tenet 7, align password policy with NIST 800-63B.',
      'Navigate to Microsoft 365 admin center > Settings > Org settings > Password expiration policy.',
      'Disable forced password expiration (set to never expire).',
      'NIST 800-63B recommends against periodic password changes.',
    ],
    adminPortalUrl: PASSWORD_PORTAL,
    estimatedImpact: 'Low - Removes forced password rotation',
  },
];

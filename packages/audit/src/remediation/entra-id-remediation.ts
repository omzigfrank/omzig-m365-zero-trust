/**
 * 29 CISA SCuBA Entra ID remediation entries.
 * Each entry maps to a control in ENTRA_ID_CONTROLS by controlId.
 *
 * Sources:
 * - CISA SCuBA Entra ID baseline (cisagov/ScubaGear baselines/aad.md)
 * - Microsoft Entra admin center deep links
 */

import type { RemediationEntry } from './types.js';

const CA_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess/ConditionalAccessBlade/~/Policies';
const AUTH_METHODS_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/AuthenticationMethodsMenuBlade/~/AdminAuthMethods';
const USER_SETTINGS_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_UsersManagementMenuBlade/~/UserSettings';
const CONSENT_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ConsentPoliciesMenuBlade/~/UserSettings';
const EXTERNAL_ID_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/CompanyRelationshipsMenuBlade/~/Settings';
const PIM_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_Azure_PIMCommon/ResourceMenuBlade/~/roles';
const ROLES_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/RolesManagementMenuBlade/~/AllRoles';
const IDENTITY_PROTECTION_PORTAL = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentityProtectionMenuBlade';
const PASSWORD_PORTAL = 'https://admin.microsoft.com/#/Settings/SecurityPrivacy/:/Settings/L1/PasswordPolicy';

export const ENTRA_ID_REMEDIATION: RemediationEntry[] = [
  // ===== MS.AAD.1.x - Legacy Authentication =====
  {
    controlId: 'MS.AAD.1.1v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access > Policies.',
      'Click "+ New policy".',
      'Name the policy (e.g., "CA001-Block-Legacy-Auth").',
      'Under Users: select "All users".',
      'Under Target resources: select "All cloud apps".',
      'Under Conditions > Client apps: check "Exchange ActiveSync clients" and "Other clients".',
      'Under Access controls > Grant: select "Block Access".',
      'Set the policy to "Report-only" first. Monitor sign-in logs for impact.',
      'After confirming no legitimate users are affected, switch to "On".',
    ],
    adminPortalUrl: CA_PORTAL,
    powershell: `Connect-MgGraph -Scopes "Policy.ReadWrite.ConditionalAccess"
New-MgIdentityConditionalAccessPolicy -BodyParameter @{
  displayName = "CA001-Block-Legacy-Auth"
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
    estimatedImpact: 'High - May block users on older email clients (Outlook 2010 and earlier)',
  },

  // ===== MS.AAD.2.x - Risk-Based Policies =====
  {
    controlId: 'MS.AAD.2.1v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access > Policies.',
      'Click "+ New policy".',
      'Name the policy (e.g., "CA002-Block-High-Risk-Users").',
      'Under Users: select "All users". Exclude break-glass accounts.',
      'Under Conditions > User risk: select "High".',
      'Under Access controls > Grant: select "Block Access".',
      'Set the policy to "Report-only" first, then enable after validation.',
    ],
    adminPortalUrl: CA_PORTAL,
    powershell: `Connect-MgGraph -Scopes "Policy.ReadWrite.ConditionalAccess"
New-MgIdentityConditionalAccessPolicy -BodyParameter @{
  displayName = "CA002-Block-High-Risk-Users"
  state = "enabledForReportingButNotEnforced"
  conditions = @{
    userRiskLevels = @("high")
    users = @{ includeUsers = @("All") }
    applications = @{ includeApplications = @("All") }
  }
  grantControls = @{
    operator = "OR"
    builtInControls = @("block")
  }
}`,
    estimatedImpact: 'Medium - Only affects users flagged as high risk by Identity Protection',
  },
  {
    controlId: 'MS.AAD.2.3v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access > Policies.',
      'Click "+ New policy".',
      'Name the policy (e.g., "CA003-Block-High-Risk-SignIns").',
      'Under Users: select "All users". Exclude break-glass accounts.',
      'Under Conditions > Sign-in risk: select "High".',
      'Under Access controls > Grant: select "Block Access".',
      'Set the policy to "Report-only" first, then enable after validation.',
    ],
    adminPortalUrl: CA_PORTAL,
    powershell: `Connect-MgGraph -Scopes "Policy.ReadWrite.ConditionalAccess"
New-MgIdentityConditionalAccessPolicy -BodyParameter @{
  displayName = "CA003-Block-High-Risk-SignIns"
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
    estimatedImpact: 'Medium - Only affects sign-ins flagged as high risk',
  },

  // ===== MS.AAD.3.x - Multi-Factor Authentication =====
  {
    controlId: 'MS.AAD.3.1v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access > Policies.',
      'Click "+ New policy".',
      'Name the policy (e.g., "CA004-Require-Phishing-Resistant-MFA").',
      'Under Users: select "All users". Exclude break-glass accounts.',
      'Under Target resources: select "All cloud apps".',
      'Under Access controls > Grant: select "Require authentication strength" and choose "Phishing-resistant MFA".',
      'Set to "Report-only" first. Review sign-in logs to confirm users have registered phishing-resistant methods.',
      'Enable the policy once users have enrolled FIDO2 keys or Windows Hello for Business.',
    ],
    adminPortalUrl: CA_PORTAL,
    powershell: `Connect-MgGraph -Scopes "Policy.ReadWrite.ConditionalAccess"
# First, get the built-in Phishing-resistant MFA authentication strength ID
$strengths = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/authenticationStrength/policies"
$prMfa = $strengths.value | Where-Object { $_.displayName -eq "Phishing-resistant MFA" }
New-MgIdentityConditionalAccessPolicy -BodyParameter @{
  displayName = "CA004-Require-Phishing-Resistant-MFA"
  state = "enabledForReportingButNotEnforced"
  conditions = @{
    users = @{ includeUsers = @("All") }
    applications = @{ includeApplications = @("All") }
  }
  grantControls = @{
    operator = "OR"
    authenticationStrength = @{ id = $prMfa.id }
  }
}`,
    estimatedImpact: 'High - Requires all users to have phishing-resistant MFA methods enrolled',
  },
  {
    controlId: 'MS.AAD.3.2v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Protection > Authentication methods > Policies.',
      'Ensure at least one approved MFA method is enabled (Microsoft Authenticator, FIDO2 security keys, or Windows Hello).',
      'Under Microsoft Authenticator: set "Enable" to Yes and configure target users.',
      'Verify users are registered by checking the Authentication methods activity report.',
    ],
    adminPortalUrl: AUTH_METHODS_PORTAL,
    estimatedImpact: 'Low - Enables approved authentication methods for registration',
  },
  {
    controlId: 'MS.AAD.3.3v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access > Policies.',
      'Create or edit a CA policy that requires MFA for all users on all cloud apps.',
      'Under Access controls > Grant: select "Require multifactor authentication".',
      'Ensure this policy targets all users (excluding break-glass accounts).',
      'Set to "Report-only" first, then enable after confirming impact.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Medium - Enforces MFA for all sign-ins',
  },
  {
    controlId: 'MS.AAD.3.4v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Protection > Authentication methods > Settings.',
      'Under "Manage Migration", verify the state is set to "Migration Complete".',
      'If not, review the migration guide and transition from legacy MFA/SSPR policies to Authentication methods policies.',
      'Once all methods are configured under Authentication methods, set migration to "Migration Complete".',
    ],
    adminPortalUrl: AUTH_METHODS_PORTAL,
    estimatedImpact: 'Low - Administrative change that consolidates MFA policy management',
  },
  {
    controlId: 'MS.AAD.3.5v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Protection > Authentication methods > Policies.',
      'Click on "SMS" and set "Enable" to No.',
      'Click on "Voice call" and set "Enable" to No.',
      'Ensure users have alternative MFA methods available before disabling SMS/Voice.',
    ],
    adminPortalUrl: AUTH_METHODS_PORTAL,
    powershell: `Connect-MgGraph -Scopes "Policy.ReadWrite.AuthenticationMethod"
# Disable SMS authentication method
Update-MgPolicyAuthenticationMethodPolicyAuthenticationMethodConfiguration \
  -AuthenticationMethodConfigurationId "Sms" \
  -State "disabled"
# Disable Voice authentication method
Update-MgPolicyAuthenticationMethodPolicyAuthenticationMethodConfiguration \
  -AuthenticationMethodConfigurationId "Voice" \
  -State "disabled"`,
    estimatedImpact: 'High - Users relying on SMS/Voice MFA must switch to another method first',
  },
  {
    controlId: 'MS.AAD.3.6v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access > Policies.',
      'Create a CA policy targeting privileged directory roles (Global Administrator, Privileged Role Administrator, etc.).',
      'Under Access controls > Grant: select "Require authentication strength" and choose "Phishing-resistant MFA".',
      'Set to "Report-only", verify privileged users have enrolled FIDO2 or Windows Hello, then enable.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Medium - Only affects highly privileged role holders',
  },
  {
    controlId: 'MS.AAD.3.7v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access > Policies.',
      'Create or edit a CA policy.',
      'Under Access controls > Grant: select "Require device to be marked as compliant".',
      'Ensure devices are enrolled in Intune and marked compliant before enabling.',
      'WARNING: Do NOT enable this policy until compliant devices are confirmed. This can lock out all users.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'High - Can lock out users whose devices are not enrolled or compliant in Intune',
  },
  {
    controlId: 'MS.AAD.3.8v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Protection > Conditional Access > Policies.',
      'Create a CA policy targeting the "Register security information" user action.',
      'Under Conditions: optionally limit to untrusted locations.',
      'Under Access controls > Grant: select "Require device to be marked as compliant".',
      'This ensures MFA registration can only happen from managed devices.',
    ],
    adminPortalUrl: CA_PORTAL,
    estimatedImpact: 'Medium - Prevents MFA registration from unmanaged devices',
  },

  // ===== MS.AAD.4.x - Logging =====
  {
    controlId: 'MS.AAD.4.1v1',
    steps: [
      'This is an organizational/advisory control. Verify with your security team.',
      'Confirm that your organization has a SIEM or log aggregation service configured.',
      'Navigate to Microsoft Entra admin center > Monitoring & Health > Diagnostic settings.',
      'Configure diagnostic settings to export SignInLogs, AuditLogs, and NonInteractiveUserSignInLogs to your SIEM.',
      'Verify logs are flowing to the SIEM and set up alerting as appropriate.',
    ],
    adminPortalUrl: 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/DiagnosticSettingsMenuBlade',
    estimatedImpact: 'Low - Logging configuration only; no user-facing impact',
    notes: 'Advisory control - SIEM integration is an organizational decision. Ensure log export is configured.',
  },

  // ===== MS.AAD.5.x - Application Consent & Registration =====
  {
    controlId: 'MS.AAD.5.1v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Identity > Users > User settings.',
      'Set "Users can register applications" to "No".',
      'This ensures only administrators can create app registrations.',
    ],
    adminPortalUrl: USER_SETTINGS_PORTAL,
    powershell: `Connect-MgGraph -Scopes "Policy.ReadWrite.Authorization"
Update-MgPolicyAuthorizationPolicy -DefaultUserRolePermissions @{
  allowedToCreateApps = $false
}`,
    estimatedImpact: 'Low - Only affects users who were creating app registrations; admins can still register apps',
  },
  {
    controlId: 'MS.AAD.5.2v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Identity > Applications > Enterprise applications > Consent and permissions > User consent settings.',
      'Select "Do not allow user consent".',
      'This forces all application consent through the admin consent workflow.',
    ],
    adminPortalUrl: CONSENT_PORTAL,
    powershell: `Connect-MgGraph -Scopes "Policy.ReadWrite.Authorization"
Update-MgPolicyAuthorizationPolicy -DefaultUserRolePermissions @{
  permissionGrantPoliciesAssigned = @()
}`,
    estimatedImpact: 'Medium - Users will need to request admin approval for any new app permissions',
  },
  {
    controlId: 'MS.AAD.5.3v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Identity > Applications > Enterprise applications > Consent and permissions > Admin consent settings.',
      'Set "Users can request admin consent to apps they are unable to consent to" to "Yes".',
      'Add designated reviewers (admins who will approve/deny requests).',
      'Set consent request expiry to an appropriate number of days.',
    ],
    adminPortalUrl: CONSENT_PORTAL,
    estimatedImpact: 'Low - Enables structured request workflow; no disruption to existing access',
  },
  {
    controlId: 'MS.AAD.5.4v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Identity > Applications > Enterprise applications > Consent and permissions > User consent settings.',
      'Under "Group owner consent for apps accessing data", select "Do not allow group owner consent".',
      'This prevents group owners from granting consent on behalf of the group.',
    ],
    adminPortalUrl: CONSENT_PORTAL,
    estimatedImpact: 'Low - Restricts a rarely used consent path',
  },

  // ===== MS.AAD.6.x - Passwords =====
  {
    controlId: 'MS.AAD.6.1v1',
    steps: [
      'Navigate to Microsoft 365 admin center > Settings > Org settings > Security & privacy > Password expiration policy.',
      'Uncheck "Set passwords to never expire"... wait, check the box: "Set user passwords to expire after a number of days" should be UNCHECKED.',
      'Alternatively: ensure "Set passwords to never expire" is the active policy.',
      'This follows NIST 800-63B guidance: do not force periodic password changes.',
    ],
    adminPortalUrl: PASSWORD_PORTAL,
    powershell: `Connect-MgGraph -Scopes "Domain.ReadWrite.All"
# Get all domains
$domains = Get-MgDomain
foreach ($domain in $domains) {
  Update-MgDomain -DomainId $domain.Id -PasswordValidityPeriodInDays 2147483647
}`,
    estimatedImpact: 'Low - Removes forced password rotation; improves user experience per NIST guidance',
  },

  // ===== MS.AAD.7.x - Privileged Roles & PIM =====
  {
    controlId: 'MS.AAD.7.1v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Identity > Roles and administrators > Global Administrator.',
      'Review the current list of Global Administrators.',
      'Ensure there are at least 2 and no more than 8 users assigned.',
      'Remove excess Global Admins by assigning them more targeted roles (e.g., User Administrator, Security Administrator).',
      'Ensure at least 2 break-glass accounts remain.',
    ],
    adminPortalUrl: ROLES_PORTAL,
    estimatedImpact: 'Medium - Reducing Global Admin count may require role reassignment planning',
  },
  {
    controlId: 'MS.AAD.7.2v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Identity Governance > Privileged Identity Management > Entra roles.',
      'For each highly privileged role (Global Admin, Privileged Role Admin, Exchange Admin, SharePoint Admin, Security Admin):',
      'Click the role > Add assignments > Select members > Set assignment type to "Eligible" (not "Active").',
      'Remove any permanent active assignments and convert them to eligible.',
    ],
    adminPortalUrl: PIM_PORTAL,
    estimatedImpact: 'Medium - Admins must activate roles via PIM before performing privileged actions',
  },
  {
    controlId: 'MS.AAD.7.3v1',
    steps: [
      'This is an organizational/advisory control. Verify with your security team.',
      'Navigate to PIM > Entra roles > Settings > Global Administrator.',
      'Under "Activation" > "Require approval to activate": set to Yes.',
      'Add designated approvers.',
      'Note: This requires PIM P2 licensing and organizational approval workflow.',
    ],
    adminPortalUrl: PIM_PORTAL,
    estimatedImpact: 'Medium - Adds approval gate before Global Admin activation',
    notes: 'Advisory control - requires organizational policy decision on approval workflow.',
  },
  {
    controlId: 'MS.AAD.7.4v1',
    steps: [
      'This is an organizational/advisory control. Verify with your security team.',
      'Establish a monthly review process for privileged role assignments.',
      'Navigate to PIM > Entra roles > Review access to create access reviews.',
      'Configure reviews for Global Administrator, Privileged Role Administrator, and other critical roles.',
      'Assign reviewers and set the review to recur monthly.',
    ],
    adminPortalUrl: PIM_PORTAL,
    estimatedImpact: 'Low - Process change for role governance',
    notes: 'Advisory control - monthly audit cadence is an organizational requirement.',
  },
  {
    controlId: 'MS.AAD.7.5v1',
    steps: [
      'Navigate to PIM > Entra roles > Settings.',
      'For each highly privileged role, click Settings.',
      'Under "Assignment" tab: set "Allow permanent active assignment" to No.',
      'Set maximum active assignment duration (recommended: 8 hours).',
      'Convert existing permanent active assignments to eligible assignments.',
    ],
    adminPortalUrl: PIM_PORTAL,
    estimatedImpact: 'Medium - Permanent admins must switch to time-limited activations',
  },
  {
    controlId: 'MS.AAD.7.6v1',
    steps: [
      'This is an organizational/advisory control. Verify with your security team.',
      'Navigate to PIM > Entra roles > Settings.',
      'For each highly privileged role, click Settings.',
      'Under "Activation" tab: set "On activation, require" to "Azure MFA".',
      'This ensures MFA is required every time a privileged role is activated.',
    ],
    adminPortalUrl: PIM_PORTAL,
    estimatedImpact: 'Low - Adds MFA step to role activation; minimal friction for admins',
    notes: 'Advisory control - PIM activation MFA configuration.',
  },
  {
    controlId: 'MS.AAD.7.7v1',
    steps: [
      'Review all privileged role assignments in Entra admin center > Roles and administrators.',
      'Identify any assignments made directly (outside of PIM).',
      'Remove direct active assignments and re-create them as eligible assignments in PIM.',
      'Establish a policy that all privileged role provisioning must go through PIM.',
    ],
    adminPortalUrl: PIM_PORTAL,
    estimatedImpact: 'Medium - Requires migrating existing direct role assignments to PIM',
  },
  {
    controlId: 'MS.AAD.7.8v1',
    steps: [
      'This is an organizational/advisory control. Verify with your security team.',
      'Navigate to PIM > Entra roles > Settings > Global Administrator.',
      'Under "Notification" tab: configure email notifications for role activation.',
      'Add security team email addresses to receive alerts when privileged roles are activated.',
      'Consider integrating with your SIEM for real-time alerting.',
    ],
    adminPortalUrl: PIM_PORTAL,
    estimatedImpact: 'Low - Notification configuration only; no user-facing impact',
    notes: 'Advisory control - notification configuration is an organizational decision.',
  },
  {
    controlId: 'MS.AAD.7.9v1',
    steps: [
      'This is an organizational/advisory control. Verify with your security team.',
      'Navigate to PIM > Entra roles > Settings > Global Administrator.',
      'Under "Activation" tab: set "Require approval to activate" to Yes.',
      'Add designated approvers (should be different from the activating user).',
      'Test the approval workflow with a non-production account.',
    ],
    adminPortalUrl: PIM_PORTAL,
    estimatedImpact: 'Medium - Adds approval gate; may slow emergency response if approvers are unavailable',
    notes: 'Advisory control - approval workflow for Global Admin activation.',
  },

  // ===== MS.AAD.8.x - Guest Access =====
  {
    controlId: 'MS.AAD.8.1v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Identity > External Identities > External collaboration settings.',
      'Under "Guest user access restrictions": select "Guest users have limited access to properties and memberships of directory objects".',
      'This prevents guest users from enumerating the directory.',
    ],
    adminPortalUrl: EXTERNAL_ID_PORTAL,
    estimatedImpact: 'Low - Restricts guest visibility into directory objects; guests retain access to resources shared with them',
  },
  {
    controlId: 'MS.AAD.8.2v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Identity > External Identities > External collaboration settings.',
      'Under "Guest invite restrictions": select "Only users assigned to specific admin roles can invite guest users".',
      'This limits guest invitations to Guest Inviter role, User Administrator, and Global Administrator.',
    ],
    adminPortalUrl: EXTERNAL_ID_PORTAL,
    powershell: `Connect-MgGraph -Scopes "Policy.ReadWrite.Authorization"
Update-MgPolicyAuthorizationPolicy -AllowInvitesFrom "adminsAndGuestInviters"`,
    estimatedImpact: 'Medium - Regular users can no longer send guest invitations; must request through an admin',
  },
  {
    controlId: 'MS.AAD.8.3v1',
    steps: [
      'Navigate to Microsoft Entra admin center > Identity > External Identities > External collaboration settings.',
      'Under "Guest user access restrictions": select the most restrictive option appropriate for your organization.',
      'Recommended: "Guest user access is restricted to properties and memberships of their own directory objects".',
      'Review guest users periodically and remove stale guest accounts.',
    ],
    adminPortalUrl: EXTERNAL_ID_PORTAL,
    estimatedImpact: 'Low - Further restricts guest directory visibility',
  },
];

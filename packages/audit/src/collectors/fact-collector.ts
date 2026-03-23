/**
 * Fact Collector -- orchestrates all area collectors to produce a complete AuditFacts snapshot.
 *
 * Pipeline:
 * 1. Batch 1: 12 independent Graph endpoints via $batch
 * 2. Parse batch 1 results into area facts
 * 3. Extract Global Administrator role ID from batch 1
 * 4. Batch 2: dependent calls (GA members) via $batch
 * 5. Standalone calls: MFA registration (paginated -- PITFALL 7), PIM (beta -- PITFALL 2),
 *    sensitivity labels (beta -- PITFALL 3)
 * 6. Return complete AuditFacts snapshot
 */

import type { Client } from '@microsoft/microsoft-graph-client';
import type { AuditFacts } from '../types.js';
import { createEmptyFacts } from '../types.js';
import { executeBatch, type BatchRequest } from './batch-helper.js';
import { parseOrganization } from './areas/organization.js';
import { parseConditionalAccess } from './areas/conditional-access.js';
import { parseAuthenticationMethods } from './areas/authentication-methods.js';
import { parseAuthorizationPolicy } from './areas/authorization-policy.js';
import { parseDirectoryRoles } from './areas/directory-roles.js';
import { parseSecurityDefaults } from './areas/security-defaults.js';
import { parseDevices } from './areas/devices.js';
import { parseLicenses } from './areas/licenses.js';
import { parseDomains } from './areas/domains.js';
import { parsePimRoles } from './areas/pim-roles.js';
import { parseAppRegistrations } from './areas/app-registrations.js';
import { parseSensitivityLabels } from './areas/sensitivity-labels.js';

/**
 * Collect all tenant configuration facts from Microsoft Graph API.
 * Uses $batch for efficiency and handles individual endpoint failures gracefully.
 *
 * @param client - Authenticated Microsoft Graph Client
 * @param progressFn - Optional callback for progress updates
 * @returns Complete AuditFacts snapshot
 */
export async function collectFacts(
  client: Client,
  progressFn?: (msg: string) => void,
): Promise<AuditFacts> {
  const facts = createEmptyFacts();
  const progress = progressFn ?? (() => {});

  // =====================================================================
  // Batch 1: Independent Graph endpoints (12 requests)
  // =====================================================================
  progress('Collecting tenant configuration...');

  const batch1Requests: BatchRequest[] = [
    { id: 'organization', url: '/organization?$select=id,displayName,verifiedDomains' },
    {
      id: 'conditionalAccess',
      url: '/identity/conditionalAccess/policies?$select=id,displayName,state,conditions,grantControls,sessionControls&$top=100',
    },
    {
      id: 'namedLocations',
      url: '/identity/conditionalAccess/namedLocations?$select=id,displayName,isTrusted&$top=100',
    },
    { id: 'authMethodsPolicy', url: '/policies/authenticationMethodsPolicy' },
    { id: 'authorizationPolicy', url: '/policies/authorizationPolicy' },
    { id: 'adminConsentPolicy', url: '/policies/adminConsentRequestPolicy' },
    { id: 'securityDefaults', url: '/policies/identitySecurityDefaultsEnforcementPolicy' },
    { id: 'directoryRoles', url: '/directoryRoles?$select=id,displayName' },
    { id: 'subscribedSkus', url: '/subscribedSkus' },
    {
      id: 'domains',
      url: '/domains?$select=id,isDefault,isVerified,passwordValidityPeriodInDays,passwordNotificationWindowInDays',
    },
    { id: 'devices', url: '/deviceManagement/managedDevices?$select=id,complianceState&$top=999' },
    { id: 'applications', url: '/applications?$top=1&$count=true&$select=id' },
  ];

  const batch1Results = await executeBatch(client, batch1Requests);

  // Parse batch 1 results
  facts.organization = parseOrganization(batch1Results.get('organization'));
  facts.conditionalAccess = parseConditionalAccess(batch1Results.get('conditionalAccess'));

  // Named locations
  const namedLocData = batch1Results.get('namedLocations') as
    | { value?: Array<{ id: string; displayName: string; isTrusted: boolean }> }
    | undefined;
  if (namedLocData && !('error' in namedLocData)) {
    facts.namedLocations = {
      available: true,
      totalLocations: namedLocData.value?.length ?? 0,
      locations: (namedLocData.value ?? []).map((l) => ({
        id: l.id,
        displayName: l.displayName,
        isTrusted: l.isTrusted,
      })),
    };
  }

  // Auth methods (batch result only; MFA registration is standalone below)
  const { authMethods } = parseAuthenticationMethods(
    batch1Results.get('authMethodsPolicy'),
    null,
  );
  facts.authMethods = authMethods;

  // Authorization policy + admin consent
  const { authorizationPolicy, adminConsentPolicy } = parseAuthorizationPolicy(
    batch1Results.get('authorizationPolicy'),
    batch1Results.get('adminConsentPolicy'),
  );
  facts.authorizationPolicy = authorizationPolicy;
  facts.adminConsentPolicy = adminConsentPolicy;

  facts.securityDefaults = parseSecurityDefaults(batch1Results.get('securityDefaults'));
  facts.devices = parseDevices(batch1Results.get('devices'));
  facts.licenses = parseLicenses(batch1Results.get('subscribedSkus'));
  facts.appRegistrations = parseAppRegistrations(batch1Results.get('applications'));

  // Domains + password policy
  const { domains, passwordPolicy } = parseDomains(batch1Results.get('domains'));
  facts.domains = domains;
  facts.passwordPolicy = passwordPolicy;

  // Extract Global Administrator role ID for batch 2
  const directoryRolesData = batch1Results.get('directoryRoles');

  // =====================================================================
  // Batch 2: Dependent calls (require results from batch 1)
  // =====================================================================
  progress('Collecting user and device data...');

  // Get GA role ID from batch 1 directory roles
  let gaRoleId: string | null = null;
  if (directoryRolesData && !('error' in (directoryRolesData as object))) {
    const roles = directoryRolesData as { value?: Array<{ id: string; displayName: string }> };
    const gaRole = roles.value?.find((r) => r.displayName === 'Global Administrator');
    gaRoleId = gaRole?.id ?? null;
  }

  // Batch 2: GA members (depends on role ID from batch 1)
  if (gaRoleId) {
    const batch2Requests: BatchRequest[] = [
      {
        id: 'globalAdminMembers',
        url: `/directoryRoles/${gaRoleId}/members?$select=id,displayName&$top=100`,
      },
    ];

    const batch2Results = await executeBatch(client, batch2Requests);
    facts.adminRoles = parseDirectoryRoles(directoryRolesData, batch2Results.get('globalAdminMembers'));
  } else {
    facts.adminRoles = parseDirectoryRoles(directoryRolesData, null);
  }

  // =====================================================================
  // Standalone calls: MFA registration, PIM, sensitivity labels
  // These cannot be batched (different API versions or pagination)
  // =====================================================================
  progress('Collecting authentication and role data...');

  // MFA registration details -- standalone paginated call (PITFALL 7)
  try {
    const allMfaUsers: Array<{ id: string; isMfaRegistered: boolean; userPrincipalName?: string }> =
      [];
    let mfaUrl: string | null =
      '/reports/authenticationMethods/userRegistrationDetails?$top=100';

    while (mfaUrl) {
      const mfaPage = (await client.api(mfaUrl).get()) as {
        value?: Array<{ id: string; isMfaRegistered: boolean; userPrincipalName?: string }>;
        '@odata.nextLink'?: string;
      };
      if (mfaPage.value) {
        allMfaUsers.push(...mfaPage.value);
      }
      // Follow pagination
      mfaUrl = mfaPage['@odata.nextLink'] ?? null;
    }

    const { mfa } = parseAuthenticationMethods(batch1Results.get('authMethodsPolicy'), {
      value: allMfaUsers,
    });
    facts.mfa = mfa;
  } catch {
    facts.mfa = {
      available: false,
      totalUsers: 0,
      registeredUsers: 0,
      percentage: 0,
      error: 'Failed to retrieve MFA registration details.',
    };
  }

  // PIM role assignments -- standalone beta calls (PITFALL 2: requires P2)
  try {
    const eligibilityData = await client
      .api('/roleManagement/directory/roleEligibilityScheduleInstances?$top=200&$select=id')
      .get();
    let assignmentData;
    try {
      assignmentData = await client
        .api(
          '/roleManagement/directory/roleAssignmentScheduleInstances?$top=200&$select=id,assignmentType',
        )
        .get();
    } catch {
      assignmentData = { error: true, status: 403, message: 'PIM assignment endpoint failed' };
    }
    facts.roleAssignments = parsePimRoles(eligibilityData, assignmentData);
  } catch (err) {
    facts.roleAssignments = {
      available: false,
      totalAssignments: 0,
      eligibleAssignments: 0,
      activeAssignments: 0,
      error:
        err instanceof Error
          ? `PIM not available: ${err.message}`
          : 'PIM endpoints require Entra ID P2 licensing.',
    };
  }

  // Sensitivity labels -- standalone beta call (PITFALL 3: beta endpoint, cannot batch with v1.0)
  try {
    const labelsData = await client
      .api('/security/informationProtection/sensitivityLabels?$top=100&$select=id,name')
      .version('beta')
      .get();
    facts.sensitivityLabels = parseSensitivityLabels(labelsData);
  } catch (err) {
    facts.sensitivityLabels = {
      available: false,
      totalLabels: 0,
      error:
        err instanceof Error
          ? `Sensitivity labels not available: ${err.message}`
          : 'Failed to retrieve sensitivity labels.',
    };
  }

  progress('Collection complete.');
  return facts;
}

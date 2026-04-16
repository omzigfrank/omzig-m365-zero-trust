/**
 * Area recollector -- Phase 8 Plan 01.
 *
 * Re-collects a single AuditFacts area via direct GET calls (not batch)
 * and parses with the matching area parser. Used by the drift poller
 * to verify detected changes against the stored baseline.
 *
 * Rate limit errors (429) throw a typed GraphThrottledError so the
 * poller can skip the tenant for the current cycle.
 */

import type { Client } from '@microsoft/microsoft-graph-client';
import type { AuditFacts } from '../types.js';
import { parseConditionalAccess } from '../collectors/areas/conditional-access.js';
import { parseSecurityDefaults } from '../collectors/areas/security-defaults.js';
import { parseAuthenticationMethods } from '../collectors/areas/authentication-methods.js';
import { parseAuthorizationPolicy } from '../collectors/areas/authorization-policy.js';
import { parseDirectoryRoles } from '../collectors/areas/directory-roles.js';
import { parseDevices } from '../collectors/areas/devices.js';
import { parseDomains } from '../collectors/areas/domains.js';
import { parsePimRoles } from '../collectors/areas/pim-roles.js';
import { parseAppRegistrations } from '../collectors/areas/app-registrations.js';
import {
  GraphThrottledError,
  AreaRecollectionNotSupported,
} from './types.js';

/**
 * Areas that are NOT monitored by drift detection.
 * These areas either lack audit log activity types or are not
 * security-relevant for near-real-time monitoring.
 */
const UNSUPPORTED_AREAS = new Set<string>([
  'organization',
  'licenses',
  'mfa',
  'sensitivityLabels',
  'domains',
  'breakGlass',
  'adminConsentPolicy',
]);

/**
 * Re-collect a single AuditFacts area using direct GET calls.
 * Uses the same area parsers as the full fact-collector pipeline.
 *
 * @throws GraphThrottledError if the Graph API returns 429
 * @throws AreaRecollectionNotSupported for non-monitored areas
 */
export async function collectSingleArea(
  client: Client,
  area: keyof AuditFacts,
): Promise<unknown> {
  if (UNSUPPORTED_AREAS.has(area)) {
    throw new AreaRecollectionNotSupported(area);
  }

  try {
    switch (area) {
      case 'conditionalAccess': {
        const data = await client
          .api('/identity/conditionalAccess/policies')
          .select('id,displayName,state,conditions,grantControls,sessionControls')
          .top(100)
          .get();
        return parseConditionalAccess(data);
      }

      case 'securityDefaults': {
        const data = await client
          .api('/policies/identitySecurityDefaultsEnforcementPolicy')
          .get();
        return parseSecurityDefaults(data);
      }

      case 'authMethods': {
        const data = await client
          .api('/policies/authenticationMethodsPolicy')
          .get();
        // parseAuthenticationMethods expects (authMethodsData, mfaData).
        // For drift detection we only re-collect the policy, not per-user MFA.
        const { authMethods } = parseAuthenticationMethods(data, null);
        return authMethods;
      }

      case 'authorizationPolicy': {
        const authzData = await client
          .api('/policies/authorizationPolicy')
          .get();
        const { authorizationPolicy } = parseAuthorizationPolicy(authzData);
        return authorizationPolicy;
      }

      case 'adminRoles': {
        // Two calls: roles list then GA members
        const rolesData = await client
          .api('/directoryRoles')
          .select('id,displayName')
          .top(100)
          .get();

        // Find Global Administrator role ID to query members
        const roles = (rolesData as { value?: Array<{ id: string; displayName: string }> })
          .value ?? [];
        const gaRole = roles.find((r) => r.displayName === 'Global Administrator');

        let gaMembersData: unknown = null;
        if (gaRole) {
          gaMembersData = await client
            .api(`/directoryRoles/${gaRole.id}/members`)
            .get();
        }

        return parseDirectoryRoles(rolesData, gaMembersData);
      }

      case 'roleAssignments': {
        // PIM beta endpoints
        const eligibilityData = await client
          .api('/roleManagement/directory/roleEligibilityScheduleInstances')
          .get();
        const assignmentData = await client
          .api('/roleManagement/directory/roleAssignmentScheduleInstances')
          .get();
        return parsePimRoles(eligibilityData, assignmentData);
      }

      case 'appRegistrations': {
        const data = await client
          .api('/applications')
          .header('ConsistencyLevel', 'eventual')
          .top(100)
          .get();
        return parseAppRegistrations(data);
      }

      case 'passwordPolicy': {
        const data = await client
          .api('/domains')
          .select('id,isDefault,isVerified,passwordValidityPeriodInDays,passwordNotificationWindowInDays')
          .get();
        const { passwordPolicy } = parseDomains(data);
        return passwordPolicy;
      }

      case 'namedLocations': {
        const data = await client
          .api('/identity/conditionalAccess/namedLocations')
          .top(100)
          .get();
        // namedLocations uses the same collection shape; parse manually
        const locations = ((data as { value?: unknown[] }).value ?? []) as Array<{
          id: string;
          displayName: string;
          isTrusted?: boolean;
        }>;
        return {
          available: true,
          totalLocations: locations.length,
          locations: locations.map((l) => ({
            id: l.id,
            displayName: l.displayName,
            isTrusted: l.isTrusted ?? false,
          })),
        };
      }

      case 'devices': {
        const data = await client
          .api('/deviceManagement/managedDevices')
          .select('id,deviceName,complianceState')
          .top(100)
          .get();
        return parseDevices(data);
      }

      default:
        throw new AreaRecollectionNotSupported(area);
    }
  } catch (err) {
    // Handle Graph 429 throttling
    if (err instanceof GraphThrottledError) throw err;
    if (err instanceof AreaRecollectionNotSupported) throw err;

    const errAny = err as { statusCode?: number; headers?: Record<string, string> };
    if (errAny.statusCode === 429) {
      const retryAfter = parseInt(errAny.headers?.['retry-after'] ?? '60', 10);
      throw new GraphThrottledError(retryAfter);
    }

    throw err;
  }
}

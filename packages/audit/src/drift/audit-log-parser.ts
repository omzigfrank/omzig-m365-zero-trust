/**
 * Audit log parser -- Phase 8 Plan 01.
 *
 * Parses Microsoft Graph directoryAudit events and maps each
 * activityDisplayName to the corresponding AuditFacts area key.
 * Filters out non-success events and unmapped activity types,
 * deduplicates by area, and extracts actor UPN.
 */

import type { AuditFacts } from '../types.js';
import type { DirectoryAuditEvent, DriftEvent } from './types.js';

/**
 * Mapping of Graph directoryAudit activityDisplayName strings to AuditFacts area keys.
 * 18 activity types covering 10 monitored areas.
 * Source: CONTEXT.md activity type table + Microsoft Learn audit activity reference.
 */
export const ACTIVITY_TO_AREA: Record<string, keyof AuditFacts> = {
  // Conditional Access (category: Policy, service: Conditional Access)
  'Add conditional access policy': 'conditionalAccess',
  'Update conditional access policy': 'conditionalAccess',
  'Delete conditional access policy': 'conditionalAccess',
  // Named Locations (category: Policy, service: Conditional Access)
  'Add named location': 'namedLocations',
  'Update named location': 'namedLocations',
  'Delete named location': 'namedLocations',
  // Security Defaults (category: Policy, service: Conditional Access)
  'Update security defaults': 'securityDefaults',
  // Auth Methods (category: ApplicationManagement, service: Authentication Methods)
  'Authentication Methods Policy Update': 'authMethods',
  // Authorization Policy (category: AuthorizationPolicy, service: Core Directory)
  'Update authorization policy': 'authorizationPolicy',
  // Role Management (category: RoleManagement, service: Core Directory)
  'Add member to role': 'adminRoles',
  'Remove member from role': 'adminRoles',
  'Add eligible member to role': 'roleAssignments',
  'Remove eligible member from role': 'roleAssignments',
  // Applications (category: ApplicationManagement, service: Core Directory)
  'Add application': 'appRegistrations',
  'Update application': 'appRegistrations',
  'Delete application': 'appRegistrations',
  // Devices (category: Device, service: Core Directory)
  'Update device': 'devices',
  'Device no longer compliant': 'devices',
  // Password Policy (category: DirectoryManagement, service: Core Directory)
  'Set password policy': 'passwordPolicy',
};

/**
 * Parse raw directoryAudit events from the Graph API.
 *
 * 1. Filters to events where result === 'success'.
 * 2. Filters to events whose activityDisplayName is in ACTIVITY_TO_AREA.
 * 3. Maps each to a DriftEvent with area, actor UPN, timestamp.
 * 4. Groups by area name (deduplicates: 3 CA events -> one 'conditionalAccess' key).
 *
 * @returns Both the grouped map (for per-area re-collection) and the flat list.
 */
export function parseAuditLogEvents(
  rawEvents: DirectoryAuditEvent[],
): { areaEvents: Map<string, DriftEvent[]>; allEvents: DriftEvent[] } {
  const allEvents: DriftEvent[] = [];
  const areaEvents = new Map<string, DriftEvent[]>();

  for (const raw of rawEvents) {
    // Filter: only success events
    if (raw.result !== 'success') continue;

    // Filter: only mapped activity types
    const area = ACTIVITY_TO_AREA[raw.activityDisplayName];
    if (!area) continue;

    const event: DriftEvent = {
      eventId: raw.id,
      activityDisplayName: raw.activityDisplayName,
      area,
      actorUpn: raw.initiatedBy?.user?.userPrincipalName ?? null,
      actorAppName: raw.initiatedBy?.app?.displayName ?? null,
      timestamp: new Date(raw.activityDateTime),
      operationType: raw.operationType ?? 'Unknown',
    };

    allEvents.push(event);

    // Group by area
    const existing = areaEvents.get(area);
    if (existing) {
      existing.push(event);
    } else {
      areaEvents.set(area, [event]);
    }
  }

  return { areaEvents, allEvents };
}

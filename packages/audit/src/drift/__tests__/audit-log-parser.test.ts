/**
 * Phase 8 Plan 01 -- audit-log-parser tests.
 * Verifies ACTIVITY_TO_AREA mapping, event filtering, deduplication, and actor extraction.
 */
import { describe, it, expect } from 'vitest';
import { ACTIVITY_TO_AREA, parseAuditLogEvents } from '../audit-log-parser.js';
import type { DirectoryAuditEvent } from '../types.js';

function makeEvent(
  overrides: Partial<DirectoryAuditEvent> = {},
): DirectoryAuditEvent {
  return {
    id: crypto.randomUUID(),
    activityDisplayName: 'Update conditional access policy',
    activityDateTime: new Date().toISOString(),
    category: 'Policy',
    result: 'success',
    initiatedBy: {
      user: {
        userPrincipalName: 'admin@contoso.com',
      },
    },
    ...overrides,
  };
}

describe('ACTIVITY_TO_AREA mapping', () => {
  it('maps "Update conditional access policy" to conditionalAccess', () => {
    expect(ACTIVITY_TO_AREA['Update conditional access policy']).toBe('conditionalAccess');
  });

  it('maps "Add member to role" to adminRoles', () => {
    expect(ACTIVITY_TO_AREA['Add member to role']).toBe('adminRoles');
  });

  it('maps "Delete conditional access policy" to conditionalAccess', () => {
    expect(ACTIVITY_TO_AREA['Delete conditional access policy']).toBe('conditionalAccess');
  });

  it('maps "Set password policy" to passwordPolicy', () => {
    expect(ACTIVITY_TO_AREA['Set password policy']).toBe('passwordPolicy');
  });

  it('maps "Add application" to appRegistrations', () => {
    expect(ACTIVITY_TO_AREA['Add application']).toBe('appRegistrations');
  });

  it('contains 19 activity type mappings', () => {
    // 19 activity types covering 10 monitored AuditFacts areas
    expect(Object.keys(ACTIVITY_TO_AREA).length).toBe(19);
  });
});

describe('parseAuditLogEvents', () => {
  it('filters out events whose activityDisplayName is not in the mapping', () => {
    const events = [
      makeEvent({ activityDisplayName: 'Update conditional access policy' }),
      makeEvent({ activityDisplayName: 'Some unknown activity' }),
    ];
    const { allEvents } = parseAuditLogEvents(events);
    expect(allEvents).toHaveLength(1);
    expect(allEvents[0].activityDisplayName).toBe('Update conditional access policy');
  });

  it('filters out events with result !== success', () => {
    const events = [
      makeEvent({ result: 'success' }),
      makeEvent({ result: 'failure' }),
    ];
    const { allEvents } = parseAuditLogEvents(events);
    expect(allEvents).toHaveLength(1);
  });

  it('deduplicates by area (3 CA events -> 1 unique area key in areaEvents)', () => {
    const events = [
      makeEvent({ activityDisplayName: 'Update conditional access policy' }),
      makeEvent({ activityDisplayName: 'Add conditional access policy' }),
      makeEvent({ activityDisplayName: 'Delete conditional access policy' }),
    ];
    const { areaEvents, allEvents } = parseAuditLogEvents(events);
    expect(allEvents).toHaveLength(3);
    expect(areaEvents.size).toBe(1);
    expect(areaEvents.has('conditionalAccess')).toBe(true);
    expect(areaEvents.get('conditionalAccess')).toHaveLength(3);
  });

  it('extracts actor UPN from initiatedBy.user.userPrincipalName', () => {
    const events = [
      makeEvent({
        initiatedBy: {
          user: { userPrincipalName: 'alice@example.com' },
        },
      }),
    ];
    const { allEvents } = parseAuditLogEvents(events);
    expect(allEvents[0].actorUpn).toBe('alice@example.com');
  });

  it('extracts actor app name when initiated by app', () => {
    const events = [
      makeEvent({
        initiatedBy: {
          app: { displayName: 'Graph Explorer' },
        },
      }),
    ];
    const { allEvents } = parseAuditLogEvents(events);
    expect(allEvents[0].actorUpn).toBeNull();
    expect(allEvents[0].actorAppName).toBe('Graph Explorer');
  });

  it('returns empty map and array when no events match', () => {
    const events = [
      makeEvent({ result: 'failure' }),
      makeEvent({ activityDisplayName: 'Unknown activity' }),
    ];
    const { areaEvents, allEvents } = parseAuditLogEvents(events);
    expect(allEvents).toHaveLength(0);
    expect(areaEvents.size).toBe(0);
  });
});

/**
 * Phase 8 Plan 01 -- diff-engine tests.
 * Verifies array-level item matching by id, scalar area delegation to computeDrift,
 * volatile field exclusion, and human-readable summary generation.
 */
import { describe, it, expect } from 'vitest';
import { diffFactArea } from '../diff-engine.js';

describe('diffFactArea', () => {
  it('returns { drifted: false } when baseline and current areas are identical', () => {
    const baseline = {
      available: true,
      totalPolicies: 1,
      enabledCount: 1,
      reportOnlyCount: 0,
      disabledCount: 0,
      policies: [
        { id: 'p1', displayName: 'Block Legacy Auth', state: 'enabled' },
      ],
    };
    const result = diffFactArea('conditionalAccess', baseline, structuredClone(baseline));
    expect(result.drifted).toBe(false);
    expect(result.structuredDiff.added).toHaveLength(0);
    expect(result.structuredDiff.removed).toHaveLength(0);
    expect(result.structuredDiff.modified).toHaveLength(0);
  });

  it('detects a removed item (policy deleted from conditionalAccess.policies)', () => {
    const baseline = {
      available: true,
      totalPolicies: 2,
      enabledCount: 2,
      reportOnlyCount: 0,
      disabledCount: 0,
      policies: [
        { id: 'p1', displayName: 'Block Legacy Auth', state: 'enabled' },
        { id: 'p2', displayName: 'Require MFA', state: 'enabled' },
      ],
    };
    const current = {
      available: true,
      totalPolicies: 1,
      enabledCount: 1,
      reportOnlyCount: 0,
      disabledCount: 0,
      policies: [
        { id: 'p1', displayName: 'Block Legacy Auth', state: 'enabled' },
      ],
    };
    const result = diffFactArea('conditionalAccess', baseline, current);
    expect(result.drifted).toBe(true);
    expect(result.structuredDiff.removed).toHaveLength(1);
    expect(result.structuredDiff.removed[0].id).toBe('p2');
    expect(result.structuredDiff.removed[0].displayName).toBe('Require MFA');
  });

  it('detects an added item (new policy in conditionalAccess.policies)', () => {
    const baseline = {
      available: true,
      totalPolicies: 1,
      enabledCount: 1,
      reportOnlyCount: 0,
      disabledCount: 0,
      policies: [
        { id: 'p1', displayName: 'Block Legacy Auth', state: 'enabled' },
      ],
    };
    const current = {
      available: true,
      totalPolicies: 2,
      enabledCount: 2,
      reportOnlyCount: 0,
      disabledCount: 0,
      policies: [
        { id: 'p1', displayName: 'Block Legacy Auth', state: 'enabled' },
        { id: 'p3', displayName: 'New Policy', state: 'enabled' },
      ],
    };
    const result = diffFactArea('conditionalAccess', baseline, current);
    expect(result.drifted).toBe(true);
    expect(result.structuredDiff.added).toHaveLength(1);
    expect(result.structuredDiff.added[0].id).toBe('p3');
  });

  it('detects a modified item matched by id (state changed)', () => {
    const baseline = {
      available: true,
      totalPolicies: 1,
      enabledCount: 1,
      reportOnlyCount: 0,
      disabledCount: 0,
      policies: [
        { id: 'p1', displayName: 'Block Legacy Auth', state: 'enabled' },
      ],
    };
    const current = {
      available: true,
      totalPolicies: 1,
      enabledCount: 0,
      reportOnlyCount: 0,
      disabledCount: 1,
      policies: [
        { id: 'p1', displayName: 'Block Legacy Auth', state: 'disabled' },
      ],
    };
    const result = diffFactArea('conditionalAccess', baseline, current);
    expect(result.drifted).toBe(true);
    expect(result.structuredDiff.modified).toHaveLength(1);
    expect(result.structuredDiff.modified[0].id).toBe('p1');
    expect(result.structuredDiff.modified[0].changedFields).toContain('state');
  });

  it('delegates to computeDrift for scalar areas (securityDefaults) and skips volatile fields', () => {
    const baseline = { available: true, enabled: true };
    const current = {
      available: true,
      enabled: false,
      modifiedDateTime: '2026-04-16T00:00:00Z', // volatile -- should be skipped
    };
    const result = diffFactArea('securityDefaults', baseline, current);
    expect(result.drifted).toBe(true);
    expect(result.humanSummary).toContain('securityDefaults');
    expect(result.humanSummary).toContain('enabled');
    // modifiedDateTime should NOT appear in changed fields
    expect(result.humanSummary).not.toContain('modifiedDateTime');
  });

  it('generates a human-readable summary for removed items', () => {
    const baseline = {
      available: true,
      totalPolicies: 1,
      enabledCount: 1,
      reportOnlyCount: 0,
      disabledCount: 0,
      policies: [
        { id: 'p1', displayName: 'Block Legacy Auth', state: 'enabled' },
      ],
    };
    const current = {
      available: true,
      totalPolicies: 0,
      enabledCount: 0,
      reportOnlyCount: 0,
      disabledCount: 0,
      policies: [],
    };
    const result = diffFactArea('conditionalAccess', baseline, current);
    expect(result.humanSummary).toContain('1 item(s) removed');
    expect(result.humanSummary).toContain('Block Legacy Auth');
  });

  it('handles named locations (array area with locations field)', () => {
    const baseline = {
      available: true,
      totalLocations: 1,
      locations: [{ id: 'loc1', displayName: 'Office', isTrusted: true }],
    };
    const current = {
      available: true,
      totalLocations: 2,
      locations: [
        { id: 'loc1', displayName: 'Office', isTrusted: true },
        { id: 'loc2', displayName: 'Remote', isTrusted: false },
      ],
    };
    const result = diffFactArea('namedLocations', baseline, current);
    expect(result.drifted).toBe(true);
    expect(result.structuredDiff.added).toHaveLength(1);
    expect(result.structuredDiff.added[0].id).toBe('loc2');
  });
});

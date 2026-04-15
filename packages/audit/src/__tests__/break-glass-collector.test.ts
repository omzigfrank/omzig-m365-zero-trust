import { describe, it, expect, vi } from 'vitest';
import {
  collectBreakGlass,
  parseBreakGlass,
  type RawBreakGlassResponse,
} from '../collectors/areas/break-glass.js';
import type { ConditionalAccessFacts } from '../types.js';

function makeCaFacts(
  policies: Array<{
    id: string;
    state: string;
    excludeGroups?: string[];
  }>,
): ConditionalAccessFacts {
  return {
    available: true,
    totalPolicies: policies.length,
    enabledCount: policies.filter((p) => p.state === 'enabled').length,
    reportOnlyCount: policies.filter((p) => p.state === 'enabledForReportingButNotEnforced').length,
    disabledCount: policies.filter((p) => p.state === 'disabled').length,
    policies: policies.map((p) => ({
      id: p.id,
      displayName: `Policy ${p.id}`,
      state: p.state,
      conditions: {
        users: {
          includeUsers: ['All'],
          excludeGroups: p.excludeGroups ?? [],
        },
      },
      grantControls: { operator: 'OR', builtInControls: ['block'] },
      sessionControls: null,
    })),
  };
}

describe('parseBreakGlass', () => {
  it('returns available=false with nullish fields when no group found', () => {
    const raw: RawBreakGlassResponse = { found: false };
    const ca = makeCaFacts([]);
    const result = parseBreakGlass(raw, ca);

    expect(result.available).toBe(false);
    expect(result.groupName).toBeNull();
    expect(result.groupId).toBeNull();
    expect(result.memberCount).toBe(0);
    expect(result.excludedFromCaPolicies).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('returns available=true with group fields populated when a match exists', () => {
    const raw: RawBreakGlassResponse = {
      found: true,
      groupName: 'Break-Glass-Admins',
      groupId: 'bg-group-123',
      memberCount: 2,
    };
    const ca = makeCaFacts([]);
    const result = parseBreakGlass(raw, ca);

    expect(result.available).toBe(true);
    expect(result.groupName).toBe('Break-Glass-Admins');
    expect(result.groupId).toBe('bg-group-123');
    expect(result.memberCount).toBe(2);
    expect(result.excludedFromCaPolicies).toBe(false);
  });

  it('sets excludedFromCaPolicies=true when group appears in an enabled CA policy excludeGroups', () => {
    const raw: RawBreakGlassResponse = {
      found: true,
      groupName: 'Break-Glass-Admins',
      groupId: 'bg-group-123',
      memberCount: 2,
    };
    const ca = makeCaFacts([
      { id: 'p1', state: 'enabled', excludeGroups: ['other-group', 'bg-group-123'] },
    ]);
    const result = parseBreakGlass(raw, ca);

    expect(result.excludedFromCaPolicies).toBe(true);
  });

  it('sets excludedFromCaPolicies=false when group is only excluded in a report-only policy', () => {
    const raw: RawBreakGlassResponse = {
      found: true,
      groupName: 'Break-Glass-Admins',
      groupId: 'bg-group-123',
      memberCount: 2,
    };
    const ca = makeCaFacts([
      { id: 'p1', state: 'enabledForReportingButNotEnforced', excludeGroups: ['bg-group-123'] },
    ]);
    const result = parseBreakGlass(raw, ca);

    // Report-only enforcement does not count -- only enabled policies can lock out users.
    expect(result.excludedFromCaPolicies).toBe(false);
  });

  it('sets excludedFromCaPolicies=false when no enabled policy excludes the group', () => {
    const raw: RawBreakGlassResponse = {
      found: true,
      groupName: 'Break-Glass-Admins',
      groupId: 'bg-group-123',
      memberCount: 2,
    };
    const ca = makeCaFacts([
      { id: 'p1', state: 'enabled', excludeGroups: ['unrelated-group'] },
    ]);
    const result = parseBreakGlass(raw, ca);

    expect(result.excludedFromCaPolicies).toBe(false);
  });

  it('returns available=false with error populated when raw contains an error', () => {
    const raw: RawBreakGlassResponse = {
      found: false,
      error: 'Graph API 403 Forbidden',
    };
    const ca = makeCaFacts([]);
    const result = parseBreakGlass(raw, ca);

    expect(result.available).toBe(false);
    expect(result.error).toBe('Graph API 403 Forbidden');
    expect(result.groupId).toBeNull();
  });
});

describe('collectBreakGlass', () => {
  function makeClient(handlers: Record<string, () => unknown>): any {
    return {
      api: (path: string) => ({
        header: (_name: string, _value: string) => ({
          get: vi.fn().mockImplementation(async () => {
            const handler = handlers[path];
            if (!handler) throw new Error(`Unexpected path: ${path}`);
            const result = handler();
            if (result instanceof Error) throw result;
            return result;
          }),
        }),
        get: vi.fn().mockImplementation(async () => {
          const handler = handlers[path];
          if (!handler) throw new Error(`Unexpected path: ${path}`);
          const result = handler();
          if (result instanceof Error) throw result;
          return result;
        }),
      }),
    };
  }

  it('returns found=false when no matching group exists', async () => {
    const filter =
      "startswith(displayName,'Break-Glass') or startswith(displayName,'BreakGlass') or startswith(displayName,'Emergency-Access')";
    const path = `/groups?$filter=${encodeURIComponent(filter)}&$select=id,displayName&$top=5`;
    const client = makeClient({
      [path]: () => ({ value: [] }),
    });

    const result = await collectBreakGlass(client);
    expect(result.found).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('returns found=true with group fields and member count when a match exists', async () => {
    const filter =
      "startswith(displayName,'Break-Glass') or startswith(displayName,'BreakGlass') or startswith(displayName,'Emergency-Access')";
    const groupsPath = `/groups?$filter=${encodeURIComponent(filter)}&$select=id,displayName&$top=5`;
    const countPath = '/groups/bg-id-42/members/$count';
    const client = makeClient({
      [groupsPath]: () => ({
        value: [{ id: 'bg-id-42', displayName: 'Break-Glass-Admins' }],
      }),
      [countPath]: () => 3,
    });

    const result = await collectBreakGlass(client);
    expect(result.found).toBe(true);
    expect(result.groupId).toBe('bg-id-42');
    expect(result.groupName).toBe('Break-Glass-Admins');
    expect(result.memberCount).toBe(3);
  });

  it('returns found=false with error populated when the Graph query throws', async () => {
    const filter =
      "startswith(displayName,'Break-Glass') or startswith(displayName,'BreakGlass') or startswith(displayName,'Emergency-Access')";
    const path = `/groups?$filter=${encodeURIComponent(filter)}&$select=id,displayName&$top=5`;
    const client = makeClient({
      [path]: () => new Error('403 Forbidden'),
    });

    const result = await collectBreakGlass(client);
    expect(result.found).toBe(false);
    expect(result.error).toContain('403');
  });
});

/**
 * Break-glass area collector.
 *
 * Phase 7 Plan 01 addition. Searches the tenant for a conventionally-named
 * break-glass emergency access group (prefix: "Break-Glass", "BreakGlass",
 * or "Emergency-Access"), captures its member count, and reports whether
 * the group is excluded from at least one ENABLED Conditional Access policy.
 *
 * This fact feeds prerequisite checks in CA-policy-creating executors
 * (REMED-07: refuse to deploy a CA policy in a tenant with no break-glass
 * escape hatch).
 *
 * Graph query shape:
 *   GET /groups?$filter=startswith(displayName,'Break-Glass')
 *     or startswith(displayName,'BreakGlass')
 *     or startswith(displayName,'Emergency-Access')
 *     &$select=id,displayName&$top=5
 *   GET /groups/{id}/members/$count   (with ConsistencyLevel: eventual)
 */

import type { Client } from '@microsoft/microsoft-graph-client';
import type { BreakGlassFacts, ConditionalAccessFacts } from '../../types.js';

/**
 * Raw Graph response shape returned by collectBreakGlass().
 * Kept separate from BreakGlassFacts so parseBreakGlass remains a pure
 * function that takes raw responses + the already-parsed CA facts.
 */
export interface RawBreakGlassResponse {
  found: boolean;
  groupName?: string;
  groupId?: string;
  memberCount?: number;
  error?: string;
}

const BREAK_GLASS_PREFIXES = [
  'Break-Glass',
  'BreakGlass',
  'Emergency-Access',
];

/**
 * Issue the Graph queries to discover the break-glass group and its
 * member count. Returns { found: false } if no matching group exists.
 * On Graph API error, returns { found: false, error }.
 */
export async function collectBreakGlass(client: Client): Promise<RawBreakGlassResponse> {
  try {
    const filter = BREAK_GLASS_PREFIXES.map(
      (p) => `startswith(displayName,'${p}')`,
    ).join(' or ');

    const groups = (await client
      .api(`/groups?$filter=${encodeURIComponent(filter)}&$select=id,displayName&$top=5`)
      .get()) as { value?: Array<{ id: string; displayName: string }> };

    const match = groups.value?.[0];
    if (!match) {
      return { found: false };
    }

    // Member count via $count (requires ConsistencyLevel: eventual).
    let memberCount = 0;
    try {
      const countResult = await client
        .api(`/groups/${match.id}/members/$count`)
        .header('ConsistencyLevel', 'eventual')
        .get();
      memberCount = typeof countResult === 'number' ? countResult : parseInt(String(countResult), 10) || 0;
    } catch {
      // Count fetch is best-effort -- preserve the group hit even if count fails.
      memberCount = 0;
    }

    return {
      found: true,
      groupName: match.displayName,
      groupId: match.id,
      memberCount,
    };
  } catch (err) {
    return {
      found: false,
      error: err instanceof Error ? err.message : 'Failed to query break-glass group',
    };
  }
}

/**
 * Pure function: combine the raw break-glass response with the
 * already-parsed ConditionalAccessFacts to produce BreakGlassFacts.
 *
 * excludedFromCaPolicies is true iff the break-glass group ID appears
 * in conditions.users.excludeGroups of at least one ENABLED CA policy.
 * Report-only and disabled policies do NOT count (only enforced
 * exclusions matter for lockout safety).
 */
export function parseBreakGlass(
  raw: RawBreakGlassResponse,
  conditionalAccessFacts: ConditionalAccessFacts,
): BreakGlassFacts {
  if (raw.error) {
    return {
      available: false,
      groupName: null,
      groupId: null,
      memberCount: 0,
      excludedFromCaPolicies: false,
      error: raw.error,
    };
  }

  if (!raw.found) {
    return {
      available: false,
      groupName: null,
      groupId: null,
      memberCount: 0,
      excludedFromCaPolicies: false,
    };
  }

  const groupId = raw.groupId ?? null;
  let excluded = false;

  if (groupId && conditionalAccessFacts.available) {
    for (const policy of conditionalAccessFacts.policies) {
      if (policy.state !== 'enabled') continue;
      const excludeGroups = policy.conditions?.users?.excludeGroups ?? [];
      if (excludeGroups.includes(groupId)) {
        excluded = true;
        break;
      }
    }
  }

  return {
    available: true,
    groupName: raw.groupName ?? null,
    groupId,
    memberCount: raw.memberCount ?? 0,
    excludedFromCaPolicies: excluded,
  };
}

import { describe, it, expect, vi } from 'vitest';
import {
  blockLegacyAuthExecutor,
  blockLegacyAuthRollback,
  blockLegacyAuthValidatePrerequisites,
  BLOCK_LEGACY_AUTH_POLICY_NAME,
} from '../executors/block-legacy-auth.js';
import type { ExecutionContext } from '../types.js';
import { WriteRateLimiter } from '../write-rate-limiter.js';
import { createEmptyFacts } from '../../types.js';

/**
 * Build a mock graph client that records POST / GET / DELETE calls
 * and returns canned responses.
 */
function makeClient(handlers: {
  post?: (url: string, body: unknown) => unknown;
  get?: (url: string) => unknown;
  delete?: (url: string) => unknown;
}): {
  client: any;
  calls: Array<{ method: string; url: string; body?: unknown }>;
} {
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  const client = {
    api: (url: string) => ({
      post: vi.fn().mockImplementation(async (body: unknown) => {
        calls.push({ method: 'POST', url, body });
        return handlers.post ? handlers.post(url, body) : {};
      }),
      get: vi.fn().mockImplementation(async () => {
        calls.push({ method: 'GET', url });
        return handlers.get ? handlers.get(url) : {};
      }),
      delete: vi.fn().mockImplementation(async () => {
        calls.push({ method: 'DELETE', url });
        return handlers.delete ? handlers.delete(url) : undefined;
      }),
    }),
  };
  return { client, calls };
}

function makeCtxWithBreakGlass(groupId: string | null, memberCount: number): ExecutionContext {
  const facts = createEmptyFacts();
  facts.breakGlass = {
    available: groupId !== null,
    groupName: groupId ? 'Break-Glass-Admins' : null,
    groupId,
    memberCount,
    excludedFromCaPolicies: true,
  };
  return {
    tenantId: 'tenant-test',
    graphClient: {} as any,
    facts,
    rateLimiter: new WriteRateLimiter(),
  };
}

describe('blockLegacyAuthValidatePrerequisites', () => {
  it('returns ok=true when a break-glass group with members is present', async () => {
    const ctx = makeCtxWithBreakGlass('bg-id-1', 2);
    const result = await blockLegacyAuthValidatePrerequisites(ctx);
    expect(result.ok).toBe(true);
  });

  it('returns ok=false when no break-glass group is found', async () => {
    const ctx = makeCtxWithBreakGlass(null, 0);
    const result = await blockLegacyAuthValidatePrerequisites(ctx);
    expect(result.ok).toBe(false);
    expect(result.failureReason).toMatch(/break-glass/i);
  });

  it('returns ok=false when the break-glass group has zero members', async () => {
    const ctx = makeCtxWithBreakGlass('bg-id-1', 0);
    const result = await blockLegacyAuthValidatePrerequisites(ctx);
    expect(result.ok).toBe(false);
  });
});

describe('blockLegacyAuthExecutor', () => {
  it('POSTs a CA policy in Report-Only state with legacy client types blocked', async () => {
    const createdPolicy = { id: 'policy-42' };
    const readBackPolicy = {
      id: 'policy-42',
      displayName: BLOCK_LEGACY_AUTH_POLICY_NAME,
      state: 'enabledForReportingButNotEnforced',
      conditions: {},
      grantControls: {},
    };

    const { client, calls } = makeClient({
      post: () => createdPolicy,
      get: () => readBackPolicy,
    });

    const ctx = makeCtxWithBreakGlass('bg-group-xyz', 3);
    ctx.graphClient = client;

    const result = await blockLegacyAuthExecutor(ctx);

    // Assert a POST was made to the CA policies endpoint.
    const post = calls.find((c) => c.method === 'POST');
    expect(post).toBeDefined();
    expect(post!.url).toBe('/identity/conditionalAccess/policies');

    // Assert body shape
    const body = post!.body as any;
    expect(body.displayName).toBe(BLOCK_LEGACY_AUTH_POLICY_NAME);
    expect(body.state).toBe('enabledForReportingButNotEnforced');
    expect(body.conditions.clientAppTypes).toEqual(['exchangeActiveSync', 'other']);
    expect(body.conditions.users.includeUsers).toEqual(['All']);
    expect(body.conditions.users.excludeGroups).toEqual(['bg-group-xyz']);
    expect(body.grantControls.builtInControls).toEqual(['block']);

    // Assert result shape
    expect(result.beforeSnapshot).toBeNull();
    expect(result.targetResourceId).toBe('policy-42');
    expect(result.afterSnapshot).toMatchObject({ id: 'policy-42' });
  });
});

describe('blockLegacyAuthRollback', () => {
  it('DELETEs the created policy by its id', async () => {
    const { client, calls } = makeClient({});
    const ctx = makeCtxWithBreakGlass('bg-group-xyz', 3);
    ctx.graphClient = client;

    await blockLegacyAuthRollback(ctx, { targetResourceId: 'policy-42' });

    const del = calls.find((c) => c.method === 'DELETE');
    expect(del).toBeDefined();
    expect(del!.url).toBe('/identity/conditionalAccess/policies/policy-42');
  });

  it('throws when targetResourceId is missing on the beforeSnapshot wrapper', async () => {
    const { client } = makeClient({});
    const ctx = makeCtxWithBreakGlass('bg', 1);
    ctx.graphClient = client;

    await expect(blockLegacyAuthRollback(ctx, null)).rejects.toThrow(/targetResourceId/);
  });
});

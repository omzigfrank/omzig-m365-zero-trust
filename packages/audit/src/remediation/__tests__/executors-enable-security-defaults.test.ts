import { describe, it, expect, vi } from 'vitest';
import {
  enableSecurityDefaultsExecutor,
  enableSecurityDefaultsRollback,
  enableSecurityDefaultsValidatePrerequisites,
  SECURITY_DEFAULTS_TARGET_ID,
} from '../executors/enable-security-defaults.js';
import type { ExecutionContext } from '../types.js';
import { WriteRateLimiter } from '../write-rate-limiter.js';
import { createEmptyFacts } from '../../types.js';

function makeCtx(totalCAPolicies: number): ExecutionContext {
  const facts = createEmptyFacts();
  facts.conditionalAccess = {
    available: true,
    totalPolicies: totalCAPolicies,
    enabledCount: totalCAPolicies,
    reportOnlyCount: 0,
    disabledCount: 0,
    policies: [],
  };
  return {
    tenantId: 't',
    graphClient: {} as any,
    facts,
    rateLimiter: new WriteRateLimiter(),
  };
}

function makeClient(state: { isEnabled: boolean }): {
  client: any;
  calls: Array<{ method: string; url: string; body?: unknown }>;
} {
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  const client = {
    api: (url: string) => ({
      get: vi.fn().mockImplementation(async () => {
        calls.push({ method: 'GET', url });
        return { isEnabled: state.isEnabled };
      }),
      patch: vi.fn().mockImplementation(async (body: { isEnabled: boolean }) => {
        calls.push({ method: 'PATCH', url, body });
        state.isEnabled = body.isEnabled;
      }),
    }),
  };
  return { client, calls };
}

describe('enableSecurityDefaultsValidatePrerequisites', () => {
  it('fails when facts.conditionalAccess.totalPolicies > 0', async () => {
    const ctx = makeCtx(4);
    const result = await enableSecurityDefaultsValidatePrerequisites(ctx);
    expect(result.ok).toBe(false);
    expect(result.failureReason).toMatch(/mutually exclusive/i);
    expect(result.failureReason).toContain('4');
  });

  it('passes when facts.conditionalAccess.totalPolicies === 0', async () => {
    const ctx = makeCtx(0);
    const result = await enableSecurityDefaultsValidatePrerequisites(ctx);
    expect(result.ok).toBe(true);
  });

  it('fails when conditionalAccess facts are not available', async () => {
    const ctx = makeCtx(0);
    ctx.facts.conditionalAccess.available = false;
    const result = await enableSecurityDefaultsValidatePrerequisites(ctx);
    expect(result.ok).toBe(false);
  });
});

describe('enableSecurityDefaultsExecutor', () => {
  it('PATCHes identitySecurityDefaultsEnforcementPolicy with isEnabled=true', async () => {
    const state = { isEnabled: false };
    const { client, calls } = makeClient(state);
    const ctx = makeCtx(0);
    ctx.graphClient = client;

    const result = await enableSecurityDefaultsExecutor(ctx);

    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(patch!.url).toBe('/policies/identitySecurityDefaultsEnforcementPolicy');
    expect(patch!.body).toEqual({ isEnabled: true });

    expect(result.targetResourceId).toBe(SECURITY_DEFAULTS_TARGET_ID);
    expect((result.beforeSnapshot as any).isEnabled).toBe(false);
    expect((result.afterSnapshot as any).isEnabled).toBe(true);
  });
});

describe('enableSecurityDefaultsRollback', () => {
  it('PATCHes isEnabled back to the prior value from beforeSnapshot', async () => {
    const state = { isEnabled: true };
    const { client, calls } = makeClient(state);
    const ctx = makeCtx(0);
    ctx.graphClient = client;

    await enableSecurityDefaultsRollback(ctx, { isEnabled: false });

    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch!.body).toEqual({ isEnabled: false });
  });

  it('defaults to isEnabled=false when beforeSnapshot is null', async () => {
    const state = { isEnabled: true };
    const { client, calls } = makeClient(state);
    const ctx = makeCtx(0);
    ctx.graphClient = client;

    await enableSecurityDefaultsRollback(ctx, null);
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch!.body).toEqual({ isEnabled: false });
  });
});

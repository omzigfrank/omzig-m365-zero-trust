/**
 * Phase 7 Plan 03 — RISKY executor tests.
 *
 * Covers the 5 RISKY executors:
 *   - require-compliant-device (two-phase)
 *   - require-phishing-resistant-mfa (two-phase)
 *   - sign-in-risk-policy (two-phase)
 *   - block-guest-access (single-phase authPolicy)
 *   - disable-user-consent-all (single-phase authPolicy)
 *
 * Every test exercises the REAL AuditFacts path: ctx.facts.breakGlass
 * (NOT ctx.facts.breakGlassGroup), ctx.facts.devices.compliantDevices, etc.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { AuditFacts } from '../../types.js';
import type { ExecutionContext } from '../types.js';
import { createEmptyFacts } from '../../types.js';
import { WriteRateLimiter } from '../write-rate-limiter.js';
import {
  requireCompliantDeviceExecutor,
  requireCompliantDeviceEnforcePhase,
  requireCompliantDeviceRollback,
  requireCompliantDeviceValidatePrerequisites,
} from '../executors/require-compliant-device.js';
import {
  requirePhishingResistantMfaExecutor,
  requirePhishingResistantMfaEnforcePhase,
  requirePhishingResistantMfaRollback,
  requirePhishingResistantMfaValidatePrerequisites,
} from '../executors/require-phishing-resistant-mfa.js';
import {
  signInRiskPolicyExecutor,
  signInRiskPolicyEnforcePhase,
  signInRiskPolicyRollback,
  signInRiskPolicyValidatePrerequisites,
} from '../executors/sign-in-risk-policy.js';
import {
  blockGuestAccessExecutor,
  blockGuestAccessRollback,
  blockGuestAccessValidatePrerequisites,
} from '../executors/block-guest-access.js';
import {
  disableUserConsentAllExecutor,
  disableUserConsentAllRollback,
  disableUserConsentAllValidatePrerequisites,
} from '../executors/disable-user-consent-all.js';

// --- Fake Graph client ------------------------------------------------------

type Call = { method: string; url: string; body?: unknown };

function createFakeGraphClient(responses: Record<string, unknown> = {}) {
  const calls: Call[] = [];

  function api(url: string) {
    return {
      async get() {
        calls.push({ method: 'GET', url });
        return responses[`GET ${url}`] ?? {};
      },
      async post(body: unknown) {
        calls.push({ method: 'POST', url, body });
        return responses[`POST ${url}`] ?? { id: 'policy-abc-123' };
      },
      async patch(body: unknown) {
        calls.push({ method: 'PATCH', url, body });
        return responses[`PATCH ${url}`] ?? {};
      },
      async delete() {
        calls.push({ method: 'DELETE', url });
        return responses[`DELETE ${url}`] ?? {};
      },
    };
  }

  return {
    calls,
    client: { api } as unknown as ExecutionContext['graphClient'],
  };
}

function makeCtxWithBreakGlass(
  graphClient: ExecutionContext['graphClient'],
  extra: Partial<AuditFacts> = {},
): ExecutionContext {
  const facts = createEmptyFacts();
  facts.breakGlass = {
    available: true,
    groupName: 'Break-Glass-Admins',
    groupId: 'bg-group-id',
    memberCount: 2,
    excludedFromCaPolicies: true,
  };
  Object.assign(facts, extra);
  return {
    tenantId: 'test-tenant',
    graphClient,
    facts,
    rateLimiter: new WriteRateLimiter(),
  };
}

// ============================================================================
// require-compliant-device (two-phase)
// ============================================================================

describe('requireCompliantDeviceExecutor (RISKY two-phase)', () => {
  it('first phase POSTs a Report-Only CA policy and returns phase=report_only_deployed', async () => {
    const { calls, client } = createFakeGraphClient({
      'POST /identity/conditionalAccess/policies': { id: 'ca-compliant-1' },
    });
    const ctx = makeCtxWithBreakGlass(client, {
      devices: {
        available: true,
        totalDevices: 10,
        compliantDevices: 8,
        nonCompliantDevices: 2,
      },
    });

    const result = await requireCompliantDeviceExecutor(ctx);

    const post = calls.find((c) => c.method === 'POST');
    expect(post).toBeDefined();
    expect(post?.url).toBe('/identity/conditionalAccess/policies');
    const body = post?.body as Record<string, unknown>;
    expect(body.state).toBe('enabledForReportingButNotEnforced');
    const grantControls = body.grantControls as Record<string, unknown>;
    expect(grantControls.builtInControls).toEqual(['compliantDevice']);
    const conditions = body.conditions as Record<string, any>;
    expect(conditions.users.includeUsers).toEqual(['All']);
    expect(conditions.users.excludeGroups).toEqual(['bg-group-id']);

    expect(result.phase).toBe('report_only_deployed');
    expect(result.targetResourceId).toBe('ca-compliant-1');
  });

  it('enforce phase PATCHes state=enabled on the same policy id', async () => {
    const { calls, client } = createFakeGraphClient();
    const ctx = makeCtxWithBreakGlass(client);

    const result = await requireCompliantDeviceEnforcePhase(ctx, {
      targetResourceId: 'ca-compliant-1',
    });

    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(patch?.url).toBe(
      '/identity/conditionalAccess/policies/ca-compliant-1',
    );
    expect(patch?.body).toEqual({ state: 'enabled' });

    expect(result.phase).toBe('completed');
    expect(result.targetResourceId).toBe('ca-compliant-1');
  });

  it('rollback DELETEs the policy (works for both phases)', async () => {
    const { calls, client } = createFakeGraphClient();
    const ctx = makeCtxWithBreakGlass(client);
    await requireCompliantDeviceRollback(ctx, {
      targetResourceId: 'ca-compliant-1',
    });
    const del = calls.find((c) => c.method === 'DELETE');
    expect(del).toBeDefined();
    expect(del?.url).toBe('/identity/conditionalAccess/policies/ca-compliant-1');
  });

  it('prerequisite reads ctx.facts.breakGlass and fails when no break-glass group', async () => {
    const { client } = createFakeGraphClient();
    const ctx = makeCtxWithBreakGlass(client);
    // Regression guard: confirm the real path is used, not ctx.facts.breakGlassGroup
    ctx.facts.breakGlass = {
      available: false,
      groupName: null,
      groupId: null,
      memberCount: 0,
      excludedFromCaPolicies: false,
    };
    const result = await requireCompliantDeviceValidatePrerequisites(ctx);
    expect(result.ok).toBe(false);
    expect(result.failureReason).toMatch(/break-glass/i);
  });

  it('prerequisite fails when no compliant devices exist', async () => {
    const { client } = createFakeGraphClient();
    const ctx = makeCtxWithBreakGlass(client, {
      devices: {
        available: true,
        totalDevices: 5,
        compliantDevices: 0,
        nonCompliantDevices: 5,
      },
    });
    const result = await requireCompliantDeviceValidatePrerequisites(ctx);
    expect(result.ok).toBe(false);
    expect(result.failureReason).toMatch(/compliant device/i);
  });

  it('prerequisite passes when break-glass + compliant devices exist', async () => {
    const { client } = createFakeGraphClient();
    const ctx = makeCtxWithBreakGlass(client, {
      devices: {
        available: true,
        totalDevices: 5,
        compliantDevices: 3,
        nonCompliantDevices: 2,
      },
    });
    const result = await requireCompliantDeviceValidatePrerequisites(ctx);
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// require-phishing-resistant-mfa (two-phase)
// ============================================================================

describe('requirePhishingResistantMfaExecutor (RISKY two-phase)', () => {
  it('first phase creates CA policy with authenticationStrength id', async () => {
    const { calls, client } = createFakeGraphClient({
      'POST /identity/conditionalAccess/policies': { id: 'ca-phish-1' },
    });
    const ctx = makeCtxWithBreakGlass(client);
    const result = await requirePhishingResistantMfaExecutor(ctx);

    const post = calls.find((c) => c.method === 'POST');
    const body = post?.body as Record<string, unknown>;
    expect(body.state).toBe('enabledForReportingButNotEnforced');
    const grantControls = body.grantControls as Record<string, any>;
    expect(grantControls.authenticationStrength?.id).toBe(
      '00000000-0000-0000-0000-000000000004',
    );
    expect(result.phase).toBe('report_only_deployed');
    expect(result.targetResourceId).toBe('ca-phish-1');
  });

  it('enforce phase PATCHes state=enabled', async () => {
    const { calls, client } = createFakeGraphClient();
    const ctx = makeCtxWithBreakGlass(client);
    const result = await requirePhishingResistantMfaEnforcePhase(ctx, {
      targetResourceId: 'ca-phish-1',
    });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toEqual({ state: 'enabled' });
    expect(result.phase).toBe('completed');
  });

  it('rollback DELETEs the policy', async () => {
    const { calls, client } = createFakeGraphClient();
    const ctx = makeCtxWithBreakGlass(client);
    await requirePhishingResistantMfaRollback(ctx, {
      targetResourceId: 'ca-phish-1',
    });
    const del = calls.find((c) => c.method === 'DELETE');
    expect(del?.url).toContain('ca-phish-1');
  });

  it('prerequisite reads ctx.facts.breakGlass', async () => {
    const { client } = createFakeGraphClient();
    const ctx = makeCtxWithBreakGlass(client);
    const result = await requirePhishingResistantMfaValidatePrerequisites(ctx);
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// sign-in-risk-policy (two-phase)
// ============================================================================

describe('signInRiskPolicyExecutor (RISKY two-phase)', () => {
  it('first phase creates CA policy with signInRiskLevels', async () => {
    const { calls, client } = createFakeGraphClient({
      'POST /identity/conditionalAccess/policies': { id: 'ca-risk-1' },
    });
    const ctx = makeCtxWithBreakGlass(client);
    const result = await signInRiskPolicyExecutor(ctx);

    const post = calls.find((c) => c.method === 'POST');
    const body = post?.body as Record<string, unknown>;
    const conditions = body.conditions as Record<string, any>;
    expect(conditions.signInRiskLevels).toEqual(['high', 'medium']);
    expect(body.state).toBe('enabledForReportingButNotEnforced');
    expect(result.phase).toBe('report_only_deployed');
  });

  it('enforce phase PATCHes to enabled', async () => {
    const { calls, client } = createFakeGraphClient();
    const ctx = makeCtxWithBreakGlass(client);
    const result = await signInRiskPolicyEnforcePhase(ctx, {
      targetResourceId: 'ca-risk-1',
    });
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      state: 'enabled',
    });
    expect(result.phase).toBe('completed');
  });

  it('rollback DELETEs', async () => {
    const { calls, client } = createFakeGraphClient();
    const ctx = makeCtxWithBreakGlass(client);
    await signInRiskPolicyRollback(ctx, {
      targetResourceId: 'ca-risk-1',
    });
    expect(calls.find((c) => c.method === 'DELETE')).toBeDefined();
  });

  it('prerequisite reads ctx.facts.breakGlass', async () => {
    const { client } = createFakeGraphClient();
    const ctx = makeCtxWithBreakGlass(client);
    const result = await signInRiskPolicyValidatePrerequisites(ctx);
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// block-guest-access (single-phase)
// ============================================================================

describe('blockGuestAccessExecutor (RISKY single-phase)', () => {
  it('PATCHes authorizationPolicy allowInvitesFrom=adminsAndGuestInviters', async () => {
    const { calls, client } = createFakeGraphClient({
      'GET /policies/authorizationPolicy': { allowInvitesFrom: 'everyone' },
    });
    const ctx = makeCtxWithBreakGlass(client);
    const result = await blockGuestAccessExecutor(ctx);

    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.url).toBe('/policies/authorizationPolicy');
    expect(patch?.body).toEqual({
      allowInvitesFrom: 'adminsAndGuestInviters',
    });
    // beforeSnapshot captured via fresh GET (not facts)
    expect((result.beforeSnapshot as any).allowInvitesFrom).toBe('everyone');
    // Not a two-phase executor.
    expect(result.phase).toBeUndefined();
  });

  it('rollback restores prior allowInvitesFrom from snapshot', async () => {
    const { calls, client } = createFakeGraphClient();
    const ctx = makeCtxWithBreakGlass(client);
    await blockGuestAccessRollback(ctx, { allowInvitesFrom: 'everyone' });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toEqual({ allowInvitesFrom: 'everyone' });
  });

  it('prerequisite returns ok=true (no break-glass dependency)', async () => {
    const { client } = createFakeGraphClient();
    const ctx = makeCtxWithBreakGlass(client);
    const result = await blockGuestAccessValidatePrerequisites(ctx);
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// disable-user-consent-all (single-phase)
// ============================================================================

describe('disableUserConsentAllExecutor (RISKY single-phase)', () => {
  it('PATCHes authorizationPolicy permissionGrantPoliciesAssigned=[]', async () => {
    const { calls, client } = createFakeGraphClient({
      'GET /policies/authorizationPolicy': {
        permissionGrantPoliciesAssigned: [
          'ManagePermissionGrantsForSelf.microsoft-user-default-legacy',
        ],
      },
    });
    const ctx = makeCtxWithBreakGlass(client);
    const result = await disableUserConsentAllExecutor(ctx);
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toEqual({ permissionGrantPoliciesAssigned: [] });
    expect(result.phase).toBeUndefined();
  });

  it('rollback restores prior permissionGrantPoliciesAssigned', async () => {
    const { calls, client } = createFakeGraphClient();
    const ctx = makeCtxWithBreakGlass(client);
    await disableUserConsentAllRollback(ctx, {
      permissionGrantPoliciesAssigned: ['legacy-policy-id'],
    });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toEqual({
      permissionGrantPoliciesAssigned: ['legacy-policy-id'],
    });
  });

  it('prerequisite returns ok=true', async () => {
    const { client } = createFakeGraphClient();
    const ctx = makeCtxWithBreakGlass(client);
    const result = await disableUserConsentAllValidatePrerequisites(ctx);
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// Registry integration
// ============================================================================

describe('RISKY executors are registered in EXECUTOR_REGISTRY', () => {
  it('exposes all 5 RISKY bundles', async () => {
    const { EXECUTOR_REGISTRY } = await import('../executors/index.js');
    expect(EXECUTOR_REGISTRY['MS.AAD.3.7v1']).toBeDefined();
    expect(EXECUTOR_REGISTRY['MS.AAD.3.1v1']).toBeDefined();
    expect(EXECUTOR_REGISTRY['MS.AAD.5.2v1']).toBeDefined();
    expect(EXECUTOR_REGISTRY['MS.AAD.8.2v1']).toBeDefined();
    expect(EXECUTOR_REGISTRY['NIST.ZTA.T4.1v1']).toBeDefined();
    expect(EXECUTOR_REGISTRY['NIST.ZTA.T4.2v1']).toBeDefined();
  });

  it('two-phase bundles expose enforcePhaseExecutor', async () => {
    const { EXECUTOR_REGISTRY } = await import('../executors/index.js');
    expect(EXECUTOR_REGISTRY['MS.AAD.3.7v1'].enforcePhaseExecutor).toBeDefined();
    expect(EXECUTOR_REGISTRY['MS.AAD.3.1v1'].enforcePhaseExecutor).toBeDefined();
    expect(EXECUTOR_REGISTRY['NIST.ZTA.T4.1v1'].enforcePhaseExecutor).toBeDefined();
  });

  it('single-phase RISKY bundles do NOT expose enforcePhaseExecutor', async () => {
    const { EXECUTOR_REGISTRY } = await import('../executors/index.js');
    expect(EXECUTOR_REGISTRY['MS.AAD.5.2v1'].enforcePhaseExecutor).toBeUndefined();
    expect(EXECUTOR_REGISTRY['MS.AAD.8.2v1'].enforcePhaseExecutor).toBeUndefined();
  });
});

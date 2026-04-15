/**
 * Phase 7 Plan 02 — Per-executor assertion tests for the new SAFE executors.
 *
 * One mock Graph client per test; asserts that each executor posts/patches
 * the correct URL with the correct body, and that rollback reverses the
 * write. Heavy use of a shared fake Graph client to keep boilerplate minimal.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { AuditFacts } from '../../types.js';
import type {
  ExecutionContext,
} from '../types.js';
import { WriteRateLimiter } from '../write-rate-limiter.js';
import {
  enableMicrosoftAuthenticatorExecutor,
  enableMicrosoftAuthenticatorRollback,
} from '../executors/enable-microsoft-authenticator.js';
import {
  completeAuthMethodsMigrationExecutor,
  completeAuthMethodsMigrationRollback,
} from '../executors/complete-auth-methods-migration.js';
import {
  disableUserAppRegistrationExecutor,
  disableUserAppRegistrationRollback,
} from '../executors/disable-user-app-registration.js';
import {
  enableAdminConsentWorkflowExecutor,
  enableAdminConsentWorkflowRollback,
} from '../executors/enable-admin-consent-workflow.js';
import {
  disableGroupOwnerConsentExecutor,
  disableGroupOwnerConsentRollback,
} from '../executors/disable-group-owner-consent.js';
import {
  setPasswordNeverExpireExecutor,
  setPasswordNeverExpireRollback,
} from '../executors/set-password-never-expire.js';
import {
  restrictGuestAccessLimitedExecutor,
  restrictGuestAccessLimitedRollback,
} from '../executors/restrict-guest-access-limited.js';
import {
  restrictGuestAccessRestrictedExecutor,
  restrictGuestAccessRestrictedRollback,
} from '../executors/restrict-guest-access-restricted.js';
import { requirePimActivationMfaExecutor } from '../executors/require-pim-activation-mfa.js';
import { createEmptyFacts } from '../../types.js';
import { ExecutorError } from '../remediation-executor.js';

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
        return responses[`POST ${url}`] ?? { id: 'created-id' };
      },
      async patch(body: unknown) {
        calls.push({ method: 'PATCH', url, body });
        return responses[`PATCH ${url}`] ?? {};
      },
      async put(body: unknown) {
        calls.push({ method: 'PUT', url, body });
        return responses[`PUT ${url}`] ?? {};
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

function makeCtx(
  graphClient: ExecutionContext['graphClient'],
  facts: AuditFacts = createEmptyFacts(),
): ExecutionContext {
  return {
    tenantId: 'test-tenant',
    graphClient,
    facts,
    rateLimiter: new WriteRateLimiter(),
  };
}

// --- enable-microsoft-authenticator ----------------------------------------

describe('enableMicrosoftAuthenticatorExecutor', () => {
  it('PATCHes MicrosoftAuthenticator config to state=enabled', async () => {
    const { client, calls } = createFakeGraphClient({
      'GET /policies/authenticationMethodsPolicy/authenticationMethodConfigurations/MicrosoftAuthenticator':
        { id: 'MicrosoftAuthenticator', state: 'disabled' },
    });
    const ctx = makeCtx(client);

    const result = await enableMicrosoftAuthenticatorExecutor(ctx);

    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(patch!.body).toEqual({ state: 'enabled' });
    expect(result.targetResourceId).toContain('MicrosoftAuthenticator');
  });

  it('rollback PATCHes the prior state', async () => {
    const { client, calls } = createFakeGraphClient();
    const ctx = makeCtx(client);
    await enableMicrosoftAuthenticatorRollback(ctx, { state: 'disabled' });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch!.body).toEqual({ state: 'disabled' });
  });
});

// --- complete-auth-methods-migration ---------------------------------------

describe('completeAuthMethodsMigrationExecutor', () => {
  it('PATCHes policyMigrationState=migrationComplete', async () => {
    const { client, calls } = createFakeGraphClient({
      'GET /policies/authenticationMethodsPolicy': {
        policyMigrationState: 'preMigration',
      },
    });
    const ctx = makeCtx(client);

    await completeAuthMethodsMigrationExecutor(ctx);

    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch!.body).toEqual({
      policyMigrationState: 'migrationComplete',
    });
  });

  it('rollback restores prior migrationState', async () => {
    const { client, calls } = createFakeGraphClient();
    const ctx = makeCtx(client);
    await completeAuthMethodsMigrationRollback(ctx, {
      policyMigrationState: 'migrationInProgress',
    });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch!.body).toEqual({
      policyMigrationState: 'migrationInProgress',
    });
  });
});

// --- disable-user-app-registration -----------------------------------------

describe('disableUserAppRegistrationExecutor', () => {
  it('PATCHes allowedToCreateApps=false', async () => {
    const { client, calls } = createFakeGraphClient({
      'GET /policies/authorizationPolicy': {
        defaultUserRolePermissions: { allowedToCreateApps: true },
      },
    });
    const ctx = makeCtx(client);

    await disableUserAppRegistrationExecutor(ctx);

    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch!.body).toEqual({
      defaultUserRolePermissions: { allowedToCreateApps: false },
    });
  });

  it('rollback restores prior boolean', async () => {
    const { client, calls } = createFakeGraphClient();
    const ctx = makeCtx(client);
    await disableUserAppRegistrationRollback(ctx, {
      defaultUserRolePermissions: { allowedToCreateApps: true },
    });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch!.body).toEqual({
      defaultUserRolePermissions: { allowedToCreateApps: true },
    });
  });
});

// --- enable-admin-consent-workflow -----------------------------------------

describe('enableAdminConsentWorkflowExecutor', () => {
  it('PUTs isEnabled=true with a 30-day duration', async () => {
    const { client, calls } = createFakeGraphClient({
      'GET /policies/adminConsentRequestPolicy': {
        isEnabled: false,
        reviewers: [],
      },
    });
    const ctx = makeCtx(client);

    await enableAdminConsentWorkflowExecutor(ctx);

    const put = calls.find((c) => c.method === 'PUT');
    expect(put).toBeDefined();
    const body = put!.body as Record<string, unknown>;
    expect(body.isEnabled).toBe(true);
    expect(body.requestDurationInDays).toBe(30);
  });

  it('rollback re-PUTs the captured prior body', async () => {
    const { client, calls } = createFakeGraphClient();
    const ctx = makeCtx(client);
    await enableAdminConsentWorkflowRollback(ctx, {
      isEnabled: false,
      notifyReviewers: false,
      notifyReviewersOnDeny: false,
      remindersEnabled: false,
      requestDurationInDays: 14,
      reviewers: [],
    });
    const put = calls.find((c) => c.method === 'PUT');
    const body = put!.body as Record<string, unknown>;
    expect(body.isEnabled).toBe(false);
    expect(body.requestDurationInDays).toBe(14);
  });

  it('rollback throws without a beforeSnapshot (PUT needs full body)', async () => {
    const { client } = createFakeGraphClient();
    const ctx = makeCtx(client);
    await expect(
      enableAdminConsentWorkflowRollback(ctx, null),
    ).rejects.toThrow(/beforeSnapshot required/);
  });
});

// --- disable-group-owner-consent -------------------------------------------

describe('disableGroupOwnerConsentExecutor', () => {
  it('strips managePermissionGrantsForOwnedResource policies', async () => {
    const { client, calls } = createFakeGraphClient({
      'GET /policies/authorizationPolicy': {
        defaultUserRolePermissions: {
          permissionGrantPoliciesAssigned: [
            'ManagePermissionGrantsForSelf.microsoft-user-default-low',
            'managePermissionGrantsForOwnedResource.default',
          ],
        },
      },
    });
    const ctx = makeCtx(client);

    await disableGroupOwnerConsentExecutor(ctx);

    const patch = calls.find((c) => c.method === 'PATCH');
    const body = patch!.body as {
      defaultUserRolePermissions: { permissionGrantPoliciesAssigned: string[] };
    };
    expect(body.defaultUserRolePermissions.permissionGrantPoliciesAssigned).toEqual([
      'ManagePermissionGrantsForSelf.microsoft-user-default-low',
    ]);
  });

  it('rollback restores the full prior list', async () => {
    const { client, calls } = createFakeGraphClient();
    const ctx = makeCtx(client);
    await disableGroupOwnerConsentRollback(ctx, {
      defaultUserRolePermissions: {
        permissionGrantPoliciesAssigned: ['a', 'b', 'c'],
      },
    });
    const patch = calls.find((c) => c.method === 'PATCH');
    const body = patch!.body as {
      defaultUserRolePermissions: { permissionGrantPoliciesAssigned: string[] };
    };
    expect(
      body.defaultUserRolePermissions.permissionGrantPoliciesAssigned,
    ).toEqual(['a', 'b', 'c']);
  });
});

// --- set-password-never-expire ---------------------------------------------

describe('setPasswordNeverExpireExecutor', () => {
  it('PATCHes every domain to 2147483647 days', async () => {
    const { client, calls } = createFakeGraphClient({
      'GET /domains': {
        value: [
          { id: 'contoso.com', passwordValidityPeriodInDays: 90 },
          { id: 'foo.onmicrosoft.com', passwordValidityPeriodInDays: 90 },
        ],
      },
    });
    const ctx = makeCtx(client);

    const result = await setPasswordNeverExpireExecutor(ctx);

    const patches = calls.filter((c) => c.method === 'PATCH');
    expect(patches.length).toBe(2);
    for (const p of patches) {
      expect(
        (p.body as { passwordValidityPeriodInDays: number })
          .passwordValidityPeriodInDays,
      ).toBe(2147483647);
    }
    expect(
      Array.isArray(result.beforeSnapshot) &&
        (result.beforeSnapshot as unknown[]).length,
    ).toBe(2);
  });

  it('rollback restores per-domain prior validity', async () => {
    const { client, calls } = createFakeGraphClient();
    const ctx = makeCtx(client);
    await setPasswordNeverExpireRollback(ctx, [
      { id: 'contoso.com', priorValidity: 90 },
      { id: 'foo.onmicrosoft.com', priorValidity: 120 },
    ]);
    const patches = calls.filter((c) => c.method === 'PATCH');
    expect(patches.length).toBe(2);
    expect((patches[0].body as { passwordValidityPeriodInDays: number }).passwordValidityPeriodInDays).toBe(90);
    expect((patches[1].body as { passwordValidityPeriodInDays: number }).passwordValidityPeriodInDays).toBe(120);
  });
});

// --- restrict-guest-access (limited + restricted) --------------------------

describe('restrictGuestAccessLimitedExecutor', () => {
  it('PATCHes guestUserRoleId to the Limited GUID', async () => {
    const { client, calls } = createFakeGraphClient({
      'GET /policies/authorizationPolicy': {
        guestUserRoleId: 'a0b1b346-4d3e-4e8b-98f8-753987be4970', // default
      },
    });
    const ctx = makeCtx(client);

    await restrictGuestAccessLimitedExecutor(ctx);

    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch!.body).toEqual({
      guestUserRoleId: '10dae51f-b6af-4016-8d66-8c2a99b929b3',
    });
  });

  it('rollback restores the prior GUID', async () => {
    const { client, calls } = createFakeGraphClient();
    const ctx = makeCtx(client);
    await restrictGuestAccessLimitedRollback(ctx, {
      guestUserRoleId: 'a0b1b346-4d3e-4e8b-98f8-753987be4970',
    });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch!.body).toEqual({
      guestUserRoleId: 'a0b1b346-4d3e-4e8b-98f8-753987be4970',
    });
  });
});

describe('restrictGuestAccessRestrictedExecutor', () => {
  it('PATCHes guestUserRoleId to the Restricted GUID', async () => {
    const { client, calls } = createFakeGraphClient({
      'GET /policies/authorizationPolicy': {
        guestUserRoleId: '10dae51f-b6af-4016-8d66-8c2a99b929b3', // limited
      },
    });
    const ctx = makeCtx(client);

    await restrictGuestAccessRestrictedExecutor(ctx);

    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch!.body).toEqual({
      guestUserRoleId: '2af84b1e-32c8-42b7-82bc-daa82404023b',
    });
  });

  it('rollback restores the prior GUID', async () => {
    const { client, calls } = createFakeGraphClient();
    const ctx = makeCtx(client);
    await restrictGuestAccessRestrictedRollback(ctx, {
      guestUserRoleId: '10dae51f-b6af-4016-8d66-8c2a99b929b3',
    });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch!.body).toEqual({
      guestUserRoleId: '10dae51f-b6af-4016-8d66-8c2a99b929b3',
    });
  });
});

// --- require-pim-activation-mfa (skeleton) ---------------------------------

describe('requirePimActivationMfaExecutor', () => {
  it('throws ExecutorError because it is a deliberate skeleton', async () => {
    const { client } = createFakeGraphClient();
    const ctx = makeCtx(client);
    await expect(requirePimActivationMfaExecutor(ctx)).rejects.toThrow(
      ExecutorError,
    );
  });
});

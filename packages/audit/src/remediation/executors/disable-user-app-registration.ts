/**
 * SAFE executor: MS.AAD.5.1v1 / NIST.ZTA.T7.3v1 / NIST.80053.CM-7v1 --
 * Disable user app registration (allowedToCreateApps=false).
 *
 * PATCHes /policies/authorizationPolicy with defaultUserRolePermissions.
 * allowedToCreateApps = false so only admins can register new apps.
 *
 * SAFE because:
 *  - Rarely-used privilege for rank-and-file users
 *  - Admins retain the ability to register apps
 *  - Purely reversible via PATCH with the captured prior boolean value
 *
 * Rollback: PATCH the same field back to the captured prior value.
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';

const POLICY_URI = '/policies/authorizationPolicy';
export const DISABLE_USER_APP_REGISTRATION_TARGET_ID =
  'authorizationPolicy:allowedToCreateApps';

interface AuthorizationPolicyBody {
  defaultUserRolePermissions?: {
    allowedToCreateApps?: boolean;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export async function disableUserAppRegistrationValidatePrerequisites(
  _ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  return { ok: true };
}

export async function disableUserAppRegistrationExecutor(
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const beforeSnapshot = (await ctx.graphClient
    .api(POLICY_URI)
    .get()) as AuthorizationPolicyBody;

  await ctx.graphClient.api(POLICY_URI).patch({
    defaultUserRolePermissions: { allowedToCreateApps: false },
  });

  const afterSnapshot = (await ctx.graphClient
    .api(POLICY_URI)
    .get()) as AuthorizationPolicyBody;

  return {
    beforeSnapshot,
    afterSnapshot,
    targetResourceId: DISABLE_USER_APP_REGISTRATION_TARGET_ID,
    notes:
      'Set defaultUserRolePermissions.allowedToCreateApps=false (admins only)',
  };
}

export async function disableUserAppRegistrationRollback(
  ctx: ExecutionContext,
  beforeSnapshot: unknown,
): Promise<void> {
  const snap = beforeSnapshot as AuthorizationPolicyBody | null;
  // Default to true (Entra ID default) if we cannot read the prior value.
  const prior =
    snap?.defaultUserRolePermissions?.allowedToCreateApps ?? true;
  await ctx.graphClient.api(POLICY_URI).patch({
    defaultUserRolePermissions: { allowedToCreateApps: prior },
  });
}

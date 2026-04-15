/**
 * SAFE executor: MS.AAD.5.4v1 -- Disable group owner consent for apps
 * accessing group data.
 *
 * PATCHes /policies/authorizationPolicy with
 * defaultUserRolePermissions.permissionGrantPoliciesAssigned excluding
 * the managePermissionGrantsForOwnedResource policies. The minimally
 * invasive way to do this is to PATCH the field
 * allowInvitesFrom/allowedToSignUpEmailBasedSubscriptions... not applicable.
 *
 * Actually the supported Graph field here is
 * defaultUserRolePermissions.permissionGrantPoliciesAssigned -- group-owner
 * consent is enabled when policy IDs starting with
 * `managePermissionGrantsForOwnedResource-` are present. We strip those.
 *
 * SAFE because:
 *  - Restricts a rarely-used consent path (group-owner initiated)
 *  - Does not affect existing grants, only new ones
 *  - Reversible via PATCH restoring the captured prior list
 *
 * Rollback: PATCH the same field back to the captured prior array.
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';

const POLICY_URI = '/policies/authorizationPolicy';
export const DISABLE_GROUP_OWNER_CONSENT_TARGET_ID =
  'authorizationPolicy:permissionGrantPoliciesAssigned';

interface AuthorizationPolicyBody {
  defaultUserRolePermissions?: {
    permissionGrantPoliciesAssigned?: string[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export async function disableGroupOwnerConsentValidatePrerequisites(
  _ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  return { ok: true };
}

export async function disableGroupOwnerConsentExecutor(
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const beforeSnapshot = (await ctx.graphClient
    .api(POLICY_URI)
    .get()) as AuthorizationPolicyBody;

  const priorList =
    beforeSnapshot.defaultUserRolePermissions
      ?.permissionGrantPoliciesAssigned ?? [];

  // Strip any entries starting with the group-owner managed grant prefix.
  // This preserves all other permission grant policies (including user-self).
  const filtered = priorList.filter(
    (p) => !p.startsWith('managePermissionGrantsForOwnedResource'),
  );

  await ctx.graphClient.api(POLICY_URI).patch({
    defaultUserRolePermissions: { permissionGrantPoliciesAssigned: filtered },
  });

  const afterSnapshot = (await ctx.graphClient
    .api(POLICY_URI)
    .get()) as AuthorizationPolicyBody;

  return {
    beforeSnapshot,
    afterSnapshot,
    targetResourceId: DISABLE_GROUP_OWNER_CONSENT_TARGET_ID,
    notes:
      'Removed group-owner-consent policies from authorizationPolicy.permissionGrantPoliciesAssigned',
  };
}

export async function disableGroupOwnerConsentRollback(
  ctx: ExecutionContext,
  beforeSnapshot: unknown,
): Promise<void> {
  const snap = beforeSnapshot as AuthorizationPolicyBody | null;
  const prior =
    snap?.defaultUserRolePermissions?.permissionGrantPoliciesAssigned ?? [];
  await ctx.graphClient.api(POLICY_URI).patch({
    defaultUserRolePermissions: { permissionGrantPoliciesAssigned: prior },
  });
}

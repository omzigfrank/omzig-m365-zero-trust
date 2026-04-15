/**
 * SAFE executor: MS.AAD.8.3v1 -- Restrict guest directory access to the
 * tightest tier (guest user access is restricted to properties and
 * memberships of their own directory objects).
 *
 * PATCHes /policies/authorizationPolicy with guestUserRoleId set to the
 * "Restricted Guest User" role template GUID (2af84b1e-...).
 *
 * Research §1.3 PITFALL b: the three canonical GUIDs are
 *   All (default):      a0b1b346-4d3e-4e8b-98f8-753987be4970
 *   Limited:            10dae51f-b6af-4016-8d66-8c2a99b929b3
 *   Restricted Guest:   2af84b1e-32c8-42b7-82bc-daa82404023b
 *
 * SAFE because:
 *  - Guests retain access to explicitly shared resources
 *  - Reversible via PATCH to the prior GUID
 *
 * Rollback: PATCH guestUserRoleId back to the captured value.
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';

const POLICY_URI = '/policies/authorizationPolicy';
const RESTRICTED_GUEST_ROLE_ID = '2af84b1e-32c8-42b7-82bc-daa82404023b';

export const RESTRICT_GUEST_ACCESS_RESTRICTED_TARGET_ID =
  'authorizationPolicy:guestUserRoleId:restricted';

interface AuthorizationPolicyBody {
  guestUserRoleId?: string;
  [k: string]: unknown;
}

export async function restrictGuestAccessRestrictedValidatePrerequisites(
  _ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  return { ok: true };
}

export async function restrictGuestAccessRestrictedExecutor(
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const beforeSnapshot = (await ctx.graphClient
    .api(POLICY_URI)
    .get()) as AuthorizationPolicyBody;

  await ctx.graphClient
    .api(POLICY_URI)
    .patch({ guestUserRoleId: RESTRICTED_GUEST_ROLE_ID });

  const afterSnapshot = (await ctx.graphClient
    .api(POLICY_URI)
    .get()) as AuthorizationPolicyBody;

  return {
    beforeSnapshot,
    afterSnapshot,
    targetResourceId: RESTRICT_GUEST_ACCESS_RESTRICTED_TARGET_ID,
    notes: 'Set guestUserRoleId to Restricted Guest (2af84b1e-...)',
  };
}

export async function restrictGuestAccessRestrictedRollback(
  ctx: ExecutionContext,
  beforeSnapshot: unknown,
): Promise<void> {
  const snap = beforeSnapshot as AuthorizationPolicyBody | null;
  const prior =
    snap?.guestUserRoleId ?? 'a0b1b346-4d3e-4e8b-98f8-753987be4970';
  await ctx.graphClient
    .api(POLICY_URI)
    .patch({ guestUserRoleId: prior });
}

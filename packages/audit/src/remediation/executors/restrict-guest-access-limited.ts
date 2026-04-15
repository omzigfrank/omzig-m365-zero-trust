/**
 * SAFE executor: MS.AAD.8.1v1 -- Restrict guest directory access to "Limited"
 * (guest users have limited access to properties and memberships of directory
 * objects).
 *
 * PATCHes /policies/authorizationPolicy with guestUserRoleId set to the
 * well-known Restricted Guest User role template ID for "Limited" access.
 *
 * Research §1.3 PITFALL b documents the three canonical GUIDs:
 *   - All (default):      a0b1b346-4d3e-4e8b-98f8-753987be4970
 *   - Limited:            10dae51f-b6af-4016-8d66-8c2a99b929b3
 *   - Restricted Guest:   2af84b1e-32c8-42b7-82bc-daa82404023b
 *
 * This executor targets the Limited role (middle tier). Executor
 * `restrict-guest-access-restricted` handles 8.3 (tightest tier).
 *
 * SAFE because:
 *  - Guests retain access to resources that have been explicitly shared
 *  - Tenant directory enumeration is restricted, nothing is removed
 *  - Reversible via PATCH to the captured prior GUID
 *
 * Rollback: PATCH guestUserRoleId back to the captured value.
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';

const POLICY_URI = '/policies/authorizationPolicy';
const LIMITED_GUEST_ROLE_ID = '10dae51f-b6af-4016-8d66-8c2a99b929b3';

export const RESTRICT_GUEST_ACCESS_LIMITED_TARGET_ID =
  'authorizationPolicy:guestUserRoleId:limited';

interface AuthorizationPolicyBody {
  guestUserRoleId?: string;
  [k: string]: unknown;
}

export async function restrictGuestAccessLimitedValidatePrerequisites(
  _ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  return { ok: true };
}

export async function restrictGuestAccessLimitedExecutor(
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const beforeSnapshot = (await ctx.graphClient
    .api(POLICY_URI)
    .get()) as AuthorizationPolicyBody;

  await ctx.graphClient
    .api(POLICY_URI)
    .patch({ guestUserRoleId: LIMITED_GUEST_ROLE_ID });

  const afterSnapshot = (await ctx.graphClient
    .api(POLICY_URI)
    .get()) as AuthorizationPolicyBody;

  return {
    beforeSnapshot,
    afterSnapshot,
    targetResourceId: RESTRICT_GUEST_ACCESS_LIMITED_TARGET_ID,
    notes: 'Set guestUserRoleId to Limited (10dae51f-...)',
  };
}

export async function restrictGuestAccessLimitedRollback(
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

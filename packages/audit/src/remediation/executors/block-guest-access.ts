/**
 * RISKY single-phase executor: MS.AAD.8.2v1 -- Restrict guest invites to
 * admin-only (effectively "block guest access" for regular users).
 *
 * PATCHes /policies/authorizationPolicy with
 *   allowInvitesFrom = 'adminsAndGuestInviters'
 *
 * This prevents regular users (including project leads, PMs, ordinary
 * business users) from inviting external guests. Only users with the
 * Guest Inviter role or higher can create new guest accounts.
 *
 * RISKY (not SAFE) because:
 *   - Breaks existing external collaboration workflows where non-admin
 *     users routinely invite partners, contractors, and customers.
 *   - Unlike CA policies, authorizationPolicy has NO Report-Only mode
 *     (research §1.3), so the wizard cannot do a monitored rollout —
 *     it must rely on the impact-preview + warning list.
 *   - Rollback is a PATCH to the prior value, but in-flight invitation
 *     requests between deployment and rollback will have been rejected.
 *
 * Single-phase: no enforcePhaseExecutor.
 *
 * Rollback: PATCH allowInvitesFrom back to the captured prior value
 * (typically 'everyone' or 'adminsGuestInvitersAndAllMembers').
 *
 * Prerequisite: none — change is fully reversible.
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';

const POLICY_URI = '/policies/authorizationPolicy';
const ADMINS_ONLY = 'adminsAndGuestInviters';

export const BLOCK_GUEST_ACCESS_TARGET_ID =
  'authorizationPolicy:allowInvitesFrom:adminsAndGuestInviters';

interface AuthorizationPolicyBody {
  allowInvitesFrom?: string;
  [k: string]: unknown;
}

export async function blockGuestAccessValidatePrerequisites(
  _ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  // No prerequisite — guest invite restriction is independent of break-glass
  // and reversible.
  return { ok: true };
}

export async function blockGuestAccessExecutor(
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  // Capture fresh beforeSnapshot via GET — facts may be stale.
  const beforeSnapshot = (await ctx.graphClient
    .api(POLICY_URI)
    .get()) as AuthorizationPolicyBody;

  await ctx.graphClient
    .api(POLICY_URI)
    .patch({ allowInvitesFrom: ADMINS_ONLY });

  const afterSnapshot = (await ctx.graphClient
    .api(POLICY_URI)
    .get()) as AuthorizationPolicyBody;

  return {
    beforeSnapshot,
    afterSnapshot,
    targetResourceId: BLOCK_GUEST_ACCESS_TARGET_ID,
    notes:
      'Set allowInvitesFrom=adminsAndGuestInviters on authorizationPolicy. ' +
      'Only admins and Guest Inviter role holders can now create guest accounts.',
  };
}

export async function blockGuestAccessRollback(
  ctx: ExecutionContext,
  beforeSnapshot: unknown,
): Promise<void> {
  const snap = beforeSnapshot as AuthorizationPolicyBody | null;
  // Fall back to 'everyone' (Entra default) if we have no captured prior.
  const prior = snap?.allowInvitesFrom ?? 'everyone';
  await ctx.graphClient
    .api(POLICY_URI)
    .patch({ allowInvitesFrom: prior });
}

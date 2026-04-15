/**
 * RISKY single-phase executor: Disable user consent to applications (all).
 *
 * PATCHes /policies/authorizationPolicy setting
 * permissionGrantPoliciesAssigned = [] which revokes any user-delegated
 * consent grants and requires admin consent for ALL third-party apps going
 * forward (research §1.3 and §4.1).
 *
 * RISKY (not SAFE) because:
 *   - Existing user-consented apps will stop working at next token refresh;
 *     users have no ability to self-approve new apps.
 *   - The admin consent workflow (a separate toggle handled by
 *     enable-admin-consent-workflow) should ideally be enabled first so
 *     users can request admin approval for blocked apps — otherwise they
 *     will hit dead-end consent prompts.
 *   - No Report-Only equivalent exists for authorizationPolicy.
 *
 * Single-phase: no enforcePhaseExecutor.
 *
 * Rollback: PATCH permissionGrantPoliciesAssigned back to the captured
 * prior array (typically ["ManagePermissionGrantsForSelf.microsoft-user-default-legacy"]).
 *
 * Prerequisite: none — change is fully reversible via rollback.
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';

const POLICY_URI = '/policies/authorizationPolicy';

export const DISABLE_USER_CONSENT_ALL_TARGET_ID =
  'authorizationPolicy:permissionGrantPoliciesAssigned:empty';

interface AuthorizationPolicyBody {
  permissionGrantPoliciesAssigned?: string[];
  [k: string]: unknown;
}

export async function disableUserConsentAllValidatePrerequisites(
  _ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  return { ok: true };
}

export async function disableUserConsentAllExecutor(
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const beforeSnapshot = (await ctx.graphClient
    .api(POLICY_URI)
    .get()) as AuthorizationPolicyBody;

  await ctx.graphClient
    .api(POLICY_URI)
    .patch({ permissionGrantPoliciesAssigned: [] });

  const afterSnapshot = (await ctx.graphClient
    .api(POLICY_URI)
    .get()) as AuthorizationPolicyBody;

  return {
    beforeSnapshot,
    afterSnapshot,
    targetResourceId: DISABLE_USER_CONSENT_ALL_TARGET_ID,
    notes:
      'Cleared permissionGrantPoliciesAssigned on authorizationPolicy. ' +
      'Users can no longer consent to any third-party apps; all new apps require admin consent.',
  };
}

export async function disableUserConsentAllRollback(
  ctx: ExecutionContext,
  beforeSnapshot: unknown,
): Promise<void> {
  const snap = beforeSnapshot as AuthorizationPolicyBody | null;
  // Fall back to the Microsoft default legacy policy if we have no capture.
  const prior = snap?.permissionGrantPoliciesAssigned ?? [
    'ManagePermissionGrantsForSelf.microsoft-user-default-legacy',
  ];
  await ctx.graphClient
    .api(POLICY_URI)
    .patch({ permissionGrantPoliciesAssigned: prior });
}

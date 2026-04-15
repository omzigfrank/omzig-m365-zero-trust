/**
 * RISKY two-phase executor: MS.AAD.3.7v1 -- Require compliant device for all users.
 *
 * Creates a Conditional Access policy targeting All users (excluding the
 * break-glass group) requiring the compliantDevice control. Deploys in
 * Report-Only first; second phase flips to Enabled via a single PATCH
 * preserving the same policy ID (research §5.4).
 *
 * RISKY because:
 *   - Targets ALL users; any user on a non-enrolled/non-compliant device
 *     will be blocked at sign-in once enforced.
 *   - CLAUDE.md explicitly flags this as the lockout risk pattern.
 *
 * Two-phase flow:
 *   Phase 1: POST /identity/conditionalAccess/policies with
 *            state=enabledForReportingButNotEnforced. Returns
 *            phase='report_only_deployed'.
 *   Phase 2: PATCH /identity/conditionalAccess/policies/{id} with
 *            { state: 'enabled' }. Same policy ID preserved.
 *
 * Rollback (works for both phases): DELETE the policy.
 *
 * Prerequisite: break-glass group exists with at least 1 member AND at
 * least 1 compliant device exists in the tenant (from facts.devices.compliantDevices).
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';

export const REQUIRE_COMPLIANT_DEVICE_POLICY_NAME =
  'Omzig-CA-Require-Compliant-Device';

export async function requireCompliantDeviceValidatePrerequisites(
  ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  // REAL fact path: facts.breakGlass (added in Plan 07-01). NOT facts.breakGlassGroup.
  const bg = ctx.facts.breakGlass;
  if (!bg || !bg.available || !bg.groupId || bg.memberCount < 1) {
    return {
      ok: false,
      failureReason:
        'No break-glass group found in tenant. Create a group named "Break-Glass-Admins" with at least 1 member before enabling device-compliance CA policies.',
    };
  }
  // Also require at least one compliant device — otherwise enforcing the policy
  // would lock out the entire tenant.
  const devices = ctx.facts.devices;
  if (!devices || !devices.available || devices.compliantDevices < 1) {
    return {
      ok: false,
      failureReason:
        'No compliant devices found in tenant. Enroll and mark at least 1 device compliant before enabling a device-compliance CA policy.',
    };
  }
  return { ok: true };
}

export async function requireCompliantDeviceExecutor(
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const bgGroupId = ctx.facts.breakGlass.groupId;

  const policyBody = {
    displayName: REQUIRE_COMPLIANT_DEVICE_POLICY_NAME,
    state: 'enabledForReportingButNotEnforced',
    conditions: {
      users: {
        includeUsers: ['All'],
        excludeGroups: bgGroupId ? [bgGroupId] : [],
      },
      applications: {
        includeApplications: ['All'],
      },
      clientAppTypes: ['all'],
    },
    grantControls: {
      operator: 'OR',
      builtInControls: ['compliantDevice'],
    },
  };

  const created = (await ctx.graphClient
    .api('/identity/conditionalAccess/policies')
    .post(policyBody)) as { id: string; [k: string]: unknown };

  const policyId = created.id;

  const afterSnapshot = await ctx.graphClient
    .api(`/identity/conditionalAccess/policies/${policyId}`)
    .get();

  return {
    beforeSnapshot: { targetResourceId: policyId },
    afterSnapshot,
    targetResourceId: policyId,
    phase: 'report_only_deployed',
    notes: `Created require-compliant-device CA policy ${policyId} in Report-Only mode. Awaiting user Enforce signal.`,
  };
}

export async function requireCompliantDeviceEnforcePhase(
  ctx: ExecutionContext,
  jobState: { targetResourceId: string },
): Promise<ExecutionResult> {
  await ctx.graphClient
    .api(`/identity/conditionalAccess/policies/${jobState.targetResourceId}`)
    .patch({ state: 'enabled' });

  const afterSnapshot = await ctx.graphClient
    .api(`/identity/conditionalAccess/policies/${jobState.targetResourceId}`)
    .get();

  return {
    beforeSnapshot: { targetResourceId: jobState.targetResourceId },
    afterSnapshot,
    targetResourceId: jobState.targetResourceId,
    phase: 'completed',
    notes: `Enforced require-compliant-device CA policy ${jobState.targetResourceId} (state=enabled).`,
  };
}

export async function requireCompliantDeviceRollback(
  ctx: ExecutionContext,
  beforeSnapshot: unknown,
): Promise<void> {
  const target = beforeSnapshot as { targetResourceId?: string } | null;
  if (!target || !target.targetResourceId) {
    throw new Error(
      'requireCompliantDeviceRollback requires targetResourceId on the beforeSnapshot wrapper',
    );
  }
  // DELETE works whether the policy is in Report-Only or Enabled state.
  await ctx.graphClient
    .api(`/identity/conditionalAccess/policies/${target.targetResourceId}`)
    .delete();
}

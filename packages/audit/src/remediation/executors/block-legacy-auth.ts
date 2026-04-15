/**
 * SAFE executor: MS.AAD.1.1v1 -- Block legacy authentication.
 *
 * Creates a Conditional Access policy in Report-Only mode that blocks
 * Exchange ActiveSync and other legacy client types for all users,
 * excluding the break-glass group (REMED-07: prevents lockout).
 *
 * Rollback: DELETE the created policy by its id.
 * Prerequisite: tenant has a break-glass group with at least 1 member
 * (validated against facts.breakGlass, which is populated by Phase 7's
 * new break-glass collector).
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';

export const BLOCK_LEGACY_AUTH_POLICY_NAME = 'Omzig-CA001-Block-Legacy-Auth';

export async function blockLegacyAuthValidatePrerequisites(
  ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  const bg = ctx.facts.breakGlass;
  if (!bg || !bg.available || !bg.groupId || bg.memberCount < 1) {
    return {
      ok: false,
      failureReason:
        'No break-glass group found in tenant. Create a group named ' +
        '"Break-Glass-Admins" with at least 1 member before enabling CA policies.',
    };
  }
  return { ok: true };
}

export async function blockLegacyAuthExecutor(
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const bgGroupId = ctx.facts.breakGlass.groupId;

  const policyBody = {
    displayName: BLOCK_LEGACY_AUTH_POLICY_NAME,
    state: 'enabledForReportingButNotEnforced',
    conditions: {
      clientAppTypes: ['exchangeActiveSync', 'other'],
      users: {
        includeUsers: ['All'],
        excludeGroups: bgGroupId ? [bgGroupId] : [],
      },
      applications: {
        includeApplications: ['All'],
      },
    },
    grantControls: {
      operator: 'OR',
      builtInControls: ['block'],
    },
  };

  // POST creates the policy and Graph returns the full body including id.
  const created = (await ctx.graphClient
    .api('/identity/conditionalAccess/policies')
    .post(policyBody)) as { id: string; [k: string]: unknown };

  const policyId = created.id;

  // Read back the full policy object for afterSnapshot fidelity.
  const afterSnapshot = await ctx.graphClient
    .api(`/identity/conditionalAccess/policies/${policyId}`)
    .get();

  return {
    beforeSnapshot: null, // CREATE: no prior state
    afterSnapshot,
    targetResourceId: policyId,
    notes: `Created CA policy ${BLOCK_LEGACY_AUTH_POLICY_NAME} in Report-Only mode`,
  };
}

export async function blockLegacyAuthRollback(
  ctx: ExecutionContext,
  beforeSnapshot: unknown,
): Promise<void> {
  // beforeSnapshot is null for CREATE, but the worker stores the
  // targetResourceId separately. We expect the caller to resolve it
  // via the entry's job metadata and pass the id through ctx.facts
  // ... actually, since we need the policy id here and it's not on
  // beforeSnapshot, the caller must pre-populate it. Convention: use
  // beforeSnapshot as a carrier when null-but-create and pass the
  // targetResourceId as an object { targetResourceId: string }.
  //
  // Simpler approach: when beforeSnapshot is null, this is a CREATE
  // rollback; we expect targetResourceId on a wrapper passed as beforeSnapshot.
  const target = beforeSnapshot as { targetResourceId?: string } | null;
  if (!target || !target.targetResourceId) {
    throw new Error(
      'blockLegacyAuthRollback requires targetResourceId on the beforeSnapshot wrapper for CREATE rollbacks',
    );
  }
  await ctx.graphClient
    .api(`/identity/conditionalAccess/policies/${target.targetResourceId}`)
    .delete();
}

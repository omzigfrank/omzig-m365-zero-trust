/**
 * RISKY two-phase executor: Sign-in risk Conditional Access policy.
 *
 * Creates a CA policy keyed on Identity Protection sign-in risk levels
 * (medium + high) requiring MFA. Deploys in Report-Only first; second
 * phase flips to Enabled.
 *
 * RISKY because:
 *   - Identity Protection risk signals can generate surprise blocks
 *     for users whose sign-in patterns change (travel, new device,
 *     VPN changes, etc.)
 *   - Requires Entra ID P2 licensing at enforcement time.
 *
 * Rollback (both phases): DELETE the policy.
 *
 * Prerequisite: break-glass group exists with at least 1 member.
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';

export const SIGN_IN_RISK_POLICY_NAME = 'Omzig-CA-Sign-In-Risk-MFA';

export async function signInRiskPolicyValidatePrerequisites(
  ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  const bg = ctx.facts.breakGlass;
  if (!bg || !bg.available || !bg.groupId || bg.memberCount < 1) {
    return {
      ok: false,
      failureReason:
        'No break-glass group found. Create a group named "Break-Glass-Admins" with at least 1 member before enabling sign-in risk CA policies.',
    };
  }
  // P2 check is soft — we warn rather than hard-fail because the entry
  // is discoverable even without P2 and the policy deploys fine in
  // Report-Only mode regardless.
  return { ok: true };
}

export async function signInRiskPolicyExecutor(
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const bgGroupId = ctx.facts.breakGlass.groupId;

  const policyBody = {
    displayName: SIGN_IN_RISK_POLICY_NAME,
    state: 'enabledForReportingButNotEnforced',
    conditions: {
      users: {
        includeUsers: ['All'],
        excludeGroups: bgGroupId ? [bgGroupId] : [],
      },
      applications: {
        includeApplications: ['All'],
      },
      signInRiskLevels: ['high', 'medium'],
      clientAppTypes: ['all'],
    },
    grantControls: {
      operator: 'OR',
      builtInControls: ['mfa'],
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
    notes: `Created sign-in risk CA policy ${policyId} in Report-Only mode (medium+high risk levels).`,
  };
}

export async function signInRiskPolicyEnforcePhase(
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
    notes: `Enforced sign-in risk CA policy ${jobState.targetResourceId}.`,
  };
}

export async function signInRiskPolicyRollback(
  ctx: ExecutionContext,
  beforeSnapshot: unknown,
): Promise<void> {
  const target = beforeSnapshot as { targetResourceId?: string } | null;
  if (!target || !target.targetResourceId) {
    throw new Error(
      'signInRiskPolicyRollback requires targetResourceId on the beforeSnapshot wrapper',
    );
  }
  await ctx.graphClient
    .api(`/identity/conditionalAccess/policies/${target.targetResourceId}`)
    .delete();
}

/**
 * RISKY two-phase executor: MS.AAD.3.8v1 -- Require phishing-resistant MFA
 * (FIDO2, Windows Hello, certificate-based auth) for all users.
 *
 * Creates a Conditional Access policy using an authentication strength
 * reference pointing at the well-known "Phishing-resistant MFA" built-in
 * strength (research §5.4). Deploys in Report-Only first; second phase
 * flips to Enabled via a single PATCH.
 *
 * RISKY because:
 *   - Targets all users; any user without a FIDO2 key, Windows Hello,
 *     or a CBA certificate will be blocked at sign-in once enforced.
 *   - AuditFacts does NOT currently distinguish phishing-resistant method
 *     registration from any-method registration, so impact-preview is
 *     'estimated' confidence.
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

export const REQUIRE_PHISHING_RESISTANT_MFA_POLICY_NAME =
  'Omzig-CA-Require-Phishing-Resistant-MFA';

// Well-known built-in authentication strength policy ID for
// "Phishing-resistant MFA" in Entra ID.
// Reference: https://learn.microsoft.com/en-us/entra/identity/authentication/concept-authentication-strengths
const PHISHING_RESISTANT_STRENGTH_ID = '00000000-0000-0000-0000-000000000004';

export async function requirePhishingResistantMfaValidatePrerequisites(
  ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  const bg = ctx.facts.breakGlass;
  if (!bg || !bg.available || !bg.groupId || bg.memberCount < 1) {
    return {
      ok: false,
      failureReason:
        'No break-glass group found. Create a group named "Break-Glass-Admins" with at least 1 member before enabling phishing-resistant MFA CA policies.',
    };
  }
  return { ok: true };
}

export async function requirePhishingResistantMfaExecutor(
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const bgGroupId = ctx.facts.breakGlass.groupId;

  const policyBody = {
    displayName: REQUIRE_PHISHING_RESISTANT_MFA_POLICY_NAME,
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
      authenticationStrength: {
        id: PHISHING_RESISTANT_STRENGTH_ID,
      },
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
    notes: `Created phishing-resistant MFA CA policy ${policyId} in Report-Only mode.`,
  };
}

export async function requirePhishingResistantMfaEnforcePhase(
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
    notes: `Enforced phishing-resistant MFA CA policy ${jobState.targetResourceId}.`,
  };
}

export async function requirePhishingResistantMfaRollback(
  ctx: ExecutionContext,
  beforeSnapshot: unknown,
): Promise<void> {
  const target = beforeSnapshot as { targetResourceId?: string } | null;
  if (!target || !target.targetResourceId) {
    throw new Error(
      'requirePhishingResistantMfaRollback requires targetResourceId on the beforeSnapshot wrapper',
    );
  }
  await ctx.graphClient
    .api(`/identity/conditionalAccess/policies/${target.targetResourceId}`)
    .delete();
}

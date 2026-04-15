/**
 * SAFE executor: MS.AAD.3.6v1 -- Require MFA for administrative roles.
 *
 * Creates a Conditional Access policy in Report-Only mode targeting the
 * privileged directory roles (Global Admin, Privileged Role Admin,
 * Security Admin, Conditional Access Admin) requiring built-in MFA.
 * Excludes the break-glass group.
 *
 * SAFE because:
 *   - Deployed in Report-Only first, no enforcement
 *   - Targets <10 users in a typical tenant (only admin role holders)
 *   - Break-glass group is excluded
 *   - Rollback = DELETE the created policy
 *
 * Prerequisite: break-glass group exists with at least 1 member.
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';

export const REQUIRE_ADMIN_MFA_POLICY_NAME = 'Omzig-CA006-Require-Admin-MFA';

// Well-known built-in directory role template IDs for privileged admins.
// Reference: https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/permissions-reference
const PRIVILEGED_ROLE_TEMPLATE_IDS = [
  '62e90394-69f5-4237-9190-012177145e10', // Global Administrator
  'e8611ab8-c189-46e8-94e1-60213ab1f814', // Privileged Role Administrator
  '194ae4cb-b126-40b2-bd5b-6091b380977d', // Security Administrator
  'b1be1c3e-b65d-4f19-8427-f6fa0d97feb9', // Conditional Access Administrator
];

export async function requireAdminMfaValidatePrerequisites(
  ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  const bg = ctx.facts.breakGlass;
  if (!bg || !bg.available || !bg.groupId || bg.memberCount < 1) {
    return {
      ok: false,
      failureReason:
        'No break-glass group found in tenant. Create a group named ' +
        '"Break-Glass-Admins" with at least 1 member before enabling admin-targeted CA policies.',
    };
  }
  return { ok: true };
}

export async function requireAdminMfaExecutor(
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const bgGroupId = ctx.facts.breakGlass.groupId;

  const policyBody = {
    displayName: REQUIRE_ADMIN_MFA_POLICY_NAME,
    state: 'enabledForReportingButNotEnforced',
    conditions: {
      users: {
        includeRoles: PRIVILEGED_ROLE_TEMPLATE_IDS,
        excludeGroups: bgGroupId ? [bgGroupId] : [],
      },
      applications: {
        includeApplications: ['All'],
      },
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
    beforeSnapshot: null,
    afterSnapshot,
    targetResourceId: policyId,
    notes: `Created admin-MFA CA policy ${REQUIRE_ADMIN_MFA_POLICY_NAME} in Report-Only mode targeting ${PRIVILEGED_ROLE_TEMPLATE_IDS.length} privileged roles`,
  };
}

export async function requireAdminMfaRollback(
  ctx: ExecutionContext,
  beforeSnapshot: unknown,
): Promise<void> {
  const target = beforeSnapshot as { targetResourceId?: string } | null;
  if (!target || !target.targetResourceId) {
    throw new Error(
      'requireAdminMfaRollback requires targetResourceId on the beforeSnapshot wrapper for CREATE rollbacks',
    );
  }
  await ctx.graphClient
    .api(`/identity/conditionalAccess/policies/${target.targetResourceId}`)
    .delete();
}

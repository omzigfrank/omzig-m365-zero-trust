/**
 * SAFE executor: Enable Security Defaults.
 *
 * Only safe in tenants with ZERO existing Conditional Access policies
 * (research §1.5: Security Defaults and custom CA policies are mutually
 * exclusive; enabling Security Defaults in a tenant with custom CA
 * policies immediately disables all of them).
 *
 * Rollback: PATCH isEnabled back to its prior value (typically false).
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';

export const SECURITY_DEFAULTS_TARGET_ID = 'identitySecurityDefaultsEnforcementPolicy';

export async function enableSecurityDefaultsValidatePrerequisites(
  ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  const ca = ctx.facts.conditionalAccess;
  if (!ca || !ca.available) {
    return {
      ok: false,
      failureReason:
        'Conditional Access facts are not available. Run a full audit first.',
    };
  }
  if (ca.totalPolicies > 0) {
    return {
      ok: false,
      failureReason:
        `Security Defaults are mutually exclusive with custom Conditional Access policies. ` +
        `This tenant has ${ca.totalPolicies} existing CA policies; enabling Security Defaults ` +
        `would disable all of them. Delete the CA policies first or migrate to Security Defaults manually.`,
    };
  }
  return { ok: true };
}

interface SecurityDefaultsBody {
  isEnabled: boolean;
  [k: string]: unknown;
}

export async function enableSecurityDefaultsExecutor(
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const beforeSnapshot = (await ctx.graphClient
    .api('/policies/identitySecurityDefaultsEnforcementPolicy')
    .get()) as SecurityDefaultsBody;

  await ctx.graphClient
    .api('/policies/identitySecurityDefaultsEnforcementPolicy')
    .patch({ isEnabled: true });

  const afterSnapshot = (await ctx.graphClient
    .api('/policies/identitySecurityDefaultsEnforcementPolicy')
    .get()) as SecurityDefaultsBody;

  return {
    beforeSnapshot,
    afterSnapshot,
    targetResourceId: SECURITY_DEFAULTS_TARGET_ID,
    notes: 'Enabled Security Defaults (mutually exclusive with custom CA policies)',
  };
}

export async function enableSecurityDefaultsRollback(
  ctx: ExecutionContext,
  beforeSnapshot: unknown,
): Promise<void> {
  const snap = beforeSnapshot as SecurityDefaultsBody | null;
  const priorEnabled = snap?.isEnabled ?? false;
  await ctx.graphClient
    .api('/policies/identitySecurityDefaultsEnforcementPolicy')
    .patch({ isEnabled: priorEnabled });
}

/**
 * SAFE executor: MS.AAD.3.4v1 / NIST.ZTA.T6.4v1 -- Mark auth methods migration
 * as Migration Complete.
 *
 * PATCHes policyMigrationState=migrationComplete on the
 * authenticationMethodsPolicy singleton. Purely administrative -- consolidates
 * legacy MFA/SSPR settings into the unified authentication methods policy.
 *
 * SAFE because:
 *  - No user-facing effect (already-enabled methods stay enabled)
 *  - Reversible via PATCH back to the prior state
 *  - Microsoft is deprecating the legacy policies anyway
 *
 * Rollback: PATCH policyMigrationState back to the captured prior value.
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';

const POLICY_URI = '/policies/authenticationMethodsPolicy';
export const COMPLETE_AUTH_METHODS_MIGRATION_TARGET_ID =
  'authenticationMethodsPolicy:migrationState';

interface AuthMethodsPolicy {
  policyMigrationState?: string;
  [k: string]: unknown;
}

export async function completeAuthMethodsMigrationValidatePrerequisites(
  ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  const am = ctx.facts.authMethods;
  if (!am || !am.available) {
    return {
      ok: false,
      failureReason:
        'Authentication methods policy is not available. Run a full audit first.',
    };
  }
  return { ok: true };
}

export async function completeAuthMethodsMigrationExecutor(
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const beforeSnapshot = (await ctx.graphClient
    .api(POLICY_URI)
    .get()) as AuthMethodsPolicy;

  await ctx.graphClient
    .api(POLICY_URI)
    .patch({ policyMigrationState: 'migrationComplete' });

  const afterSnapshot = (await ctx.graphClient
    .api(POLICY_URI)
    .get()) as AuthMethodsPolicy;

  return {
    beforeSnapshot,
    afterSnapshot,
    targetResourceId: COMPLETE_AUTH_METHODS_MIGRATION_TARGET_ID,
    notes: 'Marked auth methods migration as Migration Complete',
  };
}

export async function completeAuthMethodsMigrationRollback(
  ctx: ExecutionContext,
  beforeSnapshot: unknown,
): Promise<void> {
  const snap = beforeSnapshot as AuthMethodsPolicy | null;
  const prior = snap?.policyMigrationState ?? 'preMigration';
  await ctx.graphClient
    .api(POLICY_URI)
    .patch({ policyMigrationState: prior });
}

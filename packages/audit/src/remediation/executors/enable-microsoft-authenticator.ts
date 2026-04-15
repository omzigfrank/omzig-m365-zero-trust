/**
 * SAFE executor: MS.AAD.3.2v1 -- Enable Microsoft Authenticator as an approved
 * authentication method.
 *
 * PATCHes the Microsoft Authenticator authentication method configuration in
 * the tenant-wide policy to `state=enabled` with targets=All users.
 *
 * SAFE because enabling an approved MFA method is purely additive -- it only
 * unlocks Authenticator registration; existing users retain their current
 * methods and nothing is disabled or removed.
 *
 * Rollback: PATCH state back to whatever was captured in beforeSnapshot.
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';

const METHOD_URI =
  '/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/MicrosoftAuthenticator';

export const ENABLE_MS_AUTHENTICATOR_TARGET_ID =
  'authenticationMethodsPolicy:MicrosoftAuthenticator';

interface MethodConfig {
  '@odata.type'?: string;
  id?: string;
  state: string;
  [k: string]: unknown;
}

export async function enableMicrosoftAuthenticatorValidatePrerequisites(
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

export async function enableMicrosoftAuthenticatorExecutor(
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const beforeSnapshot = (await ctx.graphClient
    .api(METHOD_URI)
    .get()) as MethodConfig;

  await ctx.graphClient.api(METHOD_URI).patch({ state: 'enabled' });

  const afterSnapshot = (await ctx.graphClient
    .api(METHOD_URI)
    .get()) as MethodConfig;

  return {
    beforeSnapshot,
    afterSnapshot,
    targetResourceId: ENABLE_MS_AUTHENTICATOR_TARGET_ID,
    notes: 'Enabled Microsoft Authenticator as an approved MFA method',
  };
}

export async function enableMicrosoftAuthenticatorRollback(
  ctx: ExecutionContext,
  beforeSnapshot: unknown,
): Promise<void> {
  const snap = beforeSnapshot as MethodConfig | null;
  if (!snap) {
    throw new Error(
      'enableMicrosoftAuthenticatorRollback: beforeSnapshot required',
    );
  }
  await ctx.graphClient.api(METHOD_URI).patch({ state: snap.state });
}

/**
 * SAFE executor: MS.AAD.3.5v1 -- Disable SMS and Voice authentication methods.
 *
 * Gated by a prerequisite check: at least one strong authentication method
 * (Microsoft Authenticator or FIDO2) must already be enabled in the tenant.
 * Without this guard, disabling SMS/Voice in a tenant that has no strong
 * methods configured would effectively disable MFA for everyone who relies
 * on the weak methods.
 *
 * Note: AuthMethodsFacts does not currently expose a windowsHelloForBusiness
 * flag, so the prerequisite treats (microsoftAuthEnabled || fido2Enabled) as
 * "at least one strong method". Windows Hello users are implicitly covered
 * because Microsoft Authenticator is near-universal on tenants that have
 * modern auth configured.
 *
 * Rollback: PATCH both method configurations back to their prior state.
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';

export const DISABLE_SMS_VOICE_TARGET_ID = 'authenticationMethodsPolicy:Sms,Voice';

export async function disableSmsVoiceValidatePrerequisites(
  ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  const am = ctx.facts.authMethods;
  if (!am || !am.available) {
    return {
      ok: false,
      failureReason:
        'Authentication methods policy is not available. Run a full audit first to collect the authMethods facts.',
    };
  }
  // AuthMethodsFacts intentionally lacks a windowsHelloForBusiness flag;
  // treat Microsoft Authenticator + FIDO2 as the strong-method pair.
  if (!am.microsoftAuthEnabled && !am.fido2Enabled) {
    return {
      ok: false,
      failureReason:
        'Cannot disable SMS/Voice -- no strong authentication method is currently enabled. ' +
        'Configure Microsoft Authenticator or FIDO2 in Entra > Protection > Authentication methods first.',
    };
  }
  return { ok: true };
}

interface MethodConfig {
  '@odata.type'?: string;
  id?: string;
  state: string;
  [k: string]: unknown;
}

export async function disableSmsVoiceExecutor(
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  // Capture before state for rollback.
  const smsBefore = (await ctx.graphClient
    .api('/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/Sms')
    .get()) as MethodConfig;
  const voiceBefore = (await ctx.graphClient
    .api('/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/Voice')
    .get()) as MethodConfig;

  // Disable SMS.
  await ctx.graphClient
    .api('/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/Sms')
    .patch({ state: 'disabled' });

  // Disable Voice.
  await ctx.graphClient
    .api('/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/Voice')
    .patch({ state: 'disabled' });

  // Re-fetch for afterSnapshot fidelity.
  const smsAfter = (await ctx.graphClient
    .api('/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/Sms')
    .get()) as MethodConfig;
  const voiceAfter = (await ctx.graphClient
    .api('/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/Voice')
    .get()) as MethodConfig;

  return {
    beforeSnapshot: { sms: smsBefore, voice: voiceBefore },
    afterSnapshot: { sms: smsAfter, voice: voiceAfter },
    targetResourceId: DISABLE_SMS_VOICE_TARGET_ID,
    notes: 'Disabled SMS and Voice authentication methods',
  };
}

export async function disableSmsVoiceRollback(
  ctx: ExecutionContext,
  beforeSnapshot: unknown,
): Promise<void> {
  const snap = beforeSnapshot as { sms?: MethodConfig; voice?: MethodConfig } | null;
  if (!snap || !snap.sms || !snap.voice) {
    throw new Error('disableSmsVoiceRollback: beforeSnapshot must contain sms and voice entries');
  }
  let smsOk = false;
  try {
    await ctx.graphClient
      .api('/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/Sms')
      .patch({ state: snap.sms.state });
    smsOk = true;
    await ctx.graphClient
      .api('/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/Voice')
      .patch({ state: snap.voice.state });
  } catch (err) {
    // If the Voice PATCH fails after SMS PATCH succeeded, signal partial.
    const reason = err instanceof Error ? err.message : String(err);
    if (smsOk) {
      throw new Error(`partial: SMS rolled back, Voice failed: ${reason}`);
    }
    throw err;
  }
}

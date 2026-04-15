/**
 * Executor registry.
 *
 * Maps controlId -> { executor, rollbackExecutor, validatePrerequisites }.
 * Wired into the main remediation registry at module load time (see
 * ../index.ts) by mutating each RemediationEntry in place.
 *
 * Phase 7 Plan 01 shipped 5 initial SAFE executors. Plan 07-02 completes
 * SAFE coverage by:
 *   - Adding 8 new executor modules (one per new Graph operation)
 *   - Adding 1 PIM skeleton that throws ExecutorError
 *   - Aliasing several NIST entries to the existing Entra ID executors
 *     (NIST entries often wrap the same underlying Graph write, so the
 *     same ExecutorBundle is registered under multiple controlIds)
 *
 * Skeletons intentionally deferred (throw ExecutorError on execution):
 *   - EXCHANGE mailbox auditing (EXTREMED-01 PowerShell sidecar)
 *   - MS.AAD.7.6v1 PIM activation MFA (requires P2 + per-role enumeration)
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';

import {
  blockLegacyAuthExecutor,
  blockLegacyAuthRollback,
  blockLegacyAuthValidatePrerequisites,
} from './block-legacy-auth.js';
import {
  disableSmsVoiceExecutor,
  disableSmsVoiceRollback,
  disableSmsVoiceValidatePrerequisites,
} from './disable-sms-voice.js';
import {
  requireAdminMfaExecutor,
  requireAdminMfaRollback,
  requireAdminMfaValidatePrerequisites,
} from './require-admin-mfa.js';
import {
  enableSecurityDefaultsExecutor,
  enableSecurityDefaultsRollback,
  enableSecurityDefaultsValidatePrerequisites,
} from './enable-security-defaults.js';
import { enableMailboxAuditingExecutor } from './enable-mailbox-auditing.js';

// Plan 07-02 additions:
import {
  enableMicrosoftAuthenticatorExecutor,
  enableMicrosoftAuthenticatorRollback,
  enableMicrosoftAuthenticatorValidatePrerequisites,
} from './enable-microsoft-authenticator.js';
import {
  completeAuthMethodsMigrationExecutor,
  completeAuthMethodsMigrationRollback,
  completeAuthMethodsMigrationValidatePrerequisites,
} from './complete-auth-methods-migration.js';
import {
  disableUserAppRegistrationExecutor,
  disableUserAppRegistrationRollback,
  disableUserAppRegistrationValidatePrerequisites,
} from './disable-user-app-registration.js';
import {
  enableAdminConsentWorkflowExecutor,
  enableAdminConsentWorkflowRollback,
  enableAdminConsentWorkflowValidatePrerequisites,
} from './enable-admin-consent-workflow.js';
import {
  disableGroupOwnerConsentExecutor,
  disableGroupOwnerConsentRollback,
  disableGroupOwnerConsentValidatePrerequisites,
} from './disable-group-owner-consent.js';
import {
  setPasswordNeverExpireExecutor,
  setPasswordNeverExpireRollback,
  setPasswordNeverExpireValidatePrerequisites,
} from './set-password-never-expire.js';
import {
  restrictGuestAccessLimitedExecutor,
  restrictGuestAccessLimitedRollback,
  restrictGuestAccessLimitedValidatePrerequisites,
} from './restrict-guest-access-limited.js';
import {
  restrictGuestAccessRestrictedExecutor,
  restrictGuestAccessRestrictedRollback,
  restrictGuestAccessRestrictedValidatePrerequisites,
} from './restrict-guest-access-restricted.js';
import {
  requirePimActivationMfaExecutor,
  requirePimActivationMfaRollback,
  requirePimActivationMfaValidatePrerequisites,
} from './require-pim-activation-mfa.js';

// Plan 07-03 RISKY executor additions:
import {
  requireCompliantDeviceExecutor,
  requireCompliantDeviceEnforcePhase,
  requireCompliantDeviceRollback,
  requireCompliantDeviceValidatePrerequisites,
} from './require-compliant-device.js';
import {
  requirePhishingResistantMfaExecutor,
  requirePhishingResistantMfaEnforcePhase,
  requirePhishingResistantMfaRollback,
  requirePhishingResistantMfaValidatePrerequisites,
} from './require-phishing-resistant-mfa.js';
import {
  signInRiskPolicyExecutor,
  signInRiskPolicyEnforcePhase,
  signInRiskPolicyRollback,
  signInRiskPolicyValidatePrerequisites,
} from './sign-in-risk-policy.js';
import {
  blockGuestAccessExecutor,
  blockGuestAccessRollback,
  blockGuestAccessValidatePrerequisites,
} from './block-guest-access.js';
import {
  disableUserConsentAllExecutor,
  disableUserConsentAllRollback,
  disableUserConsentAllValidatePrerequisites,
} from './disable-user-consent-all.js';

export interface ExecutorBundle {
  executor: (ctx: ExecutionContext) => Promise<ExecutionResult>;
  rollbackExecutor?: (ctx: ExecutionContext, beforeSnapshot: unknown) => Promise<void>;
  validatePrerequisites?: (ctx: ExecutionContext) => Promise<PrerequisiteCheckResult>;
  /** Plan 07-03: two-phase RISKY executors supply the second-phase function. */
  enforcePhaseExecutor?: (
    ctx: ExecutionContext,
    jobState: { targetResourceId: string },
  ) => Promise<ExecutionResult>;
}

// Bundles defined once so NIST aliases can share the same instance.
const blockLegacyAuthBundle: ExecutorBundle = {
  executor: blockLegacyAuthExecutor,
  rollbackExecutor: blockLegacyAuthRollback,
  validatePrerequisites: blockLegacyAuthValidatePrerequisites,
};

const disableSmsVoiceBundle: ExecutorBundle = {
  executor: disableSmsVoiceExecutor,
  rollbackExecutor: disableSmsVoiceRollback,
  validatePrerequisites: disableSmsVoiceValidatePrerequisites,
};

const requireAdminMfaBundle: ExecutorBundle = {
  executor: requireAdminMfaExecutor,
  rollbackExecutor: requireAdminMfaRollback,
  validatePrerequisites: requireAdminMfaValidatePrerequisites,
};

const enableMicrosoftAuthenticatorBundle: ExecutorBundle = {
  executor: enableMicrosoftAuthenticatorExecutor,
  rollbackExecutor: enableMicrosoftAuthenticatorRollback,
  validatePrerequisites: enableMicrosoftAuthenticatorValidatePrerequisites,
};

const completeAuthMethodsMigrationBundle: ExecutorBundle = {
  executor: completeAuthMethodsMigrationExecutor,
  rollbackExecutor: completeAuthMethodsMigrationRollback,
  validatePrerequisites: completeAuthMethodsMigrationValidatePrerequisites,
};

const disableUserAppRegistrationBundle: ExecutorBundle = {
  executor: disableUserAppRegistrationExecutor,
  rollbackExecutor: disableUserAppRegistrationRollback,
  validatePrerequisites: disableUserAppRegistrationValidatePrerequisites,
};

const enableAdminConsentWorkflowBundle: ExecutorBundle = {
  executor: enableAdminConsentWorkflowExecutor,
  rollbackExecutor: enableAdminConsentWorkflowRollback,
  validatePrerequisites: enableAdminConsentWorkflowValidatePrerequisites,
};

const disableGroupOwnerConsentBundle: ExecutorBundle = {
  executor: disableGroupOwnerConsentExecutor,
  rollbackExecutor: disableGroupOwnerConsentRollback,
  validatePrerequisites: disableGroupOwnerConsentValidatePrerequisites,
};

const setPasswordNeverExpireBundle: ExecutorBundle = {
  executor: setPasswordNeverExpireExecutor,
  rollbackExecutor: setPasswordNeverExpireRollback,
  validatePrerequisites: setPasswordNeverExpireValidatePrerequisites,
};

const restrictGuestAccessLimitedBundle: ExecutorBundle = {
  executor: restrictGuestAccessLimitedExecutor,
  rollbackExecutor: restrictGuestAccessLimitedRollback,
  validatePrerequisites: restrictGuestAccessLimitedValidatePrerequisites,
};

const restrictGuestAccessRestrictedBundle: ExecutorBundle = {
  executor: restrictGuestAccessRestrictedExecutor,
  rollbackExecutor: restrictGuestAccessRestrictedRollback,
  validatePrerequisites: restrictGuestAccessRestrictedValidatePrerequisites,
};

const requirePimActivationMfaBundle: ExecutorBundle = {
  executor: requirePimActivationMfaExecutor,
  rollbackExecutor: requirePimActivationMfaRollback,
  validatePrerequisites: requirePimActivationMfaValidatePrerequisites,
};

// --- Plan 07-03 RISKY bundles ---

// Two-phase: require compliant device (MS.AAD.3.7v1, NIST.ZTA.T4.2v1)
const requireCompliantDeviceBundle: ExecutorBundle = {
  executor: requireCompliantDeviceExecutor,
  enforcePhaseExecutor: requireCompliantDeviceEnforcePhase,
  rollbackExecutor: requireCompliantDeviceRollback,
  validatePrerequisites: requireCompliantDeviceValidatePrerequisites,
};

// Two-phase: require phishing-resistant MFA (MS.AAD.3.1v1)
const requirePhishingResistantMfaBundle: ExecutorBundle = {
  executor: requirePhishingResistantMfaExecutor,
  enforcePhaseExecutor: requirePhishingResistantMfaEnforcePhase,
  rollbackExecutor: requirePhishingResistantMfaRollback,
  validatePrerequisites: requirePhishingResistantMfaValidatePrerequisites,
};

// Two-phase: sign-in risk CA policy (NIST.ZTA.T4.1v1)
const signInRiskPolicyBundle: ExecutorBundle = {
  executor: signInRiskPolicyExecutor,
  enforcePhaseExecutor: signInRiskPolicyEnforcePhase,
  rollbackExecutor: signInRiskPolicyRollback,
  validatePrerequisites: signInRiskPolicyValidatePrerequisites,
};

// Single-phase: block guest invites (MS.AAD.8.2v1)
const blockGuestAccessBundle: ExecutorBundle = {
  executor: blockGuestAccessExecutor,
  rollbackExecutor: blockGuestAccessRollback,
  validatePrerequisites: blockGuestAccessValidatePrerequisites,
};

// Single-phase: disable user consent to all apps (MS.AAD.5.2v1)
const disableUserConsentAllBundle: ExecutorBundle = {
  executor: disableUserConsentAllExecutor,
  rollbackExecutor: disableUserConsentAllRollback,
  validatePrerequisites: disableUserConsentAllValidatePrerequisites,
};

/**
 * Map from controlId to the bundle of executor functions for that control.
 */
export const EXECUTOR_REGISTRY: Record<string, ExecutorBundle> = {
  // --- CISA SCuBA Entra ID ---
  'MS.AAD.1.1v1': blockLegacyAuthBundle,
  'MS.AAD.3.2v1': enableMicrosoftAuthenticatorBundle,
  'MS.AAD.3.4v1': completeAuthMethodsMigrationBundle,
  'MS.AAD.3.5v1': disableSmsVoiceBundle,
  'MS.AAD.3.6v1': requireAdminMfaBundle,
  'MS.AAD.5.1v1': disableUserAppRegistrationBundle,
  'MS.AAD.5.3v1': enableAdminConsentWorkflowBundle,
  'MS.AAD.5.4v1': disableGroupOwnerConsentBundle,
  'MS.AAD.6.1v1': setPasswordNeverExpireBundle,
  'MS.AAD.7.6v1': requirePimActivationMfaBundle,
  'MS.AAD.8.1v1': restrictGuestAccessLimitedBundle,
  'MS.AAD.8.3v1': restrictGuestAccessRestrictedBundle,

  // --- NIST ZTA ---
  // Block legacy auth (same Graph write as MS.AAD.1.1v1)
  'NIST.ZTA.T2.1v1': blockLegacyAuthBundle,
  // Admin-MFA CA policy (same Graph write as MS.AAD.3.6v1)
  'NIST.ZTA.T4.6v1': requireAdminMfaBundle,
  // Complete auth methods migration (same as MS.AAD.3.4v1)
  'NIST.ZTA.T6.4v1': completeAuthMethodsMigrationBundle,
  // Disable SMS/Voice (same as MS.AAD.3.5v1)
  'NIST.ZTA.T6.5v1': disableSmsVoiceBundle,
  // Enable admin consent workflow (same as MS.AAD.5.3v1)
  'NIST.ZTA.T6.7v1': enableAdminConsentWorkflowBundle,
  // Restrict user app registration (same as MS.AAD.5.1v1)
  'NIST.ZTA.T7.3v1': disableUserAppRegistrationBundle,
  // Password never-expire (same as MS.AAD.6.1v1)
  'NIST.ZTA.T7.4v1': setPasswordNeverExpireBundle,

  // --- NIST 800-53 ---
  // IA-5 password validity (same as MS.AAD.6.1v1)
  'NIST.80053.IA-5v1': setPasswordNeverExpireBundle,
  // SC-7 boundary protection / block legacy auth (same as MS.AAD.1.1v1)
  'NIST.80053.SC-7v1': blockLegacyAuthBundle,
  // CM-7 restrict user app registration (same as MS.AAD.5.1v1)
  'NIST.80053.CM-7v1': disableUserAppRegistrationBundle,

  // --- NIST CSF ---
  // PR.DS-2 block legacy auth (same as MS.AAD.1.1v1)
  'NIST.CSF.PR.DS-2v1': blockLegacyAuthBundle,
  // RS.MA-1 admin consent workflow (same as MS.AAD.5.3v1)
  'NIST.CSF.RS.MA-1v1': enableAdminConsentWorkflowBundle,

  // --- Plan 07-03 RISKY executors ---
  // Require phishing-resistant MFA (MS.AAD.3.1v1 — two-phase)
  'MS.AAD.3.1v1': requirePhishingResistantMfaBundle,
  // Require compliant device (MS.AAD.3.7v1 — two-phase)
  'MS.AAD.3.7v1': requireCompliantDeviceBundle,
  // Disable user consent to all apps (MS.AAD.5.2v1 — single-phase authPolicy)
  'MS.AAD.5.2v1': disableUserConsentAllBundle,
  // Restrict guest invites to admins (MS.AAD.8.2v1 — single-phase authPolicy)
  'MS.AAD.8.2v1': blockGuestAccessBundle,
  // Sign-in risk CA policy (NIST.ZTA.T4.1v1 — two-phase)
  'NIST.ZTA.T4.1v1': signInRiskPolicyBundle,
  // NIST.ZTA.T4.2v1 alias for compliant-device CA policy
  'NIST.ZTA.T4.2v1': requireCompliantDeviceBundle,
};

// Exports for direct unit testing. Security Defaults has no CISA SCuBA
// controlId mapping yet; it is exported so a future plan can wire it in.
export {
  blockLegacyAuthExecutor,
  blockLegacyAuthRollback,
  blockLegacyAuthValidatePrerequisites,
  disableSmsVoiceExecutor,
  disableSmsVoiceRollback,
  disableSmsVoiceValidatePrerequisites,
  requireAdminMfaExecutor,
  requireAdminMfaRollback,
  requireAdminMfaValidatePrerequisites,
  enableSecurityDefaultsExecutor,
  enableSecurityDefaultsRollback,
  enableSecurityDefaultsValidatePrerequisites,
  enableMailboxAuditingExecutor,
  enableMicrosoftAuthenticatorExecutor,
  enableMicrosoftAuthenticatorRollback,
  enableMicrosoftAuthenticatorValidatePrerequisites,
  completeAuthMethodsMigrationExecutor,
  completeAuthMethodsMigrationRollback,
  completeAuthMethodsMigrationValidatePrerequisites,
  disableUserAppRegistrationExecutor,
  disableUserAppRegistrationRollback,
  disableUserAppRegistrationValidatePrerequisites,
  enableAdminConsentWorkflowExecutor,
  enableAdminConsentWorkflowRollback,
  enableAdminConsentWorkflowValidatePrerequisites,
  disableGroupOwnerConsentExecutor,
  disableGroupOwnerConsentRollback,
  disableGroupOwnerConsentValidatePrerequisites,
  setPasswordNeverExpireExecutor,
  setPasswordNeverExpireRollback,
  setPasswordNeverExpireValidatePrerequisites,
  restrictGuestAccessLimitedExecutor,
  restrictGuestAccessLimitedRollback,
  restrictGuestAccessLimitedValidatePrerequisites,
  restrictGuestAccessRestrictedExecutor,
  restrictGuestAccessRestrictedRollback,
  restrictGuestAccessRestrictedValidatePrerequisites,
  requirePimActivationMfaExecutor,
  requirePimActivationMfaRollback,
  requirePimActivationMfaValidatePrerequisites,
  // Plan 07-03 RISKY executors
  requireCompliantDeviceExecutor,
  requireCompliantDeviceEnforcePhase,
  requireCompliantDeviceRollback,
  requireCompliantDeviceValidatePrerequisites,
  requirePhishingResistantMfaExecutor,
  requirePhishingResistantMfaEnforcePhase,
  requirePhishingResistantMfaRollback,
  requirePhishingResistantMfaValidatePrerequisites,
  signInRiskPolicyExecutor,
  signInRiskPolicyEnforcePhase,
  signInRiskPolicyRollback,
  signInRiskPolicyValidatePrerequisites,
  blockGuestAccessExecutor,
  blockGuestAccessRollback,
  blockGuestAccessValidatePrerequisites,
  disableUserConsentAllExecutor,
  disableUserConsentAllRollback,
  disableUserConsentAllValidatePrerequisites,
};

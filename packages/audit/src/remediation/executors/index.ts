/**
 * Executor registry.
 *
 * Phase 7 Plan 01 Task 2. Maps controlId -> executor/rollback/prereq
 * functions. Wired into the main remediation registry at module load
 * time (see ../index.ts) by mutating each RemediationEntry in place.
 *
 * 5 initial SAFE executors:
 *   - MS.AAD.1.1v1: block legacy auth (CA policy, Report-Only)
 *   - MS.AAD.3.5v1: disable SMS/Voice auth methods
 *   - MS.AAD.3.6v1: require admin MFA (admin-scoped CA policy)
 *   - EXCHANGE_MAILBOX_AUDIT: skeleton / deferred to EXTREMED-01
 *   - identitySecurityDefaultsEnforcementPolicy: enable Security Defaults
 *     (not attached via controlId -- helper exports only; a future plan
 *     will map it to the correct registry entry once CISA adds one)
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

export interface ExecutorBundle {
  executor: (ctx: ExecutionContext) => Promise<ExecutionResult>;
  rollbackExecutor?: (ctx: ExecutionContext, beforeSnapshot: unknown) => Promise<void>;
  validatePrerequisites?: (ctx: ExecutionContext) => Promise<PrerequisiteCheckResult>;
}

/**
 * Map from controlId to the bundle of executor functions for that control.
 * The main registry (../index.ts) attaches these to RemediationEntries at
 * module load time.
 */
export const EXECUTOR_REGISTRY: Record<string, ExecutorBundle> = {
  'MS.AAD.1.1v1': {
    executor: blockLegacyAuthExecutor,
    rollbackExecutor: blockLegacyAuthRollback,
    validatePrerequisites: blockLegacyAuthValidatePrerequisites,
  },
  'MS.AAD.3.5v1': {
    executor: disableSmsVoiceExecutor,
    rollbackExecutor: disableSmsVoiceRollback,
    validatePrerequisites: disableSmsVoiceValidatePrerequisites,
  },
  'MS.AAD.3.6v1': {
    executor: requireAdminMfaExecutor,
    rollbackExecutor: requireAdminMfaRollback,
    validatePrerequisites: requireAdminMfaValidatePrerequisites,
  },
  // Skeleton: Exchange mailbox auditing awaits the PowerShell sidecar
  // (EXTREMED-01). The throwing executor ensures the framework is
  // exercised even when the sidecar is not available. No registry
  // entry points to this yet -- it is exported so consumers can invoke
  // it through a future dispatcher routing table.
};

// Exports also include functions not yet wired to a real registry
// controlId (Security Defaults has no CISA SCuBA control ID of its own,
// Exchange mailbox auditing awaits sidecar). Plan 07-02/07-03 will wire
// these through a dispatcher-level routing table.
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
};

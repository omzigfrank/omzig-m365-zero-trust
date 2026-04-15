/**
 * SAFE executor SKELETON: MS.AAD.7.6v1 -- Require Azure MFA on PIM activation.
 *
 * Intended behavior:
 *   For each highly-privileged Entra ID directory role, load the PIM
 *   role management policy assignment, locate the
 *   Enablement_EndUser_Assignment rule on effectiveRules, and PATCH
 *   enabledRules to include 'MultiFactorAuthentication'.
 *
 * Status: skeleton. The PIM Graph endpoints
 *   GET  /policies/roleManagementPolicyAssignments
 *   GET  /policies/roleManagementPolicies/{id}
 *   PATCH /policies/roleManagementPolicies/{id}/rules/{ruleId}
 * exist, but the full flow requires per-role enumeration, policy
 * assignment resolution, and rule replacement semantics that cross
 * several Graph resources. It also requires Entra ID P2 licensing in
 * the target tenant, which is out of scope for the Plan 07-02 SAFE
 * coverage gate. Planned for a follow-up alongside the PIM
 * approval-flow executors (currently classified RISKY).
 *
 * The throwing executor exercises the framework's ExecutorError path
 * so the worker reports a clear message to the UI instead of silently
 * skipping the control.
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';
import { ExecutorError } from '../remediation-executor.js';

export async function requirePimActivationMfaValidatePrerequisites(
  _ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  return { ok: true };
}

export async function requirePimActivationMfaExecutor(
  _ctx: ExecutionContext,
): Promise<ExecutionResult> {
  throw new ExecutorError(
    'MS.AAD.7.6v1',
    new Error(
      'PIM activation-MFA requires per-role policy assignment enumeration; ' +
        'deferred to a follow-up alongside the broader PIM workflow (requires Entra ID P2). ' +
        'Use the admin portal link in the meantime.',
    ),
  );
}

export async function requirePimActivationMfaRollback(
  _ctx: ExecutionContext,
  _beforeSnapshot: unknown,
): Promise<void> {
  // No-op -- the executor never wrote anything. This function exists so
  // the rollback service does not throw if it is ever invoked by mistake.
}

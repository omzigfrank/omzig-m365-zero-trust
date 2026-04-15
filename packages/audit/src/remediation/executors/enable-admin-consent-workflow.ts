/**
 * SAFE executor: MS.AAD.5.3v1 / NIST.ZTA.T6.7v1 / NIST.CSF.RS.MA-1v1 --
 * Enable the Admin Consent Request workflow.
 *
 * PUTs /policies/adminConsentRequestPolicy (singleton) with
 * isEnabled=true, a reasonable default duration, and notifyReviewers toggles.
 *
 * NOTE (research §1.4): PUT is destructive on this resource -- the body
 * replaces the entire policy. We capture the full prior body into
 * beforeSnapshot and rollback by re-PUTting that entire object.
 *
 * SAFE because:
 *  - Purely additive for end users (creates a structured request path)
 *  - Does not remove existing grants
 *  - Reversible via PUT with the captured full-body beforeSnapshot
 *
 * Note: the reviewers list is intentionally empty by default in this
 * executor -- the admin must assign reviewers via the portal afterwards
 * (the Graph call requires a valid Entra object ID which we do not
 * have at execution time). The flow still improves the consent posture.
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';

const POLICY_URI = '/policies/adminConsentRequestPolicy';
export const ENABLE_ADMIN_CONSENT_WORKFLOW_TARGET_ID =
  'adminConsentRequestPolicy';

interface AdminConsentRequestPolicy {
  isEnabled?: boolean;
  notifyReviewers?: boolean;
  notifyReviewersOnDeny?: boolean;
  remindersEnabled?: boolean;
  requestDurationInDays?: number;
  reviewers?: unknown[];
  [k: string]: unknown;
}

export async function enableAdminConsentWorkflowValidatePrerequisites(
  _ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  return { ok: true };
}

export async function enableAdminConsentWorkflowExecutor(
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const beforeSnapshot = (await ctx.graphClient
    .api(POLICY_URI)
    .get()) as AdminConsentRequestPolicy;

  // PUT is destructive -- we must send a full policy body.
  const body = {
    isEnabled: true,
    notifyReviewers: true,
    notifyReviewersOnDeny: true,
    remindersEnabled: true,
    requestDurationInDays: 30,
    reviewers: beforeSnapshot.reviewers ?? [],
  };

  await ctx.graphClient.api(POLICY_URI).put(body);

  const afterSnapshot = (await ctx.graphClient
    .api(POLICY_URI)
    .get()) as AdminConsentRequestPolicy;

  return {
    beforeSnapshot,
    afterSnapshot,
    targetResourceId: ENABLE_ADMIN_CONSENT_WORKFLOW_TARGET_ID,
    notes:
      'Enabled Admin Consent Request workflow (30-day duration, reviewers TBD)',
  };
}

export async function enableAdminConsentWorkflowRollback(
  ctx: ExecutionContext,
  beforeSnapshot: unknown,
): Promise<void> {
  const snap = beforeSnapshot as AdminConsentRequestPolicy | null;
  if (!snap) {
    throw new Error(
      'enableAdminConsentWorkflowRollback: beforeSnapshot required (PUT rollback needs full body)',
    );
  }
  // Re-PUT the full captured body.
  await ctx.graphClient.api(POLICY_URI).put({
    isEnabled: snap.isEnabled ?? false,
    notifyReviewers: snap.notifyReviewers ?? false,
    notifyReviewersOnDeny: snap.notifyReviewersOnDeny ?? false,
    remindersEnabled: snap.remindersEnabled ?? false,
    requestDurationInDays: snap.requestDurationInDays ?? 30,
    reviewers: snap.reviewers ?? [],
  });
}

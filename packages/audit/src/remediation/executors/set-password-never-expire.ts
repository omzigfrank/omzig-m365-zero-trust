/**
 * SAFE executor: MS.AAD.6.1v1 / NIST.ZTA.T7.4v1 / NIST.80053.IA-5v1 --
 * Set password validity period to never-expire per NIST 800-63B.
 *
 * For every accepted domain in the tenant, PATCH
 * passwordValidityPeriodInDays = 2147483647 (Int32 max ~= infinity) and
 * passwordNotificationWindowInDays = 14 (default).
 *
 * NIST 800-63B recommends against forced periodic password rotation; this
 * aligns with the recommendation and reduces helpdesk friction.
 *
 * SAFE because:
 *  - Does not disable or weaken any existing authentication factor
 *  - Reversible via PATCH with the captured prior numeric value
 *  - Impact is "users no longer forced to rotate"; no lockout risk
 *
 * Rollback: PATCH each domain back to the captured prior validity period.
 * Partial-failure handling: if one domain fails mid-loop, emit a
 * "partial:" error so the rollback service returns rollback_partial.
 */

import type {
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from '../types.js';

export const SET_PASSWORD_NEVER_EXPIRE_TARGET_ID = 'domains:passwordValidity';
const NEVER_EXPIRE_DAYS = 2147483647;

interface DomainRow {
  id: string;
  passwordValidityPeriodInDays?: number;
  passwordNotificationWindowInDays?: number;
  [k: string]: unknown;
}

interface DomainsResponse {
  value: DomainRow[];
  [k: string]: unknown;
}

interface DomainSnapshot {
  id: string;
  priorValidity: number;
}

export async function setPasswordNeverExpireValidatePrerequisites(
  _ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  return { ok: true };
}

export async function setPasswordNeverExpireExecutor(
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const domainsResponse = (await ctx.graphClient
    .api('/domains')
    .get()) as DomainsResponse;
  const domains = domainsResponse.value ?? [];

  const snapshots: DomainSnapshot[] = [];

  for (const domain of domains) {
    snapshots.push({
      id: domain.id,
      priorValidity:
        domain.passwordValidityPeriodInDays ?? NEVER_EXPIRE_DAYS,
    });
    await ctx.graphClient.api(`/domains/${domain.id}`).patch({
      passwordValidityPeriodInDays: NEVER_EXPIRE_DAYS,
      passwordNotificationWindowInDays:
        domain.passwordNotificationWindowInDays ?? 14,
    });
  }

  const afterDomainsResponse = (await ctx.graphClient
    .api('/domains')
    .get()) as DomainsResponse;

  return {
    beforeSnapshot: snapshots,
    afterSnapshot: afterDomainsResponse.value,
    targetResourceId: SET_PASSWORD_NEVER_EXPIRE_TARGET_ID,
    notes: `Set password validity to never-expire on ${snapshots.length} domain(s)`,
  };
}

export async function setPasswordNeverExpireRollback(
  ctx: ExecutionContext,
  beforeSnapshot: unknown,
): Promise<void> {
  const snapshots = beforeSnapshot as DomainSnapshot[] | null;
  if (!Array.isArray(snapshots)) {
    throw new Error(
      'setPasswordNeverExpireRollback: beforeSnapshot must be a DomainSnapshot array',
    );
  }

  const rolledBack: string[] = [];
  try {
    for (const snap of snapshots) {
      await ctx.graphClient
        .api(`/domains/${snap.id}`)
        .patch({ passwordValidityPeriodInDays: snap.priorValidity });
      rolledBack.push(snap.id);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (rolledBack.length > 0 && rolledBack.length < snapshots.length) {
      throw new Error(
        `partial: rolled back ${rolledBack.length}/${snapshots.length} domains: ${reason}`,
      );
    }
    throw err;
  }
}

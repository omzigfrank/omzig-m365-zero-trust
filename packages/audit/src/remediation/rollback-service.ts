/**
 * RollbackService -- Phase 7 Plan 01 Task 2.
 *
 * Computes drift between the current state of a Graph resource and the
 * afterSnapshot captured at the time of remediation, and performs the
 * rollback by PATCHing beforeSnapshot back (or executing a custom
 * rollbackExecutor for CREATE-type remediations where the rollback is
 * a DELETE).
 *
 * Research §7.2: skip volatile fields that always change on every PATCH
 * (modifiedDateTime, createdDateTime, policyVersion, lastModifiedDateTime)
 * because a trivial drift on these fields is expected and is not a
 * meaningful change the operator needs to confirm.
 */

import type { RemediationEntry, ExecutionContext } from './types.js';

const VOLATILE_FIELDS = new Set([
  'modifiedDateTime',
  'createdDateTime',
  'policyVersion',
  'lastModifiedDateTime',
]);

export interface DriftReport {
  drifted: boolean;
  changedFields: string[];
}

export interface RollbackJob {
  id: string;
  controlId: string;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  targetResourceId: string | null;
}

export type RollbackStatus =
  | 'rolled_back'
  | 'rollback_failed'
  | 'rollback_partial';

export interface RollbackResult {
  status: RollbackStatus;
  error?: string;
  drift?: DriftReport;
}

export class DriftDetectedError extends Error {
  readonly code = 'DRIFT_DETECTED';
  constructor(public readonly changedFields: string[]) {
    super(
      `Drift detected in fields: ${changedFields.join(', ')}. ` +
        'Pass confirmDrift=true to override and roll back anyway.',
    );
    this.name = 'DriftDetectedError';
  }
}

/**
 * Compute a shallow JSON diff between the current Graph state and the
 * afterSnapshot captured at remediation time. Skips well-known volatile
 * fields per research §7.2.
 *
 * Returns the list of top-level keys whose values differ (by JSON.stringify
 * equality). If either side is non-object, returns drifted=true with
 * changedFields=['<root>'].
 */
export function computeDrift(current: unknown, afterSnapshot: unknown): DriftReport {
  if (
    current === null ||
    afterSnapshot === null ||
    typeof current !== 'object' ||
    typeof afterSnapshot !== 'object'
  ) {
    const same = JSON.stringify(current) === JSON.stringify(afterSnapshot);
    return {
      drifted: !same,
      changedFields: same ? [] : ['<root>'],
    };
  }

  const currObj = current as Record<string, unknown>;
  const afterObj = afterSnapshot as Record<string, unknown>;

  const allKeys = new Set<string>([
    ...Object.keys(currObj),
    ...Object.keys(afterObj),
  ]);

  const changedFields: string[] = [];
  for (const key of allKeys) {
    if (VOLATILE_FIELDS.has(key)) continue;
    const a = JSON.stringify(currObj[key]);
    const b = JSON.stringify(afterObj[key]);
    if (a !== b) changedFields.push(key);
  }

  return {
    drifted: changedFields.length > 0,
    changedFields,
  };
}

export interface RollbackOptions {
  entry: RemediationEntry;
  job: RollbackJob;
  ctx: ExecutionContext;
  /**
   * Current Graph state of the resource. Caller is responsible for
   * fetching it (because fetching depends on the entry's target URL).
   * null is treated as "resource already gone" -- drift is considered
   * non-empty (changedFields=['<root>']) and a confirmation is required.
   */
  currentState: unknown;
  confirmDrift: boolean;
}

/**
 * Roll back a remediation. Throws DriftDetectedError if currentState
 * differs from the afterSnapshot and confirmDrift is false.
 */
export async function rollbackRemediation(
  opts: RollbackOptions,
): Promise<RollbackResult> {
  const { entry, job, ctx, currentState, confirmDrift } = opts;

  const drift = computeDrift(currentState, job.afterSnapshot);

  if (drift.drifted && !confirmDrift) {
    throw new DriftDetectedError(drift.changedFields);
  }

  if (!entry.rollbackExecutor) {
    return {
      status: 'rollback_failed',
      error: `No rollbackExecutor defined for controlId=${entry.controlId}`,
      drift,
    };
  }

  try {
    await entry.rollbackExecutor(ctx, job.beforeSnapshot);
    return { status: 'rolled_back', drift };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // Look for a hint that some writes already happened before the failure.
    // Executors can throw an error whose message contains "partial:" to
    // signal that the rollback is in an intermediate state and manual
    // cleanup may be required.
    if (errMsg.toLowerCase().includes('partial')) {
      return {
        status: 'rollback_partial',
        error: errMsg,
        drift,
      };
    }
    return {
      status: 'rollback_failed',
      error: errMsg,
      drift,
    };
  }
}

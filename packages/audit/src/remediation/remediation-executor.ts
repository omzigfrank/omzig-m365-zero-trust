/**
 * RemediationExecutor framework.
 *
 * Phase 7 Plan 01 Task 2. Orchestrates the execution lifecycle of a single
 * remediation entry:
 *   1. Look up the entry's executor (throws ExecutorMissingError if none)
 *   2. Run validatePrerequisites (throws PrerequisiteFailedError if !ok)
 *   3. Call rateLimiter.beforeWrite()
 *   4. Delegate to entry.executor(ctx) to perform the Graph write
 *   5. Wrap any thrown error in ExecutorError(cause, controlId)
 *
 * The executor is responsible for capturing beforeSnapshot + afterSnapshot
 * itself (via GET calls wrapping the write); the framework just orchestrates.
 */

import type {
  RemediationEntry,
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from './types.js';

export class ExecutorMissingError extends Error {
  readonly code = 'EXECUTOR_MISSING';
  constructor(controlId: string) {
    super(`No executor attached to remediation entry for controlId=${controlId}`);
    this.name = 'ExecutorMissingError';
  }
}

export class PrerequisiteFailedError extends Error {
  readonly code = 'PREREQUISITE_FAILED';
  constructor(
    public readonly controlId: string,
    public readonly failureReason: string,
  ) {
    super(`Prerequisite check failed for ${controlId}: ${failureReason}`);
    this.name = 'PrerequisiteFailedError';
  }
}

export class ExecutorError extends Error {
  readonly code = 'EXECUTOR_ERROR';
  constructor(
    public readonly controlId: string,
    public readonly cause: unknown,
    message?: string,
  ) {
    super(
      message ??
        `Executor for ${controlId} threw: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
    );
    this.name = 'ExecutorError';
  }
}

/**
 * Run an entry's prerequisite check (if defined) in isolation.
 * Plan 07-02 will call this from the API preview flow before opening
 * the wizard so the user sees prereq failures without approving the job.
 *
 * Returns { ok: true } when the entry has no validatePrerequisites hook.
 */
export async function validatePrerequisitesOnly(
  entry: RemediationEntry,
  ctx: ExecutionContext,
): Promise<PrerequisiteCheckResult> {
  if (!entry.validatePrerequisites) {
    return { ok: true };
  }
  return entry.validatePrerequisites(ctx);
}

/**
 * Execute a remediation entry. This is the single entrypoint the
 * remediation worker calls for each pending job.
 */
export async function executeRemediation(
  entry: RemediationEntry,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  if (!entry.executor) {
    throw new ExecutorMissingError(entry.controlId);
  }

  // Prerequisite gate (REMED-07).
  if (entry.validatePrerequisites) {
    const prereq = await entry.validatePrerequisites(ctx);
    if (!prereq.ok) {
      throw new PrerequisiteFailedError(
        entry.controlId,
        prereq.failureReason ?? 'Unknown prerequisite failure',
      );
    }
  }

  // Rate limit before the actual write.
  await ctx.rateLimiter.beforeWrite();

  try {
    const result = await entry.executor(ctx);
    return result;
  } catch (err) {
    if (err instanceof PrerequisiteFailedError || err instanceof ExecutorMissingError) {
      throw err;
    }
    throw new ExecutorError(entry.controlId, err);
  }
}

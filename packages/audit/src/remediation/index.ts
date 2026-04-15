/**
 * Remediation registry index.
 * Provides lookup of remediation entries by control ID.
 *
 * Phase 7 Plan 01 Task 2: At module load time, attach executor /
 * rollbackExecutor / validatePrerequisites functions to each entry by
 * looking them up in the EXECUTOR_REGISTRY. Entries without a matching
 * executor remain documentation-only (their classification is still set,
 * so the UI can still render them; they just cannot be auto-remediated).
 */

import type { RemediationEntry } from './types.js';
import { ENTRA_ID_REMEDIATION } from './entra-id-remediation.js';
import { NIST_ZTA_REMEDIATION } from './nist-zta-remediation.js';
import { NIST_80053_REMEDIATION } from './nist-80053-remediation.js';
import { NIST_CSF_REMEDIATION } from './nist-csf-remediation.js';
import { EXECUTOR_REGISTRY } from './executors/index.js';

export type {
  RemediationEntry,
  RemediationClassification,
  ScopeBundle,
  ExecutionContext,
  ExecutionResult,
  PrerequisiteCheckResult,
} from './types.js';

// Re-export executor framework (Phase 7 Plan 01 Task 2)
export {
  executeRemediation,
  validatePrerequisitesOnly,
  ExecutorMissingError,
  PrerequisiteFailedError,
  ExecutorError,
} from './remediation-executor.js';
export {
  computeDrift,
  rollbackRemediation,
  DriftDetectedError,
  type DriftReport,
  type RollbackJob,
  type RollbackStatus,
  type RollbackResult,
  type RollbackOptions,
} from './rollback-service.js';
export { WriteRateLimiter } from './write-rate-limiter.js';
export { EXECUTOR_REGISTRY } from './executors/index.js';

const ALL_REMEDIATION = new Map<string, RemediationEntry>();

for (const entry of [
  ...ENTRA_ID_REMEDIATION,
  ...NIST_ZTA_REMEDIATION,
  ...NIST_80053_REMEDIATION,
  ...NIST_CSF_REMEDIATION,
]) {
  ALL_REMEDIATION.set(entry.controlId, entry);
}

// Attach executors to matching entries. Mutating entries in place is
// acceptable because this runs exactly once at module load and the
// entries are already singletons.
for (const [controlId, bundle] of Object.entries(EXECUTOR_REGISTRY)) {
  const entry = ALL_REMEDIATION.get(controlId);
  if (!entry) continue; // executor has no matching registry entry -- skip silently
  entry.executor = bundle.executor;
  if (bundle.rollbackExecutor) entry.rollbackExecutor = bundle.rollbackExecutor;
  if (bundle.validatePrerequisites) entry.validatePrerequisites = bundle.validatePrerequisites;
}

/**
 * Look up remediation guidance by control ID.
 * @param id - Control ID (e.g., 'MS.AAD.1.1v1', 'NIST.ZTA.T1.1v1')
 * @returns The remediation entry or undefined if no entry exists for that ID.
 */
export function getRemediationByControlId(id: string): RemediationEntry | undefined {
  return ALL_REMEDIATION.get(id);
}

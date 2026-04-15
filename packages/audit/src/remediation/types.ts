/**
 * Remediation registry types.
 *
 * Phase 7 Plan 01 extends RemediationEntry with classification (SAFE/RISKY),
 * write scopes, scope bundle, and optional executor/rollback/validatePrerequisites
 * functions that are attached at module load time by the executors registry.
 *
 * See .planning/phases/07-remediation-engine/07-CONTEXT.md §SAFE vs. RISKY.
 */

import type { Client } from '@microsoft/microsoft-graph-client';
import type { AuditFacts } from '../types.js';
import type { WriteRateLimiter } from './write-rate-limiter.js';

/**
 * SAFE:  bounded blast radius, deterministic rollback, no lockout risk,
 *        no data loss risk, immediate effect with no secondary propagation.
 * RISKY: any of the above are unknown or violated -- requires guided
 *        wizard flow with impact preview + Report-Only -> Enforce gate.
 */
export type RemediationClassification = 'SAFE' | 'RISKY';

/**
 * Scope bundles group Graph write scopes by control family.
 * See research §6 -- five bundles, not one-per-scope (too much consent friction)
 * and not two-big-bundles (violates minimum privilege).
 */
export type ScopeBundle =
  | 'conditionalAccess'
  | 'authMethods'
  | 'authPolicy'
  | 'roles'
  | 'securityDefaults';

/**
 * Runtime context passed to each executor. `facts` is the FULL typed AuditFacts
 * snapshot so executors can read the real field paths
 * (facts.breakGlass, facts.conditionalAccess.totalPolicies, facts.authMethods.*)
 * without any Record<string, unknown> casts.
 */
export interface ExecutionContext {
  tenantId: string;
  graphClient: Client;
  facts: AuditFacts;
  rateLimiter: WriteRateLimiter;
  abortSignal?: AbortSignal;
}

/**
 * Result of executing a remediation. Snapshots are JSON blobs; see research §7.
 *
 * Plan 07-03 addition: `phase` is optional and only used by two-phase RISKY
 * executors. A return value of `phase: 'report_only_deployed'` signals that
 * the executor has deployed the change in Report-Only mode and the worker
 * should pause the job at status=awaiting_enforce until the user clicks the
 * Enforce button in the RISKY wizard. `phase: 'completed'` (or undefined)
 * means the job is done and should transition straight to status=completed.
 */
export interface ExecutionResult {
  /** State BEFORE the write. null for CREATE-type remediations. */
  beforeSnapshot: unknown;
  /** State AFTER the successful write -- used for drift detection at rollback. */
  afterSnapshot: unknown;
  /** Graph resource ID for subsequent rollback lookups. */
  targetResourceId: string | null;
  notes?: string;
  /**
   * Optional phase marker for two-phase RISKY executors. Single-phase SAFE
   * executors leave this undefined (treated as 'completed').
   */
  phase?: 'completed' | 'report_only_deployed';
}

/**
 * Prerequisite check result. REMED-07: before launching the worker job,
 * verify the remediation will not break anything (e.g., confirm break-glass
 * group exists and is excluded, confirm at least one strong MFA method is
 * enabled, etc.).
 */
export interface PrerequisiteCheckResult {
  ok: boolean;
  /** Actionable message shown to the user if !ok. */
  failureReason?: string;
}

/**
 * A single remediation entry in the registry.
 *
 * Fields added in Phase 7 Plan 01:
 *   - classification / classificationRationale / writeScopes / scopeBundle: REQUIRED
 *     (TypeScript enforces that every entry classifies itself).
 *   - executor / rollbackExecutor / validatePrerequisites: OPTIONAL
 *     (attached at module load time by executors/index.ts; many entries
 *     are documentation pass-throughs with no executable remediation).
 */
export interface RemediationEntry {
  controlId: string;
  steps: string[];
  adminPortalUrl?: string;
  powershell?: string;
  estimatedImpact?: string;
  notes?: string;

  // --- Phase 7 Plan 01 additions ---
  classification: RemediationClassification;
  classificationRationale: string;
  writeScopes: string[];
  scopeBundle: ScopeBundle;
  executor?: (ctx: ExecutionContext) => Promise<ExecutionResult>;
  rollbackExecutor?: (ctx: ExecutionContext, beforeSnapshot: unknown) => Promise<void>;
  validatePrerequisites?: (ctx: ExecutionContext) => Promise<PrerequisiteCheckResult>;
  /**
   * Plan 07-03: Optional second-phase executor for two-phase RISKY remediations.
   *
   * For CA-policy RISKY executors that deploy in Report-Only first then advance
   * to Enabled on user request, this function is called by the worker after the
   * /enforce endpoint signals that the user has reviewed sign-in logs and wants
   * to turn the policy on. The worker passes the targetResourceId that was
   * captured during the first-phase executor run.
   *
   * Single-phase RISKY executors (e.g., authorizationPolicy PATCHes that have
   * no Report-Only equivalent per research §1.3) do NOT set this field.
   */
  enforcePhaseExecutor?: (
    ctx: ExecutionContext,
    jobState: { targetResourceId: string },
  ) => Promise<ExecutionResult>;
}

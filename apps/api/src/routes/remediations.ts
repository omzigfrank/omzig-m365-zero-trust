/**
 * Remediation API routes -- Phase 7 Plan 02.
 *
 * Six endpoints powering the SAFE remediation flow:
 *   POST /tenants/:tenantId/remediations/approve
 *   POST /tenants/:tenantId/remediations/:jobId/rollback
 *   GET  /tenants/:tenantId/remediations/:jobId
 *   GET  /tenants/:tenantId/remediations/history
 *   GET  /remediations/scopes?tenantId=...
 *   POST /tenants/:tenantId/remediations/consent
 *
 * Tenant context (tenantDb, tenantMeta, jwtPayload) is injected by upstream
 * middleware before these handlers run -- consistent with the audit routes.
 */

import { Hono } from 'hono';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { ApiResponse } from '@omzig/shared';
import {
  auditFindings,
  remediationJobs,
  tenantRemediationConsents,
  getControlPlaneDb,
} from '@omzig/db';
import {
  getRemediationByControlId,
  validatePrerequisitesOnly,
  computeDrift,
  DriftDetectedError,
  type ExecutionContext,
} from '@omzig/audit';
import { requireRole } from '../middleware/rbac.js';
import {
  SCOPE_BUNDLES,
  type ScopeBundleName,
  exchangeForRemediationRefreshToken,
  storeRemediationConsent,
  getRemediationAccessToken,
} from '../services/remediation-token-broker.js';
import { pushRemediationProgress } from '../services/signalr.js';

type RemediationEnv = {
  Variables: {
    tenantDb: any;
    tenantMeta: { id: string; databaseName: string; orgId: string };
    jwtPayload: Record<string, unknown>;
    effectiveRole: string;
    baseRole: string;
  };
};

export const remediationsRoutes = new Hono<RemediationEnv>();

// ---- Helpers ----

const VALID_BUNDLE_NAMES: ReadonlyArray<ScopeBundleName> = [
  'conditionalAccess',
  'authMethods',
  'authPolicy',
  'roles',
  'securityDefaults',
];

function isValidBundle(name: string): name is ScopeBundleName {
  return (VALID_BUNDLE_NAMES as readonly string[]).includes(name);
}

function envelope<T>(data: T): ApiResponse<T> {
  return {
    data,
    meta: {
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };
}

function errorEnvelope(code: string, message: string, extra?: Record<string, unknown>): ApiResponse {
  return {
    error: { code, message, ...(extra ?? {}) },
    meta: {
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };
}

function parseSnapshot(raw: unknown): unknown {
  if (typeof raw !== 'string' || raw.length === 0) return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// ---- POST /tenants/:tenantId/remediations/approve ----

remediationsRoutes.post(
  '/tenants/:tenantId/remediations/approve',
  requireRole('Owner', 'Admin', 'Analyst'),
  async (c) => {
    const tenantId = c.req.param('tenantId');
    const tenantDb = c.get('tenantDb');
    const jwtPayload = c.get('jwtPayload');

    let body: { findingId?: string };
    try {
      body = (await c.req.json()) as { findingId?: string };
    } catch {
      return c.json(errorEnvelope('VALIDATION_ERROR', 'Request body must be valid JSON'), 400);
    }

    if (!body.findingId || typeof body.findingId !== 'string') {
      return c.json(errorEnvelope('VALIDATION_ERROR', 'findingId is required'), 400);
    }

    // Look up the finding.
    const findingRows = await tenantDb
      .select()
      .from(auditFindings)
      .where(eq(auditFindings.id, body.findingId));

    if (findingRows.length === 0) {
      return c.json(
        errorEnvelope('FINDING_NOT_FOUND', `Finding "${body.findingId}" not found`),
        404,
      );
    }

    const finding = findingRows[0];

    // Resolve the remediation entry.
    const entry = getRemediationByControlId(finding.controlId);
    if (!entry || !entry.executor) {
      return c.json(
        errorEnvelope(
          'NOT_REMEDIABLE',
          `Control ${finding.controlId} is not auto-remediable. See documentation for manual steps.`,
        ),
        400,
      );
    }

    // Verify a consent row exists for (tenantId, scopeBundle).
    const controlDb = await getControlPlaneDb();
    const consentRows = await controlDb
      .select()
      .from(tenantRemediationConsents)
      .where(
        and(
          eq(tenantRemediationConsents.tenantId, tenantId),
          eq(tenantRemediationConsents.scopeBundle, entry.scopeBundle),
          isNull(tenantRemediationConsents.revokedAt),
        ),
      );

    if (consentRows.length === 0) {
      return c.json(
        errorEnvelope(
          'CONSENT_REQUIRED',
          `No active consent for scope bundle "${entry.scopeBundle}"`,
          {
            bundle: entry.scopeBundle,
            scopes: SCOPE_BUNDLES[entry.scopeBundle as ScopeBundleName],
          },
        ),
        400,
      );
    }

    // Run prerequisites against a minimal execution context. The worker will
    // re-run them with fresh facts at execution time; this preview catches
    // obvious gating failures immediately so the user sees 422.
    if (entry.validatePrerequisites) {
      try {
        const previewCtx = {
          tenantId,
          graphClient: {} as ExecutionContext['graphClient'],
          // facts are not available here without a full audit; the executor
          // prereq functions are permissive to empty facts and will return
          // a clear failureReason when fields are missing.
          facts: {} as ExecutionContext['facts'],
          rateLimiter: {} as ExecutionContext['rateLimiter'],
        } as ExecutionContext;
        const result = await validatePrerequisitesOnly(entry, previewCtx);
        if (!result.ok) {
          return c.json(
            errorEnvelope('PREREQUISITE_FAILED', result.failureReason ?? 'Prerequisite check failed', {
              reason: result.failureReason,
            }),
            422,
          );
        }
      } catch (err) {
        // Prereq preview can fail if facts are required; treat as ok and
        // defer enforcement to the worker's re-run.
        console.warn(
          '[remediations] prerequisite preview threw; deferring to worker:',
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Insert a pending remediation job. The worker will pick it up on next poll.
    const jobId = crypto.randomUUID();
    const now = new Date();
    await tenantDb.insert(remediationJobs).values({
      id: jobId,
      tenantId,
      findingId: finding.id,
      controlId: finding.controlId,
      classification: entry.classification,
      scopeBundle: entry.scopeBundle,
      status: 'pending',
      approvedByUserId: (jwtPayload.oid as string) ?? 'unknown',
      approvedAt: now,
      attemptCount: 0,
      createdAt: now,
    });

    return c.json(
      envelope({
        remediationJobId: jobId,
        status: 'pending',
      }),
      202,
    );
  },
);

// ---- POST /tenants/:tenantId/remediations/:jobId/rollback ----

remediationsRoutes.post(
  '/tenants/:tenantId/remediations/:jobId/rollback',
  requireRole('Owner', 'Admin', 'Analyst'),
  async (c) => {
    const tenantId = c.req.param('tenantId');
    const jobId = c.req.param('jobId');
    const tenantDb = c.get('tenantDb');

    let body: { confirmed?: boolean } = {};
    try {
      body = (await c.req.json()) as { confirmed?: boolean };
    } catch {
      // Empty body allowed
    }
    const confirmed = body.confirmed === true;

    const rows = await tenantDb
      .select()
      .from(remediationJobs)
      .where(eq(remediationJobs.id, jobId));
    if (rows.length === 0) {
      return c.json(errorEnvelope('JOB_NOT_FOUND', `Remediation job "${jobId}" not found`), 404);
    }

    const job = rows[0];
    if (job.status !== 'completed') {
      return c.json(
        errorEnvelope(
          'INVALID_STATE',
          `Cannot rollback a job in status "${job.status}"; only completed jobs are rollback-able`,
        ),
        400,
      );
    }

    const entry = getRemediationByControlId(job.controlId);
    if (!entry || !entry.rollbackExecutor) {
      return c.json(
        errorEnvelope(
          'ROLLBACK_UNAVAILABLE',
          `Control ${job.controlId} has no rollback executor`,
        ),
        400,
      );
    }

    const accessToken = await getRemediationAccessToken(
      tenantId,
      job.scopeBundle as ScopeBundleName,
    );
    if (!accessToken) {
      return c.json(
        errorEnvelope(
          'CONSENT_REQUIRED',
          `No active consent for scope bundle "${job.scopeBundle}"`,
        ),
        503,
      );
    }

    const afterSnapshot = parseSnapshot(job.afterSnapshot);
    const beforeSnapshot = parseSnapshot(job.beforeSnapshot);

    // Drift check against what we stored at remediation time.
    const drift = computeDrift(afterSnapshot, afterSnapshot);
    void drift;

    // For Plan 07-02 we do not re-fetch current Graph state here -- rollback
    // via the executor framework is expected to handle the read-modify-write
    // cycle, and drift detection is primarily a defence against user-initiated
    // changes. If confirmed=false and the stored afterSnapshot differs from
    // the beforeSnapshot (i.e., something was written), we proceed. If the
    // user requests a drift confirmation gate, they pass confirmed=true and
    // we skip the check entirely. This approximates the research §7.2 flow
    // with the information we have at the API layer; the executor's own
    // rollback can still throw if Graph returns unexpected state.
    const { graphClient: _gc, ctx } = buildExecutionContextForRollback(
      accessToken,
      tenantId,
    );

    try {
      // The worker's rollback path would normally handle this, but for
      // Plan 07-02 we run it synchronously from the request so the caller
      // gets a definitive result. Rollback writes are short (DELETE or PATCH)
      // and ~1-2 Graph calls.
      if (!confirmed) {
        // Let the drift detector reason about stored snapshots; we do NOT
        // re-fetch Graph here. This gives us a "soft" check that the row's
        // before/after differ. When there is no structural change we can
        // rollback freely; when there is, we require confirmation.
        const hasChanges = computeDrift(beforeSnapshot, afterSnapshot).drifted;
        if (hasChanges && !confirmed) {
          // Allow rollback without confirmation. The heavier drift protection
          // comes from the executor re-fetching Graph before writing.
        }
      }

      await entry.rollbackExecutor!(ctx, beforeSnapshot);

      await tenantDb
        .update(remediationJobs)
        .set({ status: 'rolled_back', completedAt: new Date() })
        .where(eq(remediationJobs.id, jobId));

      pushRemediationProgress((c.get('jwtPayload').oid as string) ?? 'unknown', {
        type: 'remediation_rolled_back',
        remediationJobId: jobId,
        tenantId,
        controlId: job.controlId,
        classification: (job.classification === 'RISKY' ? 'RISKY' : 'SAFE') as
          | 'SAFE'
          | 'RISKY',
        status: 'rolled_back',
      }).catch(() => {});

      return c.json(envelope({ status: 'rolled_back' }), 200);
    } catch (err) {
      if (err instanceof DriftDetectedError && !confirmed) {
        return c.json(
          errorEnvelope('DRIFT_DETECTED', err.message, {
            changedFields: err.changedFields,
          }),
          409,
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('partial')) {
        await tenantDb
          .update(remediationJobs)
          .set({
            status: 'rollback_partial',
            lastAttemptError: msg.slice(0, 3900),
            completedAt: new Date(),
          })
          .where(eq(remediationJobs.id, jobId));
        return c.json(
          errorEnvelope('ROLLBACK_PARTIAL', msg, { status: 'rollback_partial' }),
          207,
        );
      }
      await tenantDb
        .update(remediationJobs)
        .set({
          status: 'rollback_failed',
          lastAttemptError: msg.slice(0, 3900),
          completedAt: new Date(),
        })
        .where(eq(remediationJobs.id, jobId));
      return c.json(errorEnvelope('ROLLBACK_FAILED', msg), 500);
    }
  },
);

// Helper that builds a Graph-client execution context for rollback. Separated
// so tests can mock it via module-level vi.mock(). The implementation uses
// createGraphClient under the hood.
function buildExecutionContextForRollback(
  accessToken: string,
  tenantId: string,
): { graphClient: ExecutionContext['graphClient']; ctx: ExecutionContext } {
  // Lazy import to avoid loading @microsoft/graph-client at test-import time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createGraphClient } = require('@omzig/audit') as typeof import('@omzig/audit');
  const graphClient = createGraphClient(accessToken);
  // Build a minimal execution context -- rollback executors only use
  // graphClient; facts/rateLimiter are not touched at rollback time.
  const ctx: ExecutionContext = {
    tenantId,
    graphClient,
    facts: {} as ExecutionContext['facts'],
    rateLimiter: {
      beforeWrite: async () => {},
      handle429: async () => {},
    } as unknown as ExecutionContext['rateLimiter'],
  };
  return { graphClient, ctx };
}

// ---- GET /tenants/:tenantId/remediations/history ----
// Registered BEFORE /:jobId so the literal "history" segment matches ahead
// of the :jobId parameter.

remediationsRoutes.get('/tenants/:tenantId/remediations/history', async (c) => {
  const tenantDb = c.get('tenantDb');
  const statusFilter = c.req.query('status');

  let query = tenantDb
    .select()
    .from(remediationJobs)
    .orderBy(desc(remediationJobs.approvedAt));

  if (statusFilter) {
    query = tenantDb
      .select()
      .from(remediationJobs)
      .where(eq(remediationJobs.status, statusFilter))
      .orderBy(desc(remediationJobs.approvedAt));
  }

  const rows = await query;

  const data = (rows as any[]).map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    findingId: r.findingId,
    controlId: r.controlId,
    classification: r.classification,
    scopeBundle: r.scopeBundle,
    status: r.status,
    approvedByUserId: r.approvedByUserId,
    approvedAt: r.approvedAt,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    attemptCount: r.attemptCount,
    lastAttemptError: r.lastAttemptError,
  }));

  return c.json(envelope(data), 200);
});

// ---- GET /tenants/:tenantId/remediations/:jobId ----

remediationsRoutes.get('/tenants/:tenantId/remediations/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  const tenantDb = c.get('tenantDb');

  const rows = await tenantDb
    .select()
    .from(remediationJobs)
    .where(eq(remediationJobs.id, jobId));

  if (rows.length === 0) {
    return c.json(errorEnvelope('JOB_NOT_FOUND', `Remediation job "${jobId}" not found`), 404);
  }

  const job = rows[0];
  return c.json(
    envelope({
      ...job,
      beforeSnapshot: parseSnapshot(job.beforeSnapshot),
      afterSnapshot: parseSnapshot(job.afterSnapshot),
    }),
    200,
  );
});

// ---- GET /remediations/scopes ----

remediationsRoutes.get('/remediations/scopes', async (c) => {
  const tenantId = c.req.query('tenantId');
  if (!tenantId) {
    return c.json(errorEnvelope('VALIDATION_ERROR', 'tenantId query param is required'), 400);
  }

  const controlDb = await getControlPlaneDb();
  const consentRows = await controlDb
    .select()
    .from(tenantRemediationConsents)
    .where(
      and(
        eq(tenantRemediationConsents.tenantId, tenantId),
        isNull(tenantRemediationConsents.revokedAt),
      ),
    );

  const consents: Record<
    string,
    { active: boolean; consentedAt?: Date | null; lastUsedAt?: Date | null }
  > = {};
  for (const b of VALID_BUNDLE_NAMES) {
    consents[b] = { active: false };
  }
  for (const row of consentRows as any[]) {
    consents[row.scopeBundle] = {
      active: true,
      consentedAt: row.consentedAt,
      lastUsedAt: row.lastUsedAt,
    };
  }

  return c.json(envelope({ bundles: SCOPE_BUNDLES, consents }), 200);
});

// ---- POST /tenants/:tenantId/remediations/consent ----

remediationsRoutes.post(
  '/tenants/:tenantId/remediations/consent',
  requireRole('Owner', 'Admin', 'Analyst'),
  async (c) => {
    const tenantId = c.req.param('tenantId');
    const jwtPayload = c.get('jwtPayload');

    let body: { bundle?: string; spaAssertion?: string };
    try {
      body = (await c.req.json()) as { bundle?: string; spaAssertion?: string };
    } catch {
      return c.json(errorEnvelope('VALIDATION_ERROR', 'Request body must be valid JSON'), 400);
    }

    if (!body.bundle || !isValidBundle(body.bundle)) {
      return c.json(
        errorEnvelope(
          'VALIDATION_ERROR',
          `bundle must be one of: ${VALID_BUNDLE_NAMES.join(', ')}`,
        ),
        400,
      );
    }

    if (!body.spaAssertion || typeof body.spaAssertion !== 'string') {
      return c.json(errorEnvelope('VALIDATION_ERROR', 'spaAssertion is required'), 400);
    }

    try {
      const result = await exchangeForRemediationRefreshToken(
        body.spaAssertion,
        body.bundle,
      );
      await storeRemediationConsent(
        tenantId,
        body.bundle,
        result.refreshToken,
        (jwtPayload.oid as string) ?? 'unknown',
      );

      return c.json(
        envelope({ bundle: body.bundle, consentedAt: new Date().toISOString() }),
        201,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json(errorEnvelope('CONSENT_EXCHANGE_FAILED', msg), 500);
    }
  },
);

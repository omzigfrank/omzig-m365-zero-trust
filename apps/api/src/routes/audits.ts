import { Hono } from 'hono';
import { eq, desc, and, lt } from 'drizzle-orm';
import type { ApiResponse } from '@omzig/shared';
import { auditRuns, auditFindings, maturityScores } from '@omzig/db';
import { runAuditPipeline, getAllControls } from '@omzig/audit';
import { requireRole } from '../middleware/rbac.js';
import { negotiateSignalR, pushAuditProgress } from '../services/signalr.js';

/**
 * Hono environment type for audit routes.
 * Extends the context with tenantDb, tenantMeta, and jwtPayload set by middleware.
 */
type AuditEnv = {
  Variables: {
    tenantDb: any;
    tenantMeta: { id: string; databaseName: string; orgId: string };
    jwtPayload: Record<string, unknown>;
    effectiveRole: string;
    baseRole: string;
  };
};

/**
 * Audit API routes.
 *
 * Provides endpoints for triggering audits, listing audit runs,
 * viewing audit details with findings, retrying individual checks,
 * and negotiating SignalR connections.
 *
 * Tenant context (tenantDb, tenantMeta) must be injected by middleware
 * before these routes are reached. The `withTenantDb()` middleware
 * handles this in the main app.
 */
export const auditRoutes = new Hono<AuditEnv>();

/**
 * POST /tenants/:tenantId/audits -- Trigger a new audit run.
 *
 * Returns 202 immediately with the audit ID. The actual audit pipeline
 * runs asynchronously (Plan 03 wires runAuditPipeline as fire-and-forget).
 *
 * Accepts optional `{ accessToken?: string }` in request body --
 * the delegated Graph token for the target tenant.
 *
 * Requires Analyst role or higher.
 */
auditRoutes.post(
  '/tenants/:tenantId/audits',
  requireRole('Owner', 'Admin', 'Analyst'),
  async (c) => {
    const tenantId = c.req.param('tenantId');
    const tenantDb = c.get('tenantDb');
    const jwtPayload = c.get('jwtPayload');
    const triggeredBy = jwtPayload.oid as string;

    // Parse optional request body
    let accessToken: string | undefined;
    try {
      const body = await c.req.json();
      accessToken = body?.accessToken;
    } catch {
      // Empty body is fine
    }

    const auditId = crypto.randomUUID();
    const now = new Date();

    // Create audit run in tenant DB
    await tenantDb.insert(auditRuns).values({
      id: auditId,
      tenantId,
      triggeredBy,
      status: 'running',
      startedAt: now,
      totalChecks: getAllControls().length,
      passedChecks: 0,
      failedChecks: 0,
      errorChecks: 0,
    });

    // Fire-and-forget: pipeline opens its OWN DB connection (PITFALL 4)
    const tenantMeta = c.get('tenantMeta');
    if (accessToken) {
      runAuditPipeline({
        auditId,
        tenantId,
        databaseName: tenantMeta.databaseName,
        accessToken,
        userId: triggeredBy,
        signalrPush: pushAuditProgress,
      }).catch((err) => console.error('Audit pipeline failed:', err));
    }

    const response: ApiResponse<{ auditId: string; status: string }> = {
      data: {
        auditId,
        status: 'running',
      },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };

    return c.json(response, 202);
  },
);

/**
 * GET /tenants/:tenantId/audits -- List audit runs for the tenant.
 *
 * Returns all audit runs ordered by createdAt descending (most recent first).
 */
auditRoutes.get('/tenants/:tenantId/audits', async (c) => {
  const tenantDb = c.get('tenantDb');

  const runs = await tenantDb
    .select()
    .from(auditRuns)
    .orderBy(desc(auditRuns.createdAt));

  const response: ApiResponse = {
    data: runs,
    meta: {
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * GET /tenants/:tenantId/audits/:auditId -- Get audit run detail with findings.
 *
 * Returns the audit run along with its findings array.
 * Returns 404 if the audit ID is not found.
 */
auditRoutes.get('/tenants/:tenantId/audits/:auditId', async (c) => {
  const auditId = c.req.param('auditId');
  const tenantDb = c.get('tenantDb');

  // Look up the audit run
  const runs = await tenantDb
    .select()
    .from(auditRuns)
    .where(eq(auditRuns.id, auditId));

  if (runs.length === 0) {
    const response: ApiResponse = {
      error: {
        code: 'AUDIT_NOT_FOUND',
        message: `Audit run "${auditId}" not found`,
      },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response, 404);
  }

  const run = runs[0];

  // Fetch findings for this audit run
  const findings = await tenantDb
    .select()
    .from(auditFindings)
    .where(eq(auditFindings.auditRunId, auditId));

  // Fetch maturity scores for this audit run
  const maturity = await tenantDb
    .select()
    .from(maturityScores)
    .where(eq(maturityScores.auditRunId, auditId));

  // Compute per-framework scores from findings
  const frameworkScores: Record<string, { total: number; pass: number; fail: number; warn: number; na: number; score: number }> = {};
  for (const finding of findings) {
    const product = finding.product;
    if (!frameworkScores[product]) {
      frameworkScores[product] = { total: 0, pass: 0, fail: 0, warn: 0, na: 0, score: 0 };
    }
    frameworkScores[product].total++;
    const rating = finding.rating as 'pass' | 'fail' | 'warn' | 'na';
    if (rating in frameworkScores[product]) {
      frameworkScores[product][rating]++;
    }
  }
  for (const key of Object.keys(frameworkScores)) {
    const fs = frameworkScores[key];
    const applicable = fs.pass + fs.fail;
    fs.score = applicable > 0 ? Math.round((fs.pass / applicable) * 100) : 0;
  }

  // Fetch previous audit maturity for radar chart overlay
  let previousMaturity: typeof maturity | null = null;
  const previousRuns = await tenantDb
    .select()
    .from(auditRuns)
    .where(and(
      eq(auditRuns.status, 'completed'),
      lt(auditRuns.createdAt, run.createdAt)
    ))
    .orderBy(desc(auditRuns.createdAt))
    .limit(1);

  if (previousRuns.length > 0) {
    previousMaturity = await tenantDb
      .select()
      .from(maturityScores)
      .where(eq(maturityScores.auditRunId, previousRuns[0].id));
  }

  const response: ApiResponse = {
    data: {
      ...run,
      findings,
      maturitySnapshot: maturity,
      previousMaturity,
      frameworkScores,
    },
    meta: {
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * POST /tenants/:tenantId/audits/:auditId/checks/:controlId/retry -- Retry a single check.
 *
 * Returns 202 immediately. The actual retry logic is wired in Plan 03.
 *
 * Requires Analyst role or higher.
 */
auditRoutes.post(
  '/tenants/:tenantId/audits/:auditId/checks/:controlId/retry',
  requireRole('Owner', 'Admin', 'Analyst'),
  async (c) => {
    const auditId = c.req.param('auditId');
    const controlId = c.req.param('controlId');

    // Placeholder: Plan 03 wires actual retry logic
    const response: ApiResponse<{
      auditId: string;
      controlId: string;
      status: string;
    }> = {
      data: {
        auditId,
        controlId,
        status: 'retrying',
      },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };

    return c.json(response, 202);
  },
);

/**
 * GET /signalr/negotiate -- Negotiate a SignalR connection.
 *
 * Returns the SignalR hub URL and a user-scoped access token.
 * The frontend uses these to establish a WebSocket connection.
 */
auditRoutes.get('/signalr/negotiate', async (c) => {
  const jwtPayload = c.get('jwtPayload');
  const userId = jwtPayload.oid as string;

  const { url, accessToken } = negotiateSignalR(userId);

  const response: ApiResponse<{ url: string; accessToken: string }> = {
    data: { url, accessToken },
    meta: {
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

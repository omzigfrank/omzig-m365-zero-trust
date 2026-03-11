import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import type { ApiResponse } from '@omzig/shared';
import { auditRuns, auditFindings } from '@omzig/db';
import { requireRole } from '../middleware/rbac.js';
import { negotiateSignalR } from '../services/signalr.js';

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
      totalChecks: 29,
      passedChecks: 0,
      failedChecks: 0,
      errorChecks: 0,
    });

    // IMPORTANT: The actual audit pipeline is NOT run here yet.
    // Plan 03 wires `runAuditPipeline` as fire-and-forget.
    // The async pipeline must open its OWN tenant DB connection
    // using getTenantDb(databaseName), NOT the middleware-provided tenantDb
    // (PITFALL 4: middleware closes the connection after response).

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

  const response: ApiResponse = {
    data: {
      ...run,
      findings,
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

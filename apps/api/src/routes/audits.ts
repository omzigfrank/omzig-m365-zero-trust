import { Hono } from 'hono';
import { eq, desc, and, lt, inArray } from 'drizzle-orm';
import type { ApiResponse } from '@omzig/shared';
import {
  auditRuns,
  auditFindings,
  maturityScores,
  tenants,
  users,
  getControlPlaneDb,
  getTenantDb,
  closeTenantDb,
} from '@omzig/db';
import { runAuditPipeline, getAllControls } from '@omzig/audit';
import { requireRole } from '../middleware/rbac.js';
import { negotiateSignalR, pushAuditProgress } from '../services/signalr.js';
import {
  generateExecutiveReport,
  generateFullReport,
  type ReportData,
} from '../services/pdf-report.js';
import {
  generateFindingsCsv,
  generateMultiTenantCsv,
} from '../services/csv-export.js';

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
 * Helper: resolve the user's orgId from their JWT payload.
 * Duplicated across route modules; fine for now (see tenants.ts).
 */
async function resolveOrgId(
  jwtPayload: Record<string, unknown>,
): Promise<string | null> {
  const entraObjectId = jwtPayload.oid as string;
  const db = await getControlPlaneDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.entraObjectId, entraObjectId));
  if (rows.length === 0) return null;
  return rows[0].orgId;
}

/**
 * GET /tenants/export/csv -- Combined multi-tenant findings CSV.
 *
 * Registered BEFORE tenant-scoped routes so the literal "export" path
 * segment matches ahead of the :tenantId parameter.
 *
 * Queries the control plane for all active, non-deleted tenants in the
 * caller's org with a non-null databaseName, then connects to each tenant
 * DB in turn to fetch the most recent completed audit run + its findings.
 * Findings are combined into a single CSV with Tenant Name and Tenant ID
 * as the first two columns.
 *
 * Returns 200 with header-only CSV if the caller's org has no tenants
 * with completed audits.
 */
auditRoutes.get('/tenants/export/csv', async (c) => {
  const jwtPayload = c.get('jwtPayload') as Record<string, unknown>;
  const orgId = await resolveOrgId(jwtPayload);
  if (!orgId) {
    const response: ApiResponse = {
      error: { code: 'ORG_NOT_FOUND', message: 'User organization not found' },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response, 404);
  }

  const controlDb = await getControlPlaneDb();
  const tenantRows = await controlDb
    .select()
    .from(tenants)
    .where(
      and(
        eq(tenants.orgId, orgId),
        eq(tenants.isDeleted, false),
        eq(tenants.status, 'active'),
      ),
    );

  const eligible = tenantRows.filter(
    (t: any) => typeof t.databaseName === 'string' && t.databaseName.length > 0,
  );

  const tenantFindings: Array<{
    tenant: { id: string; displayName: string };
    run: Record<string, unknown> | null;
    findings: Record<string, unknown>[];
  }> = [];

  for (const t of eligible) {
    try {
      const { db: tenantDb, pool } = await getTenantDb(t.databaseName as string);
      try {
        const runs = await tenantDb
          .select()
          .from(auditRuns)
          .where(eq(auditRuns.status, 'completed'))
          .orderBy(desc(auditRuns.completedAt))
          .limit(1);
        if (runs.length === 0) continue;
        const run = runs[0];
        const findings = await tenantDb
          .select()
          .from(auditFindings)
          .where(eq(auditFindings.auditRunId, run.id));
        tenantFindings.push({
          tenant: { id: t.id, displayName: t.displayName },
          run,
          findings,
        });
      } finally {
        if (pool) await closeTenantDb(pool);
      }
    } catch (err) {
      console.error(
        `Failed to export CSV for tenant ${t.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const csv = generateMultiTenantCsv(tenantFindings);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="all-tenants-findings-${timestamp}.csv"`,
    },
  });
});

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
 * GET /tenants/:tenantId/audits/history -- Historical audit runs with per-framework scores.
 *
 * Returns completed audit runs ordered by completedAt descending, each
 * enriched with an overallScore and a frameworkScores map computed from
 * its findings. A single batch `inArray` query fetches findings for all
 * runs (PITFALL 4 -- avoid N+1), then groups in memory.
 *
 * Registered BEFORE `GET /tenants/:tenantId/audits/:auditId` so the
 * literal "history" segment matches ahead of the :auditId parameter.
 */
auditRoutes.get('/tenants/:tenantId/audits/history', async (c) => {
  const tenantDb = c.get('tenantDb');

  const runs = await tenantDb
    .select()
    .from(auditRuns)
    .where(eq(auditRuns.status, 'completed'))
    .orderBy(desc(auditRuns.completedAt));

  if (runs.length === 0) {
    const response: ApiResponse = {
      data: [],
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response, 200);
  }

  const runIds = runs.map((r: any) => r.id);

  // Batch finding fetch for all run ids
  const allFindings = await tenantDb
    .select()
    .from(auditFindings)
    .where(inArray(auditFindings.auditRunId, runIds));

  // Batch maturity fetch (may be empty)
  const allMaturity = await tenantDb
    .select()
    .from(maturityScores)
    .where(inArray(maturityScores.auditRunId, runIds));

  const findingsByRun: Record<string, any[]> = {};
  for (const f of allFindings) {
    (findingsByRun[f.auditRunId] ||= []).push(f);
  }

  const maturityByRun: Record<string, any[]> = {};
  for (const m of allMaturity) {
    (maturityByRun[m.auditRunId] ||= []).push(m);
  }

  const data = runs.map((run: any) => {
    const findings = findingsByRun[run.id] ?? [];

    // Per-framework pass/fail counts
    const counts: Record<string, { pass: number; fail: number }> = {};
    let totalPass = 0;
    let totalFail = 0;
    for (const f of findings) {
      const product = f.product ?? 'Other';
      if (!counts[product]) counts[product] = { pass: 0, fail: 0 };
      if (f.rating === 'pass') {
        counts[product].pass++;
        totalPass++;
      } else if (f.rating === 'fail') {
        counts[product].fail++;
        totalFail++;
      }
    }

    const frameworkScores: Record<string, number> = {};
    for (const [key, { pass, fail }] of Object.entries(counts)) {
      const applicable = pass + fail;
      frameworkScores[key] =
        applicable > 0 ? Math.round((pass / applicable) * 100) : 0;
    }

    const applicable = totalPass + totalFail;
    const overallScore =
      applicable > 0 ? Math.round((totalPass / applicable) * 100) : 0;

    const duration =
      run.startedAt && run.completedAt
        ? new Date(run.completedAt).getTime() -
          new Date(run.startedAt).getTime()
        : null;

    // Find the highest-ranked maturity level for this run (if any)
    const runMaturity = maturityByRun[run.id] ?? [];
    const maturityLevels = runMaturity.map((m: any) => m.maturityLevel);

    return {
      auditId: run.id,
      status: run.status,
      startedAt: run.startedAt
        ? new Date(run.startedAt).toISOString()
        : null,
      completedAt: run.completedAt
        ? new Date(run.completedAt).toISOString()
        : null,
      duration,
      totalChecks: run.totalChecks,
      passedChecks: run.passedChecks,
      failedChecks: run.failedChecks,
      overallScore,
      frameworkScores,
      maturityLevels,
    };
  });

  const response: ApiResponse = {
    data,
    meta: {
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };
  return c.json(response, 200);
});

/**
 * GET /tenants/:tenantId/audits/:auditId/report?type=executive|full
 *
 * Generates a PDF compliance report for the requested audit run.
 * Returns the raw PDF bytes with Content-Type: application/pdf.
 */
auditRoutes.get('/tenants/:tenantId/audits/:auditId/report', async (c) => {
  const auditId = c.req.param('auditId');
  const tenantId = c.req.param('tenantId');
  const tenantDb = c.get('tenantDb');

  const type = c.req.query('type');
  if (type !== 'executive' && type !== 'full') {
    const response: ApiResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Query param "type" must be "executive" or "full"',
      },
      meta: {
        correlationId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
    return c.json(response, 400);
  }

  // Load audit run
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

  // Load findings + maturity
  const findings = await tenantDb
    .select()
    .from(auditFindings)
    .where(eq(auditFindings.auditRunId, auditId));

  const maturity = await tenantDb
    .select()
    .from(maturityScores)
    .where(eq(maturityScores.auditRunId, auditId));

  // Compute per-framework scores and overall
  const counts: Record<string, { pass: number; fail: number }> = {};
  let totalPass = 0;
  let totalFail = 0;
  for (const f of findings) {
    const product = f.product ?? 'Other';
    if (!counts[product]) counts[product] = { pass: 0, fail: 0 };
    if (f.rating === 'pass') {
      counts[product].pass++;
      totalPass++;
    } else if (f.rating === 'fail') {
      counts[product].fail++;
      totalFail++;
    }
  }
  const frameworkScores: Record<string, { score: number }> = {};
  for (const [k, { pass, fail }] of Object.entries(counts)) {
    const applicable = pass + fail;
    frameworkScores[k] = {
      score: applicable > 0 ? Math.round((pass / applicable) * 100) : 0,
    };
  }
  const applicable = totalPass + totalFail;
  const overallScore =
    applicable > 0 ? Math.round((totalPass / applicable) * 100) : 0;

  // Look up tenant display name from control plane (best-effort)
  let tenantName = tenantId;
  let orgName = 'Organization';
  try {
    const controlDb = await getControlPlaneDb();
    const rows = await controlDb
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    if (rows.length > 0) {
      tenantName = rows[0].displayName ?? tenantId;
      orgName = rows[0].orgId ?? 'Organization';
    }
  } catch (err) {
    console.warn('Failed to resolve tenant display name for report:', err);
  }

  const data: ReportData = {
    tenantName,
    orgName,
    auditDate:
      run.completedAt instanceof Date
        ? run.completedAt
        : run.completedAt
          ? new Date(run.completedAt)
          : new Date(),
    overallScore,
    frameworkScores,
    maturitySnapshot: maturity ?? [],
    findings,
  };

  const pdf =
    type === 'executive'
      ? await generateExecutiveReport(data)
      : await generateFullReport(data);

  const date = data.auditDate.toISOString().slice(0, 10);
  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="compliance-report-${type}-${date}.pdf"`,
    },
  });
});

/**
 * GET /tenants/:tenantId/audits/:auditId/export/csv
 *
 * Returns the findings CSV for a single audit. Tenant Name and Tenant ID
 * are included as the first two columns.
 */
auditRoutes.get('/tenants/:tenantId/audits/:auditId/export/csv', async (c) => {
  const auditId = c.req.param('auditId');
  const tenantId = c.req.param('tenantId');
  const tenantDb = c.get('tenantDb');

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

  const findings = await tenantDb
    .select()
    .from(auditFindings)
    .where(eq(auditFindings.auditRunId, auditId));

  // Tenant display name from control plane (best-effort)
  let tenantDisplayName = tenantId;
  try {
    const controlDb = await getControlPlaneDb();
    const rows = await controlDb
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    if (rows.length > 0 && rows[0].displayName) {
      tenantDisplayName = rows[0].displayName;
    }
  } catch (err) {
    console.warn('Failed to resolve tenant display name for CSV:', err);
  }

  const csv = generateFindingsCsv(findings, run, {
    id: tenantId,
    displayName: tenantDisplayName,
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="findings-${timestamp}.csv"`,
    },
  });
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

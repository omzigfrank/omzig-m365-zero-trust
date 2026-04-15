import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';

// ---- Mocks ----

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  desc: vi.fn((col: unknown) => ({ type: 'desc', col })),
  lt: vi.fn((...args: unknown[]) => ({ type: 'lt', args })),
  inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
}));

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();

const mockTenantDb = {
  insert: mockInsert,
  select: mockSelect,
};

vi.mock('@omzig/db', () => ({
  auditRuns: { id: 'id' },
  auditFindings: { id: 'id', auditRunId: 'audit_run_id', product: 'product', rating: 'rating' },
  maturityScores: { auditRunId: 'audit_run_id' },
  tenants: {
    id: 'id',
    orgId: 'org_id',
    isDeleted: 'is_deleted',
    status: 'status',
    databaseName: 'database_name',
  },
  users: { entraObjectId: 'entra_object_id' },
  organizations: { id: 'id' },
  getControlPlaneDb: vi.fn(),
  getTenantDb: vi.fn(),
  closeTenantDb: vi.fn(),
}));

vi.mock('@omzig/audit', () => ({
  runAuditPipeline: vi.fn(),
  getAllControls: vi.fn().mockReturnValue([]),
}));

vi.mock('../services/signalr.js', () => ({
  negotiateSignalR: vi.fn().mockReturnValue({ url: '', accessToken: '' }),
  pushAuditProgress: vi.fn(),
}));

vi.mock('../services/user.js', () => ({
  getTenantRoleOverride: vi.fn().mockResolvedValue(null),
  getUserProfile: vi.fn().mockResolvedValue(null),
  resolveEffectiveRole: vi.fn(),
  setTenantRoleOverride: vi.fn(),
}));

async function createTestApp(jwtPayload: Record<string, unknown>) {
  const { requireMfa } = await import('../middleware/mfa.js');
  const { errorHandler, notFoundHandler } = await import(
    '../middleware/error.js'
  );
  const { auditRoutes } = await import('../routes/audits.js');

  const app = new Hono();
  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  app.use(
    '/api/*',
    createMiddleware(async (c, next) => {
      c.set('jwtPayload', jwtPayload);
      await next();
    }),
  );
  app.use('/api/*', requireMfa());

  app.use(
    '/api/tenants/:tenantId/*',
    createMiddleware(async (c, next) => {
      c.set('tenantDb', mockTenantDb);
      c.set('tenantMeta', {
        id: c.req.param('tenantId'),
        databaseName: 'tenant_test_db',
        orgId: 'org-1',
      });
      await next();
    }),
  );

  app.route('/api', auditRoutes);
  return app;
}

const JWT = {
  oid: 'user-oid',
  preferred_username: 'a@b.com',
  name: 'User',
  roles: ['Analyst'],
  amr: ['pwd', 'mfa'],
};

beforeEach(async () => {
  // Full reset clears both calls AND mockResolvedValueOnce queues so
  // implementations set up in previous tests don't leak into later ones.
  mockValues.mockReset();
  mockInsert.mockReset();
  mockLimit.mockReset();
  mockOrderBy.mockReset();
  mockWhere.mockReset();
  mockFrom.mockReset();
  mockSelect.mockReset();

  mockValues.mockResolvedValue(undefined);
  mockInsert.mockReturnValue({ values: mockValues });

  mockLimit.mockResolvedValue([]);
  mockOrderBy.mockReturnValue({ limit: mockLimit });
  mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  mockFrom.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy });
  mockSelect.mockReturnValue({ from: mockFrom });
});

describe('GET /api/tenants/:tenantId/audits/history', () => {
  it('returns audit runs with computed overallScore and per-framework scores', async () => {
    const runs = [
      {
        id: 'audit-2',
        status: 'completed',
        startedAt: new Date('2026-03-12T10:00:00Z'),
        completedAt: new Date('2026-03-12T10:05:00Z'),
        totalChecks: 10,
        passedChecks: 8,
        failedChecks: 2,
      },
      {
        id: 'audit-1',
        status: 'completed',
        startedAt: new Date('2026-03-10T10:00:00Z'),
        completedAt: new Date('2026-03-10T10:05:00Z'),
        totalChecks: 10,
        passedChecks: 5,
        failedChecks: 5,
      },
    ];

    // The history route does 3 select chains:
    //  1. select().from(auditRuns).where(eq(status,completed)).orderBy(desc)     → runs
    //  2. select().from(auditFindings).where(inArray(...))                       → findings (batch)
    //  3. select().from(maturityScores).where(inArray(...))                      → maturity (batch)
    // The first uses .orderBy terminal; second and third terminate at .where.
    // Our default chain is select().from().where().orderBy() so we need to
    // thread the resolved value for each step.

    // Build a findings fixture where audit-2 has 8 pass / 2 fail,
    // audit-1 has 5 pass / 5 fail, split across frameworks.
    const findings = [
      // audit-2: 4 AAD pass, 2 ZTA pass, 1 80053 pass, 1 CSF pass, 1 AAD fail, 1 ZTA fail
      { auditRunId: 'audit-2', product: 'AAD', rating: 'pass' },
      { auditRunId: 'audit-2', product: 'AAD', rating: 'pass' },
      { auditRunId: 'audit-2', product: 'AAD', rating: 'pass' },
      { auditRunId: 'audit-2', product: 'AAD', rating: 'pass' },
      { auditRunId: 'audit-2', product: 'AAD', rating: 'fail' },
      { auditRunId: 'audit-2', product: 'ZTA', rating: 'pass' },
      { auditRunId: 'audit-2', product: 'ZTA', rating: 'pass' },
      { auditRunId: 'audit-2', product: 'ZTA', rating: 'fail' },
      { auditRunId: 'audit-2', product: '80053', rating: 'pass' },
      { auditRunId: 'audit-2', product: 'CSF', rating: 'pass' },
      // audit-1: 5 pass / 5 fail, all AAD
      { auditRunId: 'audit-1', product: 'AAD', rating: 'pass' },
      { auditRunId: 'audit-1', product: 'AAD', rating: 'pass' },
      { auditRunId: 'audit-1', product: 'AAD', rating: 'pass' },
      { auditRunId: 'audit-1', product: 'AAD', rating: 'pass' },
      { auditRunId: 'audit-1', product: 'AAD', rating: 'pass' },
      { auditRunId: 'audit-1', product: 'AAD', rating: 'fail' },
      { auditRunId: 'audit-1', product: 'AAD', rating: 'fail' },
      { auditRunId: 'audit-1', product: 'AAD', rating: 'fail' },
      { auditRunId: 'audit-1', product: 'AAD', rating: 'fail' },
      { auditRunId: 'audit-1', product: 'AAD', rating: 'fail' },
    ];

    // Step 1: runs query terminates at .orderBy(). The first .where()
    //         must return the chain object with .orderBy on it, and
    //         .orderBy itself must resolve to the runs array.
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValueOnce(runs);
    // Step 2: findings query terminates at .where(inArray(...))
    mockWhere.mockResolvedValueOnce(findings);
    // Step 3: maturity query terminates at .where(inArray(...))
    mockWhere.mockResolvedValueOnce([]);

    const app = await createTestApp(JWT);
    const res = await app.request('/api/tenants/tenant-1/audits/history', {
      headers: { 'X-Tenant-Id': 'tenant-1' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{
        auditId: string;
        overallScore: number;
        frameworkScores: Record<string, number>;
      }>;
    };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);

    const a2 = body.data.find((r) => r.auditId === 'audit-2')!;
    expect(a2).toBeDefined();
    // 8 pass / 10 applicable = 80
    expect(a2.overallScore).toBe(80);
    // AAD: 4/5 = 80
    expect(a2.frameworkScores.AAD).toBe(80);
    // ZTA: 2/3 = 67
    expect(a2.frameworkScores.ZTA).toBe(67);
    // 80053: 1/1 = 100
    expect(a2.frameworkScores['80053']).toBe(100);
    // CSF: 1/1 = 100
    expect(a2.frameworkScores.CSF).toBe(100);

    const a1 = body.data.find((r) => r.auditId === 'audit-1')!;
    expect(a1.overallScore).toBe(50);
    expect(a1.frameworkScores.AAD).toBe(50);
  });

  it('returns empty array when no completed audits exist', async () => {
    mockOrderBy.mockResolvedValueOnce([]);
    const app = await createTestApp(JWT);
    const res = await app.request('/api/tenants/tenant-1/audits/history', {
      headers: { 'X-Tenant-Id': 'tenant-1' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });
});

describe('GET /api/tenants/export/csv', () => {
  it('returns text/csv combining findings across all active tenants', async () => {
    const { getControlPlaneDb, getTenantDb } = await import('@omzig/db');

    // Mock control-plane: users lookup -> orgId; then active tenants list
    let selectCallIdx = 0;
    (getControlPlaneDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => {
            selectCallIdx++;
            if (selectCallIdx === 1) {
              // users lookup
              return Promise.resolve([
                { id: 'u1', orgId: 'org-1', entraObjectId: 'user-oid' },
              ]);
            }
            // tenants lookup
            return Promise.resolve([
              {
                id: 't-1',
                orgId: 'org-1',
                displayName: 'Acme',
                databaseName: 'tenant_acme',
                isDeleted: false,
                status: 'active',
              },
              {
                id: 't-2',
                orgId: 'org-1',
                displayName: 'Beta',
                databaseName: 'tenant_beta',
                isDeleted: false,
                status: 'active',
              },
            ]);
          },
        }),
      }),
    });

    // Per-tenant DB: most recent run + findings
    let tenantDbCallIdx = 0;
    (getTenantDb as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        tenantDbCallIdx++;
        const auditId = `audit-${tenantDbCallIdx}`;
        return {
          db: {
            select: () => ({
              from: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: () =>
                      Promise.resolve([
                        {
                          id: auditId,
                          completedAt: new Date('2026-04-14T10:00:00Z'),
                          status: 'completed',
                        },
                      ]),
                  }),
                }),
              }),
            }),
          },
          pool: {},
        };
      },
    );

    // The tenant DB also needs a findings query; since the same mock select
    // chain from tenant DB isn't used for findings (we'll make a second call),
    // simplify: our implementation will do 2 queries per tenant (run + findings)
    // We need to make the mock above handle findings query too. Reshape the
    // tenant DB mock to support two shapes.

    (getTenantDb as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        let q = 0;
        return {
          db: {
            select: () => ({
              from: () => ({
                where: () => {
                  q++;
                  if (q === 2) {
                    // findings
                    return Promise.resolve([
                      {
                        controlId: 'c1',
                        product: 'AAD',
                        rating: 'fail',
                        severity: 'High',
                        message: 'bad',
                      },
                    ]);
                  }
                  return {
                    orderBy: () => ({
                      limit: () =>
                        Promise.resolve([
                          {
                            id: 'audit-x',
                            completedAt: new Date('2026-04-14T10:00:00Z'),
                            status: 'completed',
                          },
                        ]),
                    }),
                  };
                },
              }),
            }),
          },
          pool: {},
        };
      },
    );

    const app = await createTestApp(JWT);
    const res = await app.request('/api/tenants/export/csv', {
      headers: { 'X-Tenant-Id': 'tenant-1' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const body = await res.text();
    expect(body).toContain('"Tenant Name"');
    expect(body).toContain('"Tenant ID"');
    expect(body).toContain('"Acme"');
    expect(body).toContain('"Beta"');
  });

  it('returns header-only CSV when org has no tenants with completed audits', async () => {
    const { getControlPlaneDb } = await import('@omzig/db');
    let selectCallIdx = 0;
    (getControlPlaneDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => {
            selectCallIdx++;
            if (selectCallIdx === 1) {
              return Promise.resolve([
                { id: 'u1', orgId: 'org-1', entraObjectId: 'user-oid' },
              ]);
            }
            return Promise.resolve([]); // no tenants
          },
        }),
      }),
    });

    const app = await createTestApp(JWT);
    const res = await app.request('/api/tenants/export/csv', {
      headers: { 'X-Tenant-Id': 'tenant-1' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const body = await res.text();
    // header only
    expect(body.split('\n').filter((l) => l.trim().length > 0).length).toBe(1);
    expect(body).toContain('"Tenant Name"');
  });
});

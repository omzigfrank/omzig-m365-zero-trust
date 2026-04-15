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
  tenants: { id: 'id', orgId: 'org_id', isDeleted: 'is_deleted', status: 'status', databaseName: 'database_name' },
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

// ---- generateExecutiveReport / generateFullReport ----

describe('PDF report service', () => {
  it('generateExecutiveReport returns a non-empty Buffer', async () => {
    const { generateExecutiveReport } = await import(
      '../services/pdf-report.js'
    );
    const buf = await generateExecutiveReport({
      tenantName: 'Acme',
      orgName: 'Acme Inc.',
      auditDate: new Date('2026-04-14T10:00:00Z'),
      overallScore: 78,
      frameworkScores: {
        AAD: { score: 85 },
        ZTA: { score: 70 },
        '80053': { score: 60 },
        CSF: { score: 90 },
      },
      maturitySnapshot: [
        { tenet: 'User', tenetName: 'User', weightedPassRate: 80, maturityLevel: 'advanced' },
      ],
      findings: [
        {
          controlId: 'MS.AAD.1.1v1',
          severity: 'High',
          rating: 'fail',
          message: 'fail msg',
          product: 'AAD',
          action: 'fix it',
        },
      ],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    // PDF file signature
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });

  it('generateFullReport returns a non-empty Buffer', async () => {
    const { generateFullReport } = await import('../services/pdf-report.js');
    const buf = await generateFullReport({
      tenantName: 'Acme',
      orgName: 'Acme Inc.',
      auditDate: new Date('2026-04-14T10:00:00Z'),
      overallScore: 78,
      frameworkScores: {
        AAD: { score: 85 },
        ZTA: { score: 70 },
        '80053': { score: 60 },
        CSF: { score: 90 },
      },
      maturitySnapshot: [
        { tenet: 'User', tenetName: 'User', weightedPassRate: 80, maturityLevel: 'advanced' },
      ],
      findings: Array.from({ length: 12 }, (_, i) => ({
        controlId: `MS.AAD.${i}.1v1`,
        severity: i % 2 === 0 ? 'High' : 'Medium',
        rating: i % 3 === 0 ? 'pass' : 'fail',
        message: `Message ${i}`,
        action: `Action ${i}`,
        product: 'AAD',
      })),
      trendData: [
        { date: '2026-01-01', scores: { Overall: 70, AAD: 75, ZTA: 65, '80053': 60, CSF: 80 } },
        { date: '2026-02-01', scores: { Overall: 75, AAD: 80, ZTA: 70, '80053': 65, CSF: 85 } },
        { date: '2026-03-01', scores: { Overall: 78, AAD: 85, ZTA: 70, '80053': 60, CSF: 90 } },
      ],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });
});

// ---- Route tests ----

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

describe('GET /api/tenants/:tenantId/audits/:auditId/report', () => {
  beforeEach(async () => {
    // Full reset: clears both call history AND mock implementations,
    // so mockResolvedValueOnce queues don't bleed between tests.
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

    // Mock the control-plane DB lookup for tenant info
    const { getControlPlaneDb } = await import('@omzig/db');
    (getControlPlaneDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve([
              { id: 'tenant-1', orgId: 'org-1', displayName: 'Acme', isDeleted: false },
            ]),
        }),
      }),
    });
  });

  it('returns 400 when type is missing or invalid', async () => {
    // Even reaching the handler body — audit lookup returns something
    const mockRun = {
      id: 'audit-1',
      completedAt: new Date(),
      status: 'completed',
      totalChecks: 10,
      passedChecks: 8,
      failedChecks: 2,
    };
    mockWhere
      .mockResolvedValueOnce([mockRun]) // audit run
      .mockResolvedValueOnce([]) // findings
      .mockResolvedValueOnce([]); // maturity

    const app = await createTestApp(JWT);
    const res = await app.request(
      '/api/tenants/tenant-1/audits/audit-1/report?type=banana',
      { headers: { 'X-Tenant-Id': 'tenant-1' } },
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 application/pdf for type=executive', async () => {
    const mockRun = {
      id: 'audit-1',
      completedAt: new Date('2026-04-14T10:00:00Z'),
      status: 'completed',
      totalChecks: 10,
      passedChecks: 8,
      failedChecks: 2,
    };
    mockWhere
      .mockResolvedValueOnce([mockRun]) // audit run
      .mockResolvedValueOnce([
        { controlId: 'c1', product: 'AAD', rating: 'pass', severity: 'Low', message: 'ok' },
        { controlId: 'c2', product: 'AAD', rating: 'fail', severity: 'High', message: 'bad' },
      ]) // findings
      .mockResolvedValueOnce([]); // maturity

    const app = await createTestApp(JWT);
    const res = await app.request(
      '/api/tenants/tenant-1/audits/audit-1/report?type=executive',
      { headers: { 'X-Tenant-Id': 'tenant-1' } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });

  it('returns 200 application/pdf for type=full', async () => {
    const mockRun = {
      id: 'audit-1',
      completedAt: new Date('2026-04-14T10:00:00Z'),
      status: 'completed',
      totalChecks: 10,
      passedChecks: 8,
      failedChecks: 2,
    };
    mockWhere
      .mockResolvedValueOnce([mockRun])
      .mockResolvedValueOnce([
        { controlId: 'c1', product: 'AAD', rating: 'pass', severity: 'Low', message: 'ok' },
      ])
      .mockResolvedValueOnce([]);

    const app = await createTestApp(JWT);
    const res = await app.request(
      '/api/tenants/tenant-1/audits/audit-1/report?type=full',
      { headers: { 'X-Tenant-Id': 'tenant-1' } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
  });

  it('returns 404 when audit run does not exist', async () => {
    mockWhere.mockResolvedValueOnce([]);
    const app = await createTestApp(JWT);
    const res = await app.request(
      '/api/tenants/tenant-1/audits/missing/report?type=executive',
      { headers: { 'X-Tenant-Id': 'tenant-1' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /api/tenants/:tenantId/audits/:auditId/export/csv', () => {
  beforeEach(async () => {
    mockValues.mockReset();
    mockInsert.mockReset();
    mockLimit.mockReset();
    mockOrderBy.mockReset();
    mockWhere.mockReset();
    mockFrom.mockReset();
    mockSelect.mockReset();

    mockLimit.mockResolvedValue([]);
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockFrom.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy });
    mockSelect.mockReturnValue({ from: mockFrom });

    const { getControlPlaneDb } = await import('@omzig/db');
    (getControlPlaneDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve([
              { id: 'tenant-1', orgId: 'org-1', displayName: 'Acme', isDeleted: false },
            ]),
        }),
      }),
    });
  });

  it('returns text/csv with Tenant Name column included', async () => {
    const mockRun = {
      id: 'audit-1',
      completedAt: new Date('2026-04-14T10:00:00Z'),
    };
    mockWhere
      .mockResolvedValueOnce([mockRun])
      .mockResolvedValueOnce([
        { controlId: 'c1', product: 'AAD', rating: 'pass', message: 'ok' },
      ]);

    const app = await createTestApp(JWT);
    const res = await app.request(
      '/api/tenants/tenant-1/audits/audit-1/export/csv',
      { headers: { 'X-Tenant-Id': 'tenant-1' } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const body = await res.text();
    expect(body).toContain('"Tenant Name"');
    expect(body).toContain('"Acme"');
  });

  it('returns 404 when audit run does not exist', async () => {
    mockWhere.mockResolvedValueOnce([]);
    const app = await createTestApp(JWT);
    const res = await app.request(
      '/api/tenants/tenant-1/audits/missing/export/csv',
      { headers: { 'X-Tenant-Id': 'tenant-1' } },
    );
    expect(res.status).toBe(404);
  });
});

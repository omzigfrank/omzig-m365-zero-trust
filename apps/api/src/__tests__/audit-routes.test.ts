import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({ type: 'eq', col: _col, val: _val })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', conditions: args })),
  desc: vi.fn((_col: unknown) => ({ type: 'desc', col: _col })),
}));

// Mock crypto.randomUUID for predictable IDs
const originalRandomUUID = crypto.randomUUID;
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  ...crypto,
  randomUUID: () => {
    uuidCounter++;
    return `test-uuid-${uuidCounter}`;
  },
});

// Mock @omzig/db module
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();

const mockTenantDb = {
  insert: mockInsert,
  select: mockSelect,
};

vi.mock('@omzig/db', () => ({
  auditRuns: {
    id: 'id',
    tenantId: 'tenant_id',
    triggeredBy: 'triggered_by',
    status: 'status',
    startedAt: 'started_at',
    completedAt: 'completed_at',
    totalChecks: 'total_checks',
    passedChecks: 'passed_checks',
    failedChecks: 'failed_checks',
    errorChecks: 'error_checks',
    summary: 'summary',
    createdAt: 'created_at',
  },
  auditFindings: {
    id: 'id',
    auditRunId: 'audit_run_id',
    controlId: 'control_id',
    product: 'product',
    description: 'description',
    requirementLevel: 'requirement_level',
    severity: 'severity',
    rating: 'rating',
    message: 'message',
    action: 'action',
    settingName: 'setting_name',
    currentValue: 'current_value',
    expectedValue: 'expected_value',
    requiredPermission: 'required_permission',
    nist80053: 'nist_800_53',
    createdAt: 'created_at',
  },
  getTenantDb: vi.fn(),
  closeTenantDb: vi.fn(),
}));

// Mock SignalR service
vi.mock('../services/signalr.js', () => ({
  negotiateSignalR: vi.fn().mockReturnValue({
    url: 'https://test-signalr.service.signalr.net/client/?hub=audit',
    accessToken: 'mock-signalr-token',
  }),
  pushAuditProgress: vi.fn().mockResolvedValue(undefined),
}));

// Mock user service (needed for RBAC middleware)
vi.mock('../services/user.js', () => ({
  getTenantRoleOverride: vi.fn().mockResolvedValue(null),
  getUserProfile: vi.fn().mockResolvedValue(null),
  resolveEffectiveRole: vi.fn(),
  setTenantRoleOverride: vi.fn(),
}));

/**
 * Helper: create a test Hono app with mock JWT, MFA, and audit routes.
 * Simulates the same middleware chain as the real app.
 */
async function createAuditTestApp(
  jwtPayload: Record<string, unknown>,
  tenantDbOverride?: unknown,
) {
  const { requireMfa } = await import('../middleware/mfa.js');
  const { requireRole } = await import('../middleware/rbac.js');
  const { errorHandler, notFoundHandler } = await import('../middleware/error.js');

  // Lazy import of the audit routes
  const { auditRoutes } = await import('../routes/audits.js');

  const app = new Hono();
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  // Mock JWT injection
  app.use(
    '/api/*',
    createMiddleware(async (c, next) => {
      c.set('jwtPayload', jwtPayload);
      await next();
    }),
  );

  // MFA check
  app.use('/api/*', requireMfa());

  // Mock tenant context injection (simulates withTenantDb middleware)
  app.use(
    '/api/tenants/:tenantId/*',
    createMiddleware(async (c, next) => {
      c.set('tenantDb', tenantDbOverride || mockTenantDb);
      c.set('tenantMeta', {
        id: c.req.param('tenantId'),
        databaseName: 'tenant_test_db',
        orgId: 'org-1',
      });
      await next();
    }),
  );

  // Mount audit routes
  app.route('/api', auditRoutes);

  return app;
}

const ANALYST_JWT = {
  oid: 'user-oid-analyst',
  preferred_username: 'analyst@test.com',
  name: 'Test Analyst',
  roles: ['Analyst'],
  amr: ['pwd', 'mfa'],
};

const READONLY_JWT = {
  oid: 'user-oid-readonly',
  preferred_username: 'reader@test.com',
  name: 'Test Reader',
  roles: ['Read-only'],
  amr: ['pwd', 'mfa'],
};

describe('Audit API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;

    // Setup default mock chain: insert().values()
    mockValues.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });

    // Setup default mock chain: select().from().where().orderBy()
    mockOrderBy.mockResolvedValue([]);
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockFrom.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy });
    mockSelect.mockReturnValue({ from: mockFrom });
  });

  describe('POST /api/tenants/:tenantId/audits', () => {
    it('returns 202 with auditId and status running', async () => {
      const app = await createAuditTestApp(ANALYST_JWT);

      const res = await app.request('/api/tenants/tenant-1/audits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': 'tenant-1',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(body.data.auditId).toBeDefined();
      expect(body.data.status).toBe('running');
    });

    it('requires Analyst role or higher (rejects Read-only)', async () => {
      const app = await createAuditTestApp(READONLY_JWT);

      const res = await app.request('/api/tenants/tenant-1/audits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': 'tenant-1',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(403);
    });

    it('accepts optional accessToken in request body', async () => {
      const app = await createAuditTestApp(ANALYST_JWT);

      const res = await app.request('/api/tenants/tenant-1/audits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': 'tenant-1',
        },
        body: JSON.stringify({ accessToken: 'some-graph-token' }),
      });

      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.data.status).toBe('running');
    });

    it('inserts a new audit run row into the tenant DB', async () => {
      const app = await createAuditTestApp(ANALYST_JWT);

      await app.request('/api/tenants/tenant-1/audits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': 'tenant-1',
        },
        body: JSON.stringify({}),
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          triggeredBy: 'user-oid-analyst',
          status: 'running',
          totalChecks: 29,
        }),
      );
    });
  });

  describe('GET /api/tenants/:tenantId/audits', () => {
    it('returns list of audit runs ordered by createdAt desc', async () => {
      const mockRuns = [
        {
          id: 'audit-2',
          tenantId: 'tenant-1',
          status: 'completed',
          totalChecks: 29,
          passedChecks: 25,
          failedChecks: 4,
          createdAt: '2026-03-11T10:00:00Z',
        },
        {
          id: 'audit-1',
          tenantId: 'tenant-1',
          status: 'completed',
          totalChecks: 29,
          passedChecks: 20,
          failedChecks: 9,
          createdAt: '2026-03-10T10:00:00Z',
        },
      ];

      mockOrderBy.mockResolvedValueOnce(mockRuns);

      const app = await createAuditTestApp(ANALYST_JWT);

      const res = await app.request('/api/tenants/tenant-1/audits', {
        method: 'GET',
        headers: { 'X-Tenant-Id': 'tenant-1' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.data[0].id).toBe('audit-2');
    });
  });

  describe('GET /api/tenants/:tenantId/audits/:auditId', () => {
    it('returns audit run with findings array', async () => {
      const mockRun = {
        id: 'audit-1',
        tenantId: 'tenant-1',
        status: 'completed',
        totalChecks: 29,
        passedChecks: 28,
        failedChecks: 1,
        createdAt: '2026-03-11T10:00:00Z',
      };

      const mockFindings = [
        {
          id: 'finding-1',
          auditRunId: 'audit-1',
          controlId: 'MS.AAD.1.1v1',
          rating: 'pass',
          severity: 'High',
        },
      ];

      // First select: audit run (where returns array)
      mockWhere.mockResolvedValueOnce([mockRun]);
      // Second select: findings
      mockFrom.mockReturnValueOnce({ where: mockWhere, orderBy: mockOrderBy });
      mockSelect.mockReturnValueOnce({ from: mockFrom });
      mockWhere.mockResolvedValueOnce(mockFindings);

      const app = await createAuditTestApp(ANALYST_JWT);

      const res = await app.request('/api/tenants/tenant-1/audits/audit-1', {
        method: 'GET',
        headers: { 'X-Tenant-Id': 'tenant-1' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe('audit-1');
      expect(body.data.findings).toBeDefined();
      expect(body.data.findings).toHaveLength(1);
      expect(body.data.findings[0].controlId).toBe('MS.AAD.1.1v1');
    });

    it('returns 404 for unknown audit ID', async () => {
      // Return empty array for audit run lookup
      mockWhere.mockResolvedValueOnce([]);

      const app = await createAuditTestApp(ANALYST_JWT);

      const res = await app.request('/api/tenants/tenant-1/audits/nonexistent', {
        method: 'GET',
        headers: { 'X-Tenant-Id': 'tenant-1' },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('AUDIT_NOT_FOUND');
    });
  });

  describe('POST /api/tenants/:tenantId/audits/:auditId/checks/:controlId/retry', () => {
    it('returns 202 with retry confirmation', async () => {
      const app = await createAuditTestApp(ANALYST_JWT);

      const res = await app.request(
        '/api/tenants/tenant-1/audits/audit-1/checks/MS.AAD.1.1v1/retry',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-Id': 'tenant-1',
          },
        },
      );

      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.data.auditId).toBe('audit-1');
      expect(body.data.controlId).toBe('MS.AAD.1.1v1');
      expect(body.data.status).toBe('retrying');
    });

    it('requires Analyst role or higher', async () => {
      const app = await createAuditTestApp(READONLY_JWT);

      const res = await app.request(
        '/api/tenants/tenant-1/audits/audit-1/checks/MS.AAD.1.1v1/retry',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-Id': 'tenant-1',
          },
        },
      );

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/signalr/negotiate', () => {
    it('returns { data: { url, accessToken } }', async () => {
      const app = await createAuditTestApp(ANALYST_JWT);

      const res = await app.request('/api/signalr/negotiate', {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(body.data.url).toContain('hub=audit');
      expect(body.data.accessToken).toBe('mock-signalr-token');
    });
  });
});

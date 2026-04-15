/**
 * Phase 7 Plan 02 -- Remediations routes tests.
 *
 * Mocks the tenant DB, control plane DB, remediation-token-broker, and the
 * @omzig/audit remediation registry lookups. Tests cover all six endpoints
 * with happy paths and the key error cases from the plan's <behavior> block.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ApiResponse } from '@omzig/shared';

// ---- Shared mock state ----

const TENANT_REMEDIATION_CONSENTS = Symbol('tenant_remediation_consents');
const REMEDIATION_JOBS = Symbol('remediation_jobs');
const AUDIT_FINDINGS = Symbol('audit_findings');

let findingsRows: any[] = [];
let consentRows: any[] = [];
let jobRows: any[] = [];
let insertedJobs: any[] = [];
let jobUpdates: any[] = [];
let consentByAll: any[] = [];

function resetState() {
  findingsRows = [];
  consentRows = [];
  jobRows = [];
  insertedJobs = [];
  jobUpdates = [];
  consentByAll = [];
}

function createMockTenantDb() {
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: any) => {
        const chain: any = {
          where: vi.fn().mockImplementation(() => {
            if (table === AUDIT_FINDINGS) return Promise.resolve(findingsRows);
            if (table === REMEDIATION_JOBS) return Promise.resolve(jobRows);
            return Promise.resolve([]);
          }),
          orderBy: vi.fn().mockImplementation(() => {
            if (table === REMEDIATION_JOBS) return Promise.resolve(jobRows);
            return Promise.resolve([]);
          }),
        };
        return chain;
      }),
    })),
    insert: vi.fn().mockImplementation((table: any) => ({
      values: vi.fn().mockImplementation((vals: any) => {
        if (table === REMEDIATION_JOBS) insertedJobs.push(vals);
        return Promise.resolve(undefined);
      }),
    })),
    update: vi.fn().mockImplementation((table: any) => ({
      set: vi.fn().mockImplementation((vals: any) => {
        jobUpdates.push({ table, vals });
        return {
          where: vi
            .fn()
            .mockImplementation(() => Promise.resolve({ rowsAffected: 1 })),
        };
      }),
    })),
  };
}

function createMockControlDb() {
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: any) => ({
        where: vi.fn().mockImplementation(() => {
          if (table === TENANT_REMEDIATION_CONSENTS) {
            // If there were two eq() filters (tenant+bundle), we match consentRows;
            // for the scopes endpoint, match consentByAll.
            return Promise.resolve(
              consentRows.length ? consentRows : consentByAll,
            );
          }
          return Promise.resolve([]);
        }),
      })),
    })),
  };
}

let mockTenantDb: ReturnType<typeof createMockTenantDb>;
let mockControlDb: ReturnType<typeof createMockControlDb>;

// ---- External module mocks ----

vi.mock('@omzig/db', () => ({
  getControlPlaneDb: vi.fn().mockImplementation(async () => mockControlDb),
  auditFindings: AUDIT_FINDINGS,
  remediationJobs: REMEDIATION_JOBS,
  tenantRemediationConsents: TENANT_REMEDIATION_CONSENTS,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
  desc: vi.fn((...args: any[]) => args),
  isNull: vi.fn((...args: any[]) => args),
}));

// Remediation entry registry mock.
const mockEntry: any = {
  controlId: 'MS.AAD.1.1v1',
  classification: 'SAFE',
  scopeBundle: 'conditionalAccess',
  writeScopes: ['Policy.ReadWrite.ConditionalAccess'],
  executor: vi.fn(),
  rollbackExecutor: vi.fn(),
  validatePrerequisites: undefined,
};

let validatePrereqReturn: { ok: boolean; failureReason?: string } = { ok: true };

vi.mock('@omzig/audit', () => ({
  getRemediationByControlId: vi.fn((id: string) => {
    if (id === 'UNKNOWN.CONTROL') return undefined;
    if (id === 'DOCS.ONLY') return { ...mockEntry, executor: undefined };
    if (id === 'WITH.PREREQ') {
      return {
        ...mockEntry,
        controlId: 'WITH.PREREQ',
        validatePrerequisites: async () => validatePrereqReturn,
      };
    }
    return mockEntry;
  }),
  validatePrerequisitesOnly: vi.fn(async (entry: any, _ctx: any) => {
    if (entry.validatePrerequisites) return entry.validatePrerequisites();
    return { ok: true };
  }),
  computeDrift: vi.fn(() => ({ drifted: false, changedFields: [] })),
  DriftDetectedError: class DriftDetectedError extends Error {
    readonly code = 'DRIFT_DETECTED';
    constructor(public readonly changedFields: string[]) {
      super('drift');
      this.name = 'DriftDetectedError';
    }
  },
  createGraphClient: vi.fn(() => ({ api: () => ({}) })),
}));

// Remediation-token-broker mock.
let getTokenReturn: string | null = 'test-access-token';
const mockExchange = vi.fn().mockResolvedValue({
  accessToken: 'new-access',
  refreshToken: 'new-refresh',
  expiresOn: new Date(),
});
const mockStore = vi.fn().mockResolvedValue(undefined);

vi.mock('../services/remediation-token-broker.js', () => ({
  SCOPE_BUNDLES: {
    conditionalAccess: ['Policy.ReadWrite.ConditionalAccess', 'Policy.Read.All'],
    authMethods: ['Policy.ReadWrite.AuthenticationMethod'],
    authPolicy: ['Policy.ReadWrite.Authorization'],
    roles: ['RoleManagement.ReadWrite.Directory'],
    securityDefaults: ['Policy.ReadWrite.SecurityDefaults'],
  },
  exchangeForRemediationRefreshToken: (...a: any[]) => mockExchange(...a),
  storeRemediationConsent: (...a: any[]) => mockStore(...a),
  getRemediationAccessToken: vi.fn(async () => getTokenReturn),
}));

vi.mock('../services/signalr.js', () => ({
  pushAuditProgress: vi.fn().mockResolvedValue(undefined),
  pushRemediationProgress: vi.fn().mockResolvedValue(undefined),
}));

// ---- Test helper: build app with mocked middleware chain ----

const ADMIN_JWT = {
  oid: 'admin-oid',
  preferred_username: 'admin@test.com',
  name: 'Admin User',
  roles: ['Admin'],
  amr: ['pwd', 'mfa'],
};

const READONLY_JWT = {
  oid: 'reader-oid',
  preferred_username: 'reader@test.com',
  name: 'Read Only',
  roles: ['Read-only'],
  amr: ['pwd', 'mfa'],
};

async function createTestApp(jwtPayload = ADMIN_JWT) {
  const { remediationsRoutes } = await import('../routes/remediations.js');

  const app = new Hono();
  app.use(
    '/api/*',
    createMiddleware(async (c, next) => {
      c.set('jwtPayload', jwtPayload);
      await next();
    }),
  );
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
  app.route('/api', remediationsRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  validatePrereqReturn = { ok: true };
  getTokenReturn = 'test-access-token';
  mockTenantDb = createMockTenantDb();
  mockControlDb = createMockControlDb();
  mockEntry.executor = vi.fn();
  mockEntry.rollbackExecutor = vi.fn();
});

// ================================================================
// POST /api/tenants/:tenantId/remediations/approve
// ================================================================

describe('POST /api/tenants/:tenantId/remediations/approve', () => {
  it('returns 202 and a remediationJobId when all checks pass', async () => {
    findingsRows = [
      { id: 'f1', controlId: 'MS.AAD.1.1v1', product: 'AAD' },
    ];
    consentRows = [{ id: 'c1', scopeBundle: 'conditionalAccess' }];

    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/approve',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId: 'f1' }),
      },
    );

    expect(res.status).toBe(202);
    const body = (await res.json()) as ApiResponse<{
      remediationJobId: string;
      status: string;
    }>;
    expect(body.data?.remediationJobId).toBeDefined();
    expect(body.data?.status).toBe('pending');
    expect(insertedJobs.length).toBe(1);
    expect(insertedJobs[0].status).toBe('pending');
    expect(insertedJobs[0].findingId).toBe('f1');
  });

  it('returns 404 when the finding does not exist', async () => {
    findingsRows = [];
    consentRows = [{ scopeBundle: 'conditionalAccess' }];

    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/approve',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId: 'missing' }),
      },
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 when the control has no executor (documentation-only)', async () => {
    findingsRows = [{ id: 'f1', controlId: 'DOCS.ONLY' }];
    consentRows = [{ scopeBundle: 'conditionalAccess' }];

    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/approve',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId: 'f1' }),
      },
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('NOT_REMEDIABLE');
  });

  it('returns 400 with consent_required error when no active consent exists', async () => {
    findingsRows = [{ id: 'f1', controlId: 'MS.AAD.1.1v1' }];
    consentRows = []; // no consent

    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/approve',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId: 'f1' }),
      },
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('CONSENT_REQUIRED');
    expect(body.error.bundle).toBe('conditionalAccess');
    expect(body.error.scopes).toContain('Policy.ReadWrite.ConditionalAccess');
  });

  it('returns 422 when validatePrerequisites returns ok=false', async () => {
    findingsRows = [{ id: 'f1', controlId: 'WITH.PREREQ' }];
    consentRows = [{ scopeBundle: 'conditionalAccess' }];
    validatePrereqReturn = { ok: false, failureReason: 'No break-glass group' };

    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/approve',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId: 'f1' }),
      },
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('PREREQUISITE_FAILED');
    expect(body.error.reason).toBe('No break-glass group');
  });

  it('returns 403 for Read-only users', async () => {
    findingsRows = [{ id: 'f1', controlId: 'MS.AAD.1.1v1' }];
    consentRows = [{ scopeBundle: 'conditionalAccess' }];

    const app = await createTestApp(READONLY_JWT);
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/approve',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId: 'f1' }),
      },
    );

    expect(res.status).toBe(403);
  });

  it('returns 400 on invalid JSON body', async () => {
    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/approve',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ not json }',
      },
    );

    expect(res.status).toBe(400);
  });
});

// ================================================================
// POST /api/tenants/:tenantId/remediations/:jobId/rollback
// ================================================================

describe('POST /api/tenants/:tenantId/remediations/:jobId/rollback', () => {
  it('returns 200 and marks status=rolled_back on success', async () => {
    jobRows = [
      {
        id: 'job-1',
        tenantId: 'tenant-1',
        controlId: 'MS.AAD.1.1v1',
        classification: 'SAFE',
        scopeBundle: 'conditionalAccess',
        status: 'completed',
        beforeSnapshot: JSON.stringify({ targetResourceId: 'policy-abc' }),
        afterSnapshot: JSON.stringify({ id: 'policy-abc' }),
      },
    ];

    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/job-1/rollback',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      },
    );

    expect(res.status).toBe(200);
    const setCalls = jobUpdates.filter(
      (u) => u.vals.status === 'rolled_back',
    );
    expect(setCalls.length).toBe(1);
  });

  it('returns 404 when the job does not exist', async () => {
    jobRows = [];
    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/missing/rollback',
      { method: 'POST' },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when the job is not in status=completed', async () => {
    jobRows = [
      {
        id: 'job-2',
        controlId: 'MS.AAD.1.1v1',
        status: 'pending',
        scopeBundle: 'conditionalAccess',
      },
    ];
    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/job-2/rollback',
      { method: 'POST' },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('INVALID_STATE');
  });

  it('returns 503 when no active consent exists at rollback time', async () => {
    jobRows = [
      {
        id: 'job-3',
        controlId: 'MS.AAD.1.1v1',
        status: 'completed',
        scopeBundle: 'conditionalAccess',
        beforeSnapshot: null,
        afterSnapshot: null,
      },
    ];
    getTokenReturn = null;

    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/job-3/rollback',
      { method: 'POST' },
    );
    expect(res.status).toBe(503);
  });

  it('marks job as rollback_failed and returns 500 when rollback executor throws', async () => {
    jobRows = [
      {
        id: 'job-4',
        controlId: 'MS.AAD.1.1v1',
        status: 'completed',
        scopeBundle: 'conditionalAccess',
        beforeSnapshot: null,
        afterSnapshot: null,
      },
    ];
    mockEntry.rollbackExecutor = vi
      .fn()
      .mockRejectedValue(new Error('boom'));

    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/job-4/rollback',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      },
    );

    expect(res.status).toBe(500);
    const failUpdate = jobUpdates.find(
      (u) => u.vals.status === 'rollback_failed',
    );
    expect(failUpdate).toBeDefined();
  });

  it('returns 207 and marks rollback_partial when error contains "partial"', async () => {
    jobRows = [
      {
        id: 'job-5',
        controlId: 'MS.AAD.1.1v1',
        status: 'completed',
        scopeBundle: 'conditionalAccess',
        beforeSnapshot: null,
        afterSnapshot: null,
      },
    ];
    mockEntry.rollbackExecutor = vi
      .fn()
      .mockRejectedValue(new Error('partial: SMS rolled back, Voice failed'));

    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/job-5/rollback',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      },
    );

    expect(res.status).toBe(207);
    const partialUpdate = jobUpdates.find(
      (u) => u.vals.status === 'rollback_partial',
    );
    expect(partialUpdate).toBeDefined();
  });
});

// ================================================================
// GET /api/tenants/:tenantId/remediations/:jobId
// ================================================================

describe('GET /api/tenants/:tenantId/remediations/:jobId', () => {
  it('returns the full job row with parsed snapshots', async () => {
    jobRows = [
      {
        id: 'job-1',
        status: 'completed',
        beforeSnapshot: JSON.stringify({ a: 1 }),
        afterSnapshot: JSON.stringify({ b: 2 }),
      },
    ];

    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/job-1',
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<any>;
    expect(body.data.id).toBe('job-1');
    expect(body.data.beforeSnapshot).toEqual({ a: 1 });
    expect(body.data.afterSnapshot).toEqual({ b: 2 });
  });

  it('returns 404 for a missing job', async () => {
    jobRows = [];
    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/nope',
    );
    expect(res.status).toBe(404);
  });
});

// ================================================================
// GET /api/tenants/:tenantId/remediations/history
// ================================================================

describe('GET /api/tenants/:tenantId/remediations/history', () => {
  it('returns all jobs for the tenant', async () => {
    jobRows = [
      { id: 'j1', controlId: 'MS.AAD.1.1v1', status: 'completed' },
      { id: 'j2', controlId: 'MS.AAD.3.5v1', status: 'failed' },
    ];

    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/history',
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<any[]>;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
  });
});

// ================================================================
// GET /api/remediations/scopes
// ================================================================

describe('GET /api/remediations/scopes', () => {
  it('returns 400 when tenantId is missing', async () => {
    const app = await createTestApp();
    const res = await app.request('/api/remediations/scopes');
    expect(res.status).toBe(400);
  });

  it('returns all five bundles with per-bundle consent state', async () => {
    consentByAll = [
      { scopeBundle: 'conditionalAccess', consentedAt: new Date(), lastUsedAt: null },
    ];

    const app = await createTestApp();
    const res = await app.request(
      '/api/remediations/scopes?tenantId=tenant-1',
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{
      bundles: Record<string, string[]>;
      consents: Record<string, { active: boolean }>;
    }>;
    expect(body.data.bundles.conditionalAccess).toContain(
      'Policy.ReadWrite.ConditionalAccess',
    );
    expect(body.data.consents.conditionalAccess.active).toBe(true);
    expect(body.data.consents.authMethods.active).toBe(false);
    expect(body.data.consents.roles.active).toBe(false);
  });
});

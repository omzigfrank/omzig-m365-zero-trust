/**
 * Phase 7 Plan 02 -- Consent route test.
 *
 * Tests POST /api/tenants/:tenantId/remediations/consent, verifying that
 * the handler forwards the SPA assertion to exchangeForRemediationRefreshToken
 * and stores the resulting refresh token via storeRemediationConsent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';

// Drizzle + db mocks (this route never touches the tenant DB but the
// router import pulls in the full module, which imports @omzig/db).
vi.mock('@omzig/db', () => ({
  getControlPlaneDb: vi.fn().mockImplementation(async () => ({
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
  })),
  auditFindings: Symbol('auditFindings'),
  remediationJobs: Symbol('remediationJobs'),
  tenantRemediationConsents: Symbol('tenantRemediationConsents'),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  isNull: vi.fn(),
}));

vi.mock('@omzig/audit', () => ({
  getRemediationByControlId: vi.fn(() => undefined),
  validatePrerequisitesOnly: vi.fn(),
  computeDrift: vi.fn(),
  DriftDetectedError: class extends Error {},
  createGraphClient: vi.fn(() => ({})),
}));

const mockExchange = vi.fn().mockResolvedValue({
  accessToken: 'at',
  refreshToken: 'rt',
  expiresOn: new Date(),
});
const mockStore = vi.fn().mockResolvedValue(undefined);

vi.mock('../services/remediation-token-broker.js', () => ({
  SCOPE_BUNDLES: {
    conditionalAccess: ['Policy.ReadWrite.ConditionalAccess'],
    authMethods: ['Policy.ReadWrite.AuthenticationMethod'],
    authPolicy: ['Policy.ReadWrite.Authorization'],
    roles: ['RoleManagement.ReadWrite.Directory'],
    securityDefaults: ['Policy.ReadWrite.SecurityDefaults'],
  },
  exchangeForRemediationRefreshToken: (...a: any[]) => mockExchange(...a),
  storeRemediationConsent: (...a: any[]) => mockStore(...a),
  getRemediationAccessToken: vi.fn(async () => null),
}));

vi.mock('../services/signalr.js', () => ({
  pushAuditProgress: vi.fn(),
  pushRemediationProgress: vi.fn(),
}));

const ADMIN_JWT = {
  oid: 'admin-oid',
  roles: ['Admin'],
  amr: ['pwd', 'mfa'],
};

async function createTestApp() {
  const { remediationsRoutes } = await import('../routes/remediations.js');
  const app = new Hono();
  app.use(
    '/api/*',
    createMiddleware(async (c, next) => {
      c.set('jwtPayload', ADMIN_JWT);
      await next();
    }),
  );
  app.use(
    '/api/tenants/:tenantId/*',
    createMiddleware(async (c, next) => {
      c.set('tenantDb', {
        insert: () => ({ values: () => Promise.resolve(undefined) }),
      });
      c.set('tenantMeta', { id: 't1', databaseName: 'x', orgId: 'o' });
      await next();
    }),
  );
  app.route('/api', remediationsRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/tenants/:tenantId/remediations/consent', () => {
  it('calls exchange + store and returns 201', async () => {
    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/consent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundle: 'conditionalAccess',
          spaAssertion: 'spa-token',
        }),
      },
    );

    expect(res.status).toBe(201);
    expect(mockExchange).toHaveBeenCalledWith('spa-token', 'conditionalAccess');
    expect(mockStore).toHaveBeenCalledWith(
      'tenant-1',
      'conditionalAccess',
      'rt',
      'admin-oid',
    );
  });

  it('rejects an invalid bundle name with 400', async () => {
    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/consent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundle: 'bogusBundle',
          spaAssertion: 'spa-token',
        }),
      },
    );

    expect(res.status).toBe(400);
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it('rejects a missing spaAssertion with 400', async () => {
    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/consent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: 'conditionalAccess' }),
      },
    );

    expect(res.status).toBe(400);
  });

  it('returns 500 when the OBO exchange throws', async () => {
    mockExchange.mockRejectedValueOnce(new Error('bad assertion'));
    const app = await createTestApp();
    const res = await app.request(
      '/api/tenants/tenant-1/remediations/consent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundle: 'conditionalAccess',
          spaAssertion: 'spa-token',
        }),
      },
    );

    expect(res.status).toBe(500);
  });
});

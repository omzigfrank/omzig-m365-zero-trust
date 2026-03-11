import { describe, it, expect } from 'vitest';
import type { HealthResponse, ApiResponse, ApiError } from '@omzig/shared';

// App will be created once it exists
const getApp = async () => {
  const { createApp } = await import('../app.js');
  return createApp();
};

describe('GET /api/health', () => {
  it('returns 200 with structured HealthResponse', async () => {
    const app = await getApp();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as HealthResponse;
    expect(body.status).toBe('healthy');
    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe('string');
    expect(body.version).toBeDefined();
    expect(typeof body.version).toBe('string');
    expect(body.checks).toBeDefined();
    expect(body.checks.database).toBeDefined();
    expect(body.checks.keyVault).toBeDefined();
    expect(body.checks.signalR).toBeDefined();
  });

  it('returns checks with unknown status when downstream services are unavailable', async () => {
    const app = await getApp();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as HealthResponse;
    // Services are not wired yet, so all checks should be 'unknown'
    expect(body.checks.database.status).toBe('unknown');
    expect(body.checks.keyVault.status).toBe('unknown');
    expect(body.checks.signalR.status).toBe('unknown');
  });

  it('does not require authentication', async () => {
    const app = await getApp();
    // No Authorization header
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
  });
});

describe('Error handling', () => {
  it('returns 404 with structured ApiError for unknown non-api routes', async () => {
    const app = await getApp();
    // Use a non-/api/ path to avoid auth middleware interception
    const res = await app.request('/nonexistent');
    expect(res.status).toBe(404);

    const body = (await res.json()) as ApiResponse;
    expect(body.error).toBeDefined();
    expect(body.error!.code).toBe('NOT_FOUND');
    expect(body.error!.message).toBeDefined();
    expect(body.meta).toBeDefined();
    expect(body.meta!.correlationId).toBeDefined();
    expect(body.meta!.timestamp).toBeDefined();
  });

  it('returns auth error for unknown /api/* routes (auth middleware intercepts first)', async () => {
    const app = await getApp();
    // Unknown /api/* routes hit auth middleware before not-found handler
    // Without AZURE_TENANT_ID/AZURE_CLIENT_ID set, MFA middleware runs and returns 401
    const res = await app.request('/api/nonexistent');
    // Either 401 (no auth) or 403 (no MFA) depending on middleware chain
    expect([401, 403]).toContain(res.status);

    const body = (await res.json()) as ApiResponse;
    expect(body.error).toBeDefined();
    expect(body.meta).toBeDefined();
    expect(body.meta!.correlationId).toBeDefined();
  });
});

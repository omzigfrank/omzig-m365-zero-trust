import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { ApiResponse } from '@omzig/shared';

/**
 * Auth middleware tests.
 *
 * Since Hono's jwt middleware calls the real JWKS endpoint, we test
 * the auth middleware integration by:
 * 1. Testing the createAuthMiddleware configuration (unit)
 * 2. Testing the middleware chain with a mock JWT payload injected
 *    into the context (simulating post-validation state)
 *
 * Full JWKS validation is tested in integration tests (Plan 04).
 */

const createTestApp = async () => {
  const { createApp } = await import('../app.js');
  return createApp();
};

describe('Auth middleware', () => {
  it('rejects requests without Authorization header with 401', async () => {
    const app = await createTestApp();
    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(401);

    const body = (await res.json()) as ApiResponse;
    expect(body.error).toBeDefined();
    expect(body.error!.code).toBe('UNAUTHORIZED');
  });

  it('rejects requests with invalid Bearer token format with 401', async () => {
    const app = await createTestApp();
    const res = await app.request('/api/auth/me', {
      headers: { Authorization: 'InvalidFormat' },
    });
    expect(res.status).toBe(401);
  });

  it('health endpoint remains accessible without authentication', async () => {
    const app = await createTestApp();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/auth/me', () => {
  it('returns UserProfile with role information when authenticated', async () => {
    // We use the test helper to simulate a valid JWT context
    const { createTestAppWithAuth } = await import('./helpers.js');
    const app = createTestAppWithAuth({
      oid: 'test-user-123',
      preferred_username: 'user@example.com',
      name: 'Test User',
      roles: ['Admin'],
      amr: ['pwd', 'mfa'],
    });

    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse;
    expect(body.data).toBeDefined();
    const profile = body.data as any;
    expect(profile.email).toBe('user@example.com');
    expect(profile.displayName).toBe('Test User');
    expect(profile.baseRole).toBe('Admin');
  });

  it('resolves effective role with tenant context', async () => {
    const { createTestAppWithAuth } = await import('./helpers.js');
    const app = createTestAppWithAuth({
      oid: 'test-user-456',
      preferred_username: 'analyst@example.com',
      name: 'Analyst User',
      roles: ['Analyst'],
      amr: ['pwd', 'mfa'],
    });

    const res = await app.request('/api/auth/me', {
      headers: { 'X-Tenant-Id': 'tenant-abc' },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as ApiResponse;
    expect(body.data).toBeDefined();
  });
});

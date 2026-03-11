import { describe, it, expect } from 'vitest';
import type { ApiResponse } from '@omzig/shared';

describe('MFA middleware', () => {
  it('passes when JWT amr claim contains mfa', async () => {
    const { createTestAppWithAuth } = await import('./helpers.js');
    const app = createTestAppWithAuth({
      oid: 'user-1',
      preferred_username: 'user@example.com',
      name: 'Test',
      roles: ['Admin'],
      amr: ['pwd', 'mfa'],
    });

    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(200);
  });

  it('rejects with 403 MFA_NOT_COMPLETED when amr is ["pwd"] only', async () => {
    const { createTestAppWithAuth } = await import('./helpers.js');
    const app = createTestAppWithAuth({
      oid: 'user-2',
      preferred_username: 'user@example.com',
      name: 'Test',
      roles: ['Admin'],
      amr: ['pwd'],
    });

    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(403);

    const body = (await res.json()) as ApiResponse;
    expect(body.error).toBeDefined();
    expect(body.error!.code).toBe('MFA_NOT_COMPLETED');
    expect(body.error!.message).toContain('Multi-factor authentication');
  });

  it('rejects with 403 MFA_NOT_COMPLETED when amr is undefined', async () => {
    const { createTestAppWithAuth } = await import('./helpers.js');
    const app = createTestAppWithAuth({
      oid: 'user-3',
      preferred_username: 'user@example.com',
      name: 'Test',
      roles: ['Admin'],
      // No amr claim
    });

    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(403);

    const body = (await res.json()) as ApiResponse;
    expect(body.error!.code).toBe('MFA_NOT_COMPLETED');
  });

  it('rejects with 403 MFA_NOT_COMPLETED when amr is empty array', async () => {
    const { createTestAppWithAuth } = await import('./helpers.js');
    const app = createTestAppWithAuth({
      oid: 'user-4',
      preferred_username: 'user@example.com',
      name: 'Test',
      roles: ['Admin'],
      amr: [],
    });

    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(403);

    const body = (await res.json()) as ApiResponse;
    expect(body.error!.code).toBe('MFA_NOT_COMPLETED');
  });
});

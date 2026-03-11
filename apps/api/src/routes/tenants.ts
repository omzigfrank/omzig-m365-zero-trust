import { Hono } from 'hono';
import type { ApiResponse } from '@omzig/shared';

/**
 * Tenant management routes.
 *
 * All endpoints return 501 Not Implemented as stubs.
 * Full implementation comes in Phase 4 (Tenant Onboarding).
 */
export const tenantsRoutes = new Hono();

const notImplemented = (): ApiResponse => ({
  error: {
    code: 'NOT_IMPLEMENTED',
    message: 'Tenant management endpoints will be available in Phase 4',
  },
  meta: {
    correlationId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  },
});

// GET /api/tenants - List tenants for the authenticated user's org
tenantsRoutes.get('/', (c) => {
  return c.json(notImplemented(), 501);
});

// POST /api/tenants - Provision a new tenant
tenantsRoutes.post('/', (c) => {
  return c.json(notImplemented(), 501);
});

// GET /api/tenants/:id - Get tenant details
tenantsRoutes.get('/:id', (c) => {
  return c.json(notImplemented(), 501);
});

// DELETE /api/tenants/:id - Deprovision a tenant
tenantsRoutes.delete('/:id', (c) => {
  return c.json(notImplemented(), 501);
});

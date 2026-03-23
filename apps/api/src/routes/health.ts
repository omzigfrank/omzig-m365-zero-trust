import { Hono } from 'hono';
import type { HealthResponse, HealthCheck } from '@omzig/shared';

const health = new Hono();

/**
 * GET / - Health check endpoint.
 * Public (no authentication required) for Container Apps liveness/readiness probes.
 * Returns structured HealthResponse with downstream service checks.
 */
health.get('/', (c) => {
  // Downstream services are not wired yet -- report 'unknown' status
  const unknownCheck: HealthCheck = { status: 'unknown' };

  const response: HealthResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
    checks: {
      database: unknownCheck,
      keyVault: unknownCheck,
      signalR: unknownCheck,
    },
  };

  return c.json(response, 200);
});

export { health };

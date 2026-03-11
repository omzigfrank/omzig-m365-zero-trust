import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { requireMfa } from './middleware/mfa.js';
import { health } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { tenantsRoutes } from './routes/tenants.js';

/**
 * Create the Hono application instance.
 * Separated from index.ts for testability (tests import createApp, not the server).
 */
export function createApp(): Hono {
  const app = new Hono();

  // Global error handler
  app.onError(errorHandler);

  // Not-found handler for unmatched routes
  app.notFound(notFoundHandler);

  // CORS middleware
  app.use(
    '*',
    cors({
      origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
      credentials: true,
    }),
  );

  // Health check routes (BEFORE auth middleware -- must be public for Container Apps probes)
  app.route('/api/health', health);

  // Authentication middleware chain for all /api/* routes EXCEPT /api/health
  // 1. JWK validation against Entra ID JWKS endpoint
  const tenantId = process.env.AZURE_TENANT_ID ?? '';
  const clientId = process.env.AZURE_CLIENT_ID ?? '';
  if (tenantId && clientId) {
    app.use('/api/*', createAuthMiddleware(tenantId, clientId));
  }

  // 2. MFA enforcement (checks amr claim in JWT)
  app.use('/api/*', requireMfa());

  // Protected routes
  app.route('/api/auth', authRoutes);

  // Tenant management routes (stub -- full implementation in Phase 4)
  app.route('/api/tenants', tenantsRoutes);

  return app;
}

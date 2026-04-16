import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { requireMfa } from './middleware/mfa.js';
import { health } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { tenantsRoutes } from './routes/tenants.js';
import { oauthCallbackRoutes } from './routes/oauth-callback.js';
import { wizardStateRoutes } from './routes/wizard-state.js';
import { auditRoutes } from './routes/audits.js';
import { actionQueueRoutes } from './routes/action-queue.js';
import { scheduleRoutes } from './routes/schedule.js';
import { remediationsRoutes } from './routes/remediations.js';
import { driftRoutes } from './routes/drift.js';

/**
 * Create the Hono application instance.
 * Separated from index.ts for testability (tests import createApp, not the server).
 *
 * Route registration order:
 * 1. Error handler, CORS (global)
 * 2. Health routes (public -- Container Apps probes)
 * 3. OAuth callback routes (public -- Entra ID redirect, no auth)
 * 4. Auth middleware chain (JWK + MFA)
 * 5. Protected routes (auth, tenants, wizard-state, audits)
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

  // ---- Public routes (BEFORE auth middleware) ----

  // Health check routes (Container Apps probes)
  app.route('/api/health', health);

  // OAuth callback routes (Entra ID redirect -- no auth needed)
  app.route('/api', oauthCallbackRoutes);

  // ---- Authentication middleware chain ----
  // Applied to all /api/* routes EXCEPT those registered above

  // 1. JWK validation against Entra ID JWKS endpoint
  const tenantId = process.env.AZURE_TENANT_ID ?? '';
  const clientId = process.env.AZURE_CLIENT_ID ?? '';
  if (tenantId && clientId) {
    app.use('/api/*', createAuthMiddleware(tenantId, clientId));
  }

  // 2. MFA enforcement (checks amr claim in JWT)
  app.use('/api/*', requireMfa());

  // ---- Protected routes (AFTER auth middleware) ----

  // User profile and role resolution
  app.route('/api/auth', authRoutes);

  // Tenant management CRUD and onboarding endpoints
  app.route('/api/tenants', tenantsRoutes);

  // Tenant scan-schedule endpoints (Phase 6 Plan 01)
  // Routes are namespaced under /tenants/:tenantId/schedule
  app.route('/api', scheduleRoutes);

  // Wizard state persistence (setupWizardState table)
  app.route('/api/wizard-state', wizardStateRoutes);

  // Action queue routes (cross-tenant action items and dismiss)
  app.route('/api/action-queue', actionQueueRoutes);

  // Audit routes (trigger, list, detail, retry) and SignalR negotiate
  // These routes handle their own /tenants/:tenantId/audits path prefix
  // and the /signalr/negotiate endpoint
  app.route('/api', auditRoutes);

  // Remediation routes (Phase 7 Plan 02): approve, rollback, get, history,
  // scopes, consent. These routes handle their own path prefixes:
  //   /tenants/:tenantId/remediations/*  (tenant-scoped)
  //   /remediations/scopes               (top-level)
  app.route('/api', remediationsRoutes);

  // Drift detection routes (Phase 8 Plan 01): list, detail, dismiss,
  // config get/patch. These routes handle their own path prefixes:
  //   /tenants/:tenantId/drift-alerts/*  (tenant-scoped)
  //   /tenants/:tenantId/drift-config    (tenant-scoped)
  app.route('/api', driftRoutes);

  return app;
}

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { health } from './routes/health.js';

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

  // Health check routes (BEFORE auth middleware -- must be public)
  app.route('/api/health', health);

  // Auth middleware chain will be added in Task 2
  // app.use('/api/*', authMiddleware);
  // app.use('/api/*', mfaMiddleware);

  // Protected routes will be added in Task 2
  // app.route('/api/auth', authRoutes);

  return app;
}

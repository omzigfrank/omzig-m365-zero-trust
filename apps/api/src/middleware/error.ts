import type { ErrorHandler, NotFoundHandler } from 'hono';
import type { ApiResponse } from '@omzig/shared';
import { ERROR_CODES } from '@omzig/shared';

/**
 * Global error handler using Hono's onError hook.
 * Returns structured ApiResponse with full error details (MSPs are technical users).
 */
export const errorHandler: ErrorHandler = (err, c) => {
  const correlationId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const isDev = process.env.NODE_ENV !== 'production';

  console.error(`[${correlationId}] Unhandled error:`, err.message, isDev ? err.stack : '');

  const status = 'status' in err && typeof err.status === 'number' ? err.status : 500;

  const body: ApiResponse = {
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: err.message || 'An unexpected error occurred',
      details: isDev ? err.stack : undefined,
      correlationId,
    },
    meta: {
      correlationId,
      timestamp,
    },
  };

  return c.json(body, status as any);
};

/**
 * Not-found handler for unmatched routes.
 * Returns structured ApiResponse with NOT_FOUND error.
 */
export const notFoundHandler: NotFoundHandler = (c) => {
  const correlationId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const body: ApiResponse = {
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${c.req.method} ${c.req.path}`,
      correlationId,
    },
    meta: {
      correlationId,
      timestamp,
    },
  };

  return c.json(body, 404);
};

import { createMiddleware } from 'hono/factory';
import { verifyWithJwks } from 'hono/jwt';
import type { ApiResponse } from '@omzig/shared';
import { ERROR_CODES } from '@omzig/shared';

/**
 * Create JWK-based authentication middleware for Entra ID.
 *
 * This is a thin wrapper around Hono's verifyWithJwks utility configured
 * for the specified Entra tenant and client application.
 *
 * JWKS URI: https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys
 * Issuer:   https://login.microsoftonline.com/{tenantId}/v2.0
 * Audience: clientId
 * Algorithm: RS256
 *
 * Note: For production, this validates JWTs against Microsoft's JWKS endpoint.
 * For testing, a mock middleware injects the JWT payload directly.
 */
export function createAuthMiddleware(tenantId: string, clientId: string) {
  const jwksUri = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
  const expectedIssuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;

  return createMiddleware(async (c, next) => {
    const authorization = c.req.header('Authorization');

    if (!authorization) {
      const body: ApiResponse = {
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'Authorization header is required',
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(body, 401);
    }

    const parts = authorization.split(/\s+/);
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      const body: ApiResponse = {
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'Invalid authorization format. Use: Bearer <token>',
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(body, 401);
    }

    const token = parts[1];

    try {
      const payload = await verifyWithJwks(token, {
        jwks_uri: jwksUri,
        allowedAlgorithms: ['RS256'] as const,
        verification: {
          iss: expectedIssuer,
          aud: clientId,
        },
      });

      c.set('jwtPayload', payload);
      await next();
    } catch (err) {
      const body: ApiResponse = {
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'Invalid or expired token',
          details: err instanceof Error ? err.message : 'Token verification failed',
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(body, 401);
    }
  });
}

/**
 * Simple auth guard middleware that checks for jwtPayload on context.
 * Used in the middleware chain after JWK validation (or mock injection in tests).
 * If no payload exists, the request was not authenticated.
 */
export function requireAuth() {
  return createMiddleware(async (c, next) => {
    const payload = c.get('jwtPayload');
    if (!payload) {
      const body: ApiResponse = {
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'Authentication required',
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(body, 401);
    }
    await next();
  });
}

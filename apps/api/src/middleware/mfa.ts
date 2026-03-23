import { createMiddleware } from 'hono/factory';
import type { ApiResponse } from '@omzig/shared';
import { ERROR_CODES } from '@omzig/shared';

/**
 * MFA enforcement middleware.
 *
 * Reads the jwtPayload from context (set by JWK/auth middleware)
 * and checks the `amr` (authentication methods references) claim.
 *
 * Entra ID includes `amr` in the token when MFA was performed:
 * - ['pwd', 'mfa'] = password + MFA completed
 * - ['pwd'] = password only, no MFA
 *
 * A Zero Trust auditing platform must practice Zero Trust itself,
 * so MFA is required for all authenticated API access.
 */
export function requireMfa() {
  return createMiddleware(async (c, next) => {
    const payload = c.get('jwtPayload') as Record<string, unknown> | undefined;

    if (!payload) {
      // No JWT payload means auth middleware didn't run or failed
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

    const amr = payload.amr as string[] | undefined;

    if (!amr || !Array.isArray(amr) || !amr.includes('mfa')) {
      const body: ApiResponse = {
        error: {
          code: ERROR_CODES.MFA_NOT_COMPLETED,
          message:
            'Multi-factor authentication is required to access this platform',
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(body, 403);
    }

    await next();
  });
}

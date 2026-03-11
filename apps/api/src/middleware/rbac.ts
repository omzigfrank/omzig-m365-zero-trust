import { createMiddleware } from 'hono/factory';
import type { ApiResponse, Role, Permission } from '@omzig/shared';
import { ERROR_CODES, ROLES, ROLE_HIERARCHY, hasPermission } from '@omzig/shared';
import { getTenantRoleOverride } from '../services/user.js';

/**
 * Determine the user's highest role from their Entra ID app roles claim.
 * Entra ID `roles` is an array of role names assigned to the user.
 * If multiple roles assigned, use the highest in the hierarchy.
 */
function resolveBaseRole(roles: string[]): Role | null {
  if (!roles || roles.length === 0) return null;

  let highest: Role | null = null;
  let highestLevel = 0;

  for (const roleName of roles) {
    if (ROLES.includes(roleName as Role)) {
      const level = ROLE_HIERARCHY[roleName as Role];
      if (level > highestLevel) {
        highestLevel = level;
        highest = roleName as Role;
      }
    }
  }

  return highest;
}

/**
 * Resolve the effective role considering per-tenant overrides.
 * Override takes precedence over base role when present (can upgrade OR downgrade).
 */
async function resolveEffectiveRole(
  entraObjectId: string,
  baseRole: Role,
  tenantId: string | null,
): Promise<Role> {
  if (!tenantId) return baseRole;

  const override = await getTenantRoleOverride(entraObjectId, tenantId);
  if (override) {
    return override.role;
  }

  return baseRole;
}

/**
 * Role-based access control middleware.
 *
 * Checks the user's JWT roles claim against the allowed roles.
 * Supports per-tenant role overrides via X-Tenant-Id header.
 *
 * Override semantics:
 * - If X-Tenant-Id is present and user has an override for that tenant,
 *   the override role is used instead of the base role.
 * - Overrides can both UPGRADE (Read-only -> Analyst) and DOWNGRADE (Admin -> Read-only).
 *
 * @param allowedRoles - Roles that are permitted to access the route
 */
export function requireRole(...allowedRoles: Role[]) {
  return createMiddleware(async (c, next) => {
    const payload = c.get('jwtPayload') as Record<string, unknown> | undefined;

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

    const roles = (payload.roles as string[]) || [];
    const baseRole = resolveBaseRole(roles);

    if (!baseRole) {
      const body: ApiResponse = {
        error: {
          code: ERROR_CODES.INSUFFICIENT_ROLE,
          message: 'No valid role assigned. Contact your administrator.',
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(body, 403);
    }

    // Check for per-tenant override
    const tenantId = c.req.header('X-Tenant-Id') || null;
    const entraObjectId = payload.oid as string;
    const effectiveRole = await resolveEffectiveRole(entraObjectId, baseRole, tenantId);

    if (!allowedRoles.includes(effectiveRole)) {
      const body: ApiResponse = {
        error: {
          code: ERROR_CODES.INSUFFICIENT_ROLE,
          message: `Role '${effectiveRole}' is not authorized for this action. Required: ${allowedRoles.join(', ')}`,
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(body, 403);
    }

    // Store resolved role info on context for downstream handlers
    c.set('effectiveRole', effectiveRole);
    c.set('baseRole', baseRole);

    await next();
  });
}

/**
 * Permission-based access control middleware.
 *
 * Uses the shared hasPermission function to check if the user's
 * effective role (considering per-tenant overrides) grants the
 * required permission.
 *
 * @param permission - Permission key from ROLE_PERMISSIONS
 */
export function requirePermission(permission: Permission) {
  return createMiddleware(async (c, next) => {
    const payload = c.get('jwtPayload') as Record<string, unknown> | undefined;

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

    const roles = (payload.roles as string[]) || [];
    const baseRole = resolveBaseRole(roles);

    if (!baseRole) {
      const body: ApiResponse = {
        error: {
          code: ERROR_CODES.INSUFFICIENT_ROLE,
          message: 'No valid role assigned. Contact your administrator.',
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(body, 403);
    }

    const tenantId = c.req.header('X-Tenant-Id') || null;
    const entraObjectId = payload.oid as string;
    const effectiveRole = await resolveEffectiveRole(entraObjectId, baseRole, tenantId);

    if (!hasPermission(effectiveRole, permission)) {
      const body: ApiResponse = {
        error: {
          code: ERROR_CODES.INSUFFICIENT_ROLE,
          message: `Permission '${permission}' denied for role '${effectiveRole}'`,
        },
        meta: {
          correlationId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      };
      return c.json(body, 403);
    }

    c.set('effectiveRole', effectiveRole);
    c.set('baseRole', baseRole);

    await next();
  });
}

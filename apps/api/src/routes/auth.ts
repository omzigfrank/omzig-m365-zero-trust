import { Hono } from 'hono';
import type { ApiResponse, UserProfile, EffectiveRole, Role } from '@omzig/shared';
import { ROLES, ROLE_HIERARCHY } from '@omzig/shared';
import { getUserProfile, resolveEffectiveRole } from '../services/user.js';

export const authRoutes = new Hono();

/**
 * Determine the user's highest role from their Entra ID app roles claim.
 */
function resolveBaseRole(roles: string[]): Role {
  if (!roles || roles.length === 0) return 'Read-only';

  let highest: Role = 'Read-only';
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
 * GET /me - Returns the authenticated user's profile.
 *
 * Reads the JWT payload from context (set by auth middleware)
 * and constructs a UserProfile. First attempts to fetch from DB,
 * falls back to constructing from JWT claims.
 *
 * If X-Tenant-Id header is present, resolves the effective role
 * for that tenant (which may differ from the base role due to overrides).
 */
authRoutes.get('/me', async (c) => {
  const payload = c.get('jwtPayload') as Record<string, unknown>;
  const entraObjectId = payload.oid as string;
  const email = payload.preferred_username as string;
  const displayName = payload.name as string;
  const roles = (payload.roles as string[]) || [];
  const baseRole = resolveBaseRole(roles);
  const tenantId = c.req.header('X-Tenant-Id') || null;

  // Try to get full profile from DB
  let profile = await getUserProfile(entraObjectId);

  if (!profile) {
    // Fallback: construct from JWT claims (DB not yet wired)
    profile = {
      id: entraObjectId,
      email,
      displayName,
      baseRole,
      orgId: '', // Will be populated when DB is wired
      orgName: '', // Will be populated when DB is wired
      isActive: true,
      lastActiveAt: new Date().toISOString(),
    };
  }

  // Resolve effective role if tenant context is provided
  let effectiveRoleInfo: EffectiveRole | undefined;
  if (tenantId) {
    effectiveRoleInfo = await resolveEffectiveRole(
      entraObjectId,
      tenantId,
      profile.baseRole,
    );
  }

  const response: ApiResponse<UserProfile & { effectiveRole?: EffectiveRole }> = {
    data: {
      ...profile,
      effectiveRole: effectiveRoleInfo,
    },
    meta: {
      correlationId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

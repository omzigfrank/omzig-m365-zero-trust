import { eq, and } from 'drizzle-orm';
import { getControlPlaneDb, users, organizations, tenantUserAccess } from '@omzig/db';
import type { UserProfile, TenantRoleOverride, EffectiveRole, Role } from '@omzig/shared';

/**
 * Get a user profile by Entra Object ID.
 *
 * Queries the control plane database, joining users with organizations
 * to populate the orgName field.
 *
 * @param entraObjectId - The user's Entra ID object identifier
 * @returns UserProfile or null if not found
 */
export async function getUserProfile(
  entraObjectId: string,
): Promise<UserProfile | null> {
  let db;
  try {
    db = await getControlPlaneDb();
  } catch {
    // DB not configured (e.g. missing env vars) — fall back to null
    // so callers use the JWT-based fallback profile
    return null;
  }

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      baseRole: users.baseRole,
      orgId: users.orgId,
      orgName: organizations.name,
      isActive: users.isActive,
      lastActiveAt: users.lastActiveAt,
    })
    .from(users)
    .innerJoin(organizations, eq(users.orgId, organizations.id))
    .where(eq(users.entraObjectId, entraObjectId));

  if (rows.length === 0) return null;

  const row = rows[0]!;
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    baseRole: row.baseRole as Role,
    orgId: row.orgId,
    orgName: row.orgName,
    isActive: Boolean(row.isActive),
    lastActiveAt: row.lastActiveAt ? new Date(row.lastActiveAt).toISOString() : null,
  };
}

/**
 * Resolve the effective role for a user in a specific tenant context.
 *
 * If a tenantId is provided, checks for per-tenant role overrides.
 * Override takes precedence over base role (can upgrade OR downgrade).
 *
 * @param userId - The user's platform ID
 * @param tenantId - Optional tenant context
 * @param baseRole - The user's base role from Entra ID
 * @returns EffectiveRole with override information
 */
export async function resolveEffectiveRole(
  userId: string,
  tenantId: string | null,
  baseRole: Role,
): Promise<EffectiveRole> {
  if (!tenantId) {
    return {
      baseRole,
      effectiveRole: baseRole,
      isOverride: false,
    };
  }

  const override = await getTenantRoleOverride(userId, tenantId);
  if (override) {
    return {
      baseRole,
      effectiveRole: override.role,
      isOverride: true,
      tenantId,
    };
  }

  return {
    baseRole,
    effectiveRole: baseRole,
    isOverride: false,
    tenantId,
  };
}

/**
 * In-memory tenant role override store for testing.
 * In production, overrides come from the tenantUserAccess table.
 * Key format: `${entraObjectId}:${tenantId}`
 */
const testOverrides = new Map<string, TenantRoleOverride>();

/**
 * Get a per-tenant role override for a user.
 *
 * Checks the in-memory test store first, then queries the tenantUserAccess
 * table in the control plane database.
 *
 * @param entraObjectId - The user's Entra ID object identifier
 * @param tenantId - The tenant to check for overrides
 * @returns TenantRoleOverride or null if no override exists
 */
export async function getTenantRoleOverride(
  entraObjectId: string,
  tenantId: string,
): Promise<TenantRoleOverride | null> {
  // Check in-memory test overrides first
  const testOverride = testOverrides.get(`${entraObjectId}:${tenantId}`);
  if (testOverride) return testOverride;

  let db;
  try {
    db = await getControlPlaneDb();
  } catch {
    return null;
  }

  // Look up the user's platform ID first
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.entraObjectId, entraObjectId));

  if (userRows.length === 0) return null;

  const userId = userRows[0]!.id;

  const accessRows = await db
    .select({
      roleOverride: tenantUserAccess.roleOverride,
      grantedBy: tenantUserAccess.grantedBy,
    })
    .from(tenantUserAccess)
    .where(
      and(
        eq(tenantUserAccess.userId, userId),
        eq(tenantUserAccess.tenantId, tenantId),
      ),
    );

  if (accessRows.length === 0 || !accessRows[0]!.roleOverride) return null;

  return {
    tenantId,
    role: accessRows[0]!.roleOverride as Role,
    grantedBy: accessRows[0]!.grantedBy,
  };
}

/**
 * Set a per-tenant role override in the in-memory test store.
 * For test use only — production overrides are managed via the admin API
 * and stored in the tenantUserAccess table.
 */
export function setTenantRoleOverride(
  entraObjectId: string,
  tenantId: string,
  role: Role,
): void {
  testOverrides.set(`${entraObjectId}:${tenantId}`, {
    tenantId,
    role,
    grantedBy: 'system',
  });
}

/**
 * Clear all in-memory tenant role overrides (for test cleanup).
 */
export function clearTenantRoleOverrides(): void {
  testOverrides.clear();
}

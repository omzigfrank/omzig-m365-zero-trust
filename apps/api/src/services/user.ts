import type { UserProfile, TenantRoleOverride, EffectiveRole, Role } from '@omzig/shared';

/**
 * In-memory tenant role override store.
 * Used for testing and initial development.
 * Will be wired to the control plane database in Plan 03.
 *
 * Key format: `${entraObjectId}:${tenantId}`
 */
const tenantOverrides = new Map<string, TenantRoleOverride>();

/**
 * Get a user profile by Entra Object ID.
 *
 * For now, returns null (placeholder). The function signature and
 * return type are the contract. Will be wired to the control plane
 * database (users table) in Plan 03.
 *
 * @param entraObjectId - The user's Entra ID object identifier
 * @returns UserProfile or null if not found
 */
export async function getUserProfile(
  entraObjectId: string,
): Promise<UserProfile | null> {
  // TODO: Wire to control plane DB in Plan 03
  // SELECT * FROM users WHERE entra_object_id = @entraObjectId
  return null;
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
 * Get a per-tenant role override for a user.
 *
 * Uses in-memory store for now. Will be wired to the tenantUserAccess
 * table in Plan 03.
 *
 * @param entraObjectId - The user's Entra ID object identifier
 * @param tenantId - The tenant to check for overrides
 * @returns TenantRoleOverride or null if no override exists
 */
export async function getTenantRoleOverride(
  entraObjectId: string,
  tenantId: string,
): Promise<TenantRoleOverride | null> {
  const key = `${entraObjectId}:${tenantId}`;
  return tenantOverrides.get(key) ?? null;
}

/**
 * Set a per-tenant role override (for testing/development).
 * In production, this would be managed via the admin API.
 *
 * @param entraObjectId - The user's Entra ID object identifier
 * @param tenantId - The tenant to set the override for
 * @param role - The override role
 */
export function setTenantRoleOverride(
  entraObjectId: string,
  tenantId: string,
  role: Role,
): void {
  const key = `${entraObjectId}:${tenantId}`;
  tenantOverrides.set(key, {
    tenantId,
    role,
    grantedBy: 'system', // Test/dev default
  });
}

/**
 * Clear all tenant role overrides (for test cleanup).
 */
export function clearTenantRoleOverrides(): void {
  tenantOverrides.clear();
}

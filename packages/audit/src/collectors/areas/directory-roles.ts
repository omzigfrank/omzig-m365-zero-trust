/**
 * Directory Roles area collector.
 * Parses:
 *   - /directoryRoles?$select=id,displayName&$top=100 (batch 1)
 *   - /directoryRoles/{globalAdminId}/members (batch 2, dependent on batch 1 for role ID)
 *
 * Response type: Collection (has `value` array)
 */

import type { AdminRolesFacts } from '../../types.js';
import { isBatchError } from '../batch-helper.js';

interface RolesResponse {
  value?: Array<{
    id: string;
    displayName: string;
  }>;
}

interface MembersResponse {
  value?: Array<{
    id: string;
    displayName?: string;
  }>;
}

export function parseDirectoryRoles(
  rolesData: unknown,
  gaMembersData?: unknown | null,
): AdminRolesFacts {
  if (isBatchError(rolesData)) {
    return {
      available: false,
      globalAdminCount: 0,
      globalAdminRoleId: null,
      error: `Graph API error: status ${(rolesData as { status: number }).status}`,
    };
  }

  const rolesResponse = rolesData as RolesResponse;
  const roles = rolesResponse.value ?? [];

  // Find Global Administrator role
  const gaRole = roles.find((r) => r.displayName === 'Global Administrator');
  const globalAdminRoleId = gaRole?.id ?? null;

  let globalAdminCount = 0;

  if (gaMembersData && !isBatchError(gaMembersData)) {
    const members = gaMembersData as MembersResponse;
    globalAdminCount = members.value?.length ?? 0;
  }

  return {
    available: true,
    globalAdminCount,
    globalAdminRoleId,
  };
}

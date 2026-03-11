/**
 * Organization area collector.
 * Parses: /organization?$select=id,displayName,verifiedDomains
 *
 * Response type: Collection (has `value` array)
 */

import type { OrganizationFacts } from '../../types.js';
import { isBatchError } from '../batch-helper.js';

interface VerifiedDomain {
  name: string;
  isDefault: boolean;
  isVerified: boolean;
}

interface OrgResponse {
  value?: Array<{
    id: string;
    displayName: string;
    verifiedDomains: VerifiedDomain[];
  }>;
}

export function parseOrganization(data: unknown): OrganizationFacts {
  if (isBatchError(data)) {
    return {
      available: false,
      tenantId: null,
      displayName: null,
      primaryDomain: null,
      error: `Graph API error: status ${(data as { status: number }).status}`,
    };
  }

  const response = data as OrgResponse;

  if (!response.value || response.value.length === 0) {
    return {
      available: false,
      tenantId: null,
      displayName: null,
      primaryDomain: null,
      error: 'Organization query returned no results.',
    };
  }

  const org = response.value[0];
  const defaultDomains = org.verifiedDomains?.filter((d) => d.isDefault) ?? [];

  return {
    available: true,
    tenantId: org.id,
    displayName: org.displayName,
    primaryDomain: defaultDomains.length > 0 ? defaultDomains[0].name : null,
  };
}

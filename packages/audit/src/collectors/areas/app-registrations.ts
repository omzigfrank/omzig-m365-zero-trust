/**
 * App Registrations area collector.
 * Parses: /applications?$top=1&$count=true&$select=id
 *
 * Uses $count=true to get total count without fetching all apps.
 * Note: $count requires ConsistencyLevel: eventual header.
 */

import type { AppRegistrationsFacts } from '../../types.js';
import { isBatchError } from '../batch-helper.js';

interface AppsResponse {
  '@odata.count'?: number;
  value?: Array<{ id: string }>;
}

export function parseAppRegistrations(data: unknown): AppRegistrationsFacts {
  if (isBatchError(data)) {
    return {
      available: false,
      totalApps: 0,
      error: `Graph API error: status ${(data as { status: number }).status}`,
    };
  }

  const response = data as AppsResponse;
  let totalApps = 0;

  if (response['@odata.count'] !== undefined) {
    totalApps = response['@odata.count'];
  } else if (response.value) {
    totalApps = response.value.length;
  }

  return {
    available: true,
    totalApps,
  };
}

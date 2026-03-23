/**
 * Security Defaults area collector.
 * Parses: /policies/identitySecurityDefaultsEnforcementPolicy
 *
 * Response type: Singleton (direct object, NOT a collection)
 */

import type { SecurityDefaultsFacts } from '../../types.js';
import { isBatchError } from '../batch-helper.js';

interface SecurityDefaultsResponse {
  isEnabled?: boolean;
}

export function parseSecurityDefaults(data: unknown): SecurityDefaultsFacts {
  if (isBatchError(data)) {
    return {
      available: false,
      enabled: false,
      error: `Graph API error: status ${(data as { status: number }).status}`,
    };
  }

  const response = data as SecurityDefaultsResponse;

  return {
    available: true,
    enabled: response.isEnabled ?? false,
  };
}

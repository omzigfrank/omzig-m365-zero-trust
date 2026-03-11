/**
 * Domains area collector.
 * Parses: /domains?$select=id,isDefault,isVerified,passwordValidityPeriodInDays,passwordNotificationWindowInDays
 *
 * Response type: Collection (has `value` array)
 * Also populates passwordPolicy from the default domain's password settings.
 */

import type { DomainsFacts, PasswordPolicyFacts } from '../../types.js';
import { isBatchError } from '../batch-helper.js';

interface DomainEntry {
  id: string;
  isDefault: boolean;
  isVerified: boolean;
  passwordValidityPeriodInDays: number | null;
  passwordNotificationWindowInDays: number | null;
}

interface DomainsResponse {
  value?: DomainEntry[];
}

export function parseDomains(
  data: unknown,
): { domains: DomainsFacts; passwordPolicy: PasswordPolicyFacts } {
  const passwordPolicy: PasswordPolicyFacts = {
    available: false,
    passwordValidityPeriodInDays: null,
    passwordNotificationWindowInDays: null,
  };

  if (isBatchError(data)) {
    return {
      domains: {
        available: false,
        totalDomains: 0,
        customDomainCount: 0,
        hasOnlyOnmicrosoft: true,
        error: `Graph API error: status ${(data as { status: number }).status}`,
      },
      passwordPolicy,
    };
  }

  const response = data as DomainsResponse;
  const allDomains = response.value ?? [];

  const customDomains = allDomains.filter((d) => !d.id.endsWith('.onmicrosoft.com'));
  const defaultDomain = allDomains.find((d) => d.isDefault);

  // Extract password policy from the default domain
  if (defaultDomain && defaultDomain.passwordValidityPeriodInDays !== null) {
    passwordPolicy.available = true;
    passwordPolicy.passwordValidityPeriodInDays = defaultDomain.passwordValidityPeriodInDays;
    passwordPolicy.passwordNotificationWindowInDays =
      defaultDomain.passwordNotificationWindowInDays;
  }

  return {
    domains: {
      available: true,
      totalDomains: allDomains.length,
      customDomainCount: customDomains.length,
      hasOnlyOnmicrosoft: customDomains.length === 0,
    },
    passwordPolicy,
  };
}

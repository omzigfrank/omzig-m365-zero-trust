/**
 * Conditional Access area collector.
 * Parses: /identity/conditionalAccess/policies?$select=id,displayName,state,conditions,grantControls,sessionControls&$top=100
 *
 * Response type: Collection (has `value` array)
 */

import type { ConditionalAccessFacts, ConditionalAccessPolicy } from '../../types.js';
import { isBatchError } from '../batch-helper.js';

interface CAPolicyResponse {
  value?: Array<{
    id: string;
    displayName: string;
    state: string;
    conditions: unknown;
    grantControls: unknown;
    sessionControls: unknown;
  }>;
}

export function parseConditionalAccess(data: unknown): ConditionalAccessFacts {
  if (isBatchError(data)) {
    return {
      available: false,
      totalPolicies: 0,
      enabledCount: 0,
      reportOnlyCount: 0,
      disabledCount: 0,
      policies: [],
      error: `Graph API error: status ${(data as { status: number }).status}`,
    };
  }

  const response = data as CAPolicyResponse;
  const rawPolicies = response.value ?? [];

  let enabledCount = 0;
  let reportOnlyCount = 0;
  let disabledCount = 0;

  const policies: ConditionalAccessPolicy[] = rawPolicies.map((pol) => {
    switch (pol.state) {
      case 'enabled':
        enabledCount++;
        break;
      case 'enabledForReportingButNotEnforced':
        reportOnlyCount++;
        break;
      case 'disabled':
        disabledCount++;
        break;
    }

    return {
      id: pol.id,
      displayName: pol.displayName,
      state: pol.state,
      conditions: pol.conditions as ConditionalAccessPolicy['conditions'],
      grantControls: pol.grantControls as ConditionalAccessPolicy['grantControls'],
      sessionControls: pol.sessionControls,
    };
  });

  return {
    available: true,
    totalPolicies: policies.length,
    enabledCount,
    reportOnlyCount,
    disabledCount,
    policies,
  };
}

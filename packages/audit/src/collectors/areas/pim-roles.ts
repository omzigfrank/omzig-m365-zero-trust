/**
 * PIM Roles area collector.
 * Parses:
 *   - beta /roleManagement/directory/roleEligibilityScheduleInstances
 *   - beta /roleManagement/directory/roleAssignmentScheduleInstances
 *
 * PITFALL 2: These beta endpoints require Entra ID P2 licensing.
 * Non-P2 tenants will get 403 Forbidden. This must be handled gracefully
 * by setting available=false rather than crashing.
 */

import type { RoleAssignmentsFacts } from '../../types.js';
import { isBatchError } from '../batch-helper.js';

interface PimEligibilityResponse {
  value?: Array<{
    id: string;
    principalId: string;
    roleDefinitionId: string;
  }>;
}

interface PimAssignmentResponse {
  value?: Array<{
    id: string;
    principalId: string;
    assignmentType: string;
    roleDefinitionId: string;
  }>;
}

export function parsePimRoles(
  eligibilityData: unknown,
  assignmentData: unknown,
): RoleAssignmentsFacts {
  // Both PIM endpoints require P2; if either is an error, report unavailable
  if (isBatchError(eligibilityData) && isBatchError(assignmentData)) {
    return {
      available: false,
      totalAssignments: 0,
      eligibleAssignments: 0,
      activeAssignments: 0,
      error: 'PIM endpoints require Entra ID P2 licensing.',
    };
  }

  let eligibleAssignments = 0;
  let totalAssignments = 0;
  let activeAssignments = 0;

  if (!isBatchError(eligibilityData) && eligibilityData) {
    const eligible = eligibilityData as PimEligibilityResponse;
    eligibleAssignments = eligible.value?.length ?? 0;
  }

  if (!isBatchError(assignmentData) && assignmentData) {
    const assignments = assignmentData as PimAssignmentResponse;
    const items = assignments.value ?? [];
    totalAssignments = items.length;
    activeAssignments = items.filter(
      (a) => a.assignmentType === 'Activated' || a.assignmentType === 'Assigned',
    ).length;
  }

  return {
    available: true,
    totalAssignments,
    eligibleAssignments,
    activeAssignments,
  };
}

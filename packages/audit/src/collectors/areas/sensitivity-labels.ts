/**
 * Sensitivity Labels area collector.
 * Parses: beta /security/informationProtection/sensitivityLabels?$top=100&$select=id,name
 *
 * PITFALL 3: This endpoint uses the BETA Graph API, NOT v1.0.
 * It cannot be batched with v1.0 endpoints -- must be a standalone call.
 */

import type { SensitivityLabelsFacts } from '../../types.js';
import { isBatchError } from '../batch-helper.js';

interface LabelsResponse {
  value?: Array<{
    id: string;
    name: string;
  }>;
}

export function parseSensitivityLabels(data: unknown): SensitivityLabelsFacts {
  if (isBatchError(data)) {
    return {
      available: false,
      totalLabels: 0,
      error: `Graph API error: status ${(data as { status: number }).status}`,
    };
  }

  const response = data as LabelsResponse;

  return {
    available: true,
    totalLabels: response.value?.length ?? 0,
  };
}

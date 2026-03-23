/**
 * Sensitivity Labels area collector.
 * Parses: beta /security/informationProtection/sensitivityLabels?$top=100&$select=id,name
 *
 * PITFALL 3: This endpoint uses the BETA Graph API, NOT v1.0.
 * It cannot be batched with v1.0 endpoints -- must be a standalone call.
 *
 * PITFALL: When the tenant lacks Microsoft Purview / E5 licensing,
 * Graph returns a 403 HTML page (not JSON). We detect and clean this up.
 */

import type { SensitivityLabelsFacts } from '../../types.js';
import { isBatchError } from '../batch-helper.js';

interface LabelsResponse {
  value?: Array<{
    id: string;
    name: string;
  }>;
}

/** Strip HTML tags from error messages (Graph sometimes returns HTML error pages). */
function cleanErrorMessage(raw: string): string {
  // If the message contains HTML tags, it's a raw error page — replace with clean message
  if (/<\/?[a-z][\s\S]*>/i.test(raw)) {
    // Try to extract the HTTP status from the HTML (e.g. "403 Forbidden")
    const statusMatch = raw.match(/(\d{3}\s+\w+)/);
    if (statusMatch) {
      return `HTTP ${statusMatch[1]} — this endpoint requires Microsoft Purview / E5 licensing.`;
    }
    return 'Endpoint returned an error page — this likely requires Microsoft Purview / E5 licensing.';
  }
  return raw;
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

/**
 * Clean up raw error messages from the sensitivity labels endpoint.
 * Called by fact-collector when the standalone call throws.
 */
export function cleanSensitivityLabelsError(err: unknown): string {
  if (err instanceof Error) {
    return cleanErrorMessage(err.message);
  }
  if (typeof err === 'string') {
    return cleanErrorMessage(err);
  }
  return 'Failed to retrieve sensitivity labels — this endpoint may require Microsoft Purview / E5 licensing.';
}

/**
 * Graph API $batch request helper.
 * Groups requests into batches of max 20 (Graph API limit),
 * executes them, and returns per-request results.
 *
 * PITFALL 1: The $batch outer response is always 200.
 * Each individual response within the batch has its own status code.
 * Failed individual requests (status >= 400) return { error: true, status }.
 */

import type { Client } from '@microsoft/microsoft-graph-client';

/** A single request to include in a $batch call. */
export interface BatchRequest {
  id: string;
  url: string;
  method?: string;
}

/** Result of a failed individual request within a batch. */
export interface BatchError {
  error: true;
  status: number;
  message?: string;
}

/** Maximum requests per $batch call (Graph API limit). */
const MAX_BATCH_SIZE = 20;

/**
 * Execute batch requests against Microsoft Graph $batch endpoint.
 * Groups requests into chunks of 20 and returns results keyed by request ID.
 *
 * @param client - Microsoft Graph Client instance
 * @param requests - Array of batch requests with id, url, and optional method
 * @returns Map of request ID to response body (or BatchError for failures)
 */
export async function executeBatch(
  client: Client,
  requests: BatchRequest[],
): Promise<Map<string, unknown>> {
  const results = new Map<string, unknown>();

  // Group requests into chunks of MAX_BATCH_SIZE
  const chunks: BatchRequest[][] = [];
  for (let i = 0; i < requests.length; i += MAX_BATCH_SIZE) {
    chunks.push(requests.slice(i, i + MAX_BATCH_SIZE));
  }

  for (const chunk of chunks) {
    const batchBody = {
      requests: chunk.map((req) => ({
        id: req.id,
        method: req.method ?? 'GET',
        url: req.url,
      })),
    };

    try {
      const batchResponse = await client.api('/$batch').post(batchBody);
      const responses: Array<{ id: string; status: number; body: unknown }> =
        batchResponse?.responses ?? [];

      for (const resp of responses) {
        if (resp.status >= 400) {
          // Per-request failure: set error flag instead of crashing
          const errorBody = resp.body as { error?: { message?: string } } | undefined;
          results.set(resp.id, {
            error: true,
            status: resp.status,
            message: errorBody?.error?.message ?? `Request failed with status ${resp.status}`,
          } satisfies BatchError);
        } else {
          results.set(resp.id, resp.body);
        }
      }
    } catch (err) {
      // Entire batch failed -- mark all requests in this chunk as errored
      for (const req of chunk) {
        results.set(req.id, {
          error: true,
          status: 0,
          message: err instanceof Error ? err.message : 'Batch request failed',
        } satisfies BatchError);
      }
    }
  }

  return results;
}

/**
 * Check if a batch result is an error.
 */
export function isBatchError(result: unknown): result is BatchError {
  return (
    typeof result === 'object' &&
    result !== null &&
    'error' in result &&
    (result as BatchError).error === true
  );
}

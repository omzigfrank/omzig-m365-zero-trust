import jwt from 'jsonwebtoken';
import type {
  AuditProgressMessage,
  RemediationProgressMessage,
} from '@omzig/audit';

const HUB_NAME = 'audit';

/**
 * Get required SignalR configuration from environment variables.
 * Throws descriptive error when either SIGNALR_ENDPOINT or SIGNALR_ACCESS_KEY is missing.
 */
function getSignalRConfig(): { endpoint: string; accessKey: string } {
  const endpoint = process.env.SIGNALR_ENDPOINT;
  if (!endpoint) {
    throw new Error(
      'SIGNALR_ENDPOINT environment variable is required for SignalR push. ' +
        'Set it to your Azure SignalR Service endpoint URL (e.g., https://my-signalr.service.signalr.net)',
    );
  }

  const accessKey = process.env.SIGNALR_ACCESS_KEY;
  if (!accessKey) {
    throw new Error(
      'SIGNALR_ACCESS_KEY environment variable is required for SignalR push. ' +
        'Set it to the access key from your Azure SignalR Service connection string.',
    );
  }

  return { endpoint, accessKey };
}

/**
 * Push an audit progress message to a specific user via Azure SignalR REST API.
 *
 * Uses serverless mode: the API server signs a JWT with the SignalR access key
 * and POSTs the message directly to the SignalR REST API endpoint for the target user.
 *
 * @param userId - The user ID (typically Entra OID) to push the message to
 * @param message - The audit progress message payload
 */
export async function pushAuditProgress(
  userId: string,
  message: AuditProgressMessage,
): Promise<void> {
  const { endpoint, accessKey } = getSignalRConfig();

  const url = `${endpoint}/api/v1/hubs/${HUB_NAME}/users/${userId}`;

  // Sign JWT with access key (HS256) for SignalR REST API authentication
  const token = jwt.sign(
    { aud: url },
    accessKey,
    { algorithm: 'HS256', expiresIn: '5m' },
  );

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      target: 'auditProgress',
      arguments: [message],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `SignalR push failed (${response.status}): ${body}`,
    );
  }
}

/**
 * Push a remediation progress message to a specific user via Azure SignalR REST API.
 *
 * Mirrors pushAuditProgress but emits on the 'remediationProgress' hub method
 * so the frontend can subscribe to remediation lifecycle events separately
 * from audit pipeline progress. Five message types:
 *   remediation_started | remediation_progress | remediation_completed |
 *   remediation_failed | remediation_rolled_back
 */
export async function pushRemediationProgress(
  userId: string,
  message: RemediationProgressMessage,
): Promise<void> {
  const { endpoint, accessKey } = getSignalRConfig();

  const url = `${endpoint}/api/v1/hubs/${HUB_NAME}/users/${userId}`;

  const token = jwt.sign(
    { aud: url },
    accessKey,
    { algorithm: 'HS256', expiresIn: '5m' },
  );

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      target: 'remediationProgress',
      arguments: [message],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `SignalR remediation push failed (${response.status}): ${body}`,
    );
  }
}

/**
 * Generate a SignalR negotiate response for a client to establish a WebSocket connection.
 *
 * Returns the hub URL and an access token scoped to the specific user.
 * The frontend uses this to connect via the @microsoft/signalr client SDK.
 *
 * @param userId - The user ID to scope the connection to (typically Entra OID)
 * @returns Object with `url` (SignalR hub URL) and `accessToken` (user-scoped JWT)
 */
export function negotiateSignalR(userId: string): {
  url: string;
  accessToken: string;
} {
  const { endpoint, accessKey } = getSignalRConfig();

  const hubUrl = `${endpoint}/client/?hub=${HUB_NAME}`;

  // Sign JWT with userId as nameid claim -- SignalR uses this to identify the connection
  const accessToken = jwt.sign(
    { aud: hubUrl, nameid: userId },
    accessKey,
    { algorithm: 'HS256', expiresIn: '1h' },
  );

  return { url: hubUrl, accessToken };
}

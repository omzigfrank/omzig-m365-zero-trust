/**
 * GDAP (Granular Delegated Admin Privileges) verification service.
 *
 * Verifies a GDAP delegated admin relationship via the Microsoft Graph API.
 * MSPs enter their GDAP relationship ID from Partner Center, and this service
 * confirms the relationship is active and extracts the customer tenant ID.
 *
 * Uses Graph API v1.0 GDAP endpoints (not Partner Center API).
 * See: https://learn.microsoft.com/en-us/graph/api/resources/delegatedadminrelationship
 *
 * TENANT-02: GDAP/Lighthouse delegated admin onboarding
 */

/** Result of a successful GDAP relationship verification. */
export interface GdapVerificationResult {
  customerTenantId: string;
  customerDisplayName: string;
  roles: Array<{ roleDefinitionId: string }>;
  expiresAt: string;
}

/** GDAP relationship statuses from Graph API. */
type GdapStatus =
  | 'created'
  | 'approvalPending'
  | 'approved'
  | 'activating'
  | 'active'
  | 'expiring'
  | 'expired'
  | 'terminationRequested'
  | 'terminating'
  | 'terminated';

/** Graph API GDAP relationship response shape. */
interface GdapRelationshipResponse {
  id: string;
  displayName: string;
  status: GdapStatus;
  customer: {
    tenantId: string;
    displayName: string;
  };
  accessDetails: {
    unifiedRoles: Array<{
      roleDefinitionId: string;
    }>;
  };
  duration: string;
  endDateTime: string;
}

/**
 * Verify a GDAP delegated admin relationship via Graph API.
 *
 * Fetches the relationship by ID, checks that its status is 'active',
 * and returns the customer tenant details and granted roles.
 *
 * @param relationshipId - The GDAP relationship ID from Partner Center
 * @param accessToken - A valid Graph API access token with DelegatedAdminRelationship.Read.All
 * @returns Customer tenant ID, display name, roles, and expiry
 * @throws Error if relationship not found (404), not active, or other Graph API error
 */
export async function verifyGdapRelationship(
  relationshipId: string,
  accessToken: string,
): Promise<GdapVerificationResult> {
  const url = `https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships/${encodeURIComponent(relationshipId)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 404) {
    throw new Error(
      `GDAP relationship not found: "${relationshipId}". Verify the relationship ID in Partner Center.`,
    );
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `Graph API error (${response.status}) verifying GDAP relationship: ${errorBody}`,
    );
  }

  const relationship: GdapRelationshipResponse = await response.json();

  // Verify relationship is active (Pitfall 4: non-active relationships can't be used)
  if (relationship.status !== 'active') {
    const guidance =
      relationship.status === 'approvalPending'
        ? 'Ask your customer to approve the GDAP request in Partner Center.'
        : relationship.status === 'expired'
          ? 'This GDAP relationship has expired. Create a new relationship in Partner Center.'
          : `Current status: "${relationship.status}". Only active relationships can be used for onboarding.`;

    throw new Error(
      `GDAP relationship "${relationshipId}" is not active. ${guidance}`,
    );
  }

  return {
    customerTenantId: relationship.customer.tenantId,
    customerDisplayName: relationship.customer.displayName,
    roles: relationship.accessDetails.unifiedRoles,
    expiresAt: relationship.endDateTime,
  };
}

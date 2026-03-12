import { apiClient } from "./api-client";
import type { TenantSummary } from "@omzig/shared";

// Types for wizard state
export interface StepMetadata {
  step: number;
  data: Record<string, unknown>;
  completedAt: string;
}

export interface WizardStateResponse {
  id: string;
  currentStep: number;
  totalSteps: number;
  stepsCompleted: StepMetadata[];
  isComplete: boolean;
  updatedAt: string;
}

export interface GdapVerificationResult {
  customerTenantId: string;
  customerDisplayName: string;
  roles: Array<{ roleDefinitionId: string }>;
  expiresAt: string;
}

/**
 * Fetch all tenants for the current organization.
 */
export async function fetchTenants(): Promise<TenantSummary[]> {
  const res = await apiClient.get<TenantSummary[]>("/api/tenants");

  if (res.error) {
    throw new Error(res.error.message || "Failed to fetch tenants");
  }

  return res.data ?? [];
}

/**
 * Fetch a single tenant by ID.
 */
export async function fetchTenantDetail(
  id: string,
): Promise<TenantSummary> {
  const res = await apiClient.get<TenantSummary>(`/api/tenants/${id}`);

  if (res.error) {
    throw new Error(res.error.message || "Failed to fetch tenant detail");
  }

  return res.data!;
}

/**
 * Soft-delete a tenant. Returns the suspended tenant.
 */
export async function deleteTenant(id: string): Promise<void> {
  const res = await apiClient.delete<{ id: string; status: string }>(
    `/api/tenants/${id}`,
  );

  if (res.error) {
    throw new Error(res.error.message || "Failed to remove tenant");
  }
}

/**
 * Create a new pending tenant record.
 * POST /api/tenants
 */
export async function createTenant(data: {
  displayName: string;
  primaryDomain?: string;
  contactEmail?: string;
}): Promise<{ id: string; status: string }> {
  const res = await apiClient.post<{ id: string; status: string }>(
    "/api/tenants",
    data,
  );

  if (res.error) {
    throw new Error(res.error.message || "Failed to create tenant");
  }

  return res.data!;
}

/**
 * Generate an OAuth consent URL for a tenant.
 * POST /api/tenants/:id/onboard/oauth
 */
export async function generateConsentUrl(
  tenantId: string,
): Promise<{ consentUrl: string }> {
  const res = await apiClient.post<{ consentUrl: string }>(
    `/api/tenants/${tenantId}/onboard/oauth`,
    {},
  );

  if (res.error) {
    throw new Error(res.error.message || "Failed to generate consent URL");
  }

  return res.data!;
}

/**
 * Verify a GDAP delegated admin relationship.
 * POST /api/tenants/:id/onboard/gdap
 */
export async function verifyGdap(
  tenantId: string,
  relationshipId: string,
): Promise<GdapVerificationResult> {
  const res = await apiClient.post<GdapVerificationResult>(
    `/api/tenants/${tenantId}/onboard/gdap`,
    { relationshipId },
  );

  if (res.error) {
    throw new Error(res.error.message || "Failed to verify GDAP relationship");
  }

  return res.data!;
}

/**
 * Provision a tenant (create DB, store credentials, activate).
 * POST /api/tenants/:id/provision
 */
export async function provisionTenant(
  tenantId: string,
  data: {
    m365TenantId: string;
    token: string;
    connectionMethod: "oauth" | "gdap";
  },
): Promise<{ databaseName: string; tenantId: string; status: string }> {
  const res = await apiClient.post<{
    databaseName: string;
    tenantId: string;
    status: string;
  }>(`/api/tenants/${tenantId}/provision`, data);

  if (res.error) {
    throw new Error(res.error.message || "Failed to provision tenant");
  }

  return res.data!;
}

/**
 * Fetch current wizard state from the setupWizardState table.
 * GET /api/wizard-state
 * Returns null if no state exists.
 */
export async function fetchWizardState(): Promise<WizardStateResponse | null> {
  const res = await apiClient.get<WizardStateResponse | null>(
    "/api/wizard-state",
  );

  if (res.error) {
    throw new Error(res.error.message || "Failed to fetch wizard state");
  }

  return res.data ?? null;
}

/**
 * Upsert wizard progress to the setupWizardState table.
 * PATCH /api/wizard-state
 * Handles 409 conflict by re-fetching and retrying once.
 */
export async function updateWizardState(data: {
  currentStep: number;
  stepsCompleted: StepMetadata[];
  isComplete?: boolean;
}): Promise<WizardStateResponse> {
  const res = await apiClient.patch<WizardStateResponse>("/api/wizard-state", data);

  // Handle 409 conflict: re-fetch and retry once
  if (res.error && res.error.code === "CONFLICT") {
    const retryRes = await apiClient.patch<WizardStateResponse>(
      "/api/wizard-state",
      data,
    );
    if (retryRes.error) {
      throw new Error(
        retryRes.error.message || "Failed to update wizard state after retry",
      );
    }
    return retryRes.data!;
  }

  if (res.error) {
    throw new Error(res.error.message || "Failed to update wizard state");
  }

  return res.data!;
}

/**
 * Reset wizard state by deleting the setupWizardState row.
 * DELETE /api/wizard-state
 */
export async function resetWizardState(): Promise<void> {
  const res = await apiClient.delete<null>("/api/wizard-state");

  if (res.error) {
    throw new Error(res.error.message || "Failed to reset wizard state");
  }
}

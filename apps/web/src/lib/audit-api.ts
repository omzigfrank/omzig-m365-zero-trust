import { apiClient } from "./api-client";
import type { AuditRunDetail } from "./types";

/**
 * Trigger an async audit run via the backend API.
 * Returns 202 with { auditId, status: 'running' }.
 */
export async function triggerAudit(
  tenantId: string,
  accessToken?: string,
): Promise<{ auditId: string; status: string }> {
  const res = await apiClient.post<{ auditId: string; status: string }>(
    `/tenants/${tenantId}/audits`,
    accessToken ? { accessToken } : {},
    tenantId,
  );

  if (res.error) {
    throw new Error(res.error.message || "Failed to trigger audit");
  }

  return res.data!;
}

/**
 * Fetch full audit run detail (with findings) from the backend.
 */
export async function fetchAuditDetail(
  tenantId: string,
  auditId: string,
): Promise<AuditRunDetail> {
  const res = await apiClient.get<AuditRunDetail>(
    `/tenants/${tenantId}/audits/${auditId}`,
    tenantId,
  );

  if (res.error) {
    throw new Error(res.error.message || "Failed to fetch audit detail");
  }

  return res.data!;
}

/**
 * Negotiate a SignalR connection for real-time progress updates.
 */
export async function negotiateSignalR(): Promise<{
  url: string;
  accessToken: string;
}> {
  const res = await apiClient.get<{ url: string; accessToken: string }>(
    "/signalr/negotiate",
  );

  if (res.error) {
    throw new Error(res.error.message || "Failed to negotiate SignalR");
  }

  return res.data!;
}

/**
 * Retry a single check in an audit run.
 */
export async function retryCheck(
  tenantId: string,
  auditId: string,
  controlId: string,
): Promise<{ auditId: string; controlId: string; status: string }> {
  const res = await apiClient.post<{
    auditId: string;
    controlId: string;
    status: string;
  }>(
    `/tenants/${tenantId}/audits/${auditId}/checks/${controlId}/retry`,
    {},
    tenantId,
  );

  if (res.error) {
    throw new Error(res.error.message || "Failed to retry check");
  }

  return res.data!;
}

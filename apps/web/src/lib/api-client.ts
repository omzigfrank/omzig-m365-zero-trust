import { msalInstance, graphScopes } from "./msal";
import type { ApiResponse } from "@omzig/shared";
import { InteractionRequiredAuthError } from "@azure/msal-browser";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Acquire a fresh access token for the backend API.
 * Falls back to redirect-based acquisition if silent fails.
 */
async function getAccessToken(): Promise<string> {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) {
    throw new Error("No authenticated account. Please sign in.");
  }

  try {
    const result = await msalInstance.acquireTokenSilent({
      scopes: graphScopes,
      account: accounts[0],
    });
    return result.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      await msalInstance.acquireTokenRedirect({
        scopes: graphScopes,
        account: accounts[0],
      });
      // Won't reach here -- page redirects
      return "";
    }
    throw err;
  }
}

/**
 * Authenticated fetch wrapper for calling the Hono backend API.
 *
 * - Acquires a fresh MSAL access token
 * - Sends Authorization: Bearer header
 * - Optionally sends X-Tenant-Id header
 * - Handles 401 (redirect to login), 403, and 5xx errors
 */
async function apiRequest<T>(
  method: string,
  path: string,
  options?: {
    body?: unknown;
    tenantId?: string;
  },
): Promise<ApiResponse<T>> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  if (options?.tenantId) {
    headers["X-Tenant-Id"] = options.tenantId;
  }

  const url = `${API_BASE_URL}${path}`;

  const response = await fetch(url, {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  // Handle 401: redirect to login
  if (response.status === 401) {
    await msalInstance.acquireTokenRedirect({
      scopes: graphScopes,
      account: msalInstance.getAllAccounts()[0],
    });
    // Won't reach here -- page redirects
    return { error: { code: "UNAUTHORIZED", message: "Session expired" } };
  }

  const json: ApiResponse<T> = await response.json();

  // Attach HTTP status for callers that need it
  if (!response.ok && !json.error) {
    return {
      error: {
        code: `HTTP_${response.status}`,
        message: response.statusText || "Request failed",
      },
    };
  }

  return json;
}

export async function apiGet<T>(
  path: string,
  tenantId?: string,
): Promise<ApiResponse<T>> {
  return apiRequest<T>("GET", path, { tenantId });
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  tenantId?: string,
): Promise<ApiResponse<T>> {
  return apiRequest<T>("POST", path, { body, tenantId });
}

export async function apiPut<T>(
  path: string,
  body: unknown,
  tenantId?: string,
): Promise<ApiResponse<T>> {
  return apiRequest<T>("PUT", path, { body, tenantId });
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  tenantId?: string,
): Promise<ApiResponse<T>> {
  return apiRequest<T>("PATCH", path, { body, tenantId });
}

export async function apiDelete<T>(
  path: string,
  tenantId?: string,
): Promise<ApiResponse<T>> {
  return apiRequest<T>("DELETE", path, { tenantId });
}

export const apiClient = {
  get: apiGet,
  post: apiPost,
  put: apiPut,
  patch: apiPatch,
  delete: apiDelete,
};

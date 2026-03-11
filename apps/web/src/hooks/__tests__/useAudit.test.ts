import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the useAudit hook's underlying modules.
 *
 * Since the web app uses pnpm strict hoisting that prevents
 * @testing-library/react from resolving react, we test the
 * audit-api module (pure async functions) and the SignalR
 * integration logic directly.
 */

// ---- Mock fetch globally ----
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---- Mock MSAL ----
vi.mock("@/lib/msal", () => ({
  msalInstance: {
    getAllAccounts: () => [{ username: "user@test.com" }],
    acquireTokenSilent: vi.fn().mockResolvedValue({
      accessToken: "mock-api-token",
    }),
    acquireTokenRedirect: vi.fn(),
  },
  apiScopes: ["api://test/.default"],
}));

// ---- Mock @omzig/shared ----
vi.mock("@omzig/shared", () => ({
  // ApiResponse type is just used for typing, no runtime needed
}));

describe("audit-api module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("triggerAudit POSTs to correct endpoint and returns auditId", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({
        data: { auditId: "audit-123", status: "running" },
        meta: { correlationId: "c1", timestamp: "2026-03-11T00:00:00Z" },
      }),
    });

    const { triggerAudit } = await import("@/lib/audit-api");
    const result = await triggerAudit("tenant-1", "graph-token");

    expect(result.auditId).toBe("audit-123");
    expect(result.status).toBe("running");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/tenants/tenant-1/audits");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ accessToken: "graph-token" });
  });

  it("fetchAuditDetail GETs audit with findings", async () => {
    const mockDetail = {
      id: "audit-123",
      tenantId: "tenant-1",
      status: "completed",
      totalChecks: 29,
      passedChecks: 25,
      failedChecks: 4,
      errorChecks: 0,
      findings: [
        {
          id: "f1",
          controlId: "MS.AAD.1.1v1",
          rating: "pass",
          message: "Legacy auth blocked",
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: mockDetail,
        meta: { correlationId: "c2", timestamp: "2026-03-11T00:00:00Z" },
      }),
    });

    const { fetchAuditDetail } = await import("@/lib/audit-api");
    const result = await fetchAuditDetail("tenant-1", "audit-123");

    expect(result.totalChecks).toBe(29);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].controlId).toBe("MS.AAD.1.1v1");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/tenants/tenant-1/audits/audit-123");
  });

  it("negotiateSignalR returns url and accessToken", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          url: "https://signalr.test/client/?hub=audit",
          accessToken: "signalr-jwt",
        },
        meta: { correlationId: "c3", timestamp: "2026-03-11T00:00:00Z" },
      }),
    });

    const { negotiateSignalR } = await import("@/lib/audit-api");
    const result = await negotiateSignalR();

    expect(result.url).toContain("hub=audit");
    expect(result.accessToken).toBe("signalr-jwt");
  });

  it("retryCheck POSTs to correct endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({
        data: {
          auditId: "audit-123",
          controlId: "MS.AAD.1.1v1",
          status: "retrying",
        },
        meta: { correlationId: "c4", timestamp: "2026-03-11T00:00:00Z" },
      }),
    });

    const { retryCheck } = await import("@/lib/audit-api");
    const result = await retryCheck("tenant-1", "audit-123", "MS.AAD.1.1v1");

    expect(result.status).toBe("retrying");
    expect(result.controlId).toBe("MS.AAD.1.1v1");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain(
      "/tenants/tenant-1/audits/audit-123/checks/MS.AAD.1.1v1/retry",
    );
    expect(opts.method).toBe("POST");
  });

  it("triggerAudit throws on API error response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        error: { code: "FORBIDDEN", message: "Access denied" },
        meta: { correlationId: "c5", timestamp: "2026-03-11T00:00:00Z" },
      }),
    });

    const { triggerAudit } = await import("@/lib/audit-api");
    await expect(triggerAudit("tenant-1")).rejects.toThrow("Access denied");
  });
});

describe("AuditProgressUpdate type", () => {
  it("matches backend AuditProgressMessage shape", async () => {
    const { default: types } = await import("@/lib/types").then((m) => ({
      default: m,
    }));

    // Type-check: ensure interface shape is usable
    const update: import("@/lib/types").AuditProgressUpdate = {
      auditId: "audit-123",
      tenantId: "tenant-1",
      completed: 5,
      total: 29,
      currentCheck: "Evaluating MS.AAD.3.1v1",
      status: "running",
    };

    expect(update.completed).toBe(5);
    expect(update.total).toBe(29);
    expect(update.status).toBe("running");
  });
});

describe("AuditRunDetail type", () => {
  it("accepts findings with all expected fields", () => {
    const detail: import("@/lib/types").AuditRunDetail = {
      id: "audit-1",
      tenantId: "tenant-1",
      status: "completed",
      totalChecks: 29,
      passedChecks: 25,
      failedChecks: 4,
      errorChecks: 0,
      findings: [
        {
          id: "f1",
          controlId: "MS.AAD.1.1v1",
          product: "Entra ID",
          description: "Block legacy auth",
          requirementLevel: "SHALL",
          severity: "High",
          rating: "pass",
          message: "Legacy auth is blocked",
          settingName: "CA Policy",
          currentValue: "Block",
          expectedValue: "Block",
        },
      ],
    };

    expect(detail.findings[0].requirementLevel).toBe("SHALL");
    expect(detail.findings[0].severity).toBe("High");
    expect(detail.findings[0].settingName).toBe("CA Policy");
  });
});

describe("AuditState type", () => {
  it("includes new fields for async progress", () => {
    const state: import("@/lib/types").AuditState = {
      status: "running",
      progress: "5/29 — Evaluating MS.AAD.3.1v1",
      completed: 5,
      total: 29,
      currentCheck: "Evaluating MS.AAD.3.1v1",
      auditId: "audit-123",
      result: null,
      error: null,
    };

    expect(state.completed).toBe(5);
    expect(state.total).toBe(29);
    expect(state.auditId).toBe("audit-123");
  });
});

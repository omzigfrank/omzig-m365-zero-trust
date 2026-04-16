import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── Mock api-client ───────────────────────────────────────────────
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// ── Mock SignalR ──────────────────────────────────────────────────
const mockOn = vi.fn();
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockStop = vi.fn().mockResolvedValue(undefined);

vi.mock("@microsoft/signalr", () => ({
  HubConnectionBuilder: vi.fn().mockImplementation(() => ({
    withUrl: vi.fn().mockReturnThis(),
    withAutomaticReconnect: vi.fn().mockReturnThis(),
    build: vi.fn().mockReturnValue({
      on: mockOn,
      start: mockStart,
      stop: mockStop,
      state: "Connected",
    }),
  })),
  HubConnectionState: {
    Disconnected: "Disconnected",
    Connected: "Connected",
  },
}));

// ── Lazy import ───────────────────────────────────────────────────
import { useDriftAlerts } from "@/hooks/useDriftAlerts";

// ── Fixtures ──────────────────────────────────────────────────────
const MOCK_ALERTS = [
  {
    id: "a1",
    area: "conditionalAccess",
    severity: "Critical",
    activityType: "Delete conditional access policy",
    actorUpn: "admin@test.com",
    diffSummary: "Policy deleted",
    detectedAt: new Date().toISOString(),
    dismissedAt: null,
  },
  {
    id: "a2",
    area: "adminRoles",
    severity: "High",
    activityType: "Add member to role",
    actorUpn: "it@test.com",
    diffSummary: "Global Admin added",
    detectedAt: new Date().toISOString(),
    dismissedAt: null,
  },
];

// Helper: mock apiGet to handle both alert fetch and negotiate calls
function setupMocks() {
  mockApiGet.mockImplementation((path: string) => {
    if (typeof path === "string" && path.includes("/signalr/negotiate")) {
      return Promise.resolve({
        data: { url: "https://signalr.test", accessToken: "tok" },
      });
    }
    if (typeof path === "string" && path.includes("/drift-alerts")) {
      return Promise.resolve({
        data: { data: MOCK_ALERTS, total: 2, page: 1, pageSize: 20 },
      });
    }
    return Promise.resolve({ data: null });
  });
}

// ── Setup ─────────────────────────────────────────────────────────
beforeEach(() => {
  mockApiGet.mockClear();
  mockApiPost.mockClear();
  mockOn.mockClear();
  mockStart.mockClear();
  mockStop.mockClear();
});

afterEach(() => {
  // Don't use restoreAllMocks -- it detaches module-level mocks
});

// ═══════════════════════════════════════════════════════════════════
// useDriftAlerts Tests
// ═══════════════════════════════════════════════════════════════════

describe("useDriftAlerts", () => {
  it("fetches alerts on mount when tenantId is set", async () => {
    setupMocks();

    const { result } = renderHook(() => useDriftAlerts("tenant-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.alerts.length).toBe(2);
    expect(result.current.total).toBe(2);
  });

  it("returns empty alerts when tenantId is null", async () => {
    const { result } = renderHook(() => useDriftAlerts(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.alerts).toEqual([]);
    expect(result.current.total).toBe(0);
  });

  it("SignalR driftAlert handler prepends new alert when tenantId matches", async () => {
    setupMocks();

    const { result } = renderHook(() => useDriftAlerts("tenant-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Wait for SignalR setup to complete
    await waitFor(() => {
      const driftAlertCall = mockOn.mock.calls.find(
        (call) => call[0] === "driftAlert",
      );
      expect(driftAlertCall).toBeDefined();
    });

    const driftAlertCall = mockOn.mock.calls.find(
      (call) => call[0] === "driftAlert",
    )!;
    const handler = driftAlertCall[1];

    // Simulate a drift alert for the current tenant
    act(() => {
      handler({
        type: "drift_detected",
        driftAlertId: "new-alert-1",
        tenantId: "tenant-1",
        area: "securityDefaults",
        severity: "Critical",
        activityType: "Update security defaults",
        actorUpn: "hacker@bad.com",
        diffSummary: "Security defaults disabled",
        detectedAt: new Date().toISOString(),
      });
    });

    // New alert should be prepended
    expect(result.current.alerts[0].id).toBe("new-alert-1");
    expect(result.current.total).toBe(3);
  });

  it("SignalR ignores messages for different tenantId", async () => {
    setupMocks();

    const { result } = renderHook(() => useDriftAlerts("tenant-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Wait for SignalR setup
    await waitFor(() => {
      const driftAlertCall = mockOn.mock.calls.find(
        (call) => call[0] === "driftAlert",
      );
      expect(driftAlertCall).toBeDefined();
    });

    const driftAlertCall = mockOn.mock.calls.find(
      (call) => call[0] === "driftAlert",
    )!;
    const handler = driftAlertCall[1];

    // Simulate a drift alert for a DIFFERENT tenant
    act(() => {
      handler({
        type: "drift_detected",
        driftAlertId: "other-alert",
        tenantId: "tenant-OTHER",
        area: "adminRoles",
        severity: "High",
        activityType: "Add member to role",
        actorUpn: null,
        diffSummary: "test",
        detectedAt: new Date().toISOString(),
      });
    });

    // Should NOT be added
    expect(result.current.alerts.length).toBe(2);
    expect(result.current.total).toBe(2);
  });

  it("dismissAlert sends POST and updates local state", async () => {
    setupMocks();
    mockApiPost.mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useDriftAlerts("tenant-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Dismiss the first alert
    await act(async () => {
      await result.current.dismissAlert("a1");
    });

    // Alert should now have dismissedAt set
    const dismissed = result.current.alerts.find((a) => a.id === "a1");
    expect(dismissed?.dismissedAt).not.toBeNull();
    expect(mockApiPost).toHaveBeenCalledWith(
      "/tenants/tenant-1/drift-alerts/a1/dismiss",
      {},
      "tenant-1",
    );
  });
});

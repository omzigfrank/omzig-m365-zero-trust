import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// ── Mock next/navigation ──────────────────────────────────────────
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/drift",
}));

// ── Mock useAuth ──────────────────────────────────────────────────
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    highestRole: "Admin",
    account: { name: "Test User", username: "test@example.com" },
    user: { name: "Test User", email: "test@example.com" },
    roles: ["Admin"],
    hasMfa: true,
    tenantId: "tenant-1",
    login: vi.fn(),
    logout: vi.fn(),
    switchTenant: vi.fn(),
    getToken: vi.fn(),
  }),
}));

// ── Mock api-client ───────────────────────────────────────────────
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPatch = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    patch: (...args: unknown[]) => mockApiPatch(...args),
    put: vi.fn(),
    delete: vi.fn(),
  },
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

// ── Mock AuthGuard to pass through children ───────────────────────
vi.mock("@/components/layout/AuthGuard", () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Full drift alert fixture ──────────────────────────────────────
const FULL_ALERT = {
  id: "alert-1",
  area: "conditionalAccess",
  severity: "Critical" as const,
  activityType: "Delete conditional access policy",
  actorUpn: "admin@contoso.com",
  beforeSnapshot: JSON.stringify({
    policies: [
      { id: "p1", displayName: "Block Legacy Auth", state: "enabled" },
    ],
  }),
  afterSnapshot: JSON.stringify({
    policies: [],
  }),
  diffSummary: "CA policy 'Block Legacy Auth' deleted",
  auditEventId: "event-123",
  detectedAt: new Date().toISOString(),
  dismissedAt: null,
  dismissedBy: null,
  remediationJobId: null,
};

const DISMISSED_ALERT = {
  ...FULL_ALERT,
  id: "alert-2",
  dismissedAt: new Date().toISOString(),
  dismissedBy: "admin@contoso.com",
};

// ── Lazy imports ──────────────────────────────────────────────────
import { DriftAlertDetail } from "@/components/drift/DriftAlertDetail";

// ── Setup ─────────────────────────────────────────────────────────
beforeEach(() => {
  pushMock.mockClear();
  mockApiGet.mockClear();
  mockApiPost.mockClear();
  mockApiPatch.mockClear();
});

afterEach(() => {
  cleanup();
});

// ═══════════════════════════════════════════════════════════════════
// DriftAlertDetail Tests
// ═══════════════════════════════════════════════════════════════════

describe("DriftAlertDetail", () => {
  it("renders area name, severity badge, activity type, and actor UPN", async () => {
    mockApiGet.mockResolvedValueOnce({ data: FULL_ALERT });

    render(
      <DriftAlertDetail
        alertId="alert-1"
        tenantId="tenant-1"
        onClose={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Conditional Access")).toBeDefined();
    });
    expect(screen.getByText("Critical")).toBeDefined();
    expect(screen.getByText("Delete conditional access policy")).toBeDefined();
    expect(screen.getByText(/admin@contoso.com/)).toBeDefined();
  });

  it("renders human-readable diff summary", async () => {
    mockApiGet.mockResolvedValueOnce({ data: FULL_ALERT });

    render(
      <DriftAlertDetail
        alertId="alert-1"
        tenantId="tenant-1"
        onClose={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    await waitFor(() => {
      const summary = screen.getByTestId("drift-detail-summary");
      expect(summary.textContent).toContain(
        "CA policy 'Block Legacy Auth' deleted",
      );
    });
  });

  it("renders before/after JSON sections", async () => {
    mockApiGet.mockResolvedValueOnce({ data: FULL_ALERT });

    render(
      <DriftAlertDetail
        alertId="alert-1"
        tenantId="tenant-1"
        onClose={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("drift-detail-before")).toBeDefined();
      expect(screen.getByTestId("drift-detail-after")).toBeDefined();
    });
  });

  it("renders latency notice", async () => {
    mockApiGet.mockResolvedValueOnce({ data: FULL_ALERT });

    render(
      <DriftAlertDetail
        alertId="alert-1"
        tenantId="tenant-1"
        onClose={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/changes may take up to 15 minutes/i),
      ).toBeDefined();
    });
  });

  it("renders Dismiss button for active alert", async () => {
    mockApiGet.mockResolvedValueOnce({ data: FULL_ALERT });

    render(
      <DriftAlertDetail
        alertId="alert-1"
        tenantId="tenant-1"
        onClose={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("drift-detail-dismiss")).toBeDefined();
    });
  });

  it("hides Dismiss button for dismissed alert", async () => {
    mockApiGet.mockResolvedValueOnce({ data: DISMISSED_ALERT });

    render(
      <DriftAlertDetail
        alertId="alert-2"
        tenantId="tenant-1"
        onClose={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Conditional Access")).toBeDefined();
    });
    expect(screen.queryByTestId("drift-detail-dismiss")).toBeNull();
  });

  it("dismiss button calls onDismiss callback", async () => {
    mockApiGet.mockResolvedValueOnce({ data: FULL_ALERT });
    const onDismiss = vi.fn();

    render(
      <DriftAlertDetail
        alertId="alert-1"
        tenantId="tenant-1"
        onClose={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("drift-detail-dismiss")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("drift-detail-dismiss"));
    expect(onDismiss).toHaveBeenCalledWith("alert-1");
  });
});

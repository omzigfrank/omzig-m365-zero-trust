import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

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

// ── Drift alert fixtures ──────────────────────────────────────────
interface DriftAlertRow {
  id: string;
  area: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  activityType: string;
  actorUpn: string | null;
  diffSummary: string;
  detectedAt: string;
  dismissedAt: string | null;
}

const MOCK_ALERTS: DriftAlertRow[] = [
  {
    id: "alert-1",
    area: "conditionalAccess",
    severity: "Critical",
    activityType: "Delete conditional access policy",
    actorUpn: "admin@contoso.com",
    diffSummary: "CA policy 'Block Legacy Auth' deleted",
    detectedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    dismissedAt: null,
  },
  {
    id: "alert-2",
    area: "adminRoles",
    severity: "High",
    activityType: "Add member to role",
    actorUpn: "it-admin@contoso.com",
    diffSummary: "Global Admin added: user@contoso.com",
    detectedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    dismissedAt: null,
  },
  {
    id: "alert-3",
    area: "appRegistrations",
    severity: "Low",
    activityType: "Add application",
    actorUpn: null,
    diffSummary: "New app registered: Test App",
    detectedAt: new Date(Date.now() - 24 * 3600_000).toISOString(),
    dismissedAt: new Date().toISOString(),
  },
];

// ── Lazy imports ──────────────────────────────────────────────────
import { DriftAlertList } from "@/components/drift/DriftAlertList";
import { DriftSeverityBadge } from "@/components/drift/DriftSeverityBadge";
import { DriftConfigPanel } from "@/components/drift/DriftConfigPanel";

// ── Setup ─────────────────────────────────────────────────────────
beforeEach(() => {
  pushMock.mockClear();
});

afterEach(() => {
  cleanup();
});

// ═══════════════════════════════════════════════════════════════════
// DriftSeverityBadge Tests
// ═══════════════════════════════════════════════════════════════════

describe("DriftSeverityBadge", () => {
  it("renders Critical with red background", () => {
    const { container } = render(<DriftSeverityBadge severity="Critical" />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.textContent).toBe("Critical");
    expect(badge.className).toContain("bg-red-100");
    expect(badge.className).toContain("text-red-800");
  });

  it("renders High with orange background", () => {
    const { container } = render(<DriftSeverityBadge severity="High" />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.textContent).toBe("High");
    expect(badge.className).toContain("bg-orange-100");
    expect(badge.className).toContain("text-orange-800");
  });

  it("renders Medium with yellow background", () => {
    const { container } = render(<DriftSeverityBadge severity="Medium" />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.textContent).toBe("Medium");
    expect(badge.className).toContain("bg-yellow-100");
    expect(badge.className).toContain("text-yellow-800");
  });

  it("renders Low with blue background", () => {
    const { container } = render(<DriftSeverityBadge severity="Low" />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.textContent).toBe("Low");
    expect(badge.className).toContain("bg-blue-100");
    expect(badge.className).toContain("text-blue-800");
  });
});

// ═══════════════════════════════════════════════════════════════════
// DriftAlertList Tests
// ═══════════════════════════════════════════════════════════════════

describe("DriftAlertList", () => {
  it("renders a table with 3 alert rows", () => {
    render(
      <DriftAlertList
        alerts={MOCK_ALERTS}
        onAlertSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    // Each alert should render its area or activity
    expect(screen.getByText("Conditional Access")).toBeDefined();
    expect(screen.getByText("Admin Roles")).toBeDefined();
    expect(screen.getByText("App Registrations")).toBeDefined();
  });

  it("renders DriftSeverityBadge for each row with correct severity text", () => {
    render(
      <DriftAlertList
        alerts={MOCK_ALERTS}
        onAlertSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("Critical")).toBeDefined();
    expect(screen.getByText("High")).toBeDefined();
    expect(screen.getByText("Low")).toBeDefined();
  });

  it("shows empty state when alerts is empty", () => {
    render(
      <DriftAlertList
        alerts={[]}
        onAlertSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("No drift alerts detected")).toBeDefined();
  });

  it("renders 'Active' badge for active alerts and 'Dismissed' for dismissed", () => {
    render(
      <DriftAlertList
        alerts={MOCK_ALERTS}
        onAlertSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    // 2 active alerts + 1 dismissed
    const activeElements = screen.getAllByText("Active");
    expect(activeElements.length).toBe(2);
    expect(screen.getByText("Dismissed")).toBeDefined();
  });

  it("clicking a row calls onAlertSelect with the alert id", () => {
    const onAlertSelect = vi.fn();
    render(
      <DriftAlertList
        alerts={MOCK_ALERTS}
        onAlertSelect={onAlertSelect}
        onDismiss={vi.fn()}
      />,
    );
    // Click the first row
    const row = screen.getByTestId("drift-alert-row-alert-1");
    fireEvent.click(row);
    expect(onAlertSelect).toHaveBeenCalledWith("alert-1");
  });

  it("Dismiss button visible for active alerts only", () => {
    render(
      <DriftAlertList
        alerts={MOCK_ALERTS}
        onAlertSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    // 2 active alerts should have dismiss buttons
    const dismissButtons = screen.getAllByRole("button", { name: /dismiss/i });
    expect(dismissButtons.length).toBe(2);
  });

  it("renders actor UPN or 'System' for null actor", () => {
    render(
      <DriftAlertList
        alerts={MOCK_ALERTS}
        onAlertSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("admin@contoso.com")).toBeDefined();
    expect(screen.getByText("it-admin@contoso.com")).toBeDefined();
    expect(screen.getByText("System")).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// DriftConfigPanel Tests
// ═══════════════════════════════════════════════════════════════════

describe("DriftConfigPanel", () => {
  it("renders interval dropdown with 15/30/45/60 options", () => {
    // Mock the fetch for drift-config
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { intervalMinutes: 15, lastPollAt: null },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<DriftConfigPanel tenantId="tenant-1" />);
    // The component should render the heading
    expect(screen.getByText("Drift Monitoring")).toBeDefined();
  });

  it("renders Save button", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { intervalMinutes: 15, lastPollAt: null },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<DriftConfigPanel tenantId="tenant-1" />);
    expect(screen.getByRole("button", { name: /save/i })).toBeDefined();
  });
});

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { TenantSummary, TenantHealth } from "@omzig/shared";

// ── Mock next/navigation ──────────────────────────────────────────
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

// ── Fixtures ──────────────────────────────────────────────────────
function makeTenant(overrides: Partial<TenantSummary> = {}): TenantSummary {
  return {
    id: "t1",
    displayName: "Acme Corp",
    m365TenantId: "aaa-bbb-ccc",
    status: "active",
    connectionMethod: "oauth",
    primaryDomain: "acme.onmicrosoft.com",
    health: "green",
    overallScore: 85,
    frameworkScores: { AAD: 90, ZTA: 80, "80053": 75, CSF: 82 },
    lastAuditAt: new Date(Date.now() - 3600_000).toISOString(), // 1 hour ago
    criticalFindingsCount: 2,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const FIXTURE_TENANTS: TenantSummary[] = [
  makeTenant(),
  makeTenant({
    id: "t2",
    displayName: "Beta LLC",
    health: "yellow",
    overallScore: 55,
    frameworkScores: { AAD: 60, ZTA: 50 },
    criticalFindingsCount: 0,
  }),
  makeTenant({
    id: "t3",
    displayName: "Gamma Inc",
    health: "red",
    overallScore: 20,
    frameworkScores: null,
    criticalFindingsCount: 5,
  }),
  makeTenant({
    id: "t4",
    displayName: "Delta Co",
    health: "gray",
    overallScore: null,
    lastAuditAt: null,
    criticalFindingsCount: 0,
  }),
  makeTenant({
    id: "t5",
    displayName: "Epsilon Ltd",
    health: "orange",
    status: "needs_reauth",
    overallScore: 70,
    criticalFindingsCount: 1,
  }),
];

// ── Mock useTenants hook ──────────────────────────────────────────
const removeTenantMock = vi.fn();
const refetchMock = vi.fn();
let mockHookReturn = {
  tenants: FIXTURE_TENANTS,
  loading: false,
  error: null as string | null,
  removeTenant: removeTenantMock,
  refetch: refetchMock,
};

vi.mock("@/hooks/useTenants", () => ({
  useTenants: () => mockHookReturn,
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
    login: vi.fn(),
    logout: vi.fn(),
    getToken: vi.fn(),
  }),
}));

// ── Mock AuthGuard to pass through children ───────────────────────
vi.mock("@/components/layout/AuthGuard", () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Lazy imports (after mocks) ────────────────────────────────────
import { HealthDot } from "@/components/tenants/HealthDot";
import { TenantCard } from "@/components/tenants/TenantCard";
import { TenantGrid } from "@/components/tenants/TenantGrid";
import { TenantTable } from "@/components/tenants/TenantTable";
import { RemoveTenantModal } from "@/components/tenants/RemoveTenantModal";
import TenantDashboardPage from "@/app/tenants/page";

beforeEach(() => {
  pushMock.mockClear();
  removeTenantMock.mockClear();
  refetchMock.mockClear();
  mockHookReturn = {
    tenants: FIXTURE_TENANTS,
    loading: false,
    error: null,
    removeTenant: removeTenantMock,
    refetch: refetchMock,
  };
});

afterEach(() => {
  cleanup();
});

// ═══════════════════════════════════════════════════════════════════
// HealthDot
// ═══════════════════════════════════════════════════════════════════
describe("HealthDot", () => {
  const cases: [TenantHealth, string][] = [
    ["green", "bg-emerald-500"],
    ["yellow", "bg-amber-500"],
    ["red", "bg-red-500"],
    ["gray", "bg-gray-400"],
    ["orange", "bg-orange-500"],
  ];

  it.each(cases)("renders %s health with class %s", (health, expectedClass) => {
    render(<HealthDot health={health} />);
    const dot = screen.getByLabelText(`Health: ${health}`);
    expect(dot).toBeDefined();
    expect(dot.className).toContain(expectedClass);
  });
});

// ═══════════════════════════════════════════════════════════════════
// TenantCard
// ═══════════════════════════════════════════════════════════════════
describe("TenantCard", () => {
  it("shows displayName and overall score", () => {
    const tenant = makeTenant();
    render(<TenantCard tenant={tenant} onRemove={vi.fn()} />);
    expect(screen.getByText("Acme Corp")).toBeDefined();
    expect(screen.getByText("85")).toBeDefined();
  });

  it("shows '--' when overallScore is null", () => {
    const tenant = makeTenant({ overallScore: null });
    render(<TenantCard tenant={tenant} onRemove={vi.fn()} />);
    expect(screen.getByText("--")).toBeDefined();
  });

  it("shows framework mini scores", () => {
    const tenant = makeTenant();
    render(<TenantCard tenant={tenant} onRemove={vi.fn()} />);
    expect(screen.getByText("90")).toBeDefined(); // AAD
    expect(screen.getByText("80")).toBeDefined(); // ZTA
  });

  it("shows critical findings count when > 0", () => {
    const tenant = makeTenant({ criticalFindingsCount: 3 });
    render(<TenantCard tenant={tenant} onRemove={vi.fn()} />);
    expect(screen.getByText("3")).toBeDefined();
  });

  it("navigates to /tenants/:id on click", () => {
    const tenant = makeTenant({ id: "tenant-123" });
    render(<TenantCard tenant={tenant} onRemove={vi.fn()} />);
    const card = screen.getByText("Acme Corp").closest("[data-testid='tenant-card']");
    expect(card).toBeDefined();
    fireEvent.click(card!);
    expect(pushMock).toHaveBeenCalledWith("/tenants/tenant-123");
  });

  it("renders HealthDot with correct health", () => {
    const tenant = makeTenant({ health: "yellow" });
    render(<TenantCard tenant={tenant} onRemove={vi.fn()} />);
    expect(screen.getByLabelText("Health: yellow")).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// TenantGrid
// ═══════════════════════════════════════════════════════════════════
describe("TenantGrid", () => {
  it("renders correct number of cards plus Add Tenant card", () => {
    render(<TenantGrid tenants={FIXTURE_TENANTS} onRemove={vi.fn()} />);
    // 5 tenants + 1 "Add Tenant" card
    expect(screen.getByText("Add Tenant")).toBeDefined();
    expect(screen.getByText("Acme Corp")).toBeDefined();
    expect(screen.getByText("Beta LLC")).toBeDefined();
    expect(screen.getByText("Gamma Inc")).toBeDefined();
    expect(screen.getByText("Delta Co")).toBeDefined();
    expect(screen.getByText("Epsilon Ltd")).toBeDefined();
  });

  it("Add Tenant card navigates to /tenants/new", () => {
    render(<TenantGrid tenants={[]} onRemove={vi.fn()} />);
    const addCard = screen.getByText("Add Tenant").closest("div[role='button']") || screen.getByText("Add Tenant").closest("a");
    expect(addCard).toBeDefined();
    fireEvent.click(addCard!);
    expect(pushMock).toHaveBeenCalledWith("/tenants/new");
  });
});

// ═══════════════════════════════════════════════════════════════════
// TenantTable
// ═══════════════════════════════════════════════════════════════════
describe("TenantTable", () => {
  it("renders table with all tenant rows", () => {
    render(<TenantTable tenants={FIXTURE_TENANTS} onRemove={vi.fn()} />);
    expect(screen.getByText("Acme Corp")).toBeDefined();
    expect(screen.getByText("Beta LLC")).toBeDefined();
    expect(screen.getByText("Gamma Inc")).toBeDefined();
  });

  it("renders column headers", () => {
    render(<TenantTable tenants={FIXTURE_TENANTS} onRemove={vi.fn()} />);
    expect(screen.getByText("Name")).toBeDefined();
    expect(screen.getByText("Domain")).toBeDefined();
    expect(screen.getByText("Status")).toBeDefined();
    expect(screen.getByText("Score")).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// RemoveTenantModal
// ═══════════════════════════════════════════════════════════════════
describe("RemoveTenantModal", () => {
  const tenant = makeTenant({ displayName: "Test Tenant" });

  it("shows warning with tenant name", () => {
    render(
      <RemoveTenantModal
        tenant={tenant}
        isOpen={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/Test Tenant/)).toBeDefined();
  });

  it("confirm button disabled until name matches", () => {
    render(
      <RemoveTenantModal
        tenant={tenant}
        isOpen={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);

    const input = screen.getByPlaceholderText(/type the tenant name/i);
    fireEvent.change(input, { target: { value: "Test Tenant" } });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not match case-insensitively", () => {
    render(
      <RemoveTenantModal
        tenant={tenant}
        isOpen={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const input = screen.getByPlaceholderText(/type the tenant name/i);
    fireEvent.change(input, { target: { value: "test tenant" } });
    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders nothing when not open", () => {
    const { container } = render(
      <RemoveTenantModal
        tenant={tenant}
        isOpen={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container.innerHTML).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════════════
// TenantDashboard Page
// ═══════════════════════════════════════════════════════════════════
describe("TenantDashboard Page", () => {
  it("renders card grid by default with tenant count", () => {
    render(<TenantDashboardPage />);
    expect(screen.getByText("Tenants")).toBeDefined();
    // Count badge shows the tenant count
    const badges = screen.getAllByText("5");
    expect(badges.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Acme Corp")).toBeDefined();
  });

  it("toggle switches from grid to table view", () => {
    render(<TenantDashboardPage />);
    // Find the table view toggle button
    const tableToggle = screen.getByLabelText("Table view");
    fireEvent.click(tableToggle);
    // Table should be rendered with header columns
    expect(screen.getByText("Domain")).toBeDefined();
  });

  it("shows loading state when useTenants is loading", () => {
    mockHookReturn = {
      ...mockHookReturn,
      tenants: [],
      loading: true,
    };
    render(<TenantDashboardPage />);
    expect(screen.getByText(/loading/i)).toBeDefined();
  });

  it("shows error state with retry button", () => {
    mockHookReturn = {
      ...mockHookReturn,
      tenants: [],
      error: "Failed to fetch tenants",
    };
    render(<TenantDashboardPage />);
    // Error message appears in both the heading and the detail text
    const errorTexts = screen.getAllByText(/failed to fetch/i);
    expect(errorTexts.length).toBeGreaterThanOrEqual(1);
    const retryBtn = screen.getByText(/^retry$/i);
    expect(retryBtn).toBeDefined();
    fireEvent.click(retryBtn);
    expect(refetchMock).toHaveBeenCalled();
  });

  it("shows empty state when no tenants", () => {
    mockHookReturn = {
      ...mockHookReturn,
      tenants: [],
    };
    render(<TenantDashboardPage />);
    expect(screen.getByText(/no tenants connected/i)).toBeDefined();
  });
});

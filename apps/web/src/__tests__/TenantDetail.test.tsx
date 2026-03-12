import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { TenantSummary } from "@omzig/shared";
import type { AuditRunDetail } from "@/lib/types";

// ── Mock next/navigation ──────────────────────────────────────────
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
  useParams: () => ({ id: "tenant-123" }),
}));

// ── Fixtures ──────────────────────────────────────────────────────
const FIXTURE_TENANT: TenantSummary = {
  id: "tenant-123",
  displayName: "Acme Corp",
  m365TenantId: "aaa-bbb-ccc",
  status: "active",
  connectionMethod: "oauth",
  primaryDomain: "acme.onmicrosoft.com",
  health: "green",
  overallScore: 85,
  frameworkScores: { AAD: 90, ZTA: 80, "80053": 75, CSF: 82 },
  lastAuditAt: new Date(Date.now() - 3600_000).toISOString(),
  criticalFindingsCount: 2,
  createdAt: "2026-01-01T00:00:00Z",
};

const FIXTURE_AUDIT_RESULT: AuditRunDetail = {
  id: "audit-1",
  tenantId: "tenant-123",
  status: "completed",
  startedAt: "2026-01-01T00:00:00Z",
  completedAt: "2026-01-01T00:05:00Z",
  totalChecks: 10,
  passedChecks: 8,
  failedChecks: 2,
  errorChecks: 0,
  findings: [
    {
      id: "f1",
      controlId: "CISA.AAD.1.1v1",
      product: "AAD",
      description: "Block legacy auth",
      requirementLevel: "SHALL",
      severity: "Critical",
      rating: "pass",
      message: "Legacy auth is blocked",
    },
  ],
  maturitySnapshot: [
    {
      tenet: "T1",
      tenetName: "All Resources",
      totalChecks: 5,
      passedChecks: 4,
      failedChecks: 1,
      passRate: 80,
      weightedPassRate: 80,
      maturityLevel: "Advanced",
    },
  ],
  frameworkScores: {
    AAD: { total: 10, pass: 8, fail: 2, warn: 0, na: 0, score: 80 },
  },
};

// ── Mock tenant-api ───────────────────────────────────────────────
const mockFetchTenantDetail = vi.fn(async () => FIXTURE_TENANT);

vi.mock("@/lib/tenant-api", () => ({
  fetchTenantDetail: (...args: any[]) => mockFetchTenantDetail(...args),
  fetchTenants: vi.fn(async () => []),
  deleteTenant: vi.fn(async () => {}),
}));

// ── Mock useAudit ─────────────────────────────────────────────────
let receivedTenantId: string | undefined;
const mockAuditReturn = {
  status: "complete" as const,
  progress: "",
  completed: 10,
  total: 10,
  currentCheck: "",
  auditId: "audit-1",
  result: FIXTURE_AUDIT_RESULT,
  error: null,
  execute: vi.fn(),
  retryCheck: vi.fn(),
  reset: vi.fn(),
};

vi.mock("@/hooks/useAudit", () => ({
  useAudit: (tenantId?: string) => {
    receivedTenantId = tenantId;
    return mockAuditReturn;
  },
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
    getToken: vi.fn().mockResolvedValue("test-token"),
  }),
}));

// ── Mock AuthGuard to pass through children ───────────────────────
vi.mock("@/components/layout/AuthGuard", () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Mock recharts (for ScoreCard / ZtaMaturityRadar) ──────────────
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  RadarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="radar-chart">{children}</div>
  ),
  PolarGrid: () => <div />,
  PolarAngleAxis: () => <div />,
  PolarRadiusAxis: () => <div />,
  Radar: () => <div />,
  Legend: () => <div />,
}));

// ── Lazy imports (after mocks) ────────────────────────────────────
import TenantDetailPage from "@/app/tenants/[id]/page";

beforeEach(() => {
  pushMock.mockClear();
  receivedTenantId = undefined;
  mockFetchTenantDetail.mockResolvedValue(FIXTURE_TENANT);
});

afterEach(() => {
  cleanup();
});

// Helper: wait for loading to finish (tenant name appears in heading)
async function waitForLoaded() {
  // Tenant name appears in both breadcrumb and heading; use findAllByText
  await waitFor(() => {
    const matches = screen.getAllByText("Acme Corp");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
}

// ═══════════════════════════════════════════════════════════════════
// TenantDetail Page
// ═══════════════════════════════════════════════════════════════════
describe("TenantDetail Page", () => {
  it("renders breadcrumb with tenant name after loading", async () => {
    render(<TenantDetailPage />);
    await waitForLoaded();
    // Breadcrumb "Tenants" link exists
    expect(screen.getByText("Tenants")).toBeDefined();
    // Tenant name appears at least in breadcrumb and heading
    const names = screen.getAllByText("Acme Corp");
    expect(names.length).toBeGreaterThanOrEqual(2);
  });

  it("renders tenant header with health dot and domain", async () => {
    render(<TenantDetailPage />);
    await waitForLoaded();
    expect(screen.getByLabelText("Health: green")).toBeDefined();
    expect(screen.getByText("acme.onmicrosoft.com")).toBeDefined();
  });

  it("renders connection method badge", async () => {
    render(<TenantDetailPage />);
    await waitForLoaded();
    expect(screen.getByText("OAuth")).toBeDefined();
  });

  it("renders tab navigation with all tabs", async () => {
    render(<TenantDetailPage />);
    await waitForLoaded();
    expect(screen.getByText("Overview")).toBeDefined();
    expect(screen.getByText("Findings")).toBeDefined();
    expect(screen.getByText("Audit History")).toBeDefined();
    expect(screen.getByText("Settings")).toBeDefined();
  });

  it("switches to Findings tab on click", async () => {
    render(<TenantDetailPage />);
    await waitForLoaded();
    const findingsTab = screen.getByText("Findings");
    fireEvent.click(findingsTab);
    // AuditResults renders "Showing X of Y controls"
    expect(screen.getByText(/showing/i)).toBeDefined();
  });

  it("switches to Settings tab showing placeholder and metadata", async () => {
    render(<TenantDetailPage />);
    await waitForLoaded();
    const settingsTab = screen.getByText("Settings");
    fireEvent.click(settingsTab);
    // Both heading "Tenant Settings" and description mention tenant settings
    const settingsTexts = screen.getAllByText(/tenant settings/i);
    expect(settingsTexts.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("aaa-bbb-ccc")).toBeDefined(); // m365TenantId
  });

  it("passes tenant ID from URL params to useAudit", async () => {
    render(<TenantDetailPage />);
    await waitForLoaded();
    expect(receivedTenantId).toBe("tenant-123");
  });

  it("clicking Tenants breadcrumb navigates to /tenants", async () => {
    render(<TenantDetailPage />);
    await waitForLoaded();
    const breadcrumbLink = screen.getByText("Tenants");
    fireEvent.click(breadcrumbLink);
    expect(pushMock).toHaveBeenCalledWith("/tenants");
  });

  it("shows loading state initially", () => {
    // Make fetchTenantDetail never resolve
    mockFetchTenantDetail.mockReturnValue(new Promise(() => {}));
    render(<TenantDetailPage />);
    expect(screen.getByText(/loading/i)).toBeDefined();
  });
});

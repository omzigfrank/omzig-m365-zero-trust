import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";

// Mock next/navigation
const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

// Mock useAuth
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    highestRole: "Admin" as const,
    user: { name: "Test User", email: "test@example.com" },
    roles: ["Admin"],
    hasMfa: true,
    login: vi.fn(),
    logout: vi.fn(),
    getToken: vi.fn().mockResolvedValue("mock-token"),
    account: { name: "Test User", username: "test@example.com" },
  }),
}));

// Mock MSAL
vi.mock("@azure/msal-react", () => ({
  useMsal: () => ({
    instance: { getAllAccounts: () => [{ name: "Test" }], acquireTokenSilent: vi.fn() },
    accounts: [{ name: "Test" }],
    inProgress: "none",
  }),
  useAccount: () => ({ name: "Test", idTokenClaims: { roles: ["Admin"], amr: ["mfa"] } }),
  MsalProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock @omzig/shared
vi.mock("@omzig/shared", () => ({
  ROLES: ["Owner", "Admin", "Analyst", "Read-only"],
  ROLE_HIERARCHY: { Owner: 4, Admin: 3, Analyst: 2, "Read-only": 1 },
  hasPermission: () => true,
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  ShieldAlert: () => <div data-testid="icon-shield-alert" />,
  Key: () => <div data-testid="icon-key" />,
  Shield: () => <div data-testid="icon-shield" />,
  Check: () => <div data-testid="icon-check" />,
  CheckCircle: () => <div data-testid="icon-check-circle" />,
  Copy: () => <div data-testid="icon-copy" />,
  Loader2: () => <div data-testid="icon-loader" />,
  ExternalLink: () => <div data-testid="icon-external-link" />,
  ArrowLeft: () => <div data-testid="icon-arrow-left" />,
  ArrowRight: () => <div data-testid="icon-arrow-right" />,
  Building2: () => <div data-testid="icon-building" />,
  Globe: () => <div data-testid="icon-globe" />,
  Mail: () => <div data-testid="icon-mail" />,
  AlertTriangle: () => <div data-testid="icon-alert-triangle" />,
  RefreshCw: () => <div data-testid="icon-refresh" />,
  Plus: () => <div data-testid="icon-plus" />,
}));

// Mock @microsoft/signalr
vi.mock("@microsoft/signalr", () => ({
  HubConnectionBuilder: vi.fn().mockReturnValue({
    withUrl: vi.fn().mockReturnThis(),
    withAutomaticReconnect: vi.fn().mockReturnThis(),
    build: vi.fn().mockReturnValue({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      onclose: vi.fn(),
      state: "Connected",
    }),
  }),
  HubConnectionState: { Disconnected: "Disconnected", Connected: "Connected" },
}));

// Mock tenant-api functions
const mockCreateTenant = vi.fn();
const mockGenerateConsentUrl = vi.fn();
const mockVerifyGdap = vi.fn();
const mockProvisionTenant = vi.fn();
const mockFetchWizardState = vi.fn();
const mockUpdateWizardState = vi.fn();
const mockResetWizardState = vi.fn();

vi.mock("@/lib/tenant-api", () => ({
  createTenant: (...args: any[]) => mockCreateTenant(...args),
  generateConsentUrl: (...args: any[]) => mockGenerateConsentUrl(...args),
  verifyGdap: (...args: any[]) => mockVerifyGdap(...args),
  provisionTenant: (...args: any[]) => mockProvisionTenant(...args),
  fetchWizardState: (...args: any[]) => mockFetchWizardState(...args),
  updateWizardState: (...args: any[]) => mockUpdateWizardState(...args),
  resetWizardState: (...args: any[]) => mockResetWizardState(...args),
}));

// Mock MSAL config
vi.mock("@/lib/msal", () => ({
  msalInstance: {
    getAllAccounts: () => [{ name: "Test" }],
    acquireTokenSilent: vi.fn().mockResolvedValue({ accessToken: "mock" }),
    acquireTokenRedirect: vi.fn(),
  },
  loginRequest: { scopes: [] },
  apiScopes: ["api://test/.default"],
}));

import { OnboardingWizard } from "@/components/tenants/OnboardingWizard";
import { useOnboarding } from "@/hooks/useOnboarding";

// Helper: Render the wizard with the useOnboarding hook
function WizardWrapper() {
  const onboarding = useOnboarding();
  return <OnboardingWizard {...onboarding} />;
}

describe("OnboardingWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWizardState.mockResolvedValue(null);
    mockUpdateWizardState.mockResolvedValue({
      id: "ws-1",
      currentStep: 1,
      stepsCompleted: [],
      isComplete: false,
      updatedAt: new Date().toISOString(),
    });
    mockResetWizardState.mockResolvedValue(undefined);
    mockCreateTenant.mockResolvedValue({ id: "tenant-123", status: "pending" });
    mockGenerateConsentUrl.mockResolvedValue({ consentUrl: "https://login.microsoftonline.com/consent?state=abc" });
    mockVerifyGdap.mockResolvedValue({
      customerTenantId: "cust-tenant-456",
      customerDisplayName: "Contoso Ltd",
      roles: [{ roleDefinitionId: "role-1" }],
      expiresAt: "2027-01-01T00:00:00Z",
    });
    mockProvisionTenant.mockResolvedValue({
      databaseName: "tenant_abc123",
      tenantId: "tenant-123",
      status: "active",
    });
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("renders step indicator with 5 steps and step 1 active", async () => {
    render(<WizardWrapper />);

    await waitFor(() => {
      // "Tenant Details" appears twice: step indicator + form heading
      expect(screen.getAllByText("Tenant Details").length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText("Connection Method")).toBeDefined();
    expect(screen.getByText("Connect & Verify")).toBeDefined();
    // "Provisioning" is a step label, and "Complete" is a step label
    expect(screen.getByTestId("step-indicator-4")).toBeDefined();
    expect(screen.getByTestId("step-indicator-5")).toBeDefined();

    // Step 1 should be active (blue background)
    const step1Indicator = screen.getByTestId("step-indicator-1");
    expect(step1Indicator.className).toContain("bg-blue-600");
  });

  it("validates displayName minimum length", async () => {
    render(<WizardWrapper />);

    await waitFor(() => {
      expect(screen.getByLabelText(/display name/i)).toBeDefined();
    });

    const nameInput = screen.getByLabelText(/display name/i) as HTMLInputElement;
    const nextButton = screen.getByRole("button", { name: /next/i });

    // Enter too-short name
    fireEvent.change(nameInput, { target: { value: "AB" } });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText(/at least 3 characters/i)).toBeDefined();
    });

    // createTenant should NOT have been called
    expect(mockCreateTenant).not.toHaveBeenCalled();
  });

  it("submitting tenant details calls createTenant AND updateWizardState, then advances to step 2", async () => {
    render(<WizardWrapper />);

    await waitFor(() => {
      expect(screen.getByLabelText(/display name/i)).toBeDefined();
    });

    const nameInput = screen.getByLabelText(/display name/i);
    fireEvent.change(nameInput, { target: { value: "Test Corp" } });

    const nextButton = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(mockCreateTenant).toHaveBeenCalledWith({
        displayName: "Test Corp",
        primaryDomain: "",
        contactEmail: "",
      });
    });

    await waitFor(() => {
      expect(mockUpdateWizardState).toHaveBeenCalled();
    });

    // Should advance to step 2 -- Connection Method
    await waitFor(() => {
      expect(screen.getByText(/OAuth Consent/i)).toBeDefined();
    });
  });

  it("selecting OAuth method calls updateWizardState and advances to step 3 with OAuth UI", async () => {
    render(<WizardWrapper />);

    // Complete step 1
    await waitFor(() => {
      expect(screen.getByLabelText(/display name/i)).toBeDefined();
    });
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Test Corp" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText(/OAuth Consent/i)).toBeDefined();
    });

    // Reset mock calls after step 1
    mockUpdateWizardState.mockClear();

    // Click OAuth card
    const oauthCard = screen.getByTestId("connection-method-oauth");
    fireEvent.click(oauthCard);

    await waitFor(() => {
      expect(mockUpdateWizardState).toHaveBeenCalled();
    });

    // Should show OAuth UI (Generate Consent Link button)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /generate consent link/i })).toBeDefined();
    });
  });

  it("selecting GDAP method calls updateWizardState and advances to step 3 with GDAP UI", async () => {
    render(<WizardWrapper />);

    // Complete step 1
    await waitFor(() => {
      expect(screen.getByLabelText(/display name/i)).toBeDefined();
    });
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Test Corp" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByTestId("connection-method-gdap")).toBeDefined();
    });

    mockUpdateWizardState.mockClear();

    // Click GDAP card
    const gdapCard = screen.getByTestId("connection-method-gdap");
    fireEvent.click(gdapCard);

    await waitFor(() => {
      expect(mockUpdateWizardState).toHaveBeenCalled();
    });

    // Should show GDAP UI (Verify Relationship button)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/GDAP relationship ID/i)).toBeDefined();
    });
  });

  it("OAuth consent URL is displayed with copy button after generation", async () => {
    render(<WizardWrapper />);

    // Navigate to step 3 OAuth
    await waitFor(() => expect(screen.getByLabelText(/display name/i)).toBeDefined());
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Test Corp" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByTestId("connection-method-oauth")).toBeDefined());
    fireEvent.click(screen.getByTestId("connection-method-oauth"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /generate consent link/i })).toBeDefined();
    });

    // Click generate
    fireEvent.click(screen.getByRole("button", { name: /generate consent link/i }));

    await waitFor(() => {
      expect(mockGenerateConsentUrl).toHaveBeenCalledWith("tenant-123");
    });

    // Should show the URL and a copy button
    await waitFor(() => {
      expect(screen.getByDisplayValue(/login\.microsoftonline\.com/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /copy/i })).toBeDefined();
    });
  });

  it("GDAP verification shows customer details on success", async () => {
    render(<WizardWrapper />);

    // Navigate to step 3 GDAP
    await waitFor(() => expect(screen.getByLabelText(/display name/i)).toBeDefined());
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Test Corp" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByTestId("connection-method-gdap")).toBeDefined());
    fireEvent.click(screen.getByTestId("connection-method-gdap"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/GDAP relationship ID/i)).toBeDefined();
    });

    // Enter relationship ID and verify
    const input = screen.getByPlaceholderText(/GDAP relationship ID/i);
    fireEvent.change(input, { target: { value: "rel-abc-123" } });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => {
      expect(mockVerifyGdap).toHaveBeenCalledWith("tenant-123", "rel-abc-123");
    });

    // Should show customer details
    await waitFor(() => {
      expect(screen.getByText("Contoso Ltd")).toBeDefined();
      expect(screen.getByText(/cust-tenant-456/i)).toBeDefined();
    });
  });

  it("provisioning step shows checklist items", async () => {
    // Delay provision to observe the checklist
    mockProvisionTenant.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({
        databaseName: "tenant_abc123",
        tenantId: "tenant-123",
        status: "active",
      }), 100))
    );

    render(<WizardWrapper />);

    // Navigate through steps 1-3 (OAuth path) quickly
    await waitFor(() => expect(screen.getByLabelText(/display name/i)).toBeDefined());
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Test Corp" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByTestId("connection-method-oauth")).toBeDefined());
    fireEvent.click(screen.getByTestId("connection-method-oauth"));
    await waitFor(() => expect(screen.getByRole("button", { name: /generate consent link/i })).toBeDefined());

    // Generate consent URL
    fireEvent.click(screen.getByRole("button", { name: /generate consent link/i }));
    await waitFor(() => expect(screen.getByDisplayValue(/login\.microsoftonline\.com/i)).toBeDefined());

    // Click "Consent Received" to advance to provisioning
    fireEvent.click(screen.getByRole("button", { name: /consent received/i }));

    // Should show provisioning checklist
    await waitFor(() => {
      expect(screen.getByText(/creating tenant database/i)).toBeDefined();
      expect(screen.getByText(/storing encrypted credentials/i)).toBeDefined();
      expect(screen.getByText(/triggering first compliance audit/i)).toBeDefined();
    });
  });

  it("completion step shows View Tenant Dashboard link with correct tenant ID", async () => {
    render(<WizardWrapper />);

    // Navigate through all steps
    await waitFor(() => expect(screen.getByLabelText(/display name/i)).toBeDefined());
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Test Corp" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByTestId("connection-method-oauth")).toBeDefined());
    fireEvent.click(screen.getByTestId("connection-method-oauth"));
    await waitFor(() => expect(screen.getByRole("button", { name: /generate consent link/i })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /generate consent link/i }));
    await waitFor(() => expect(screen.getByDisplayValue(/login\.microsoftonline\.com/i)).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /consent received/i }));

    // Wait for provisioning to complete and advance to step 5
    await waitFor(() => {
      expect(screen.getByText(/tenant connected/i)).toBeDefined();
    }, { timeout: 5000 });

    // Check for View Tenant Dashboard link
    const dashboardLink = screen.getByRole("link", { name: /view tenant dashboard/i });
    expect(dashboardLink.getAttribute("href")).toBe("/tenants/tenant-123");
  });

  it("on mount, fetchWizardState is called and existing state is restored (wizard resume)", async () => {
    mockFetchWizardState.mockResolvedValue({
      id: "ws-existing",
      currentStep: 2,
      totalSteps: 5,
      stepsCompleted: [
        { step: 1, data: { tenantId: "tenant-resume", displayName: "Resume Corp" }, completedAt: "2026-03-10T00:00:00Z" },
      ],
      isComplete: false,
      updatedAt: "2026-03-10T00:00:00Z",
    });

    render(<WizardWrapper />);

    await waitFor(() => {
      expect(mockFetchWizardState).toHaveBeenCalled();
    });

    // Should restore to step 2 (Connection Method)
    await waitFor(() => {
      expect(screen.getByTestId("connection-method-oauth")).toBeDefined();
      expect(screen.getByTestId("connection-method-gdap")).toBeDefined();
    });
  });

  it("Connect Another Tenant calls resetWizardState", async () => {
    render(<WizardWrapper />);

    // Navigate through all steps to completion
    await waitFor(() => expect(screen.getByLabelText(/display name/i)).toBeDefined());
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Test Corp" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByTestId("connection-method-oauth")).toBeDefined());
    fireEvent.click(screen.getByTestId("connection-method-oauth"));
    await waitFor(() => expect(screen.getByRole("button", { name: /generate consent link/i })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /generate consent link/i }));
    await waitFor(() => expect(screen.getByDisplayValue(/login\.microsoftonline\.com/i)).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /consent received/i }));

    await waitFor(() => {
      expect(screen.getByText(/tenant connected/i)).toBeDefined();
    }, { timeout: 5000 });

    mockResetWizardState.mockClear();

    // Click "Connect Another Tenant"
    const connectAnother = screen.getByRole("button", { name: /connect another tenant/i });
    fireEvent.click(connectAnother);

    await waitFor(() => {
      expect(mockResetWizardState).toHaveBeenCalled();
    });
  });

  it("URL param consent=success auto-advances to provisioning", async () => {
    // Set URL params for consent callback
    Object.defineProperty(window, 'location', {
      value: { search: '?consent=success&tenantId=tenant-oauth-123' },
      writable: true,
    });

    // Mock searchParams to return consent params
    const originalGet = mockSearchParams.get.bind(mockSearchParams);
    vi.spyOn(mockSearchParams, 'get').mockImplementation((key: string) => {
      if (key === 'consent') return 'success';
      if (key === 'tenantId') return 'tenant-oauth-123';
      return originalGet(key);
    });

    // Mock fetchWizardState to return a step 3 state (OAuth path)
    mockFetchWizardState.mockResolvedValue({
      id: "ws-oauth",
      currentStep: 3,
      totalSteps: 5,
      stepsCompleted: [
        { step: 1, data: { tenantId: "tenant-oauth-123", displayName: "OAuth Corp" }, completedAt: "2026-03-10T00:00:00Z" },
        { step: 2, data: { connectionMethod: "oauth" }, completedAt: "2026-03-10T00:00:00Z" },
      ],
      isComplete: false,
      updatedAt: "2026-03-10T00:00:00Z",
    });

    render(<WizardWrapper />);

    // Should auto-advance to provisioning step (step 4)
    await waitFor(() => {
      expect(screen.getByText(/creating tenant database/i)).toBeDefined();
    }, { timeout: 5000 });
  });
});

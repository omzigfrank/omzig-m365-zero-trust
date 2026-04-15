import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AuditFinding } from "@/lib/types";

// Mock the remediation registry. The drawer imports from `@omzig/audit/remediation`
// so the mock path must match.
const mockRemediation = {
  controlId: "MS.AAD.1.1v1",
  steps: [
    "Navigate to Conditional Access",
    "Create new policy",
    "Set conditions for legacy auth",
  ],
  adminPortalUrl: "https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess",
  powershell: 'Connect-MgGraph -Scopes "Policy.ReadWrite.ConditionalAccess"',
  estimatedImpact: "High - blocks legacy clients",
  notes: "Test in report-only first",
  classification: "SAFE" as const,
  scopeBundle: "conditionalAccess" as const,
};

vi.mock("@omzig/audit/remediation", () => ({
  getRemediationByControlId: vi.fn((id: string) => {
    if (id === "MS.AAD.1.1v1") return mockRemediation;
    return undefined;
  }),
}));

// Mock the RemediateButton since it needs MSAL, useRemediation, etc.
vi.mock("@/components/remediation/RemediateButton", () => ({
  RemediateButton: ({ tenantId }: { tenantId: string }) => (
    <button data-testid="mock-remediate-button">Remediate {tenantId}</button>
  ),
}));

// Lazy import after mock
import { FindingDetailDrawer } from "@/components/audit/FindingDetailDrawer";

afterEach(() => {
  cleanup();
});

function makeFinding(overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: "f1",
    controlId: "MS.AAD.1.1v1",
    product: "AAD",
    description: "Legacy authentication SHALL be blocked",
    requirementLevel: "SHALL",
    severity: "High",
    rating: "fail",
    message: "Legacy authentication is not blocked by conditional access",
    action: "Create a CA policy to block legacy auth",
    settingName: "Legacy Auth Blocking",
    currentValue: "Allowed",
    expectedValue: "Blocked",
    nist80053: "AC-7",
    nistCsf: "PR.AC-1",
    nist800207Tenet: "T1",
    ...overrides,
  };
}

describe("FindingDetailDrawer", () => {
  it("renders finding status badge, severity, control ID, description, message", () => {
    const finding = makeFinding();
    render(
      <FindingDetailDrawer
        finding={finding}
        isOpen={true}
        onClose={vi.fn()}
        tenantId="test-tenant-id"
      />
    );

    expect(screen.getByText("Fail")).toBeDefined();
    expect(screen.getByText("High")).toBeDefined();
    expect(screen.getByText("MS.AAD.1.1v1")).toBeDefined();
    expect(screen.getByText(/Legacy authentication SHALL be blocked/)).toBeDefined();
    expect(screen.getByText(/Legacy authentication is not blocked/)).toBeDefined();
  });

  it("renders setting name, current value, expected value when present", () => {
    const finding = makeFinding();
    render(
      <FindingDetailDrawer
        finding={finding}
        isOpen={true}
        onClose={vi.fn()}
        tenantId="test-tenant-id"
      />
    );

    expect(screen.getByText("Legacy Auth Blocking")).toBeDefined();
    expect(screen.getByText("Allowed")).toBeDefined();
    expect(screen.getByText("Blocked")).toBeDefined();
  });

  it("renders remediation steps from registry as numbered list", () => {
    const finding = makeFinding();
    render(
      <FindingDetailDrawer
        finding={finding}
        isOpen={true}
        onClose={vi.fn()}
        tenantId="test-tenant-id"
      />
    );

    expect(screen.getByText("Navigate to Conditional Access")).toBeDefined();
    expect(screen.getByText("Create new policy")).toBeDefined();
    expect(screen.getByText("Set conditions for legacy auth")).toBeDefined();
  });

  it("renders admin portal link as external link when present", () => {
    const finding = makeFinding();
    render(
      <FindingDetailDrawer
        finding={finding}
        isOpen={true}
        onClose={vi.fn()}
        tenantId="test-tenant-id"
      />
    );

    const link = screen.getByRole("link", { name: /open in admin portal/i });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe(
      "https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess"
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("renders PowerShellBlock when powershell is present in remediation entry", () => {
    const finding = makeFinding();
    render(
      <FindingDetailDrawer
        finding={finding}
        isOpen={true}
        onClose={vi.fn()}
        tenantId="test-tenant-id"
      />
    );

    // PowerShellBlock renders in a pre > code
    expect(screen.getByText(/Connect-MgGraph/)).toBeDefined();
  });

  it("renders cross-framework badges (FindingBadges) in drawer", () => {
    const finding = makeFinding();
    render(
      <FindingDetailDrawer
        finding={finding}
        isOpen={true}
        onClose={vi.fn()}
        tenantId="test-tenant-id"
      />
    );

    expect(screen.getByText(/800-53: AC-7/)).toBeDefined();
    expect(screen.getByText(/CSF: PR.AC-1/)).toBeDefined();
    expect(screen.getByText(/ZTA: T1/)).toBeDefined();
  });

  it("renders fallback action text when no remediation entry exists", () => {
    const finding = makeFinding({
      controlId: "UNKNOWN.CONTROL",
      action: "Manual review required",
    });
    render(
      <FindingDetailDrawer
        finding={finding}
        isOpen={true}
        onClose={vi.fn()}
        tenantId="test-tenant-id"
      />
    );

    expect(screen.getByText("Manual review required")).toBeDefined();
  });

  it("shows generic fallback when no remediation entry and no action", () => {
    const finding = makeFinding({
      controlId: "UNKNOWN.CONTROL",
      action: undefined,
    });
    render(
      <FindingDetailDrawer
        finding={finding}
        isOpen={true}
        onClose={vi.fn()}
        tenantId="test-tenant-id"
      />
    );

    expect(screen.getByText("No remediation guidance available")).toBeDefined();
  });

  it("renders classification badge when remediation entry exists", () => {
    const finding = makeFinding();
    render(
      <FindingDetailDrawer
        finding={finding}
        isOpen={true}
        onClose={vi.fn()}
        tenantId="test-tenant-id"
      />
    );

    expect(screen.getByTestId("classification-badge-safe")).toBeDefined();
  });

  it("renders RemediateButton when tenantId is provided and remediation exists", () => {
    const finding = makeFinding();
    render(
      <FindingDetailDrawer
        finding={finding}
        isOpen={true}
        onClose={vi.fn()}
        tenantId="test-tenant-id"
      />
    );

    expect(screen.getByTestId("mock-remediate-button")).toBeDefined();
  });

  it("hides RemediateButton when tenantId is omitted and shows fallback copy", () => {
    const finding = makeFinding();
    render(
      <FindingDetailDrawer
        finding={finding}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    // Classification badge still renders
    expect(screen.getByTestId("classification-badge-safe")).toBeDefined();
    // But the remediate button is not rendered
    expect(screen.queryByTestId("mock-remediate-button")).toBeNull();
    // Fallback note is rendered
    expect(
      screen.getByText(/only available from the tenant detail page/i),
    ).toBeDefined();
  });
});

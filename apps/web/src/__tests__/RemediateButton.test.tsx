import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { AuditFinding } from "@/lib/types";

// ---- Mock useRemediation ----

const mockTrigger = vi.fn();
const mockReset = vi.fn();
let mockStatus = "idle";
let mockError: string | null = null;

vi.mock("@/hooks/useRemediation", () => {
  class ConsentRequiredError extends Error {
    readonly code = "CONSENT_REQUIRED";
    constructor(public bundle: string) {
      super("consent required");
      this.name = "ConsentRequiredError";
    }
  }
  return {
    ConsentRequiredError,
    useRemediation: () => ({
      status: mockStatus,
      currentJob: null,
      progress: null,
      error: mockError,
      triggerRemediation: mockTrigger,
      rollbackRemediation: vi.fn(),
      reset: mockReset,
    }),
  };
});

// Mock ConsentPrompt so we can assert it's rendered without MSAL.
vi.mock("@/components/remediation/ConsentPrompt", () => ({
  ConsentPrompt: ({
    isOpen,
    onConsentGranted,
  }: {
    isOpen: boolean;
    onConsentGranted: () => void;
  }) =>
    isOpen ? (
      <div data-testid="consent-prompt">
        <button data-testid="consent-authorize" onClick={onConsentGranted}>
          Authorize
        </button>
      </div>
    ) : null,
}));

import { RemediateButton } from "@/components/remediation/RemediateButton";

function makeFinding(overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: "f1",
    controlId: "MS.AAD.1.1v1",
    product: "AAD",
    description: "Legacy auth",
    requirementLevel: "SHALL",
    severity: "High",
    rating: "fail",
    message: "Legacy auth not blocked",
    action: "Create CA policy",
    settingName: "Legacy Auth",
    currentValue: "Allowed",
    expectedValue: "Blocked",
    nist80053: "AC-7",
    nistCsf: "PR.AC-1",
    nist800207Tenet: "T1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStatus = "idle";
  mockError = null;
  mockTrigger.mockReset();
});

afterEach(() => cleanup());

describe("RemediateButton", () => {
  it("renders disabled state with 'Coming soon' for RISKY classification", () => {
    render(
      <RemediateButton
        finding={makeFinding()}
        tenantId="tenant-1"
        classification="RISKY"
        bundle="conditionalAccess"
      />,
    );

    const container = screen.getByTestId("remediate-button-risky-disabled");
    expect(container.getAttribute("title")).toMatch(/coming in the next plan/i);
  });

  it("renders SAFE button and opens confirm dialog on click", () => {
    render(
      <RemediateButton
        finding={makeFinding()}
        tenantId="tenant-1"
        classification="SAFE"
        bundle="conditionalAccess"
      />,
    );

    const btn = screen.getByTestId("remediate-button-safe");
    fireEvent.click(btn);

    expect(screen.getByText(/Confirm Remediation/i)).toBeDefined();
    expect(screen.getByText(/MS.AAD.1.1v1/)).toBeDefined();
  });

  it("calls triggerRemediation on Approve click", async () => {
    mockTrigger.mockResolvedValueOnce({
      remediationJobId: "job-1",
      status: "pending",
    });

    render(
      <RemediateButton
        finding={makeFinding()}
        tenantId="tenant-1"
        classification="SAFE"
        bundle="conditionalAccess"
      />,
    );

    fireEvent.click(screen.getByTestId("remediate-button-safe"));
    fireEvent.click(screen.getByTestId("remediate-confirm-approve"));

    await waitFor(() => {
      expect(mockTrigger).toHaveBeenCalledWith({
        findingId: "f1",
        bundle: "conditionalAccess",
      });
    });
  });

  it("shows ConsentPrompt when triggerRemediation throws ConsentRequiredError", async () => {
    const { ConsentRequiredError } = await import("@/hooks/useRemediation");
    mockTrigger.mockRejectedValueOnce(new ConsentRequiredError("conditionalAccess"));

    render(
      <RemediateButton
        finding={makeFinding()}
        tenantId="tenant-1"
        classification="SAFE"
        bundle="conditionalAccess"
      />,
    );

    fireEvent.click(screen.getByTestId("remediate-button-safe"));
    fireEvent.click(screen.getByTestId("remediate-confirm-approve"));

    await waitFor(() => {
      expect(screen.getByTestId("consent-prompt")).toBeDefined();
    });
  });

  it("shows running status when hook status transitions to running", () => {
    mockStatus = "running";
    render(
      <RemediateButton
        finding={makeFinding()}
        tenantId="tenant-1"
        classification="SAFE"
        bundle="conditionalAccess"
      />,
    );
    expect(screen.getByText(/in progress/i)).toBeDefined();
  });

  it("shows completed state when status is completed", () => {
    mockStatus = "completed";
    render(
      <RemediateButton
        finding={makeFinding()}
        tenantId="tenant-1"
        classification="SAFE"
        bundle="conditionalAccess"
      />,
    );
    expect(screen.getByText(/Success/i)).toBeDefined();
  });
});

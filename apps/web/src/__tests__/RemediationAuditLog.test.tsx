import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const mockRollback = vi.fn();
vi.mock("@/hooks/useRemediation", () => ({
  useRemediation: () => ({
    rollbackRemediation: mockRollback,
  }),
  ConsentRequiredError: class extends Error {},
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => cleanup());

const HISTORY_ROWS = [
  {
    id: "job-1",
    controlId: "MS.AAD.1.1v1",
    classification: "SAFE",
    scopeBundle: "conditionalAccess",
    status: "completed",
    approvedByUserId: "user-1",
    approvedAt: "2026-04-15T12:00:00Z",
    completedAt: "2026-04-15T12:01:00Z",
    lastAttemptError: null,
    beforeSnapshot: null,
    afterSnapshot: { id: "policy-1" },
  },
  {
    id: "job-2",
    controlId: "MS.AAD.3.5v1",
    classification: "SAFE",
    scopeBundle: "authMethods",
    status: "failed",
    approvedByUserId: "user-1",
    approvedAt: "2026-04-15T13:00:00Z",
    completedAt: null,
    lastAttemptError: "Graph 403 Forbidden",
    beforeSnapshot: null,
    afterSnapshot: null,
  },
];

describe("RemediationAuditLog", () => {
  it("renders a row per job with classification + status badges", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: HISTORY_ROWS }),
    });

    const { RemediationAuditLog } = await import(
      "@/components/remediation/RemediationAuditLog"
    );
    render(<RemediationAuditLog tenantId="tenant-1" />);

    await waitFor(() => {
      expect(screen.getByText("MS.AAD.1.1v1")).toBeDefined();
    });
    expect(screen.getByText("MS.AAD.3.5v1")).toBeDefined();
    expect(screen.getByText(/completed/i)).toBeDefined();
    expect(screen.getByText(/failed/i)).toBeDefined();
  });

  it("shows Rollback button only on completed rows", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: HISTORY_ROWS }),
    });

    const { RemediationAuditLog } = await import(
      "@/components/remediation/RemediationAuditLog"
    );
    render(<RemediationAuditLog tenantId="tenant-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("rollback-button-job-1")).toBeDefined();
    });
    expect(screen.queryByTestId("rollback-button-job-2")).toBeNull();
  });

  it("calls rollbackRemediation when Rollback button is clicked", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: HISTORY_ROWS }),
    });
    mockRollback.mockResolvedValueOnce(undefined);

    const { RemediationAuditLog } = await import(
      "@/components/remediation/RemediationAuditLog"
    );
    render(<RemediationAuditLog tenantId="tenant-1" />);

    const btn = await screen.findByTestId("rollback-button-job-1");

    // Second fetch is the history refresh after rollback.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: HISTORY_ROWS }),
    });

    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockRollback).toHaveBeenCalledWith("job-1", false);
    });
  });

  it("shows drift modal when rollback throws with changedFields", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: HISTORY_ROWS }),
    });

    const driftErr = new Error("drift") as Error & { changedFields?: string[] };
    driftErr.changedFields = ["state", "conditions"];
    mockRollback.mockRejectedValueOnce(driftErr);

    const { RemediationAuditLog } = await import(
      "@/components/remediation/RemediationAuditLog"
    );
    render(<RemediationAuditLog tenantId="tenant-1" />);

    const btn = await screen.findByTestId("rollback-button-job-1");
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/drift detected/i)).toBeDefined();
    });
    expect(screen.getByText("state")).toBeDefined();
    expect(screen.getByText("conditions")).toBeDefined();
  });

  it("renders empty state when history is empty", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const { RemediationAuditLog } = await import(
      "@/components/remediation/RemediationAuditLog"
    );
    render(<RemediationAuditLog tenantId="tenant-1" />);

    await waitFor(() => {
      expect(screen.getByText(/No remediations/i)).toBeDefined();
    });
  });
});

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { AuditRunDetail, AuditFinding } from "@/lib/types";

// ── Mock useAuth ──────────────────────────────────────────────────
const getTokenMock = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ getToken: getTokenMock }),
}));

import { ExportButtons } from "@/components/audit/ExportButtons";

// ── Fixtures ──────────────────────────────────────────────────────
function makeFinding(overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: "finding-1",
    controlId: "MS.AAD.1.1v1",
    product: "AAD",
    description: "Legacy authentication SHALL be blocked",
    requirementLevel: "SHALL",
    severity: "High",
    rating: "fail",
    message: "Legacy authentication is not blocked",
    action: "Create CA policy to block legacy auth",
    settingName: "blockLegacyAuth",
    currentValue: "false",
    expectedValue: "true",
    nist80053: "AC-2",
    nistCsf: "PR.AC-1",
    nist800207Tenet: "User",
    requiredPermission: "Policy.ReadWrite.ConditionalAccess",
    ...overrides,
  };
}

function makeAuditData(overrides: Partial<AuditRunDetail> = {}): AuditRunDetail {
  return {
    id: "audit-123",
    tenantId: "tenant-abc",
    status: "completed",
    startedAt: "2026-04-14T10:00:00Z",
    completedAt: "2026-04-14T10:05:00Z",
    totalChecks: 10,
    passedChecks: 6,
    failedChecks: 4,
    errorChecks: 0,
    findings: [
      makeFinding({ id: "f1", severity: "Critical", rating: "fail", product: "AAD" }),
      makeFinding({ id: "f2", severity: "High", rating: "pass", product: "ZTA" }),
      makeFinding({ id: "f3", severity: "Low", rating: "fail", product: "80053" }),
    ],
    ...overrides,
  };
}

// ── URL.createObjectURL / download stubs ──────────────────────────
const createObjectURLMock = vi.fn(() => "blob:mock-url");
const revokeObjectURLMock = vi.fn();
beforeEach(() => {
  (globalThis.URL as any).createObjectURL = createObjectURLMock;
  (globalThis.URL as any).revokeObjectURL = revokeObjectURLMock;
  getTokenMock.mockReset();
  getTokenMock.mockResolvedValue("test-access-token");
  createObjectURLMock.mockClear();
  revokeObjectURLMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ExportButtons", () => {
  it("renders JSON, CSV, and PDF buttons", () => {
    render(<ExportButtons data={makeAuditData()} tenantId="tenant-abc" />);
    expect(screen.getByRole("button", { name: /json/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /csv/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /pdf/i })).toBeDefined();
  });

  it("PDF button opens dropdown with Executive Summary and Full Compliance Report options", () => {
    render(<ExportButtons data={makeAuditData()} tenantId="tenant-abc" />);
    const pdfBtn = screen.getByRole("button", { name: /pdf/i });
    fireEvent.click(pdfBtn);
    expect(screen.getByText(/executive summary/i)).toBeDefined();
    expect(screen.getByText(/full compliance report/i)).toBeDefined();
  });

  it("clicking Executive Summary triggers fetch to /report?type=executive", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });
    (globalThis as any).fetch = fetchMock;

    render(<ExportButtons data={makeAuditData()} tenantId="tenant-abc" />);
    fireEvent.click(screen.getByRole("button", { name: /pdf/i }));
    fireEvent.click(screen.getByText(/executive summary/i));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/api/tenants/tenant-abc/audits/audit-123/report");
    expect(url).toContain("type=executive");
    const opts = fetchMock.mock.calls[0][1];
    expect(opts.headers.Authorization).toBe("Bearer test-access-token");
  });

  it("clicking Full Compliance Report triggers fetch to /report?type=full", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });
    (globalThis as any).fetch = fetchMock;

    render(<ExportButtons data={makeAuditData()} tenantId="tenant-abc" />);
    fireEvent.click(screen.getByRole("button", { name: /pdf/i }));
    fireEvent.click(screen.getByText(/full compliance report/i));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("type=full");
  });

  it("PDF dropdown closes when clicking outside", () => {
    render(
      <div>
        <ExportButtons data={makeAuditData()} tenantId="tenant-abc" />
        <div data-testid="outside">outside</div>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /pdf/i }));
    expect(screen.queryByText(/executive summary/i)).not.toBeNull();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByText(/executive summary/i)).toBeNull();
  });

  it("CSV button exports ~20 columns (not the old 5 columns)", () => {
    const anchorClickMock = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreateElement(tag) as any;
      if (tag === "a") {
        el.click = anchorClickMock;
      }
      return el;
    });

    const blobCalls: any[][] = [];
    const OrigBlob = globalThis.Blob;
    (globalThis as any).Blob = function (parts: any[], opts: any) {
      blobCalls.push(parts);
      return new OrigBlob(parts, opts);
    };

    try {
      render(<ExportButtons data={makeAuditData()} tenantId="tenant-abc" />);
      fireEvent.click(screen.getByRole("button", { name: /csv/i }));

      const csvParts = blobCalls[blobCalls.length - 1];
      const text = csvParts.map((p) => String(p)).join("");
      const firstLine = text.split("\n")[0];
      // Expect ~17 columns (no Tenant Name/ID for single-tenant export)
      const columns = firstLine.split(",");
      expect(columns.length).toBeGreaterThanOrEqual(15);
      expect(firstLine).toContain("Control ID");
      expect(firstLine).toContain("NIST 800-53");
      expect(firstLine).toContain("ZTA Tenet");
      expect(firstLine).toContain("Required Permission");
    } finally {
      (globalThis as any).Blob = OrigBlob;
    }
  });

  it("CSV export respects activeFilters prop (only includes filtered findings)", () => {
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreateElement(tag) as any;
      if (tag === "a") el.click = vi.fn();
      return el;
    });

    const blobCalls: any[][] = [];
    const OrigBlob = globalThis.Blob;
    (globalThis as any).Blob = function (parts: any[], opts: any) {
      blobCalls.push(parts);
      return new OrigBlob(parts, opts);
    };

    try {
      render(
        <ExportButtons
          data={makeAuditData()}
          tenantId="tenant-abc"
          activeFilters={{
            severities: new Set(["Critical"]),
            statuses: new Set(["fail"]),
            frameworks: new Set(["AAD", "ZTA", "80053", "CSF"]),
          }}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /csv/i }));

      const csvParts = blobCalls[blobCalls.length - 1];
      const text = csvParts.map((p) => String(p)).join("");
      // Only f1 (Critical/fail/AAD) should remain (f2=pass, f3=Low)
      const lines = text.trim().split("\n");
      expect(lines.length).toBe(2); // header + 1 row
      expect(lines[1]).toContain("MS.AAD.1.1v1");
    } finally {
      (globalThis as any).Blob = OrigBlob;
    }
  });

  it("CSV file name follows findings-{ISO-timestamp}.csv format", () => {
    const createdAnchors: any[] = [];
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreateElement(tag) as any;
      if (tag === "a") {
        el.click = vi.fn();
        createdAnchors.push(el);
      }
      return el;
    });

    render(<ExportButtons data={makeAuditData()} tenantId="tenant-abc" />);
    fireEvent.click(screen.getByRole("button", { name: /csv/i }));

    const a = createdAnchors[createdAnchors.length - 1];
    expect(a.download).toMatch(/^findings-.*\.csv$/);
  });
});

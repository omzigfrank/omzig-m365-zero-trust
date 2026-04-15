import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// ── Mock useAuth ──────────────────────────────────────────────────
const getTokenMock = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ getToken: getTokenMock }),
}));

import { MultiTenantExport } from "@/components/tenants/MultiTenantExport";

// ── URL / anchor stubs ────────────────────────────────────────────
let capturedBlob: Blob | null = null;
let capturedAnchors: any[] = [];

beforeEach(() => {
  capturedBlob = null;
  capturedAnchors = [];
  (globalThis.URL as any).createObjectURL = (b: Blob) => {
    capturedBlob = b;
    return "blob:mock-url";
  };
  (globalThis.URL as any).revokeObjectURL = vi.fn();

  const origCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = origCreateElement(tag) as any;
    if (tag === "a") {
      el.click = vi.fn();
      capturedAnchors.push(el);
    }
    return el;
  });

  getTokenMock.mockReset();
  getTokenMock.mockResolvedValue("test-access-token");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MultiTenantExport", () => {
  it("renders an export button", () => {
    render(<MultiTenantExport />);
    expect(
      screen.getByRole("button", { name: /export all tenants csv/i }),
    ).toBeDefined();
  });

  it("clicking button fetches GET /api/tenants/export/csv with Bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          '"Tenant Name","Tenant ID","Audit ID"\n"Acme","tenant-1","audit-1"\n',
        ),
    });
    (globalThis as any).fetch = fetchMock;

    render(<MultiTenantExport />);
    fireEvent.click(
      screen.getByRole("button", { name: /export all tenants csv/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/api/tenants/export/csv");
    const opts = fetchMock.mock.calls[0][1];
    expect(opts.headers.Authorization).toBe("Bearer test-access-token");
  });

  it("triggers CSV download with all-tenants-findings filename", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('"Tenant Name","Tenant ID"\n'),
    });
    (globalThis as any).fetch = fetchMock;

    render(<MultiTenantExport />);
    fireEvent.click(
      screen.getByRole("button", { name: /export all tenants csv/i }),
    );

    await waitFor(() => expect(capturedBlob).not.toBeNull());
    const anchor = capturedAnchors[capturedAnchors.length - 1];
    expect(anchor.download).toMatch(/^all-tenants-findings-.*\.csv$/);
  });

  it("shows loading state during fetch", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    (globalThis as any).fetch = fetchMock;

    render(<MultiTenantExport />);
    const btn = screen.getByRole("button", {
      name: /export all tenants csv/i,
    });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /exporting/i })).toBeDefined();
    });

    resolveFetch({
      ok: true,
      text: () => Promise.resolve('"Tenant Name","Tenant ID"\n'),
    });
  });

  it("shows error message when fetch fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
    });
    (globalThis as any).fetch = fetchMock;

    render(<MultiTenantExport />);
    fireEvent.click(
      screen.getByRole("button", { name: /export all tenants csv/i }),
    );

    await waitFor(() =>
      expect(screen.getByText(/failed to export/i)).toBeDefined(),
    );
  });
});

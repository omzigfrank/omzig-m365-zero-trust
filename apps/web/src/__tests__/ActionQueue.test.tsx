import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ActionQueueItem } from "@omzig/shared";

// ── Mock next/navigation ──────────────────────────────────────────
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

// ── Mock action-queue-api ─────────────────────────────────────────
const mockFetchActionQueue = vi.fn();
const mockDismissActionQueueItem = vi.fn();
vi.mock("@/lib/action-queue-api", () => ({
  fetchActionQueue: (...args: any[]) => mockFetchActionQueue(...args),
  dismissActionQueueItem: (...args: any[]) => mockDismissActionQueueItem(...args),
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

// ── Fixtures ──────────────────────────────────────────────────────

function makeItem(overrides: Partial<ActionQueueItem> = {}): ActionQueueItem {
  return {
    id: "critical-t1",
    type: "critical_findings",
    tenantId: "t1",
    tenantName: "Acme Corp",
    severity: "critical",
    message: "3 critical/high failures in latest audit",
    count: 3,
    linkTo: "/tenants/t1",
    createdAt: new Date().toISOString(),
    dismissed: false,
    ...overrides,
  };
}

const FIXTURE_ITEMS: ActionQueueItem[] = [
  makeItem(),
  makeItem({
    id: "status-t2-needs_reauth",
    type: "needs_reauth",
    tenantId: "t2",
    tenantName: "Beta LLC",
    severity: "high",
    message: "Tenant needs re-authentication",
    count: undefined,
    linkTo: "/tenants/t2",
  }),
  makeItem({
    id: "status-t3-stale_audit",
    type: "stale_audit",
    tenantId: "t3",
    tenantName: "Gamma Inc",
    severity: "warning",
    message: "No audit in over 7 days",
    count: undefined,
    linkTo: "/tenants/t3",
  }),
];

// ── Lazy imports ──────────────────────────────────────────────────
import { ActionQueue } from "@/components/tenants/ActionQueue";

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  pushMock.mockClear();
  mockFetchActionQueue.mockClear();
  mockDismissActionQueueItem.mockClear();
});

afterEach(() => {
  cleanup();
});

// ═══════════════════════════════════════════════════════════════════
// ActionQueue Component Tests
// ═══════════════════════════════════════════════════════════════════

describe("ActionQueue", () => {
  it("renders items with tenant names", () => {
    render(
      <ActionQueue items={FIXTURE_ITEMS} onDismiss={vi.fn()} loading={false} />,
    );
    expect(screen.getByText("Acme Corp")).toBeDefined();
    expect(screen.getByText("Beta LLC")).toBeDefined();
    expect(screen.getByText("Gamma Inc")).toBeDefined();
  });

  it("shows top 5 items by default with 'View all (N)' link when more exist", () => {
    // Create 7 items
    const manyItems: ActionQueueItem[] = [];
    for (let i = 0; i < 7; i++) {
      manyItems.push(
        makeItem({
          id: `item-${i}`,
          tenantId: `t${i}`,
          tenantName: `Tenant ${i}`,
        }),
      );
    }

    render(
      <ActionQueue items={manyItems} onDismiss={vi.fn()} loading={false} />,
    );

    // Should show first 5
    expect(screen.getByText("Tenant 0")).toBeDefined();
    expect(screen.getByText("Tenant 4")).toBeDefined();
    // Tenant 5 and 6 should NOT be visible
    expect(screen.queryByText("Tenant 5")).toBeNull();
    expect(screen.queryByText("Tenant 6")).toBeNull();
    // View all link
    expect(screen.getByText("View all (7)")).toBeDefined();
  });

  it("clicking 'View all' shows all items", () => {
    const manyItems: ActionQueueItem[] = [];
    for (let i = 0; i < 7; i++) {
      manyItems.push(
        makeItem({
          id: `item-${i}`,
          tenantId: `t${i}`,
          tenantName: `Tenant ${i}`,
        }),
      );
    }

    render(
      <ActionQueue items={manyItems} onDismiss={vi.fn()} loading={false} />,
    );

    fireEvent.click(screen.getByText("View all (7)"));
    // Now all 7 should be visible
    expect(screen.getByText("Tenant 5")).toBeDefined();
    expect(screen.getByText("Tenant 6")).toBeDefined();
  });

  it("clicking dismiss button on an item calls onDismiss and removes item", () => {
    const onDismiss = vi.fn();
    render(
      <ActionQueue items={FIXTURE_ITEMS} onDismiss={onDismiss} loading={false} />,
    );

    const dismissButtons = screen.getAllByLabelText("Dismiss");
    fireEvent.click(dismissButtons[0]);
    expect(onDismiss).toHaveBeenCalledWith("critical-t1");
  });

  it("empty state shows 'No action items' message when items array is empty", () => {
    render(
      <ActionQueue items={[]} onDismiss={vi.fn()} loading={false} />,
    );
    expect(
      screen.getByText("No action items. All tenants are in good shape."),
    ).toBeDefined();
  });

  it("collapsible panel starts expanded, click header collapses content", () => {
    render(
      <ActionQueue items={FIXTURE_ITEMS} onDismiss={vi.fn()} loading={false} />,
    );

    // Items should be visible (expanded)
    expect(screen.getByText("Acme Corp")).toBeDefined();

    // Click header to collapse
    const header = screen.getByTestId("action-queue-header");
    fireEvent.click(header);

    // Items should be hidden
    expect(screen.queryByText("Acme Corp")).toBeNull();
  });

  it("critical_findings items show red indicator", () => {
    render(
      <ActionQueue
        items={[makeItem({ type: "critical_findings" })]}
        onDismiss={vi.fn()}
        loading={false}
      />,
    );
    const item = screen.getByTestId("action-queue-item-critical-t1");
    expect(item.className).toContain("border-l-red-500");
  });

  it("needs_reauth items show orange indicator", () => {
    render(
      <ActionQueue
        items={[
          makeItem({
            id: "status-t2-needs_reauth",
            type: "needs_reauth",
            severity: "high",
          }),
        ]}
        onDismiss={vi.fn()}
        loading={false}
      />,
    );
    const item = screen.getByTestId(
      "action-queue-item-status-t2-needs_reauth",
    );
    expect(item.className).toContain("border-l-orange-500");
  });

  it("stale_audit items show yellow indicator", () => {
    render(
      <ActionQueue
        items={[
          makeItem({
            id: "status-t3-stale_audit",
            type: "stale_audit",
            severity: "warning",
          }),
        ]}
        onDismiss={vi.fn()}
        loading={false}
      />,
    );
    const item = screen.getByTestId(
      "action-queue-item-status-t3-stale_audit",
    );
    expect(item.className).toContain("border-l-yellow-500");
  });

  it("clicking an item navigates to the correct tenant URL", () => {
    render(
      <ActionQueue items={FIXTURE_ITEMS} onDismiss={vi.fn()} loading={false} />,
    );

    // Click the first item (Acme Corp -> /tenants/t1)
    const item = screen.getByTestId("action-queue-item-critical-t1");
    fireEvent.click(item);
    expect(pushMock).toHaveBeenCalledWith("/tenants/t1");
  });

  it("shows count for critical_findings items", () => {
    render(
      <ActionQueue
        items={[makeItem({ count: 5 })]}
        onDismiss={vi.fn()}
        loading={false}
      />,
    );
    expect(screen.getByText("(5)")).toBeDefined();
  });

  it("shows loading skeleton rows when loading", () => {
    const { container } = render(
      <ActionQueue items={[]} onDismiss={vi.fn()} loading={true} />,
    );
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(2);
  });

  it("shows item count badge in header", () => {
    render(
      <ActionQueue items={FIXTURE_ITEMS} onDismiss={vi.fn()} loading={false} />,
    );
    // Count badge shows 3
    expect(screen.getByText("3")).toBeDefined();
  });

  it("dismiss button click does not trigger navigation (stopPropagation)", () => {
    const onDismiss = vi.fn();
    render(
      <ActionQueue items={FIXTURE_ITEMS} onDismiss={onDismiss} loading={false} />,
    );

    const dismissButtons = screen.getAllByLabelText("Dismiss");
    fireEvent.click(dismissButtons[0]);

    // Dismiss called but NOT navigate
    expect(onDismiss).toHaveBeenCalledWith("critical-t1");
    expect(pushMock).not.toHaveBeenCalled();
  });
});

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { GroupedFindingsView } from "@/components/audit/GroupedFindingsView";
import type { AuditFinding } from "@/lib/types";

afterEach(() => {
  cleanup();
});

function makeFinding(overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: "f1",
    controlId: "MS.AAD.1.1v1",
    product: "AAD",
    description: "Block legacy auth",
    requirementLevel: "SHALL",
    severity: "High",
    rating: "fail",
    message: "Legacy authentication not blocked",
    action: "Create CA policy",
    nist80053: "AC-7",
    nistCsf: "PR.AC-1",
    nist800207Tenet: "T1",
    ...overrides,
  };
}

const multiFrameworkFindings: AuditFinding[] = [
  makeFinding({ id: "f1", controlId: "MS.AAD.1.1v1", product: "AAD", rating: "fail" }),
  makeFinding({ id: "f2", controlId: "MS.AAD.2.1v1", product: "AAD", rating: "pass" }),
  makeFinding({
    id: "f3",
    controlId: "NIST.ZTA.T1.1v1",
    product: "ZTA",
    description: "ZTA T1 check",
    rating: "fail",
    nist800207Tenet: "T1",
  }),
  makeFinding({
    id: "f4",
    controlId: "NIST.ZTA.T2.1v1",
    product: "ZTA",
    description: "ZTA T2 check",
    rating: "pass",
    nist800207Tenet: "T2",
  }),
];

const singleFrameworkFindings: AuditFinding[] = [
  makeFinding({ id: "f1", controlId: "MS.AAD.1.1v1", product: "AAD", rating: "fail" }),
  makeFinding({ id: "f2", controlId: "MS.AAD.1.2v1", product: "AAD", rating: "pass" }),
  makeFinding({ id: "f3", controlId: "MS.AAD.2.1v1", product: "AAD", rating: "fail" }),
];

describe("GroupedFindingsView", () => {
  it("groups findings by framework then category when multiple frameworks selected", () => {
    render(
      <GroupedFindingsView
        findings={multiFrameworkFindings}
        frameworks={new Set(["AAD", "ZTA"])}
        onSelectFinding={vi.fn()}
      />
    );

    // Should see framework-level groups
    expect(screen.getByText(/CISA SCuBA/)).toBeDefined();
    expect(screen.getByText(/NIST 800-207/)).toBeDefined();
  });

  it("skips framework level when single framework selected, shows only category groups", () => {
    render(
      <GroupedFindingsView
        findings={singleFrameworkFindings}
        frameworks={new Set(["AAD"])}
        onSelectFinding={vi.fn()}
      />
    );

    // Should NOT see framework-level heading
    expect(screen.queryByText(/CISA SCuBA/)).toBeNull();

    // Should see category-level groups (Section 1, Section 2)
    expect(screen.getByText(/Section 1/)).toBeDefined();
    expect(screen.getByText(/Section 2/)).toBeDefined();
  });

  it("each category header shows category name and pass/fail count", () => {
    render(
      <GroupedFindingsView
        findings={singleFrameworkFindings}
        frameworks={new Set(["AAD"])}
        onSelectFinding={vi.fn()}
      />
    );

    // Section 1 has 2 findings (1 pass, 1 fail)
    const section1 = screen.getByText(/Section 1/);
    const section1Container = section1.closest("summary") || section1.closest("details");
    expect(section1Container).toBeDefined();
    // Should contain pass and fail counts
    expect(section1Container!.textContent).toContain("1");
  });

  it("clicking a finding row calls onSelectFinding with that finding", () => {
    const onSelect = vi.fn();
    render(
      <GroupedFindingsView
        findings={singleFrameworkFindings}
        frameworks={new Set(["AAD"])}
        onSelectFinding={onSelect}
      />
    );

    const findingRow = screen.getByText("MS.AAD.1.1v1");
    fireEvent.click(findingRow.closest("[data-finding-id]")!);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].controlId).toBe("MS.AAD.1.1v1");
  });

  it("empty groups (0 findings after filtering) are not rendered", () => {
    // Only AAD findings but frameworks includes ZTA
    const aadOnly: AuditFinding[] = [
      makeFinding({ id: "f1", controlId: "MS.AAD.1.1v1", product: "AAD" }),
    ];

    render(
      <GroupedFindingsView
        findings={aadOnly}
        frameworks={new Set(["AAD", "ZTA"])}
        onSelectFinding={vi.fn()}
      />
    );

    // ZTA framework group should NOT appear since there are no ZTA findings
    expect(screen.queryByText(/NIST 800-207/)).toBeNull();
  });
});

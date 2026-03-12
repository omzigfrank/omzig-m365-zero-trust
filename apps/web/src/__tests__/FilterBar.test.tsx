import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { FilterBar } from "@/components/audit/FilterBar";

afterEach(() => {
  cleanup();
});

function defaultFilters() {
  return {
    frameworks: new Set(["AAD", "ZTA", "80053", "CSF"]),
    severities: new Set(["Critical", "High", "Medium", "Low"]),
    statuses: new Set(["pass", "fail", "warn", "na"]),
    workloads: new Set(["Entra ID"]),
    search: "",
  };
}

describe("FilterBar", () => {
  it("renders Framework, Severity, Status, Workload dropdowns and a search input", () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filters={defaultFilters()}
        onFilterChange={onChange}
        findingCounts={{ total: 50, filtered: 50 }}
      />
    );

    expect(screen.getByText("Framework")).toBeDefined();
    expect(screen.getByText("Severity")).toBeDefined();
    expect(screen.getByText("Status")).toBeDefined();
    expect(screen.getByText("Workload")).toBeDefined();
    expect(screen.getByPlaceholderText("Search controls...")).toBeDefined();
  });

  it("changing framework selection calls onFilterChange with updated frameworks", () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filters={defaultFilters()}
        onFilterChange={onChange}
        findingCounts={{ total: 50, filtered: 50 }}
      />
    );

    // Open the Framework dropdown
    fireEvent.click(screen.getByText("Framework"));

    // Uncheck ZTA
    const ztaCheckbox = screen.getByLabelText("NIST 800-207");
    fireEvent.click(ztaCheckbox);

    expect(onChange).toHaveBeenCalled();
    const call = onChange.mock.calls[0][0];
    expect(call.frameworks.has("ZTA")).toBe(false);
    expect(call.frameworks.has("AAD")).toBe(true);
  });

  it("changing severity selection calls onFilterChange with updated severities", () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filters={defaultFilters()}
        onFilterChange={onChange}
        findingCounts={{ total: 50, filtered: 50 }}
      />
    );

    // Open the Severity dropdown
    fireEvent.click(screen.getByText("Severity"));

    // Uncheck Low
    const lowCheckbox = screen.getByLabelText("Low");
    fireEvent.click(lowCheckbox);

    expect(onChange).toHaveBeenCalled();
    const call = onChange.mock.calls[0][0];
    expect(call.severities.has("Low")).toBe(false);
    expect(call.severities.has("Critical")).toBe(true);
  });

  it("'Clear all' link appears when any non-default filter is active and resets all filters", () => {
    const onChange = vi.fn();
    const nonDefaultFilters = {
      ...defaultFilters(),
      severities: new Set(["Critical", "High"]),
    };

    render(
      <FilterBar
        filters={nonDefaultFilters}
        onFilterChange={onChange}
        findingCounts={{ total: 50, filtered: 30 }}
      />
    );

    const clearAll = screen.getByText("Clear all");
    expect(clearAll).toBeDefined();
    fireEvent.click(clearAll);

    expect(onChange).toHaveBeenCalled();
    const call = onChange.mock.calls[0][0];
    // Should reset to all defaults
    expect(call.severities.size).toBe(4);
    expect(call.frameworks.size).toBe(4);
    expect(call.statuses.size).toBe(4);
    expect(call.search).toBe("");
  });

  it("does not show 'Clear all' when all filters are at defaults", () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filters={defaultFilters()}
        onFilterChange={onChange}
        findingCounts={{ total: 50, filtered: 50 }}
      />
    );

    expect(screen.queryByText("Clear all")).toBeNull();
  });

  it("Workload dropdown shows 'Entra ID' as only option, pre-selected and non-removable (minSelected=1)", () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filters={defaultFilters()}
        onFilterChange={onChange}
        findingCounts={{ total: 50, filtered: 50 }}
      />
    );

    // Open the Workload dropdown
    fireEvent.click(screen.getByText("Workload"));

    // Should see Entra ID option
    const entraCheckbox = screen.getByLabelText("Entra ID");
    expect(entraCheckbox).toBeDefined();
    expect((entraCheckbox as HTMLInputElement).checked).toBe(true);

    // Trying to uncheck should not call onChange (minSelected=1)
    fireEvent.click(entraCheckbox);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows results count", () => {
    render(
      <FilterBar
        filters={defaultFilters()}
        onFilterChange={vi.fn()}
        findingCounts={{ total: 101, filtered: 45 }}
      />
    );

    expect(screen.getByText("Showing 45 of 101 controls")).toBeDefined();
  });
});

"use client";

import { Search } from "lucide-react";
import { MultiSelectDropdown } from "@/components/ui/MultiSelectDropdown";

export interface FilterState {
  frameworks: Set<string>;
  severities: Set<string>;
  statuses: Set<string>;
  workloads: Set<string>;
  search: string;
}

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  findingCounts: { total: number; filtered: number };
}

const FRAMEWORK_OPTIONS = [
  { value: "AAD", label: "CISA SCuBA" },
  { value: "ZTA", label: "NIST 800-207" },
  { value: "80053", label: "NIST 800-53" },
  { value: "CSF", label: "NIST CSF 2.0" },
];

const SEVERITY_OPTIONS = [
  { value: "Critical", label: "Critical" },
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
];

const STATUS_OPTIONS = [
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "warn", label: "Warn" },
  { value: "na", label: "N/A" },
];

const WORKLOAD_OPTIONS = [
  { value: "Entra ID", label: "Entra ID" },
];

const DEFAULT_FRAMEWORKS = new Set(["AAD", "ZTA", "80053", "CSF"]);
const DEFAULT_SEVERITIES = new Set(["Critical", "High", "Medium", "Low"]);
const DEFAULT_STATUSES = new Set(["pass", "fail", "warn", "na"]);

function isDefault(filters: FilterState): boolean {
  return (
    filters.frameworks.size === DEFAULT_FRAMEWORKS.size &&
    [...filters.frameworks].every((f) => DEFAULT_FRAMEWORKS.has(f)) &&
    filters.severities.size === DEFAULT_SEVERITIES.size &&
    [...filters.severities].every((s) => DEFAULT_SEVERITIES.has(s)) &&
    filters.statuses.size === DEFAULT_STATUSES.size &&
    [...filters.statuses].every((s) => DEFAULT_STATUSES.has(s)) &&
    filters.search === ""
  );
}

export function FilterBar({
  filters,
  onFilterChange,
  findingCounts,
}: FilterBarProps) {
  const handleFrameworkChange = (frameworks: Set<string>) => {
    onFilterChange({ ...filters, frameworks });
  };

  const handleSeverityChange = (severities: Set<string>) => {
    onFilterChange({ ...filters, severities });
  };

  const handleStatusChange = (statuses: Set<string>) => {
    onFilterChange({ ...filters, statuses });
  };

  const handleWorkloadChange = (workloads: Set<string>) => {
    onFilterChange({ ...filters, workloads });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ ...filters, search: e.target.value });
  };

  const handleClearAll = () => {
    onFilterChange({
      frameworks: new Set(DEFAULT_FRAMEWORKS),
      severities: new Set(DEFAULT_SEVERITIES),
      statuses: new Set(DEFAULT_STATUSES),
      workloads: new Set(["Entra ID"]),
      search: "",
    });
  };

  const showClearAll = !isDefault(filters);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <MultiSelectDropdown
          label="Framework"
          options={FRAMEWORK_OPTIONS}
          selected={filters.frameworks}
          onChange={handleFrameworkChange}
          minSelected={1}
        />
        <MultiSelectDropdown
          label="Severity"
          options={SEVERITY_OPTIONS}
          selected={filters.severities}
          onChange={handleSeverityChange}
        />
        <MultiSelectDropdown
          label="Status"
          options={STATUS_OPTIONS}
          selected={filters.statuses}
          onChange={handleStatusChange}
        />
        <MultiSelectDropdown
          label="Workload"
          options={WORKLOAD_OPTIONS}
          selected={filters.workloads}
          onChange={handleWorkloadChange}
          minSelected={1}
        />

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search controls..."
            value={filters.search}
            onChange={handleSearchChange}
            className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {showClearAll && (
          <button
            onClick={handleClearAll}
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="text-sm text-gray-500">
        Showing {findingCounts.filtered} of {findingCounts.total} controls
      </div>
    </div>
  );
}

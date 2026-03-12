"use client";

import { useState, useMemo, useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { FindingBadges } from "@/components/audit/FindingBadges";
import { FilterBar, type FilterState } from "@/components/audit/FilterBar";
import { GroupedFindingsView } from "@/components/audit/GroupedFindingsView";
import { FindingDetailDrawer } from "@/components/audit/FindingDetailDrawer";
import { LayoutGrid, List } from "lucide-react";
import type { AuditFinding } from "@/lib/types";

type ViewMode = "grouped" | "flat";

const DEFAULT_FILTER_STATE: FilterState = {
  frameworks: new Set(["AAD", "ZTA", "80053", "CSF"]),
  severities: new Set(["Critical", "High", "Medium", "Low"]),
  statuses: new Set(["pass", "fail", "warn", "na"]),
  workloads: new Set(["Entra ID"]),
  search: "",
};

export function AuditResults({ findings }: { findings: AuditFinding[] }) {
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");
  const [selectedFinding, setSelectedFinding] = useState<AuditFinding | null>(
    null
  );
  const [filters, setFilters] = useState<FilterState>({
    ...DEFAULT_FILTER_STATE,
    frameworks: new Set(DEFAULT_FILTER_STATE.frameworks),
    severities: new Set(DEFAULT_FILTER_STATE.severities),
    statuses: new Set(DEFAULT_FILTER_STATE.statuses),
    workloads: new Set(DEFAULT_FILTER_STATE.workloads),
  });

  // Close drawer when filters change (Pitfall 6)
  useEffect(() => {
    setSelectedFinding(null);
  }, [filters]);

  const filtered = useMemo(() => {
    return findings.filter((finding) => {
      // Framework filter
      if (!filters.frameworks.has(finding.product)) return false;

      // Severity filter
      if (!filters.severities.has(finding.severity)) return false;

      // Status filter
      if (!filters.statuses.has(finding.rating)) return false;

      // Search
      if (filters.search) {
        const q = filters.search.toLowerCase();
        return (
          finding.controlId.toLowerCase().includes(q) ||
          finding.description.toLowerCase().includes(q) ||
          finding.message.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [findings, filters]);

  return (
    <div className="space-y-4">
      {/* View toggle + filter bar */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <FilterBar
            filters={filters}
            onFilterChange={setFilters}
            findingCounts={{ total: findings.length, filtered: filtered.length }}
          />
        </div>

        {/* View toggle buttons */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-1">
          <button
            onClick={() => setViewMode("grouped")}
            aria-label="Grouped view"
            className={`rounded-md p-1.5 transition ${
              viewMode === "grouped"
                ? "bg-blue-100 text-blue-700"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("flat")}
            aria-label="Table view"
            className={`rounded-md p-1.5 transition ${
              viewMode === "flat"
                ? "bg-blue-100 text-blue-700"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Conditional view */}
      {viewMode === "grouped" ? (
        <GroupedFindingsView
          findings={filtered}
          frameworks={filters.frameworks}
          onSelectFinding={setSelectedFinding}
        />
      ) : (
        /* Flat table view (preserved from original) */
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Control
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Finding
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filtered.map((finding) => (
                <tr
                  key={finding.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => setSelectedFinding(finding)}
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge rating={finding.rating} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">
                      {finding.controlId}
                    </div>
                    <FindingBadges finding={finding} />
                  </td>
                  <td className="max-w-md px-4 py-3 text-sm text-gray-600">
                    {finding.message}
                  </td>
                  <td className="max-w-sm px-4 py-3 text-sm text-gray-500">
                    {finding.action || "\u2014"}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-gray-400"
                  >
                    No controls match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Finding detail drawer */}
      <FindingDetailDrawer
        finding={selectedFinding}
        isOpen={selectedFinding !== null}
        onClose={() => setSelectedFinding(null)}
      />
    </div>
  );
}

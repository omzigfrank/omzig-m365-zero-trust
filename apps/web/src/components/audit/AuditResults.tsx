"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { FindingBadges } from "@/components/audit/FindingBadges";
import { FrameworkFilter } from "@/components/audit/FrameworkFilter";
import { Search, Filter } from "lucide-react";
import type { AuditFinding } from "@/lib/types";

type FilterStatus = "all" | "pass" | "fail" | "warn" | "na";

const ALL_FRAMEWORKS = new Set(["AAD", "ZTA", "80053", "CSF"]);

export function AuditResults({ findings }: { findings: AuditFinding[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [frameworkFilter, setFrameworkFilter] = useState<Set<string>>(
    new Set(ALL_FRAMEWORKS)
  );

  const filtered = useMemo(() => {
    return findings.filter((finding) => {
      // Framework filter (multi-select)
      if (!frameworkFilter.has(finding.product)) return false;

      // Status filter
      if (statusFilter !== "all" && finding.rating !== statusFilter)
        return false;

      // Search
      if (search) {
        const q = search.toLowerCase();
        return (
          finding.controlId.toLowerCase().includes(q) ||
          finding.description.toLowerCase().includes(q) ||
          finding.message.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [findings, frameworkFilter, statusFilter, search]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: findings.length };
    for (const finding of findings) {
      counts[finding.rating] = (counts[finding.rating] || 0) + 1;
    }
    return counts;
  }, [findings]);

  return (
    <div className="space-y-4">
      {/* Framework filter */}
      <FrameworkFilter
        selected={frameworkFilter}
        onChange={setFrameworkFilter}
      />

      {/* Status and search filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search controls..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-gray-400" />
          {(["all", "pass", "fail", "warn", "na"] as FilterStatus[]).map(
            (status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  statusFilter === status
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {status === "all" ? "All" : status.toUpperCase()}{" "}
                ({statusCounts[status] || 0})
              </button>
            )
          )}
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-500">
        Showing {filtered.length} of {findings.length} controls
      </div>

      {/* Table */}
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
              <tr key={finding.id} className="hover:bg-gray-50">
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
    </div>
  );
}

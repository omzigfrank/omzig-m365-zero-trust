"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { Search, Filter } from "lucide-react";
import type { AuditCheck, AuditRating, AuditEnvelope } from "@/lib/types";

type FilterStatus = AuditRating | "all";

export function AuditResults({ data }: { data: AuditEnvelope }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [productFilter, setProductFilter] = useState("all");

  const allChecks = useMemo(() => {
    const checks: AuditCheck[] = [];
    for (const report of Object.values(data.reports)) {
      if (report.checks) {
        checks.push(...report.checks);
      }
    }
    return checks;
  }, [data]);

  const products = useMemo(() => {
    const set = new Set<string>();
    for (const check of allChecks) {
      const match = check.name.match(/^(?:\[.*?\]\s*)?(?:MS\.)?(\w+)\./);
      if (match) set.add(match[1]);
    }
    return Array.from(set).sort();
  }, [allChecks]);

  const filtered = useMemo(() => {
    return allChecks.filter((check) => {
      if (statusFilter !== "all" && check.rating !== statusFilter) return false;

      if (productFilter !== "all") {
        const match = check.name.match(
          /^(?:\[.*?\]\s*)?(?:MS\.)?(\w+)\./
        );
        if (match && match[1] !== productFilter) return false;
        if (!match && productFilter !== "NIST") return false;
      }

      if (search) {
        const q = search.toLowerCase();
        return (
          check.name.toLowerCase().includes(q) ||
          check.message.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [allChecks, statusFilter, productFilter, search]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allChecks.length };
    for (const check of allChecks) {
      counts[check.rating] = (counts[check.rating] || 0) + 1;
    }
    return counts;
  }, [allChecks]);

  return (
    <div className="space-y-4">
      {/* Filters */}
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

        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="all">All Products</option>
          {products.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-500">
        Showing {filtered.length} of {allChecks.length} controls
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
            {filtered.map((check, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3">
                  <Badge rating={check.rating} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                  {check.name}
                </td>
                <td className="max-w-md px-4 py-3 text-sm text-gray-600">
                  {check.message}
                </td>
                <td className="max-w-sm px-4 py-3 text-sm text-gray-500">
                  {check.action || "—"}
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

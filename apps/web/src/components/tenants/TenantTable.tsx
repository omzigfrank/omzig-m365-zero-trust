"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { TenantSummary } from "@omzig/shared";
import { HealthDot } from "./HealthDot";
import { Trash2, ArrowUpDown } from "lucide-react";

type SortKey = "displayName" | "primaryDomain" | "status" | "overallScore" | "lastAuditAt" | "health";
type SortDir = "asc" | "desc";

interface TenantTableProps {
  tenants: TenantSummary[];
  onRemove: (id: string) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TenantTable({ tenants, onRemove }: TenantTableProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("displayName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    return [...tenants].sort((a, b) => {
      let cmp = 0;
      const av = a[sortKey];
      const bv = b[sortKey];

      if (av === null && bv === null) cmp = 0;
      else if (av === null) cmp = 1;
      else if (bv === null) cmp = -1;
      else if (typeof av === "string" && typeof bv === "string") {
        cmp = av.localeCompare(bv);
      } else if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }

      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [tenants, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortHeader = ({ label, column }: { label: string; column: SortKey }) => (
    <th
      onClick={() => toggleSort(column)}
      className="cursor-pointer select-none px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 hover:text-gray-700"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </span>
    </th>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <SortHeader label="Name" column="displayName" />
            <SortHeader label="Domain" column="primaryDomain" />
            <SortHeader label="Status" column="status" />
            <SortHeader label="Score" column="overallScore" />
            <SortHeader label="Last Audit" column="lastAuditAt" />
            <SortHeader label="Health" column="health" />
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {sorted.map((tenant) => (
            <tr key={tenant.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <button
                  onClick={() => router.push(`/tenants/${tenant.id}`)}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  {tenant.displayName}
                </button>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {tenant.primaryDomain ?? "--"}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 capitalize">
                  {tenant.status}
                </span>
              </td>
              <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                {tenant.overallScore ?? "--"}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {formatDate(tenant.lastAuditAt)}
              </td>
              <td className="px-4 py-3">
                <HealthDot health={tenant.health} />
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onRemove(tenant.id)}
                  className="rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove ${tenant.displayName}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-8 text-center text-sm text-gray-400"
              >
                No tenants to display.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

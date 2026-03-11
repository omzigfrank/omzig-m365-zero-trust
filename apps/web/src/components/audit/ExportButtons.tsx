"use client";

import { FileText, FileSpreadsheet, FileJson } from "lucide-react";
import type { AuditRunDetail } from "@/lib/types";

export function ExportButtons({ data }: { data: AuditRunDetail }) {
  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `omzig-audit-${data.tenantId || "tenant"}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    const rows = [
      ["Status", "Control", "Product", "Finding", "Action"],
      ...data.findings.map((f) => [
        f.rating,
        f.controlId,
        f.product,
        `"${(f.message || "").replace(/"/g, '""')}"`,
        `"${(f.action || "").replace(/"/g, '""')}"`,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `omzig-audit-${data.tenantId || "tenant"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={downloadJson}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
      >
        <FileJson className="h-4 w-4" />
        JSON
      </button>
      <button
        onClick={downloadCsv}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
      >
        <FileSpreadsheet className="h-4 w-4" />
        CSV
      </button>
      <button
        disabled
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-400 opacity-50"
        title="Coming soon"
      >
        <FileText className="h-4 w-4" />
        PDF
      </button>
    </div>
  );
}

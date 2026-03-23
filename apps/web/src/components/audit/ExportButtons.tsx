"use client";

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
        className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-high px-3 py-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant transition hover:bg-surface-container-highest"
      >
        <span className="material-symbols-outlined text-base">download</span>
        JSON
      </button>
      <button
        onClick={downloadCsv}
        className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-high px-3 py-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant transition hover:bg-surface-container-highest"
      >
        <span className="material-symbols-outlined text-base">table_view</span>
        CSV
      </button>
      <button
        disabled
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90 disabled:opacity-60"
        title="Coming soon"
      >
        <span className="material-symbols-outlined text-base">
          picture_as_pdf
        </span>
        PDF
      </button>
    </div>
  );
}

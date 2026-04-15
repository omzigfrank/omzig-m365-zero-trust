"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { AuditRunDetail, AuditFinding } from "@/lib/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * ~17 column CSV schema for single-tenant audit export. Mirrors the
 * backend csv-export.ts CSV_COLUMNS list (minus the Tenant Name / Tenant
 * ID columns that are only used by the multi-tenant combined export).
 */
interface CsvColumnDef {
  header: string;
  accessor: (
    finding: AuditFinding,
    run: AuditRunDetail,
  ) => string | undefined | null;
}

const CSV_COLUMNS: CsvColumnDef[] = [
  { header: "Audit ID", accessor: (_f, r) => r.id },
  {
    header: "Audit Date",
    accessor: (_f, r) => r.completedAt ?? r.startedAt ?? "",
  },
  { header: "Control ID", accessor: (f) => f.controlId },
  { header: "Product", accessor: (f) => f.product },
  { header: "Description", accessor: (f) => f.description },
  { header: "Requirement Level", accessor: (f) => f.requirementLevel },
  { header: "Severity", accessor: (f) => f.severity },
  { header: "Status", accessor: (f) => f.rating },
  { header: "Message", accessor: (f) => f.message },
  { header: "Action", accessor: (f) => f.action },
  { header: "Setting Name", accessor: (f) => f.settingName },
  { header: "Current Value", accessor: (f) => f.currentValue },
  { header: "Expected Value", accessor: (f) => f.expectedValue },
  { header: "NIST 800-53", accessor: (f) => f.nist80053 },
  { header: "NIST CSF", accessor: (f) => f.nistCsf },
  { header: "ZTA Tenet", accessor: (f) => f.nist800207Tenet },
  { header: "Required Permission", accessor: (f) => f.requiredPermission },
];

function csvField(value: string | undefined | null): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function rowToLine(values: (string | undefined | null)[]): string {
  return values.map(csvField).join(",");
}

export interface ActiveFilters {
  severities?: Set<string>;
  statuses?: Set<string>;
  frameworks?: Set<string>;
  categories?: Set<string>;
}

export interface ExportButtonsProps {
  data: AuditRunDetail;
  tenantId?: string;
  activeFilters?: ActiveFilters;
}

type PdfReportType = "executive" | "full";

export function ExportButtons({
  data,
  tenantId,
  activeFilters,
}: ExportButtonsProps) {
  const { getToken } = useAuth();
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<PdfReportType | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement | null>(null);

  // Click-outside handler for PDF dropdown
  useEffect(() => {
    if (!pdfMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        pdfContainerRef.current &&
        !pdfContainerRef.current.contains(e.target as Node)
      ) {
        setPdfMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pdfMenuOpen]);

  const getFilteredFindings = (): AuditFinding[] => {
    if (!activeFilters) return data.findings;
    return data.findings.filter((f) => {
      if (
        activeFilters.severities &&
        activeFilters.severities.size > 0 &&
        !activeFilters.severities.has(f.severity)
      ) {
        return false;
      }
      if (
        activeFilters.statuses &&
        activeFilters.statuses.size > 0 &&
        !activeFilters.statuses.has(f.rating)
      ) {
        return false;
      }
      if (
        activeFilters.frameworks &&
        activeFilters.frameworks.size > 0 &&
        !activeFilters.frameworks.has(f.product)
      ) {
        return false;
      }
      return true;
    });
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `omzig-audit-${data.tenantId || "tenant"}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    const findings = getFilteredFindings();

    const headerLine = rowToLine(CSV_COLUMNS.map((c) => c.header));
    const dataLines = findings.map((f) =>
      rowToLine(CSV_COLUMNS.map((c) => c.accessor(f, data))),
    );
    const csv = [headerLine, ...dataLines].join("\n") + "\n";

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `findings-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = async (type: PdfReportType) => {
    if (!tenantId) {
      setPdfError("Tenant context required for PDF export");
      return;
    }
    setPdfError(null);
    setPdfLoading(type);
    try {
      const token = await getToken();
      const url = `${API_BASE_URL}/api/tenants/${tenantId}/audits/${data.id}/report?type=${type}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/pdf",
        },
      });
      if (!res.ok) {
        throw new Error(`PDF export failed: ${res.status} ${res.statusText}`);
      }
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `omzig-${type}-report-${data.id}-${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(blobUrl);
      setPdfMenuOpen(false);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "PDF export failed");
    } finally {
      setPdfLoading(null);
    }
  };

  const pdfDisabled = !tenantId;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          onClick={downloadJson}
          className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-700 transition hover:bg-gray-50"
        >
          <span className="material-symbols-outlined text-base">download</span>
          JSON
        </button>
        <button
          onClick={downloadCsv}
          className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-700 transition hover:bg-gray-50"
        >
          <span className="material-symbols-outlined text-base">
            table_view
          </span>
          CSV
        </button>
        <div ref={pdfContainerRef} className="relative">
          <button
            onClick={() => setPdfMenuOpen((open) => !open)}
            disabled={pdfDisabled}
            aria-haspopup="menu"
            aria-expanded={pdfMenuOpen}
            className="inline-flex items-center gap-1.5 rounded bg-omzig-400 px-3 py-2 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-omzig-500 disabled:cursor-not-allowed disabled:opacity-60"
            title={pdfDisabled ? "Tenant context required" : "Export PDF"}
          >
            <span className="material-symbols-outlined text-base">
              picture_as_pdf
            </span>
            PDF
            <ChevronDown className="h-3 w-3" />
          </button>
          {pdfMenuOpen && !pdfDisabled && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
            >
              <button
                role="menuitem"
                onClick={() => downloadPdf("executive")}
                disabled={pdfLoading !== null}
                className="block w-full px-4 py-3 text-left text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="font-medium">
                  {pdfLoading === "executive"
                    ? "Generating..."
                    : "Executive Summary"}
                </div>
                <div className="text-xs text-gray-500">
                  High-level overview for leadership
                </div>
              </button>
              <button
                role="menuitem"
                onClick={() => downloadPdf("full")}
                disabled={pdfLoading !== null}
                className="block w-full border-t border-gray-100 px-4 py-3 text-left text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="font-medium">
                  {pdfLoading === "full"
                    ? "Generating..."
                    : "Full Compliance Report"}
                </div>
                <div className="text-xs text-gray-500">
                  Detailed findings and remediation
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
      {pdfError && (
        <span className="text-xs text-red-600">{pdfError}</span>
      )}
    </div>
  );
}

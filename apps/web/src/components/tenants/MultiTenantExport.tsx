"use client";

import { useState, useEffect } from "react";
import { Download } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Button that downloads a combined multi-tenant findings CSV.
 * Calls GET /api/tenants/export/csv with a Bearer token and streams
 * the response into a Blob for client-side download.
 */
export function MultiTenantExport() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-clear error after 5 seconds
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  const handleExport = async () => {
    setError(null);
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/tenants/export/csv`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/csv",
        },
      });
      if (!res.ok) {
        throw new Error(
          `Failed to export: ${res.status} ${res.statusText || ""}`.trim(),
        );
      }
      const text = await res.text();
      const blob = new Blob([text], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `all-tenants-findings-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to export tenants CSV",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleExport}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Download className="h-4 w-4" />
        {loading ? "Exporting..." : "Export All Tenants CSV"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

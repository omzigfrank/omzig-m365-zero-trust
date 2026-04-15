"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface AuditHistoryPoint {
  auditId: string;
  startedAt: string | null;
  completedAt: string | null;
  status: string;
  duration: number | null;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  overallScore: number;
  frameworkScores: Record<string, number>;
  maturityLevels?: string[];
}

interface UseAuditHistoryResult {
  data: AuditHistoryPoint[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches the audit history for a tenant from
 * GET /api/tenants/:tenantId/audits/history.
 */
export function useAuditHistory(tenantId: string): UseAuditHistoryResult {
  const { getToken } = useAuth();
  const [data, setData] = useState<AuditHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE_URL}/api/tenants/${tenantId}/audits/history`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      if (!res.ok) {
        throw new Error(
          `Failed to fetch audit history: ${res.status} ${res.statusText}`,
        );
      }
      const body = await res.json();
      const rows: AuditHistoryPoint[] = Array.isArray(body)
        ? body
        : (body?.data ?? []);
      setData(rows);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch audit history",
      );
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!tenantId) return;
    void fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  return { data, loading, error, refetch: fetchHistory };
}

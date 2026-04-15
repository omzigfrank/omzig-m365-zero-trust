"use client";

/**
 * useImpactPreview hook -- Phase 7 Plan 03.
 *
 * Fetches POST /api/tenants/:tenantId/remediations/:findingId/preview at
 * wizard-mount time and returns { data, loading, error }. Matches research
 * §4.1: server-side fresh computation, ~2-3s latency budget, no client-side
 * caching (user might have made tenant changes between loads).
 */

import { useEffect, useState } from 'react';

export interface RemediationImpactPreview {
  affectedUserCount: number;
  totalUserCount: number;
  conflictingPolicies: Array<{ id: string; displayName: string }>;
  warnings: string[];
  confidence: 'high' | 'estimated';
  summary: string;
}

export interface UseImpactPreviewResult {
  data: RemediationImpactPreview | null;
  loading: boolean;
  error: string | null;
}

export function useImpactPreview(
  tenantId: string,
  findingId: string | null,
): UseImpactPreviewResult {
  const [data, setData] = useState<RemediationImpactPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!findingId || !tenantId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/tenants/${tenantId}/remediations/${findingId}/preview`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: { message?: string; code?: string };
          };
          throw new Error(
            body.error?.message ?? `Preview failed (${res.status})`,
          );
        }
        const body = (await res.json()) as {
          data: RemediationImpactPreview;
        };
        if (!cancelled) {
          setData(body.data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Preview failed');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantId, findingId]);

  return { data, loading, error };
}

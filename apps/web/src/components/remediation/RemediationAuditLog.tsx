"use client";

/**
 * RemediationAuditLog -- Phase 7 Plan 02.
 *
 * Tenant-scoped table of past remediations with status / classification /
 * approver / timestamps. Each row is expandable to show the beforeSnapshot
 * and afterSnapshot as collapsible JSON blocks. Completed rows show a
 * Rollback button; clicking it first attempts a rollback, and on 409
 * drift_detected surfaces a confirm modal listing the changed fields.
 */

import { Fragment, useCallback, useEffect, useState } from 'react';
import { RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { useRemediation } from '@/hooks/useRemediation';
import { ClassificationBadge } from './ClassificationBadge';

interface RemediationAuditLogProps {
  tenantId: string;
}

interface Row {
  id: string;
  controlId: string;
  classification: 'SAFE' | 'RISKY';
  scopeBundle: string;
  status: string;
  approvedByUserId: string;
  approvedAt: string;
  completedAt: string | null;
  lastAttemptError: string | null;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-700',
  rolled_back: 'bg-purple-100 text-purple-700',
  rollback_failed: 'bg-red-100 text-red-700',
  rollback_partial: 'bg-yellow-100 text-yellow-800',
};

export function RemediationAuditLog({ tenantId }: RemediationAuditLogProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [driftModal, setDriftModal] = useState<{
    jobId: string;
    changedFields: string[];
  } | null>(null);

  const remediation = useRemediation(tenantId);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/tenants/${tenantId}/remediations/history`,
      );
      if (!res.ok) throw new Error(`history fetch failed (${res.status})`);
      const body = (await res.json()) as { data: Row[] };
      setRows(body.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleRollback = async (jobId: string, confirmed: boolean) => {
    try {
      await remediation.rollbackRemediation(jobId, confirmed);
      setDriftModal(null);
      await fetchHistory();
    } catch (err) {
      const maybeDrift = err as Error & { changedFields?: string[] };
      if (maybeDrift?.changedFields?.length) {
        setDriftModal({ jobId, changedFields: maybeDrift.changedFields });
      } else {
        setError(err instanceof Error ? err.message : 'Rollback failed');
      }
    }
  };

  const toggleExpanded = (id: string) => {
    setExpanded((curr) => {
      const next = new Set(curr);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-500">
        Loading remediation history...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
        No remediations have been run on this tenant yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500"></th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Control
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Classification
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Approver
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((row) => {
            const isExpanded = expanded.has(row.id);
            const cls =
              row.classification === 'RISKY' ? 'RISKY' : 'SAFE';
            return (
              <Fragment key={row.id}>
                <tr
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleExpanded(row.id)}
                >
                  <td className="px-4 py-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {new Date(row.approvedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {row.controlId}
                  </td>
                  <td className="px-4 py-3">
                    <ClassificationBadge classification={cls} size="sm" />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_COLOR[row.status] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {row.approvedByUserId}
                  </td>
                  <td className="px-4 py-3">
                    {row.status === 'completed' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRollback(row.id, false);
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        data-testid={`rollback-button-${row.id}`}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Rollback
                      </button>
                    )}
                    {row.status === 'rolled_back' && row.completedAt && (
                      <span className="text-xs text-gray-500">
                        Rolled back at{' '}
                        {new Date(row.completedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="bg-gray-50">
                    <td></td>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="space-y-2">
                        {row.lastAttemptError && (
                          <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                            <strong>Last error:</strong> {row.lastAttemptError}
                          </div>
                        )}
                        <details className="text-xs">
                          <summary className="cursor-pointer font-medium text-gray-700">
                            beforeSnapshot
                          </summary>
                          <pre className="mt-1 overflow-auto rounded bg-white p-2 text-[11px]">
                            {JSON.stringify(row.beforeSnapshot ?? null, null, 2)}
                          </pre>
                        </details>
                        <details className="text-xs">
                          <summary className="cursor-pointer font-medium text-gray-700">
                            afterSnapshot
                          </summary>
                          <pre className="mt-1 overflow-auto rounded bg-white p-2 text-[11px]">
                            {JSON.stringify(row.afterSnapshot ?? null, null, 2)}
                          </pre>
                        </details>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Drift confirmation modal */}
      {driftModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Drift detected
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              This resource has been modified since the remediation ran. The
              following fields have changed:
            </p>
            <ul className="mt-2 list-disc pl-5 text-xs text-gray-700">
              {driftModal.changedFields.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-gray-500">
              Rolling back will discard those changes and restore the
              pre-remediation state.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDriftModal(null)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRollback(driftModal.jobId, true)}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Discard and roll back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

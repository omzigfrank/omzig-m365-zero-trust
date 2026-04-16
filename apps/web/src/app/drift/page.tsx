"use client";

/**
 * Drift alerts page -- Phase 8 Plan 02.
 *
 * Shows cross-tenant drift alerts with tenant selector,
 * filterable alert list, and detail drawer.
 */

import { useState } from "react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { DriftAlertList } from "@/components/drift/DriftAlertList";
import { DriftConfigPanel } from "@/components/drift/DriftConfigPanel";
import { DriftAlertDetail } from "@/components/drift/DriftAlertDetail";
import { useDriftAlerts } from "@/hooks/useDriftAlerts";
import { useTenants } from "@/hooks/useTenants";

export default function DriftPage() {
  const { tenants } = useTenants();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  const activeTenantId =
    selectedTenantId ?? (tenants.length === 1 ? tenants[0].id : null);

  const {
    alerts,
    total,
    loading,
    error,
    severityFilter,
    setSeverityFilter,
    areaFilter,
    setAreaFilter,
    dismissAlert,
  } = useDriftAlerts(activeTenantId);

  const handleAlertSelect = (alertId: string) => {
    setSelectedAlertId(alertId);
  };

  const handleCloseDetail = () => {
    setSelectedAlertId(null);
  };

  const handleDismissFromDetail = async (alertId: string) => {
    await dismissAlert(alertId);
    setSelectedAlertId(null);
  };

  return (
    <AuthGuard>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[28px] text-omzig-400">
            sync_problem
          </span>
          <h1 className="text-2xl font-bold text-gray-900">
            Configuration Drift
          </h1>
          {total > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
              {total}
            </span>
          )}
        </div>

        {/* Tenant selector */}
        {tenants.length > 1 && (
          <div>
            <select
              aria-label="Select tenant"
              value={selectedTenantId ?? ""}
              onChange={(e) =>
                setSelectedTenantId(e.target.value || null)
              }
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <option value="">Select a tenant...</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* No tenant selected message */}
        {!activeTenantId && tenants.length > 1 && (
          <div className="rounded-lg border-2 border-dashed border-gray-300 py-12 text-center">
            <span className="material-symbols-outlined mb-2 block text-[40px] text-gray-300">
              domain
            </span>
            <p className="text-sm text-gray-500">
              Select a tenant to view drift alerts.
            </p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && activeTenantId && (
          <div className="space-y-2">
            <div className="h-12 animate-pulse rounded border border-gray-100 bg-gray-50" />
            <div className="h-12 animate-pulse rounded border border-gray-100 bg-gray-50" />
            <div className="h-12 animate-pulse rounded border border-gray-100 bg-gray-50" />
          </div>
        )}

        {/* Alert list */}
        {!loading && activeTenantId && (
          <DriftAlertList
            alerts={alerts}
            onAlertSelect={handleAlertSelect}
            onDismiss={dismissAlert}
            severityFilter={severityFilter}
            areaFilter={areaFilter}
            onSeverityFilterChange={setSeverityFilter}
            onAreaFilterChange={setAreaFilter}
          />
        )}

        {/* Config panel (only when a specific tenant is selected) */}
        {activeTenantId && (
          <DriftConfigPanel tenantId={activeTenantId} />
        )}

        {/* Detail drawer */}
        {selectedAlertId && activeTenantId && (
          <DriftAlertDetail
            alertId={selectedAlertId}
            tenantId={activeTenantId}
            onClose={handleCloseDetail}
            onDismiss={handleDismissFromDetail}
          />
        )}
      </div>
    </AuthGuard>
  );
}

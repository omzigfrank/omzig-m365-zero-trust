"use client";

import { useState } from "react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { TenantGrid } from "@/components/tenants/TenantGrid";
import { TenantTable } from "@/components/tenants/TenantTable";
import { RemoveTenantModal } from "@/components/tenants/RemoveTenantModal";
import { useTenants } from "@/hooks/useTenants";
import { useActionQueue } from "@/hooks/useActionQueue";
import { ActionQueue } from "@/components/tenants/ActionQueue";
import type { TenantSummary } from "@omzig/shared";
import { LayoutGrid, List, AlertTriangle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

type ViewMode = "grid" | "table";

export default function TenantDashboardPage() {
  const router = useRouter();
  const { tenants, loading, error, removeTenant, refetch } = useTenants();
  const {
    items: actionItems,
    loading: actionLoading,
    dismissItem,
  } = useActionQueue();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedTenant, setSelectedTenant] = useState<TenantSummary | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);

  const handleRemoveClick = (id: string) => {
    const tenant = tenants.find((t) => t.id === id);
    if (tenant) {
      setSelectedTenant(tenant);
      setModalOpen(true);
    }
  };

  const handleConfirmRemove = async () => {
    if (selectedTenant) {
      await removeTenant(selectedTenant.id);
      setModalOpen(false);
      setSelectedTenant(null);
    }
  };

  const handleCancelRemove = () => {
    setModalOpen(false);
    setSelectedTenant(null);
  };

  return (
    <AuthGuard>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
            {tenants.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                {tenants.length}
              </span>
            )}
          </div>

          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-gray-200 bg-white">
            <button
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              className={`rounded-l-lg p-2 transition ${
                viewMode === "grid"
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              aria-label="Table view"
              className={`rounded-r-lg p-2 transition ${
                viewMode === "table"
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Action queue (rendered when tenants are loaded) */}
        {!loading && !error && tenants.length > 0 && (
          <ActionQueue
            items={actionItems}
            onDismiss={dismissItem}
            loading={actionLoading}
          />
        )}

        {/* Loading state */}
        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-48 animate-pulse rounded-lg border border-gray-200 bg-gray-100"
              />
            ))}
            <p className="sr-only">Loading tenants...</p>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <div className="text-sm font-medium text-red-800">
                Failed to fetch tenants
              </div>
              <div className="mt-1 text-sm text-red-700">{error}</div>
              <button
                onClick={refetch}
                className="mt-3 text-sm font-medium text-red-800 underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && tenants.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="text-gray-500">
              No tenants connected. Add your first tenant to get started.
            </p>
            <button
              onClick={() => router.push("/tenants/new")}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" />
              Add Tenant
            </button>
          </div>
        )}

        {/* Content */}
        {!loading && !error && tenants.length > 0 && (
          <>
            {viewMode === "grid" ? (
              <TenantGrid tenants={tenants} onRemove={handleRemoveClick} />
            ) : (
              <TenantTable tenants={tenants} onRemove={handleRemoveClick} />
            )}
          </>
        )}

        {/* Remove modal (single instance) */}
        <RemoveTenantModal
          tenant={selectedTenant}
          isOpen={modalOpen}
          onConfirm={handleConfirmRemove}
          onCancel={handleCancelRemove}
        />
      </div>
    </AuthGuard>
  );
}

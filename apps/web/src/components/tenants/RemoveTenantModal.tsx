"use client";

import { useState } from "react";
import type { TenantSummary } from "@omzig/shared";
import { AlertTriangle, X } from "lucide-react";

interface RemoveTenantModalProps {
  tenant: TenantSummary | null;
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RemoveTenantModal({
  tenant,
  isOpen,
  onConfirm,
  onCancel,
}: RemoveTenantModalProps) {
  const [confirmText, setConfirmText] = useState("");

  if (!isOpen || !tenant) return null;

  const canConfirm = confirmText === tenant.displayName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              Remove Tenant
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-4 text-sm text-gray-600">
          This will remove <strong>{tenant.displayName}</strong> and schedule
          all data for deletion after 30 days.
        </p>

        <div className="mt-4">
          <label
            htmlFor="confirm-name"
            className="block text-sm font-medium text-gray-700"
          >
            Type the tenant name to confirm
          </label>
          <input
            id="confirm-name"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type the tenant name to confirm"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              setConfirmText("");
            }}
            disabled={!canConfirm}
            aria-label="Confirm"
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useRef } from "react";
import { Check, Loader2, AlertTriangle, RefreshCw } from "lucide-react";

interface WizardStepProvisioningProps {
  provisioningStatus: {
    dbCreated: boolean;
    tokenStored: boolean;
    firstAuditTriggered: boolean;
  };
  loading: boolean;
  error: string | null;
  onStartProvisioning: () => Promise<void>;
}

const STEPS = [
  { key: "dbCreated" as const, label: "Creating tenant database" },
  { key: "tokenStored" as const, label: "Storing encrypted credentials" },
  {
    key: "firstAuditTriggered" as const,
    label: "Triggering first compliance audit",
  },
];

export function WizardStepProvisioning({
  provisioningStatus,
  loading,
  error,
  onStartProvisioning,
}: WizardStepProvisioningProps) {
  const startedRef = useRef(false);

  // Auto-trigger provisioning on mount
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      onStartProvisioning();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const completedCount = STEPS.filter(
    (s) => provisioningStatus[s.key],
  ).length;
  const progressPercent = Math.round((completedCount / STEPS.length) * 100);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          Provisioning Tenant
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Setting up the tenant environment. This may take a moment.
        </p>
      </div>

      {/* Checklist */}
      <div className="space-y-3">
        {STEPS.map((step) => {
          const isComplete = provisioningStatus[step.key];
          const isCurrentStep =
            !isComplete &&
            STEPS.findIndex((s) => !provisioningStatus[s.key]) ===
              STEPS.indexOf(step);
          const isInProgress = isCurrentStep && loading && !error;

          return (
            <div key={step.key} className="flex items-center gap-3">
              {isComplete ? (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
                  <Check className="h-4 w-4 text-green-600" />
                </div>
              ) : isInProgress ? (
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              ) : (
                <div className="h-6 w-6 rounded-full border-2 border-gray-200" />
              )}
              <span
                className={`text-sm ${
                  isComplete
                    ? "text-green-700"
                    : isInProgress
                      ? "font-medium text-blue-700"
                      : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <div className="text-sm font-medium text-red-800">
                Provisioning Failed
              </div>
              <div className="mt-1 text-sm text-red-700">{error}</div>
            </div>
          </div>
          <button
            onClick={() => {
              startedRef.current = false;
              onStartProvisioning();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

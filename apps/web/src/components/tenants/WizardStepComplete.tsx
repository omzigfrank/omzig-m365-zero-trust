"use client";

import React from "react";
import { CheckCircle } from "lucide-react";
import Link from "next/link";

interface WizardStepCompleteProps {
  tenantId: string | null;
  displayName: string | null;
  connectionMethod: "oauth" | "gdap" | null;
  onConnectAnother: () => Promise<void>;
}

export function WizardStepComplete({
  tenantId,
  displayName,
  connectionMethod,
  onConnectAnother,
}: WizardStepCompleteProps) {
  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="h-10 w-10 text-green-600" />
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Tenant Connected!
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          The tenant has been successfully connected and provisioned.
        </p>
      </div>

      {/* Summary card */}
      <div className="mx-auto max-w-sm rounded-lg border border-gray-200 bg-gray-50 p-4 text-left">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="font-medium text-gray-600">Tenant Name</dt>
            <dd className="text-gray-900">{displayName || "Unknown"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="font-medium text-gray-600">Connection</dt>
            <dd>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  connectionMethod === "oauth"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-purple-100 text-purple-700"
                }`}
              >
                {connectionMethod === "oauth" ? "OAuth Consent" : "GDAP"}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-3">
        <Link
          href={`/tenants/${tenantId}`}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
        >
          View Tenant Dashboard
        </Link>
        <button
          onClick={onConnectAnother}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Connect Another Tenant
        </button>
        <Link
          href="/tenants"
          className="text-sm text-gray-500 underline hover:text-gray-700"
        >
          Back to All Tenants
        </Link>
      </div>
    </div>
  );
}

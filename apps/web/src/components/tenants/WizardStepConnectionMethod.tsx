"use client";

import React from "react";
import { Key, Shield } from "lucide-react";

interface WizardStepConnectionMethodProps {
  onSelect: (method: "oauth" | "gdap") => Promise<void>;
}

export function WizardStepConnectionMethod({
  onSelect,
}: WizardStepConnectionMethodProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          Connection Method
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Choose how you want to connect this client tenant for auditing.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* OAuth Consent Card */}
        <button
          data-testid="connection-method-oauth"
          onClick={() => onSelect("oauth")}
          className="group relative flex flex-col items-start rounded-xl border-2 border-gray-200 p-6 text-left transition hover:border-blue-400 hover:shadow-md"
        >
          <span className="absolute right-3 top-3 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            Recommended
          </span>
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Key className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            OAuth Consent
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            Generate a consent link for your client's admin to grant audit
            permissions. Best for: remote onboarding, client self-service.
          </p>
        </button>

        {/* GDAP / Lighthouse Card */}
        <button
          data-testid="connection-method-gdap"
          onClick={() => onSelect("gdap")}
          className="group flex flex-col items-start rounded-xl border-2 border-gray-200 p-6 text-left transition hover:border-blue-400 hover:shadow-md"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
            <Shield className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            GDAP / Lighthouse
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            Use your existing GDAP delegated admin relationship from Partner
            Center. Best for: existing Microsoft partners with GDAP access.
          </p>
        </button>
      </div>
    </div>
  );
}

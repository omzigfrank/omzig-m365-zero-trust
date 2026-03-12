"use client";

import React, { useState } from "react";
import { Building2, Globe, Mail, ArrowRight } from "lucide-react";

interface WizardStepTenantDetailsProps {
  onSubmit: (data: {
    displayName: string;
    primaryDomain: string;
    contactEmail: string;
  }) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function WizardStepTenantDetails({
  onSubmit,
  loading,
  error,
}: WizardStepTenantDetailsProps) {
  const [displayName, setDisplayName] = useState("");
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Validate displayName length
    if (displayName.trim().length < 3) {
      setValidationError("Display name must be at least 3 characters");
      return;
    }
    if (displayName.trim().length > 200) {
      setValidationError("Display name must be at most 200 characters");
      return;
    }

    // Validate email format if provided
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      setValidationError("Please enter a valid email address");
      return;
    }

    await onSubmit({
      displayName: displayName.trim(),
      primaryDomain: primaryDomain.trim(),
      contactEmail: contactEmail.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Tenant Details</h2>
        <p className="mt-1 text-sm text-gray-500">
          Enter the basic information for the client tenant you want to connect.
        </p>
      </div>

      <div className="space-y-4">
        {/* Display Name */}
        <div>
          <label
            htmlFor="displayName"
            className="flex items-center gap-2 text-sm font-medium text-gray-700"
          >
            <Building2 className="h-4 w-4" />
            Display Name <span className="text-red-500">*</span>
          </label>
          <input
            id="displayName"
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Contoso Corporation"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            3-200 characters. This name will appear in your tenant list.
          </p>
        </div>

        {/* Primary Domain */}
        <div>
          <label
            htmlFor="primaryDomain"
            className="flex items-center gap-2 text-sm font-medium text-gray-700"
          >
            <Globe className="h-4 w-4" />
            Primary Domain
          </label>
          <input
            id="primaryDomain"
            type="text"
            value={primaryDomain}
            onChange={(e) => setPrimaryDomain(e.target.value)}
            placeholder="contoso.onmicrosoft.com"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Contact Email */}
        <div>
          <label
            htmlFor="contactEmail"
            className="flex items-center gap-2 text-sm font-medium text-gray-700"
          >
            <Mail className="h-4 w-4" />
            Contact Email
          </label>
          <input
            id="contactEmail"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="admin@contoso.com"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Errors */}
      {(validationError || error) && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {validationError || error}
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Creating..." : "Next"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

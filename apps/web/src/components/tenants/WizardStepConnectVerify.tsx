"use client";

import React, { useState } from "react";
import { Copy, ExternalLink, Check, Loader2 } from "lucide-react";
import type { GdapVerificationResult } from "@/lib/tenant-api";

interface WizardStepConnectVerifyProps {
  connectionMethod: "oauth" | "gdap" | null;
  consentUrl: string | null;
  gdapResult: GdapVerificationResult | null;
  loading: boolean;
  error: string | null;
  onGenerateConsent: () => Promise<void>;
  onVerifyGdap: (relationshipId: string) => Promise<void>;
  onAdvanceToProvisioning: () => Promise<void>;
}

export function WizardStepConnectVerify({
  connectionMethod,
  consentUrl,
  gdapResult,
  loading,
  error,
  onGenerateConsent,
  onVerifyGdap,
  onAdvanceToProvisioning,
}: WizardStepConnectVerifyProps) {
  const [relationshipId, setRelationshipId] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!consentUrl) return;
    try {
      await navigator.clipboard.writeText(consentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may not be available in some environments
    }
  };

  if (connectionMethod === "oauth") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Connect via OAuth Consent
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Generate a consent link and share it with your client's M365 admin.
          </p>
        </div>

        {!consentUrl ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <button
              onClick={onGenerateConsent}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Consent Link"
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={consentUrl}
                className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
              />
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                aria-label="Copy link"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <p className="text-sm text-gray-500">
              Send this link to your client's M365 admin. They will sign in and
              grant read-only audit permissions.
            </p>

            <div className="flex gap-3">
              <a
                href={consentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                <ExternalLink className="h-4 w-4" />
                Open Link Myself
              </a>
              <button
                onClick={onAdvanceToProvisioning}
                className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-500"
              >
                <Check className="h-4 w-4" />
                Consent Received
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    );
  }

  // GDAP path
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          Connect via GDAP
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Enter your GDAP relationship ID from Partner Center to verify your
          delegated admin access.
        </p>
      </div>

      {!gdapResult ? (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="gdapRelationshipId"
              className="block text-sm font-medium text-gray-700"
            >
              GDAP Relationship ID
            </label>
            <input
              id="gdapRelationshipId"
              type="text"
              value={relationshipId}
              onChange={(e) => setRelationshipId(e.target.value)}
              placeholder="Enter your GDAP relationship ID from Partner Center"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => onVerifyGdap(relationshipId)}
            disabled={loading || !relationshipId.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify Relationship"
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <h3 className="font-medium text-green-800">
              Relationship Verified
            </h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="font-medium text-gray-600">Customer:</dt>
                <dd className="text-gray-900">{gdapResult.customerDisplayName}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-gray-600">Tenant ID:</dt>
                <dd className="font-mono text-gray-900">
                  {gdapResult.customerTenantId}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-gray-600">Roles:</dt>
                <dd className="text-gray-900">
                  {gdapResult.roles.length} role(s) granted
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-gray-600">Expires:</dt>
                <dd className="text-gray-900">
                  {new Date(gdapResult.expiresAt).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>

          <button
            onClick={onAdvanceToProvisioning}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            Continue to Provisioning
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

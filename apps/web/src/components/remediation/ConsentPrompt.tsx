"use client";

/**
 * ConsentPrompt modal -- Phase 7 Plan 02.
 *
 * Opened when RemediateButton determines the scope bundle has not been
 * consented yet for the current tenant. Shows the scopes being requested
 * and triggers the MSAL popup via useIncrementalConsent.ensureConsent.
 *
 * Copy and UX follow research §2.2: popup (not redirect) + explicit user
 * gesture + clear explanation of what access is being granted.
 */

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { SCOPE_BUNDLES, type ScopeBundleName } from '@/services/remediation-consent';
import { useIncrementalConsent } from '@/hooks/useIncrementalConsent';

interface ConsentPromptProps {
  isOpen: boolean;
  bundle: ScopeBundleName;
  tenantId: string;
  onConsentGranted: () => void;
  onCancel: () => void;
}

const BUNDLE_LABEL: Record<ScopeBundleName, string> = {
  conditionalAccess: 'Conditional Access Policies',
  authMethods: 'Authentication Methods',
  authPolicy: 'Authorization Policy',
  roles: 'Directory Role Management',
  securityDefaults: 'Security Defaults',
};

export function ConsentPrompt({
  isOpen,
  bundle,
  tenantId,
  onConsentGranted,
  onCancel,
}: ConsentPromptProps) {
  const { ensureConsent, isPrompting, error } =
    useIncrementalConsent(tenantId);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAuthorize = async () => {
    setLocalError(null);
    try {
      await ensureConsent(bundle);
      onConsentGranted();
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Consent flow failed',
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-prompt-title"
    >
      <div className="max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-omzig-400" />
          <h3 id="consent-prompt-title" className="text-lg font-semibold text-gray-900">
            Permission required
          </h3>
        </div>

        <p className="mb-4 text-sm text-gray-600">
          Omzig needs permission to write{' '}
          <strong>{BUNDLE_LABEL[bundle]}</strong> settings in this tenant. You
          will see a Microsoft consent popup. After granting permission, the
          remediation will continue automatically.
        </p>

        <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-500">
            Scopes being requested
          </p>
          <ul className="mt-1 space-y-0.5 text-xs font-mono text-gray-700">
            {SCOPE_BUNDLES[bundle].map((scope) => (
              <li key={scope}>{scope}</li>
            ))}
          </ul>
        </div>

        {(error || localError) && (
          <p className="mb-3 text-sm text-red-600">
            {localError ?? error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAuthorize}
            disabled={isPrompting}
            className="rounded-md bg-omzig-400 px-4 py-2 text-sm font-medium text-white hover:bg-omzig-500 disabled:opacity-60"
          >
            {isPrompting ? 'Waiting for Microsoft...' : 'Authorize'}
          </button>
        </div>
      </div>
    </div>
  );
}

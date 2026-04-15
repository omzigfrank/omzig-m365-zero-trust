"use client";

/**
 * WizardStepReportOnly -- Phase 7 Plan 03.
 *
 * Second wizard step after Impact Preview. Explains the Report-Only strategy
 * and triggers the remediation via useRemediation.triggerRemediation. On
 * 202 response advances the wizard (via onDeployed callback) to the Monitor step.
 *
 * Handles CONSENT_REQUIRED by opening ConsentPrompt and retrying.
 */

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { AuditFinding } from '@/lib/types';
import {
  useRemediation,
  ConsentRequiredError,
} from '@/hooks/useRemediation';
import type { ScopeBundleName } from '@/services/remediation-consent';
import { ConsentPrompt } from './ConsentPrompt';

interface WizardStepReportOnlyProps {
  finding: AuditFinding;
  tenantId: string;
  bundle: ScopeBundleName;
  onDeployed: (jobId: string) => void;
  onCancel: () => void;
}

export function WizardStepReportOnly({
  finding,
  tenantId,
  bundle,
  onDeployed,
  onCancel,
}: WizardStepReportOnlyProps) {
  const remediation = useRemediation(tenantId);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const handleDeploy = async () => {
    setLocalError(null);
    setDeploying(true);
    try {
      const result = await remediation.triggerRemediation({
        findingId: finding.id,
        bundle,
      });
      onDeployed(result.remediationJobId);
    } catch (err) {
      if (err instanceof ConsentRequiredError) {
        setShowConsent(true);
      } else {
        setLocalError(
          err instanceof Error ? err.message : 'Failed to deploy Report-Only policy',
        );
      }
    } finally {
      setDeploying(false);
    }
  };

  const handleConsentGranted = async () => {
    setShowConsent(false);
    await handleDeploy();
  };

  return (
    <div className="space-y-4" data-testid="wizard-step-report-only">
      <div className="flex items-start gap-3 rounded-lg bg-blue-50 p-4 ring-1 ring-blue-200">
        <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
        <div>
          <h4 className="text-sm font-semibold text-blue-900">
            Deploy in Report-Only mode
          </h4>
          <p className="mt-1 text-sm text-blue-800">
            Omzig will deploy this policy in <strong>Report-Only</strong> mode.
            It will not block users — instead, Entra ID logs what would have
            happened so you can review the impact before enforcing the policy.
          </p>
        </div>
      </div>

      {localError && (
        <p className="text-sm text-red-600" data-testid="report-only-error">
          {localError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          disabled={deploying}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDeploy}
          disabled={deploying}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          data-testid="deploy-report-only-button"
        >
          {deploying ? 'Deploying...' : 'Deploy in Report-Only'}
        </button>
      </div>

      {showConsent && (
        <ConsentPrompt
          isOpen={showConsent}
          bundle={bundle}
          tenantId={tenantId}
          onConsentGranted={handleConsentGranted}
          onCancel={() => setShowConsent(false)}
        />
      )}
    </div>
  );
}

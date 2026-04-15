"use client";

/**
 * RemediateButton -- Phase 7 Plan 02.
 *
 * One-click remediation trigger for SAFE findings. For RISKY findings it
 * renders disabled with a "Coming soon" tooltip; the guided wizard ships in
 * Plan 07-03.
 *
 * Flow:
 *   1. User clicks "Remediate"
 *   2. Trigger triggerRemediation(findingId, bundle)
 *   3. If the API returns CONSENT_REQUIRED, open ConsentPrompt; retry on grant
 *   4. Show confirm dialog (impact summary). On Approve the job is already
 *      queued so we transition to "in progress" and subscribe to SignalR.
 *   5. Render success / failure state + links
 *
 * The hook owns SignalR subscription and polling fallback.
 */

import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import type { AuditFinding } from '@/lib/types';
import {
  useRemediation,
  ConsentRequiredError,
} from '@/hooks/useRemediation';
import type { ScopeBundleName } from '@/services/remediation-consent';
import { ConsentPrompt } from './ConsentPrompt';
import { RiskyRemediationWizard } from './RiskyRemediationWizard';

interface RemediateButtonProps {
  finding: AuditFinding;
  tenantId: string;
  classification: 'SAFE' | 'RISKY';
  bundle: ScopeBundleName;
  impactSummary?: string;
  onJobCreated?: (jobId: string) => void;
}

export function RemediateButton({
  finding,
  tenantId,
  classification,
  bundle,
  impactSummary,
  onJobCreated,
}: RemediateButtonProps) {
  const remediation = useRemediation(tenantId);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [pendingBundle, setPendingBundle] =
    useState<ScopeBundleName | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  if (classification === 'RISKY') {
    return (
      <div className="inline-block" data-testid="remediate-button-risky">
        <button
          type="button"
          onClick={() => setShowWizard(true)}
          className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
          data-testid="remediate-button-risky-trigger"
        >
          <Wand2 className="h-4 w-4" />
          Remediate (Guided)
        </button>
        <RiskyRemediationWizard
          finding={finding}
          tenantId={tenantId}
          bundle={bundle}
          isOpen={showWizard}
          onClose={() => setShowWizard(false)}
        />
      </div>
    );
  }

  const handleApprove = async () => {
    setLocalError(null);
    try {
      const result = await remediation.triggerRemediation({
        findingId: finding.id,
        bundle,
      });
      setShowConfirm(false);
      onJobCreated?.(result.remediationJobId);
    } catch (err) {
      if (err instanceof ConsentRequiredError) {
        setPendingBundle(err.bundle);
        setShowConsent(true);
        setShowConfirm(false);
      } else {
        setLocalError(
          err instanceof Error ? err.message : 'Remediation failed',
        );
      }
    }
  };

  const handleConsentGranted = async () => {
    setShowConsent(false);
    setPendingBundle(null);
    // Retry the approval now that consent is in place.
    await handleApprove();
  };

  const isRunning =
    remediation.status === 'running' || remediation.status === 'pending';
  const isCompleted = remediation.status === 'completed';
  const isFailed = remediation.status === 'failed';

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={isRunning || isCompleted}
        className="inline-flex items-center gap-2 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        data-testid="remediate-button-safe"
      >
        <Wand2 className="h-4 w-4" />
        {isCompleted ? 'Remediated' : isRunning ? 'Running...' : 'Remediate'}
      </button>

      {(isRunning || isCompleted || isFailed) && (
        <div className="mt-2 text-xs text-gray-600">
          {isRunning && 'Remediation in progress...'}
          {isCompleted && (
            <span className="text-green-700">
              Success. View in the audit log.
            </span>
          )}
          {isFailed && (
            <span className="text-red-700">
              Failed: {remediation.error ?? 'Unknown error'}
            </span>
          )}
        </div>
      )}

      {localError && (
        <p className="mt-2 text-xs text-red-600">{localError}</p>
      )}

      {/* Confirm dialog */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Confirm Remediation
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Omzig will remediate{' '}
              <strong>{finding.controlId}</strong> in the current tenant.
              {impactSummary ? ` ${impactSummary}` : ''}
            </p>
            <p className="mt-3 text-xs text-gray-500">
              This remediation is classified <strong>SAFE</strong>: it is
              reversible and has a bounded blast radius. You can roll it
              back from the Remediation Audit Log.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApprove}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                data-testid="remediate-confirm-approve"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Consent prompt */}
      {showConsent && pendingBundle && (
        <ConsentPrompt
          isOpen={showConsent}
          bundle={pendingBundle}
          tenantId={tenantId}
          onConsentGranted={handleConsentGranted}
          onCancel={() => {
            setShowConsent(false);
            setPendingBundle(null);
          }}
        />
      )}
    </div>
  );
}

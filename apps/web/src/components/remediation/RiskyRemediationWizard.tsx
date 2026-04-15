"use client";

/**
 * RiskyRemediationWizard -- Phase 7 Plan 03.
 *
 * Multi-step modal for RISKY remediations. Orchestrates four wizard steps:
 *   1. Impact Preview (useImpactPreview fetches POST /preview at mount)
 *   2. Deploy Report-Only (via useRemediation.triggerRemediation)
 *   3. Monitor (24h pause + sign-in logs link)
 *   4. Enforce (POST /:jobId/enforce + poll)
 *
 * State is held in component memory; the consent popup is a popup (not a
 * redirect) so wizard state is preserved across the consent prompt per
 * research §2.2.
 */

import { CheckCircle, X } from 'lucide-react';
import type { AuditFinding } from '@/lib/types';
import type { ScopeBundleName } from '@/services/remediation-consent';
import { useImpactPreview } from '@/hooks/useImpactPreview';
import { useRemediationWizard, type WizardStep } from '@/hooks/useRemediationWizard';
import { ImpactPreview } from './ImpactPreview';
import { WizardStepReportOnly } from './WizardStepReportOnly';
import { WizardStepMonitor } from './WizardStepMonitor';
import { WizardStepEnforce } from './WizardStepEnforce';

interface RiskyRemediationWizardProps {
  finding: AuditFinding;
  tenantId: string;
  bundle: ScopeBundleName;
  isOpen: boolean;
  onClose: () => void;
}

const STEP_LABELS: Record<Exclude<WizardStep, 'failed' | 'completed'>, string> =
  {
    impact_preview: 'Impact Preview',
    report_only: 'Deploy Report-Only',
    monitor: 'Monitor',
    enforce: 'Enforce',
  };

const STEP_ORDER: Array<Exclude<WizardStep, 'failed' | 'completed'>> = [
  'impact_preview',
  'report_only',
  'monitor',
  'enforce',
];

export function RiskyRemediationWizard({
  finding,
  tenantId,
  bundle,
  isOpen,
  onClose,
}: RiskyRemediationWizardProps) {
  const wizard = useRemediationWizard();
  const preview = useImpactPreview(tenantId, isOpen ? finding.id : null);

  if (!isOpen) return null;

  const handleClose = () => {
    wizard.reset();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      data-testid="risky-remediation-wizard"
    >
      <div className="max-w-2xl w-full rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Guided Remediation — {finding.controlId}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
            data-testid="wizard-close-button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-3 text-xs">
          {STEP_ORDER.map((s, i) => {
            const currentIdx = STEP_ORDER.indexOf(
              wizard.step === 'completed' ? 'enforce' : wizard.step === 'failed' ? 'enforce' : (wizard.step as any),
            );
            const active = i === currentIdx;
            const done = i < currentIdx;
            return (
              <div
                key={s}
                className={`flex items-center gap-1 ${
                  active
                    ? 'font-semibold text-blue-700'
                    : done
                    ? 'text-green-700'
                    : 'text-gray-400'
                }`}
                data-testid={`wizard-stepper-${s}`}
              >
                {done && <CheckCircle className="h-3 w-3" />}
                {STEP_LABELS[s]}
                {i < STEP_ORDER.length - 1 && (
                  <span className="px-1 text-gray-300">›</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Step body */}
        <div className="space-y-4 px-6 py-5">
          {wizard.step === 'impact_preview' && (
            <div>
              {preview.loading && (
                <p className="text-sm text-gray-500" data-testid="preview-loading">
                  Computing impact preview...
                </p>
              )}
              {preview.error && (
                <p className="text-sm text-red-600" data-testid="preview-error">
                  Failed to load preview: {preview.error}
                </p>
              )}
              {preview.data && <ImpactPreview preview={preview.data} />}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={wizard.advance}
                  disabled={!preview.data}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  data-testid="wizard-advance-button"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {wizard.step === 'report_only' && (
            <WizardStepReportOnly
              finding={finding}
              tenantId={tenantId}
              bundle={bundle}
              onDeployed={(jobId) => {
                wizard.setJobId(jobId);
                wizard.advance();
              }}
              onCancel={handleClose}
            />
          )}

          {wizard.step === 'monitor' && wizard.jobId && (
            <WizardStepMonitor
              jobId={wizard.jobId}
              tenantId={tenantId}
              onReadyToEnforce={wizard.advance}
              onCancel={handleClose}
            />
          )}

          {wizard.step === 'enforce' && wizard.jobId && (
            <WizardStepEnforce
              jobId={wizard.jobId}
              tenantId={tenantId}
              onCompleted={() => wizard.jumpTo('completed')}
              onFailed={(err) => wizard.setError(err)}
              onCancel={handleClose}
            />
          )}

          {wizard.step === 'completed' && (
            <div
              className="space-y-3 text-center"
              data-testid="wizard-step-completed"
            >
              <CheckCircle className="mx-auto h-10 w-10 text-green-600" />
              <h3 className="text-lg font-semibold text-gray-900">
                Remediation Complete
              </h3>
              <p className="text-sm text-gray-600">
                The policy is now enforced. You can roll it back from the
                Remediation Audit Log if needed.
              </p>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Close
              </button>
            </div>
          )}

          {wizard.step === 'failed' && (
            <div className="space-y-3" data-testid="wizard-step-failed">
              <h3 className="text-lg font-semibold text-red-900">
                Remediation Failed
              </h3>
              <p className="text-sm text-red-700">
                {wizard.error ?? 'Unknown error'}
              </p>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

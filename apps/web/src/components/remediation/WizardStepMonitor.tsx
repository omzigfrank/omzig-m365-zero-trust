"use client";

/**
 * WizardStepMonitor -- Phase 7 Plan 03.
 *
 * Third wizard step. Shows monitoring guidance (research §5.3 recommends
 * 24-48 hours of sign-in log review). Renders a deep link to the Entra
 * sign-in logs blade and an "I'm ready to enforce" button gated by an
 * explicit confirmation checkbox, plus a "Skip waiting period" override
 * for advanced users.
 */

import { useState } from 'react';
import { Clock, ExternalLink } from 'lucide-react';

interface WizardStepMonitorProps {
  jobId: string;
  tenantId: string;
  onReadyToEnforce: () => void;
  onCancel: () => void;
}

export function WizardStepMonitor({
  jobId,
  tenantId,
  onReadyToEnforce,
  onCancel,
}: WizardStepMonitorProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [override, setOverride] = useState(false);

  const canProceed = confirmed || override;

  const signInLogsUrl =
    'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/SignInsBlade';

  return (
    <div className="space-y-4" data-testid="wizard-step-monitor">
      <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200">
        <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
        <div>
          <h4 className="text-sm font-semibold text-amber-900">
            Policy deployed in Report-Only
          </h4>
          <p className="mt-1 text-sm text-amber-800">
            The policy is now logging what would have happened, without blocking
            anyone. Microsoft recommends monitoring sign-in logs for at least{' '}
            <strong>24–48 hours</strong> during normal business operations
            before enforcing.
          </p>
        </div>
      </div>

      <div className="rounded-md border border-gray-200 bg-white p-3">
        <a
          href={signInLogsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
          data-testid="sign-in-logs-link"
        >
          Open Entra sign-in logs
          <ExternalLink className="h-3 w-3" />
        </a>
        <p className="mt-1 text-xs text-gray-500">
          Filter by Conditional Access policy to see the impact of the
          Report-Only deployment.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5"
          data-testid="monitor-confirm-checkbox"
        />
        <span className="text-gray-700">
          I confirm I have monitored sign-in logs for at least 24 hours.
        </span>
      </label>

      <div className="text-xs text-gray-500">
        <button
          type="button"
          onClick={() => setOverride((v) => !v)}
          className="text-blue-600 hover:underline"
          data-testid="monitor-override-link"
        >
          {override
            ? 'Re-require monitoring period'
            : 'Skip waiting period (not recommended)'}
        </button>
      </div>

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
          onClick={onReadyToEnforce}
          disabled={!canProceed}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          data-testid="ready-to-enforce-button"
        >
          I&apos;m ready to enforce
        </button>
      </div>

      <p className="text-[10px] text-gray-400">
        Job {jobId} · Tenant {tenantId}
      </p>
    </div>
  );
}

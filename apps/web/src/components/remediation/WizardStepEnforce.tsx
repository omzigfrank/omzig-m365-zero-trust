"use client";

/**
 * WizardStepEnforce -- Phase 7 Plan 03.
 *
 * Fourth wizard step. Shows the final confirm-before-enforce copy and
 * triggers POST /api/tenants/:tenantId/remediations/:jobId/enforce.
 *
 * After POST, polls GET /api/tenants/:tenantId/remediations/:jobId every
 * 3s until status=completed or status=failed. SignalR subscription is
 * provided by the parent via useRemediation if needed.
 */

import { useState } from 'react';
import { Zap } from 'lucide-react';

interface WizardStepEnforceProps {
  jobId: string;
  tenantId: string;
  onCompleted: () => void;
  onFailed: (err: string) => void;
  onCancel: () => void;
}

export function WizardStepEnforce({
  jobId,
  tenantId,
  onCompleted,
  onFailed,
  onCancel,
}: WizardStepEnforceProps) {
  const [enforcing, setEnforcing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleEnforce = async () => {
    setLocalError(null);
    setEnforcing(true);
    try {
      const res = await fetch(
        `/api/tenants/${tenantId}/remediations/${jobId}/enforce`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(
          body.error?.message ?? `Enforcement failed (${res.status})`,
        );
      }
      // Poll for completion.
      await pollUntilCompleted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Enforcement failed';
      setLocalError(msg);
      onFailed(msg);
    } finally {
      setEnforcing(false);
    }
  };

  const pollUntilCompleted = async () => {
    const deadline = Date.now() + 60_000; // 60s cap
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(
        `/api/tenants/${tenantId}/remediations/${jobId}`,
      );
      if (!res.ok) continue;
      const body = (await res.json()) as { data: { status: string } };
      if (body.data.status === 'completed') {
        onCompleted();
        return;
      }
      if (body.data.status === 'failed') {
        throw new Error('Worker reported failure during enforce phase');
      }
    }
    throw new Error('Enforcement timed out after 60 seconds');
  };

  return (
    <div className="space-y-4" data-testid="wizard-step-enforce">
      <div className="flex items-start gap-3 rounded-lg bg-red-50 p-4 ring-1 ring-red-200">
        <Zap className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
        <div>
          <h4 className="text-sm font-semibold text-red-900">
            Enforce the policy
          </h4>
          <p className="mt-1 text-sm text-red-800">
            This will activate the policy. Users matching the policy will be
            evaluated on their next sign-in (within ~1 hour). You can still
            roll back after enforcement from the Remediation Audit Log.
          </p>
        </div>
      </div>

      {localError && (
        <p className="text-sm text-red-600" data-testid="enforce-error">
          {localError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={enforcing}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleEnforce}
          disabled={enforcing}
          className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          data-testid="enforce-now-button"
        >
          {enforcing ? 'Enforcing...' : 'Enforce Now'}
        </button>
      </div>
    </div>
  );
}

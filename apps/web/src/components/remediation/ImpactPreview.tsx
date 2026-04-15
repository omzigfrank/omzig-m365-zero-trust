"use client";

/**
 * ImpactPreview component -- Phase 7 Plan 03.
 *
 * Renders the impact preview JSON from POST /preview with:
 *   - Summary header
 *   - Affected users panel (count + progress bar vs. total)
 *   - Confidence badge (green "High" or yellow "Estimated")
 *   - Warnings list (yellow alert boxes with AlertTriangle icon)
 *   - Conflicting policies list with Entra portal links
 */

import { AlertTriangle, ShieldCheck, Users, ExternalLink } from 'lucide-react';
import type { RemediationImpactPreview } from '@/hooks/useImpactPreview';

interface ImpactPreviewProps {
  preview: RemediationImpactPreview;
}

export function ImpactPreview({ preview }: ImpactPreviewProps) {
  const percent =
    preview.totalUserCount > 0
      ? Math.min(
          100,
          Math.round((preview.affectedUserCount / preview.totalUserCount) * 100),
        )
      : 0;

  return (
    <div className="space-y-5" data-testid="impact-preview">
      {/* Summary header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900">
          {preview.summary}
        </h3>
      </div>

      {/* Confidence badge */}
      <div className="flex items-center gap-2">
        {preview.confidence === 'high' ? (
          <span
            data-testid="confidence-badge-high"
            className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-800 ring-1 ring-green-600/20"
          >
            <ShieldCheck className="h-3 w-3" />
            High Confidence
          </span>
        ) : (
          <span
            data-testid="confidence-badge-estimated"
            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-600/20"
          >
            <AlertTriangle className="h-3 w-3" />
            Estimated
          </span>
        )}
      </div>

      {/* Affected users panel */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Users className="h-4 w-4" />
          Affected Users
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className="text-2xl font-semibold text-gray-900"
            data-testid="affected-user-count"
          >
            {preview.affectedUserCount}
          </span>
          <span className="text-sm text-gray-500">
            of {preview.totalUserCount} users
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full bg-amber-500 transition-all"
            style={{ width: `${percent}%` }}
            data-testid="affected-progress-bar"
          />
        </div>
      </div>

      {/* Warnings list */}
      {preview.warnings.length > 0 && (
        <div className="space-y-2" data-testid="warnings-list">
          {preview.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-md bg-amber-50 p-3 ring-1 ring-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
              <p className="text-sm text-amber-900">{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* Conflicting policies */}
      {preview.conflictingPolicies.length > 0 && (
        <div data-testid="conflicting-policies">
          <h4 className="text-sm font-medium text-gray-700">
            Potentially conflicting CA policies
          </h4>
          <ul className="mt-2 space-y-1">
            {preview.conflictingPolicies.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <a
                  href={`https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess/PolicyBlade/policyId/${p.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                >
                  {p.displayName}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

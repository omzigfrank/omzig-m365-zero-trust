"use client";

import { ExternalLink } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Badge } from "@/components/ui/Badge";
import { FindingBadges } from "@/components/audit/FindingBadges";
import { PowerShellBlock } from "@/components/audit/PowerShellBlock";
import { getRemediationByControlId } from "@omzig/audit";
import type { AuditFinding } from "@/lib/types";

interface FindingDetailDrawerProps {
  finding: AuditFinding | null;
  isOpen: boolean;
  onClose: () => void;
}

const SEVERITY_PILL: Record<string, string> = {
  Critical: "bg-red-100 text-red-700",
  High: "bg-orange-100 text-orange-700",
  Medium: "bg-yellow-100 text-yellow-700",
  Low: "bg-gray-100 text-gray-600",
};

export function FindingDetailDrawer({
  finding,
  isOpen,
  onClose,
}: FindingDetailDrawerProps) {
  if (!finding) return null;

  const remediation = getRemediationByControlId(finding.controlId);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={finding.controlId}>
      <div className="space-y-6">
        {/* Status & Severity */}
        <div className="flex items-center gap-2">
          <Badge rating={finding.rating} />
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              SEVERITY_PILL[finding.severity] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {finding.severity}
          </span>
          <span className="text-xs text-gray-500">
            {finding.requirementLevel}
          </span>
        </div>

        {/* Description */}
        <div>
          <h4 className="text-sm font-semibold text-gray-800">Description</h4>
          <p className="mt-1 text-sm text-gray-600">{finding.description}</p>
        </div>

        {/* Finding */}
        <div>
          <h4 className="text-sm font-semibold text-gray-800">Finding</h4>
          <p className="mt-1 text-sm text-gray-600">{finding.message}</p>
        </div>

        {/* Setting Detail */}
        {finding.settingName && (
          <div>
            <h4 className="text-sm font-semibold text-gray-800">
              Setting Detail
            </h4>
            <table className="mt-2 w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="py-1.5 pr-3 font-medium text-gray-600">
                    Setting
                  </td>
                  <td className="py-1.5 text-gray-800">
                    {finding.settingName}
                  </td>
                </tr>
                {finding.currentValue !== undefined && (
                  <tr>
                    <td className="py-1.5 pr-3 font-medium text-gray-600">
                      Current
                    </td>
                    <td className="py-1.5 text-gray-800">
                      {finding.currentValue}
                    </td>
                  </tr>
                )}
                {finding.expectedValue !== undefined && (
                  <tr>
                    <td className="py-1.5 pr-3 font-medium text-gray-600">
                      Expected
                    </td>
                    <td className="py-1.5 text-gray-800">
                      {finding.expectedValue}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Cross-Framework Mappings */}
        <div>
          <h4 className="text-sm font-semibold text-gray-800">
            Cross-Framework Mappings
          </h4>
          <div className="mt-1">
            <FindingBadges finding={finding} />
          </div>
        </div>

        {/* Remediation */}
        {remediation ? (
          <div>
            <h4 className="text-sm font-semibold text-gray-800">
              Remediation Steps
            </h4>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-gray-600">
              {remediation.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>

            {remediation.estimatedImpact && (
              <div className="mt-3 rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
                <span className="font-medium">Impact:</span>{" "}
                {remediation.estimatedImpact}
              </div>
            )}

            {remediation.notes && (
              <p className="mt-2 text-xs text-gray-500 italic">
                {remediation.notes}
              </p>
            )}

            {/* Admin Portal Link */}
            {remediation.adminPortalUrl && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-gray-800">
                  Admin Portal
                </h4>
                <a
                  href={remediation.adminPortalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  Open in Admin Portal
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}

            {/* PowerShell */}
            {remediation.powershell && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-gray-800">
                  PowerShell
                </h4>
                <div className="mt-2">
                  <PowerShellBlock code={remediation.powershell} />
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Fallback */
          <div>
            <h4 className="text-sm font-semibold text-gray-800">
              Remediation
            </h4>
            <p className="mt-1 text-sm text-gray-600">
              {finding.action || "No remediation guidance available"}
            </p>
          </div>
        )}
      </div>
    </Drawer>
  );
}

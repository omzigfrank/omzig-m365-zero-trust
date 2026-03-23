import { Card } from "@/components/ui/Card";
import type { AuditFinding } from "@/lib/types";

/** NIST 800-53 control family names */
const FAMILY_NAMES: Record<string, string> = {
  AC: "Access Control",
  IA: "Identification & Auth",
  SC: "System & Comms Protection",
  AU: "Audit & Accountability",
  CM: "Configuration Mgmt",
  SI: "System & Info Integrity",
  RA: "Risk Assessment",
};

/** NIST CSF 2.0 function names */
const FUNCTION_NAMES: Record<string, string> = {
  GV: "Govern",
  ID: "Identify",
  PR: "Protect",
  DE: "Detect",
  RS: "Respond",
  RC: "Recover",
};

interface GroupStat {
  code: string;
  name: string;
  pass: number;
  total: number;
  percent: number;
}

function groupFindings(
  findings: AuditFinding[],
  product: string,
  fieldExtractor: (f: AuditFinding) => string | undefined,
  nameMap: Record<string, string>
): GroupStat[] {
  const groups: Record<string, { pass: number; total: number }> = {};

  for (const f of findings) {
    if (f.product !== product) continue;
    const code = fieldExtractor(f);
    if (!code) continue;

    // Extract family/function prefix (e.g., "AC-7" -> "AC", "PR.AC-1" -> "PR")
    const prefix = code.split(/[.-]/)[0];
    if (!groups[prefix]) groups[prefix] = { pass: 0, total: 0 };

    if (f.rating === "pass" || f.rating === "fail") {
      groups[prefix].total++;
      if (f.rating === "pass") groups[prefix].pass++;
    }
  }

  return Object.entries(groups)
    .map(([code, { pass, total }]) => ({
      code,
      name: nameMap[code] ?? code,
      pass,
      total,
      percent: total > 0 ? Math.round((pass / total) * 100) : 0,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

function getBarColor(percent: number): string {
  if (percent >= 85) return "bg-green-500";
  if (percent >= 70) return "bg-yellow-500";
  if (percent >= 50) return "bg-orange-500";
  return "bg-red-500";
}

function BreakdownTable({
  title,
  groups,
}: {
  title: string;
  groups: GroupStat[];
}) {
  if (groups.length === 0) return null;

  return (
    <div>
      <h4 className="mb-3 text-sm font-semibold text-gray-800">{title}</h4>
      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.code} className="flex items-center gap-3">
            <div className="w-8 text-xs font-mono font-medium text-gray-600">
              {g.code}
            </div>
            <div className="w-44 truncate text-xs text-gray-500">{g.name}</div>
            <div className="flex-1">
              <div className="h-2 rounded-full bg-gray-100">
                <div
                  className={`h-2 rounded-full ${getBarColor(g.percent)}`}
                  style={{ width: `${g.percent}%` }}
                />
              </div>
            </div>
            <div className="w-20 text-right text-xs text-gray-600">
              {g.pass}/{g.total} ({g.percent}%)
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FrameworkBreakdown({
  findings,
}: {
  findings: AuditFinding[];
}) {
  const nist80053Groups = groupFindings(
    findings,
    "80053",
    (f) => f.nist80053 ?? f.controlId,
    FAMILY_NAMES
  );

  const csfGroups = groupFindings(
    findings,
    "CSF",
    (f) => f.nistCsf ?? f.controlId,
    FUNCTION_NAMES
  );

  if (nist80053Groups.length === 0 && csfGroups.length === 0) return null;

  return (
    <Card>
      <h3 className="mb-4 text-lg font-semibold text-gray-900">
        Framework Breakdowns
      </h3>
      <div className="grid gap-8 md:grid-cols-2">
        <BreakdownTable
          title="NIST 800-53 by Control Family"
          groups={nist80053Groups}
        />
        <BreakdownTable
          title="CSF 2.0 by Function"
          groups={csfGroups}
        />
      </div>
    </Card>
  );
}

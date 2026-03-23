import type { AuditFinding } from "@/lib/types";

export function FindingBadges({ finding }: { finding: AuditFinding }) {
  const badges: { label: string; className: string }[] = [];

  if (finding.nist80053) {
    badges.push({
      label: `800-53: ${finding.nist80053}`,
      className: "bg-indigo-100 text-indigo-700",
    });
  }

  if (finding.nistCsf) {
    badges.push({
      label: `CSF: ${finding.nistCsf}`,
      className: "bg-teal-100 text-teal-700",
    });
  }

  if (finding.nist800207Tenet) {
    badges.push({
      label: `ZTA: ${finding.nist800207Tenet}`,
      className: "bg-blue-100 text-blue-700",
    });
  }

  if (badges.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {badges.map((badge) => (
        <span
          key={badge.label}
          className={`inline-block rounded-full px-2 py-0.5 text-xs ${badge.className}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

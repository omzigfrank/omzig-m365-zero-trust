"use client";

import { Badge } from "@/components/ui/Badge";
import type { AuditFinding } from "@/lib/types";

interface GroupedFindingsViewProps {
  findings: AuditFinding[];
  frameworks: Set<string>;
  onSelectFinding: (finding: AuditFinding) => void;
}

/** Product code to display name */
const PRODUCT_NAMES: Record<string, string> = {
  AAD: "CISA SCuBA (Entra ID)",
  ZTA: "NIST 800-207 ZTA",
  "80053": "NIST 800-53",
  CSF: "NIST CSF 2.0",
};

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

/** ZTA tenet names */
const TENET_NAMES: Record<string, string> = {
  T1: "Tenet 1: All Data Sources and Computing Services Are Considered Resources",
  T2: "Tenet 2: All Communication Is Secured Regardless of Network Location",
  T3: "Tenet 3: Access to Individual Enterprise Resources Is Granted on a Per-Session Basis",
  T4: "Tenet 4: Access to Resources Is Determined by Dynamic Policy",
  T5: "Tenet 5: Enterprise Monitors and Measures Integrity and Security Posture",
  T6: "Tenet 6: All Resource Authentication and Authorization Are Dynamic and Strictly Enforced",
  T7: "Tenet 7: Enterprise Collects Info About Network Infrastructure and Communications",
};

interface CategoryGroup {
  categoryKey: string;
  categoryName: string;
  findings: AuditFinding[];
  passCount: number;
  failCount: number;
}

interface FrameworkGroup {
  product: string;
  productName: string;
  categories: CategoryGroup[];
}

const SEVERITY_BORDER: Record<string, string> = {
  Critical: "border-l-red-500",
  High: "border-l-orange-500",
  Medium: "border-l-yellow-500",
  Low: "border-l-gray-400",
};

const SEVERITY_PILL: Record<string, string> = {
  Critical: "bg-red-100 text-red-700",
  High: "bg-orange-100 text-orange-700",
  Medium: "bg-yellow-100 text-yellow-700",
  Low: "bg-gray-100 text-gray-600",
};

/**
 * Extract the category key from a control ID based on the product code.
 */
function getCategoryKey(finding: AuditFinding): string {
  const { controlId, product } = finding;

  if (product === "AAD") {
    // MS.AAD.{N}.{M}v1 -> Section N
    const match = controlId.match(/^MS\.AAD\.(\d+)\./);
    return match ? match[1] : "other";
  }

  if (product === "ZTA") {
    // NIST.ZTA.T{N}.{M}v1 -> T{N}
    const match = controlId.match(/^NIST\.ZTA\.(T\d+)\./);
    return match ? match[1] : "other";
  }

  if (product === "80053") {
    // NIST.80053.{FAMILY}-{N}v1 -> {FAMILY}
    const match = controlId.match(/^NIST\.80053\.([A-Z]+)-/);
    return match ? match[1] : "other";
  }

  if (product === "CSF") {
    // NIST.CSF.{FUNCTION}.{category}v1 -> {FUNCTION}
    const match = controlId.match(/^NIST\.CSF\.([A-Z]+)\./);
    return match ? match[1] : "other";
  }

  return "other";
}

/**
 * Get the display name for a category key given the product.
 */
function getCategoryName(product: string, key: string): string {
  if (product === "AAD") return `Section ${key}`;
  if (product === "ZTA") return TENET_NAMES[key] ?? `Tenet ${key.replace("T", "")}`;
  if (product === "80053") return FAMILY_NAMES[key] ?? key;
  if (product === "CSF") return FUNCTION_NAMES[key] ?? key;
  return key;
}

/**
 * Group findings by product then category.
 */
function groupFindings(
  findings: AuditFinding[],
  frameworks: Set<string>
): FrameworkGroup[] {
  const frameworkMap = new Map<string, Map<string, AuditFinding[]>>();

  for (const finding of findings) {
    if (!frameworks.has(finding.product)) continue;

    if (!frameworkMap.has(finding.product)) {
      frameworkMap.set(finding.product, new Map());
    }
    const categoryMap = frameworkMap.get(finding.product)!;
    const catKey = getCategoryKey(finding);

    if (!categoryMap.has(catKey)) {
      categoryMap.set(catKey, []);
    }
    categoryMap.get(catKey)!.push(finding);
  }

  const groups: FrameworkGroup[] = [];

  // Order by framework options order
  for (const product of ["AAD", "ZTA", "80053", "CSF"]) {
    const categoryMap = frameworkMap.get(product);
    if (!categoryMap || categoryMap.size === 0) continue;

    const categories: CategoryGroup[] = [];
    for (const [catKey, catFindings] of categoryMap) {
      const passCount = catFindings.filter((f) => f.rating === "pass").length;
      const failCount = catFindings.filter(
        (f) => f.rating === "fail"
      ).length;

      categories.push({
        categoryKey: catKey,
        categoryName: getCategoryName(product, catKey),
        findings: catFindings,
        passCount,
        failCount,
      });
    }

    // Sort categories by key
    categories.sort((a, b) => a.categoryKey.localeCompare(b.categoryKey));

    groups.push({
      product,
      productName: PRODUCT_NAMES[product] ?? product,
      categories,
    });
  }

  return groups;
}

function CategorySection({
  category,
  onSelectFinding,
}: {
  category: CategoryGroup;
  onSelectFinding: (finding: AuditFinding) => void;
}) {
  return (
    <details className="group border border-gray-200 rounded-lg" open>
      <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-t-lg select-none">
        <span className="text-sm font-medium text-gray-800">
          {category.categoryName}
        </span>
        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          {category.passCount} pass
        </span>
        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
          {category.failCount} fail
        </span>
        <span className="text-xs text-gray-500">
          ({category.findings.length} total)
        </span>
      </summary>
      <div className="divide-y divide-gray-100">
        {category.findings.map((finding) => (
          <div
            key={finding.id}
            data-finding-id={finding.id}
            onClick={() => onSelectFinding(finding)}
            className={`flex cursor-pointer items-center gap-3 border-l-4 px-4 py-2.5 hover:bg-blue-50 transition ${
              SEVERITY_BORDER[finding.severity] ?? "border-l-gray-300"
            }`}
          >
            <Badge rating={finding.rating} />
            <span className="text-sm font-mono font-medium text-gray-700">
              {finding.controlId}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                SEVERITY_PILL[finding.severity] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {finding.severity}
            </span>
            <span className="flex-1 truncate text-sm text-gray-600">
              {finding.message}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

export function GroupedFindingsView({
  findings,
  frameworks,
  onSelectFinding,
}: GroupedFindingsViewProps) {
  const groups = groupFindings(findings, frameworks);

  if (groups.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-400">
        No controls match your filters.
      </div>
    );
  }

  // Determine if we have a single framework
  const activeProducts = new Set(findings.map((f) => f.product));
  const singleFramework = activeProducts.size === 1;

  if (singleFramework) {
    // Skip framework level, render categories directly
    const categories = groups[0].categories;
    return (
      <div className="space-y-3">
        {categories.map((cat) => (
          <CategorySection
            key={cat.categoryKey}
            category={cat}
            onSelectFinding={onSelectFinding}
          />
        ))}
      </div>
    );
  }

  // Multiple frameworks: two-level grouping
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.product}>
          <h3 className="mb-3 text-base font-semibold text-gray-900">
            {group.productName}
          </h3>
          <div className="space-y-3">
            {group.categories.map((cat) => (
              <CategorySection
                key={`${group.product}-${cat.categoryKey}`}
                category={cat}
                onSelectFinding={onSelectFinding}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

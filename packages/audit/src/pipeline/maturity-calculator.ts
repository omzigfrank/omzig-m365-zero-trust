/**
 * Maturity calculator with severity-weighted scoring.
 *
 * Computes per-tenet maturity levels based on NIST 800-207 ZTA tenets.
 * Severity weights: Critical=4, High=3, Medium=2, Low=1
 *
 * Thresholds (configurable):
 *   Traditional < 40, Initial 40-69, Advanced 70-89, Optimal >= 90
 */

// ========================================================================
// Types
// ========================================================================

export type MaturityLevel = 'Traditional' | 'Initial' | 'Advanced' | 'Optimal';

export interface TenetMaturity {
  tenet: string;
  tenetName: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  passRate: number;
  weightedPassRate: number;
  maturityLevel: MaturityLevel;
}

export interface MaturitySnapshot {
  tenets: TenetMaturity[];
  overallWeightedAverage: number;
  overallMaturityLevel: MaturityLevel;
  weakestTenet: TenetMaturity;
}

export interface MaturityThresholds {
  traditional: number;
  initial: number;
  advanced: number;
  optimal: number;
}

// ========================================================================
// Constants
// ========================================================================

export const SEVERITY_WEIGHTS: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

export const DEFAULT_THRESHOLDS: MaturityThresholds = {
  traditional: 0,
  initial: 40,
  advanced: 70,
  optimal: 90,
};

export const TENET_NAMES: Record<string, string> = {
  T1: 'All Resources',
  T2: 'Communication Security',
  T3: 'Per-Session Access',
  T4: 'Dynamic Policy',
  T5: 'Asset Integrity Monitoring',
  T6: 'Authentication & Authorization',
  T7: 'Continuous Improvement',
};

// ========================================================================
// Functions
// ========================================================================

/**
 * Determine maturity level from a severity-weighted pass rate.
 */
export function calculateMaturityLevel(
  weightedPassRate: number,
  thresholds: MaturityThresholds = DEFAULT_THRESHOLDS,
): MaturityLevel {
  if (weightedPassRate >= thresholds.optimal) return 'Optimal';
  if (weightedPassRate >= thresholds.advanced) return 'Advanced';
  if (weightedPassRate >= thresholds.initial) return 'Initial';
  return 'Traditional';
}

/**
 * Compute a full maturity snapshot from ZTA findings.
 *
 * Groups findings by nist800207Tenet, computes severity-weighted pass rates,
 * and returns per-tenet data plus overall averages.
 *
 * Only 'pass' and 'fail' ratings count toward totals.
 * 'warn' and 'na' are excluded from pass/fail counts.
 * Findings without nist800207Tenet are skipped.
 */
export function calculateMaturitySnapshot(
  ztaFindings: Array<{ rating: string; severity: string; nist800207Tenet?: string }>,
  thresholds?: MaturityThresholds,
): MaturitySnapshot {
  // Group findings by tenet, filtering out those without a tenet
  const tenetMap = new Map<string, Array<{ rating: string; severity: string }>>();

  for (const finding of ztaFindings) {
    if (!finding.nist800207Tenet) continue;
    const tenet = finding.nist800207Tenet;
    if (!tenetMap.has(tenet)) {
      tenetMap.set(tenet, []);
    }
    tenetMap.get(tenet)!.push(finding);
  }

  // Compute per-tenet maturity
  const tenets: TenetMaturity[] = [];

  for (const [tenet, findings] of tenetMap) {
    // Only count pass/fail (exclude warn, na)
    const scorable = findings.filter((f) => f.rating === 'pass' || f.rating === 'fail');

    const passedChecks = scorable.filter((f) => f.rating === 'pass').length;
    const failedChecks = scorable.filter((f) => f.rating === 'fail').length;
    const totalChecks = passedChecks + failedChecks;

    const passRate = totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 0;

    // Severity-weighted pass rate
    let totalWeight = 0;
    let passingWeight = 0;

    for (const f of scorable) {
      const weight = SEVERITY_WEIGHTS[f.severity] ?? 1;
      totalWeight += weight;
      if (f.rating === 'pass') {
        passingWeight += weight;
      }
    }

    const weightedPassRate = totalWeight > 0 ? (passingWeight / totalWeight) * 100 : 0;

    tenets.push({
      tenet,
      tenetName: TENET_NAMES[tenet] ?? tenet,
      totalChecks,
      passedChecks,
      failedChecks,
      passRate,
      weightedPassRate,
      maturityLevel: calculateMaturityLevel(weightedPassRate, thresholds),
    });
  }

  // Sort tenets by tenet ID for consistency
  tenets.sort((a, b) => a.tenet.localeCompare(b.tenet));

  // Overall weighted average across all tenets
  const overallWeightedAverage =
    tenets.length > 0
      ? tenets.reduce((sum, t) => sum + t.weightedPassRate, 0) / tenets.length
      : 0;

  const overallMaturityLevel = calculateMaturityLevel(overallWeightedAverage, thresholds);

  // Weakest tenet = lowest weightedPassRate
  const weakestTenet =
    tenets.length > 0
      ? tenets.reduce((min, t) => (t.weightedPassRate < min.weightedPassRate ? t : min), tenets[0])
      : {
          tenet: 'N/A',
          tenetName: 'N/A',
          totalChecks: 0,
          passedChecks: 0,
          failedChecks: 0,
          passRate: 0,
          weightedPassRate: 0,
          maturityLevel: 'Traditional' as MaturityLevel,
        };

  return {
    tenets,
    overallWeightedAverage,
    overallMaturityLevel,
    weakestTenet,
  };
}

// ========================================================================
// Framework score computation
// ========================================================================

export interface FrameworkScore {
  total: number;
  pass: number;
  fail: number;
  warn: number;
  na: number;
  score: number;
}

/**
 * Compute per-framework compliance scores from a flat findings array.
 * Groups by product, counts pass/fail/warn/na, computes score = pass/(pass+fail)*100.
 */
export function computeFrameworkScores(
  findings: Array<{ product: string; rating: string }>,
): Record<string, FrameworkScore> {
  const result: Record<string, FrameworkScore> = {};

  for (const finding of findings) {
    if (!result[finding.product]) {
      result[finding.product] = { total: 0, pass: 0, fail: 0, warn: 0, na: 0, score: 0 };
    }

    const fw = result[finding.product];
    fw.total++;

    switch (finding.rating) {
      case 'pass':
        fw.pass++;
        break;
      case 'fail':
        fw.fail++;
        break;
      case 'warn':
        fw.warn++;
        break;
      case 'na':
        fw.na++;
        break;
    }
  }

  // Compute score for each framework
  for (const fw of Object.values(result)) {
    const denominator = fw.pass + fw.fail;
    fw.score = denominator > 0 ? (fw.pass / denominator) * 100 : 0;
  }

  return result;
}

import { describe, it, expect } from 'vitest';
import {
  calculateMaturityLevel,
  calculateMaturitySnapshot,
  SEVERITY_WEIGHTS,
  DEFAULT_THRESHOLDS,
  TENET_NAMES,
  type MaturityLevel,
  type MaturitySnapshot,
  type TenetMaturity,
  type MaturityThresholds,
} from '../pipeline/maturity-calculator.js';

describe('calculateMaturityLevel', () => {
  it('returns Traditional for 0%', () => {
    expect(calculateMaturityLevel(0)).toBe('Traditional');
  });

  it('returns Traditional for 39%', () => {
    expect(calculateMaturityLevel(39)).toBe('Traditional');
  });

  it('returns Initial for 40%', () => {
    expect(calculateMaturityLevel(40)).toBe('Initial');
  });

  it('returns Initial for 69%', () => {
    expect(calculateMaturityLevel(69)).toBe('Initial');
  });

  it('returns Advanced for 70%', () => {
    expect(calculateMaturityLevel(70)).toBe('Advanced');
  });

  it('returns Advanced for 89%', () => {
    expect(calculateMaturityLevel(89)).toBe('Advanced');
  });

  it('returns Optimal for 90%', () => {
    expect(calculateMaturityLevel(90)).toBe('Optimal');
  });

  it('returns Optimal for 100%', () => {
    expect(calculateMaturityLevel(100)).toBe('Optimal');
  });

  it('supports custom thresholds', () => {
    const custom: MaturityThresholds = {
      traditional: 0,
      initial: 50,
      advanced: 80,
      optimal: 95,
    };
    expect(calculateMaturityLevel(49, custom)).toBe('Traditional');
    expect(calculateMaturityLevel(50, custom)).toBe('Initial');
    expect(calculateMaturityLevel(80, custom)).toBe('Advanced');
    expect(calculateMaturityLevel(95, custom)).toBe('Optimal');
  });
});

describe('SEVERITY_WEIGHTS', () => {
  it('Critical weighs 4x', () => {
    expect(SEVERITY_WEIGHTS.Critical).toBe(4);
  });

  it('High weighs 3x', () => {
    expect(SEVERITY_WEIGHTS.High).toBe(3);
  });

  it('Medium weighs 2x', () => {
    expect(SEVERITY_WEIGHTS.Medium).toBe(2);
  });

  it('Low weighs 1x', () => {
    expect(SEVERITY_WEIGHTS.Low).toBe(1);
  });
});

describe('TENET_NAMES', () => {
  it('maps T1 through T7', () => {
    expect(Object.keys(TENET_NAMES)).toHaveLength(7);
    expect(TENET_NAMES.T1).toBeDefined();
    expect(TENET_NAMES.T7).toBeDefined();
  });
});

describe('calculateMaturitySnapshot', () => {
  it('returns correct snapshot for T4 example: 6 checks, 1 Critical fail -> 76% -> Advanced', () => {
    // T4 example from research:
    // 6 checks: 2 Critical(4), 2 High(3), 1 Medium(2), 1 Low(1)
    // Total weight: 4+4+3+3+2+1 = 17
    // 1 Critical fails -> passing weight: 4+3+3+2+1 = 13
    // weightedPassRate = 13/17 * 100 = 76.47...
    const findings = [
      { rating: 'pass', severity: 'Critical', nist800207Tenet: 'T4' },
      { rating: 'fail', severity: 'Critical', nist800207Tenet: 'T4' },
      { rating: 'pass', severity: 'High', nist800207Tenet: 'T4' },
      { rating: 'pass', severity: 'High', nist800207Tenet: 'T4' },
      { rating: 'pass', severity: 'Medium', nist800207Tenet: 'T4' },
      { rating: 'pass', severity: 'Low', nist800207Tenet: 'T4' },
    ];

    const snapshot = calculateMaturitySnapshot(findings);
    const t4 = snapshot.tenets.find((t) => t.tenet === 'T4')!;

    expect(t4).toBeDefined();
    expect(t4.totalChecks).toBe(6);
    expect(t4.passedChecks).toBe(5);
    expect(t4.failedChecks).toBe(1);
    expect(t4.passRate).toBeCloseTo(83.33, 0);
    expect(t4.weightedPassRate).toBeCloseTo(76.47, 0);
    expect(t4.maturityLevel).toBe('Advanced');
  });

  it('Critical (4x) weighs more than Low (1x) in severity weighting', () => {
    // 2 checks, both same tenet: 1 Critical pass, 1 Low fail
    // Weighted pass = 4 / (4+1) = 80%
    const findingsA = [
      { rating: 'pass', severity: 'Critical', nist800207Tenet: 'T1' },
      { rating: 'fail', severity: 'Low', nist800207Tenet: 'T1' },
    ];

    // Compare with: 1 Critical fail, 1 Low pass
    // Weighted pass = 1 / (4+1) = 20%
    const findingsB = [
      { rating: 'fail', severity: 'Critical', nist800207Tenet: 'T1' },
      { rating: 'pass', severity: 'Low', nist800207Tenet: 'T1' },
    ];

    const snapshotA = calculateMaturitySnapshot(findingsA);
    const snapshotB = calculateMaturitySnapshot(findingsB);

    const t1A = snapshotA.tenets.find((t) => t.tenet === 'T1')!;
    const t1B = snapshotB.tenets.find((t) => t.tenet === 'T1')!;

    // Passing a Critical check matters more
    expect(t1A.weightedPassRate).toBeGreaterThan(t1B.weightedPassRate);
    expect(t1A.weightedPassRate).toBeCloseTo(80, 0);
    expect(t1B.weightedPassRate).toBeCloseTo(20, 0);
  });

  it('computes overall weighted average across multiple tenets', () => {
    const findings = [
      // T1: 1 pass (High) => weighted 100%
      { rating: 'pass', severity: 'High', nist800207Tenet: 'T1' },
      // T2: 1 fail (High) => weighted 0%
      { rating: 'fail', severity: 'High', nist800207Tenet: 'T2' },
    ];

    const snapshot = calculateMaturitySnapshot(findings);
    // Average of 100% and 0% = 50%
    expect(snapshot.overallWeightedAverage).toBeCloseTo(50, 0);
    expect(snapshot.overallMaturityLevel).toBe('Initial');
  });

  it('identifies weakest tenet', () => {
    const findings = [
      { rating: 'pass', severity: 'High', nist800207Tenet: 'T1' },
      { rating: 'pass', severity: 'High', nist800207Tenet: 'T2' },
      { rating: 'fail', severity: 'High', nist800207Tenet: 'T3' },
    ];

    const snapshot = calculateMaturitySnapshot(findings);
    expect(snapshot.weakestTenet.tenet).toBe('T3');
    expect(snapshot.weakestTenet.weightedPassRate).toBe(0);
  });

  it('handles empty findings array', () => {
    const snapshot = calculateMaturitySnapshot([]);
    expect(snapshot.tenets).toHaveLength(0);
    expect(snapshot.overallWeightedAverage).toBe(0);
    expect(snapshot.overallMaturityLevel).toBe('Traditional');
  });

  it('handles all pass scenario', () => {
    const findings = [
      { rating: 'pass', severity: 'Critical', nist800207Tenet: 'T1' },
      { rating: 'pass', severity: 'High', nist800207Tenet: 'T1' },
      { rating: 'pass', severity: 'Medium', nist800207Tenet: 'T1' },
    ];

    const snapshot = calculateMaturitySnapshot(findings);
    const t1 = snapshot.tenets.find((t) => t.tenet === 'T1')!;
    expect(t1.weightedPassRate).toBe(100);
    expect(t1.maturityLevel).toBe('Optimal');
    expect(snapshot.overallMaturityLevel).toBe('Optimal');
  });

  it('handles all fail scenario', () => {
    const findings = [
      { rating: 'fail', severity: 'Critical', nist800207Tenet: 'T1' },
      { rating: 'fail', severity: 'High', nist800207Tenet: 'T1' },
    ];

    const snapshot = calculateMaturitySnapshot(findings);
    const t1 = snapshot.tenets.find((t) => t.tenet === 'T1')!;
    expect(t1.weightedPassRate).toBe(0);
    expect(t1.maturityLevel).toBe('Traditional');
  });

  it('uses custom thresholds parameter', () => {
    const findings = [
      { rating: 'pass', severity: 'High', nist800207Tenet: 'T1' },
    ];
    const custom: MaturityThresholds = {
      traditional: 0,
      initial: 50,
      advanced: 80,
      optimal: 95,
    };
    // 100% pass rate with custom threshold: 100 >= 95 -> Optimal
    const snapshot = calculateMaturitySnapshot(findings, custom);
    const t1 = snapshot.tenets.find((t) => t.tenet === 'T1')!;
    expect(t1.maturityLevel).toBe('Optimal');
  });

  it('excludes warn and na findings from pass/fail counts', () => {
    const findings = [
      { rating: 'pass', severity: 'High', nist800207Tenet: 'T1' },
      { rating: 'warn', severity: 'Medium', nist800207Tenet: 'T1' },
      { rating: 'na', severity: 'Low', nist800207Tenet: 'T1' },
    ];

    const snapshot = calculateMaturitySnapshot(findings);
    const t1 = snapshot.tenets.find((t) => t.tenet === 'T1')!;
    // Only 1 pass, 0 fail -- warn/na excluded
    expect(t1.totalChecks).toBe(1);
    expect(t1.passedChecks).toBe(1);
    expect(t1.failedChecks).toBe(0);
    expect(t1.weightedPassRate).toBe(100);
  });

  it('skips findings without nist800207Tenet', () => {
    const findings = [
      { rating: 'pass', severity: 'High', nist800207Tenet: undefined },
      { rating: 'pass', severity: 'High', nist800207Tenet: 'T1' },
    ];

    const snapshot = calculateMaturitySnapshot(findings);
    expect(snapshot.tenets).toHaveLength(1);
    expect(snapshot.tenets[0].tenet).toBe('T1');
  });
});

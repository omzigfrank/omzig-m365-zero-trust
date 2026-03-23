import { describe, it, expect } from 'vitest';
import { computeFrameworkScores } from '../pipeline/maturity-calculator.js';

describe('computeFrameworkScores', () => {
  it('computes correct per-framework scores from mixed findings', () => {
    const findings = [
      { product: 'AAD', rating: 'pass' },
      { product: 'AAD', rating: 'fail' },
      { product: 'AAD', rating: 'pass' },
      { product: 'ZTA', rating: 'pass' },
      { product: 'ZTA', rating: 'pass' },
      { product: '80053', rating: 'fail' },
      { product: 'CSF', rating: 'pass' },
      { product: 'CSF', rating: 'warn' },
      { product: 'CSF', rating: 'na' },
    ];

    const scores = computeFrameworkScores(findings);

    // AAD: 2 pass, 1 fail => score = 2/(2+1)*100 = 66.67
    expect(scores.AAD.pass).toBe(2);
    expect(scores.AAD.fail).toBe(1);
    expect(scores.AAD.total).toBe(3);
    expect(scores.AAD.score).toBeCloseTo(66.67, 0);

    // ZTA: 2 pass, 0 fail => score = 100
    expect(scores.ZTA.pass).toBe(2);
    expect(scores.ZTA.fail).toBe(0);
    expect(scores.ZTA.total).toBe(2);
    expect(scores.ZTA.score).toBe(100);

    // 80053: 0 pass, 1 fail => score = 0
    expect(scores['80053'].pass).toBe(0);
    expect(scores['80053'].fail).toBe(1);
    expect(scores['80053'].total).toBe(1);
    expect(scores['80053'].score).toBe(0);

    // CSF: 1 pass, 0 fail, 1 warn, 1 na => score = 1/(1+0)*100 = 100
    expect(scores.CSF.pass).toBe(1);
    expect(scores.CSF.fail).toBe(0);
    expect(scores.CSF.warn).toBe(1);
    expect(scores.CSF.na).toBe(1);
    expect(scores.CSF.total).toBe(3);
    expect(scores.CSF.score).toBe(100);
  });

  it('returns empty object for empty findings array', () => {
    const scores = computeFrameworkScores([]);
    expect(Object.keys(scores)).toHaveLength(0);
  });

  it('handles single-framework findings', () => {
    const findings = [
      { product: 'ZTA', rating: 'pass' },
      { product: 'ZTA', rating: 'fail' },
      { product: 'ZTA', rating: 'pass' },
    ];

    const scores = computeFrameworkScores(findings);
    expect(Object.keys(scores)).toHaveLength(1);
    expect(scores.ZTA.pass).toBe(2);
    expect(scores.ZTA.fail).toBe(1);
    expect(scores.ZTA.score).toBeCloseTo(66.67, 0);
  });

  it('handles all-pass scenario', () => {
    const findings = [
      { product: 'AAD', rating: 'pass' },
      { product: 'AAD', rating: 'pass' },
      { product: 'AAD', rating: 'pass' },
    ];

    const scores = computeFrameworkScores(findings);
    expect(scores.AAD.score).toBe(100);
    expect(scores.AAD.pass).toBe(3);
    expect(scores.AAD.fail).toBe(0);
  });

  it('handles all-fail scenario', () => {
    const findings = [
      { product: 'AAD', rating: 'fail' },
      { product: 'AAD', rating: 'fail' },
    ];

    const scores = computeFrameworkScores(findings);
    expect(scores.AAD.score).toBe(0);
    expect(scores.AAD.pass).toBe(0);
    expect(scores.AAD.fail).toBe(2);
  });

  it('handles all-na scenario (no pass or fail)', () => {
    const findings = [
      { product: 'CSF', rating: 'na' },
      { product: 'CSF', rating: 'na' },
    ];

    const scores = computeFrameworkScores(findings);
    // No pass or fail => score = 0 (0/(0+0))
    expect(scores.CSF.score).toBe(0);
    expect(scores.CSF.na).toBe(2);
    expect(scores.CSF.pass).toBe(0);
    expect(scores.CSF.fail).toBe(0);
  });

  it('correctly counts totals per framework including warn and na', () => {
    const findings = [
      { product: 'AAD', rating: 'pass' },
      { product: 'AAD', rating: 'warn' },
      { product: 'AAD', rating: 'na' },
      { product: 'AAD', rating: 'fail' },
    ];

    const scores = computeFrameworkScores(findings);
    expect(scores.AAD.total).toBe(4);
    expect(scores.AAD.pass).toBe(1);
    expect(scores.AAD.fail).toBe(1);
    expect(scores.AAD.warn).toBe(1);
    expect(scores.AAD.na).toBe(1);
    // score = 1/(1+1)*100 = 50
    expect(scores.AAD.score).toBe(50);
  });
});

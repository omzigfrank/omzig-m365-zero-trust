/**
 * NIST CSF 2.0 Govern (GV) function evaluators.
 * 1 advisory evaluator -- organizational governance cannot be audited via Graph API.
 *
 * These are INDEPENDENT evaluators -- NOT derived from CISA or ZTA results.
 */
import type { EvaluatorFn } from '../types.js';

/**
 * GV.OC-1 -- Organizational Context
 * Always returns 'warn' (advisory) -- organizational governance policies,
 * risk management strategy, and stakeholder expectations are not auditable
 * via Microsoft Graph API.
 */
export const evaluateCSF_GV_OC1: EvaluatorFn = (_facts) => {
  return {
    rating: 'warn',
    message: 'Organizational governance context requires manual review -- not auditable via Graph API.',
    action: 'Document organizational context, risk appetite, and stakeholder expectations per GV.OC-1.',
    settingName: 'Organizational Context',
    currentValue: 'Not auditable',
    expectedValue: 'Manual governance documentation',
  };
};

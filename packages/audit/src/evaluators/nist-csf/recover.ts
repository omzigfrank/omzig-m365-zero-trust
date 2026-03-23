/**
 * NIST CSF 2.0 Recover (RC) function evaluators.
 * 1 advisory evaluator -- recovery planning cannot be audited via Graph API.
 *
 * These are INDEPENDENT evaluators -- NOT derived from CISA or ZTA results.
 */
import type { EvaluatorFn } from '../types.js';

/**
 * RC.RP-1 -- Recovery Planning
 * Always returns 'warn' (advisory) -- disaster recovery plans, backup procedures,
 * and recovery time objectives are not auditable via Microsoft Graph API.
 */
export const evaluateCSF_RC_RP1: EvaluatorFn = (_facts) => {
  return {
    rating: 'warn',
    message: 'Recovery planning requires manual review -- not auditable via Graph API.',
    action: 'Document recovery plans, backup procedures, and recovery time objectives per RC.RP-1.',
    settingName: 'Recovery Planning',
    currentValue: 'Not auditable',
    expectedValue: 'Manual recovery documentation',
  };
};

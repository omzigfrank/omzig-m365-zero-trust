/**
 * NIST 800-53 RA (Risk Assessment) evaluators.
 * 1 control: RA-5
 *
 * INDEPENDENT: These are NOT derived from CISA evaluator results.
 */
import type { EvaluatorFn } from '../types.js';

/** RA-5: Vulnerability Assessment -- pass when P2 (Identity Protection risk detection) */
export const evaluate80053_RA5: EvaluatorFn = (facts) => {
  if (!facts.licenses.available) {
    return {
      rating: 'na',
      message: 'License data unavailable.',
      action: 'Grant Organization.Read.All permission.',
      settingName: 'Vulnerability Assessment (RA-5)',
      currentValue: 'Unknown',
      expectedValue: 'Entra ID P2 for risk detection',
      requiredPermission: 'Organization.Read.All',
    };
  }
  if (facts.licenses.hasP2) {
    return {
      rating: 'pass',
      message: 'Entra ID P2 licensed -- Identity Protection risk detection and vulnerability signals available.',
      settingName: 'Vulnerability Assessment (RA-5)',
      currentValue: 'P2 licensed',
      expectedValue: 'Entra ID P2',
    };
  }
  return {
    rating: 'warn',
    message: 'No Entra ID P2; vulnerability assessment via Identity Protection unavailable.',
    action: 'Consider Entra ID P2 for risk-based vulnerability detection and assessment.',
    settingName: 'Vulnerability Assessment (RA-5)',
    currentValue: 'No P2 license',
    expectedValue: 'Entra ID P2',
  };
};

/**
 * MS.AAD.1.1v1 — Legacy authentication SHALL be blocked.
 * Ported from CisaEvaluatorRegistry.ps1 lines 14-44.
 */
import type { EvaluatorFn } from '../types.js';

export const evaluateAAD_1_1: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'fail',
      message: 'Could not retrieve CA policies.',
      settingName: 'Conditional Access - Legacy Auth Block',
      currentValue: 'Unknown',
      expectedValue: 'CA policy blocking legacy auth',
      requiredPermission: 'Policy.Read.All',
    };
  }

  for (const pol of facts.conditionalAccess.policies) {
    if (pol.state === 'disabled') continue;
    const conditions = pol.conditions;
    const grants = pol.grantControls;
    if (!conditions?.clientAppTypes || !grants?.builtInControls) continue;

    const hasLegacy = conditions.clientAppTypes.some(
      (t) => t === 'exchangeActiveSync' || t === 'other',
    );
    if (hasLegacy && grants.builtInControls.includes('block')) {
      return {
        rating: 'pass',
        message: 'A CA policy blocks legacy authentication.',
        settingName: 'Conditional Access - Legacy Auth Block',
        currentValue: `Policy "${pol.displayName}" blocks legacy auth`,
        expectedValue: 'CA policy blocking legacy auth',
      };
    }
  }

  return {
    rating: 'fail',
    message: 'No CA policy found that blocks legacy authentication.',
    action: 'Create a CA policy targeting legacy client app types with a Block grant control.',
    settingName: 'Conditional Access - Legacy Auth Block',
    currentValue: 'No blocking policy found',
    expectedValue: 'CA policy blocking legacy auth',
  };
};

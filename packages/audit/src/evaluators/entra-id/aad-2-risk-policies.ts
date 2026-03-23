/**
 * MS.AAD.2.x — Risk-Based Policies
 * Ported from CisaEvaluatorRegistry.ps1 lines 47-92.
 */
import type { EvaluatorFn } from '../types.js';

/** MS.AAD.2.1v1 — Users detected as high risk SHALL be blocked. */
export const evaluateAAD_2_1: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'fail',
      message: 'Could not retrieve CA policies.',
      settingName: 'Conditional Access - User Risk Policy',
      currentValue: 'Unknown',
      expectedValue: 'CA policy targeting high user risk',
      requiredPermission: 'Policy.Read.All',
    };
  }
  if (!facts.licenses.hasP2) {
    return {
      rating: 'na',
      message: 'Requires Entra ID P2 for risk-based policies.',
      action: 'Add Entra ID P2 licensing to enable Identity Protection.',
      settingName: 'Conditional Access - User Risk Policy',
      currentValue: 'No P2 license',
      expectedValue: 'Entra ID P2 license',
    };
  }

  for (const pol of facts.conditionalAccess.policies) {
    if (pol.state === 'disabled') continue;
    if (pol.conditions?.userRiskLevels && pol.conditions.userRiskLevels.length > 0) {
      return {
        rating: 'pass',
        message: 'A CA policy addresses user risk levels.',
        settingName: 'Conditional Access - User Risk Policy',
        currentValue: `Policy "${pol.displayName}" targets user risk`,
        expectedValue: 'CA policy targeting high user risk',
      };
    }
  }

  return {
    rating: 'fail',
    message: 'No CA policy found targeting user risk levels.',
    action: 'Create a CA policy that blocks or requires password change for high-risk users.',
    settingName: 'Conditional Access - User Risk Policy',
    currentValue: 'No user risk policy found',
    expectedValue: 'CA policy targeting high user risk',
  };
};

/** MS.AAD.2.3v1 — Sign-ins detected as high risk SHALL be blocked. */
export const evaluateAAD_2_3: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'fail',
      message: 'Could not retrieve CA policies.',
      settingName: 'Conditional Access - Sign-In Risk Policy',
      currentValue: 'Unknown',
      expectedValue: 'CA policy targeting high sign-in risk',
      requiredPermission: 'Policy.Read.All',
    };
  }
  if (!facts.licenses.hasP2) {
    return {
      rating: 'na',
      message: 'Requires Entra ID P2 for risk-based policies.',
      action: 'Add Entra ID P2 licensing to enable Identity Protection.',
      settingName: 'Conditional Access - Sign-In Risk Policy',
      currentValue: 'No P2 license',
      expectedValue: 'Entra ID P2 license',
    };
  }

  for (const pol of facts.conditionalAccess.policies) {
    if (pol.state === 'disabled') continue;
    if (pol.conditions?.signInRiskLevels && pol.conditions.signInRiskLevels.length > 0) {
      return {
        rating: 'pass',
        message: 'A CA policy addresses sign-in risk levels.',
        settingName: 'Conditional Access - Sign-In Risk Policy',
        currentValue: `Policy "${pol.displayName}" targets sign-in risk`,
        expectedValue: 'CA policy targeting high sign-in risk',
      };
    }
  }

  return {
    rating: 'fail',
    message: 'No CA policy found targeting sign-in risk levels.',
    action: 'Create a CA policy that blocks or requires MFA for high-risk sign-ins.',
    settingName: 'Conditional Access - Sign-In Risk Policy',
    currentValue: 'No sign-in risk policy found',
    expectedValue: 'CA policy targeting high sign-in risk',
  };
};

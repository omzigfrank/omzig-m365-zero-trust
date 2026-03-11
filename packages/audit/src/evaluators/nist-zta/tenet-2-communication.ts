/**
 * NIST 800-207 Tenet 2: All communication is secured regardless of network location.
 * (Encryption Everywhere)
 * Ported from NistEvaluatorRegistry.ps1 lines 67-153.
 */
import type { EvaluatorFn } from '../types.js';

/** T2.1 -- Legacy authentication blocked */
export const evaluateZTA_T2_1: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'fail',
      message: 'Could not verify legacy authentication blocking.',
      action: 'Verify CA policy read permissions.',
      settingName: 'Legacy Auth Blocked',
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
        message: 'CA policy blocks legacy authentication protocols.',
        settingName: 'Legacy Auth Blocked',
        currentValue: `Policy "${pol.displayName}" blocks legacy auth`,
        expectedValue: 'CA policy blocking legacy auth',
      };
    }
  }

  return {
    rating: 'fail',
    message: 'No CA policy blocks legacy authentication.',
    action: 'Block legacy auth to ensure all communication uses modern encrypted protocols.',
    settingName: 'Legacy Auth Blocked',
    currentValue: 'No blocking policy found',
    expectedValue: 'CA policy blocking legacy auth',
  };
};

/** T2.2 -- Security defaults vs CA strategy */
export const evaluateZTA_T2_2: EvaluatorFn = (facts) => {
  if (!facts.securityDefaults.available || !facts.conditionalAccess.available) {
    return {
      rating: 'fail',
      message: 'Could not determine security baseline strategy.',
      action: 'Verify access to security defaults and CA policy data.',
      settingName: 'Security Baseline Strategy',
      currentValue: 'Unknown',
      expectedValue: 'CA policies active or security defaults enabled',
      requiredPermission: 'Policy.Read.All',
    };
  }

  if (facts.conditionalAccess.totalPolicies > 0 && !facts.securityDefaults.enabled) {
    return {
      rating: 'pass',
      message: `Using Conditional Access (${facts.conditionalAccess.totalPolicies} policies). Security defaults disabled.`,
      settingName: 'Security Baseline Strategy',
      currentValue: `${facts.conditionalAccess.totalPolicies} CA policies, security defaults off`,
      expectedValue: 'CA policies active or security defaults enabled',
    };
  }
  if (facts.securityDefaults.enabled && facts.conditionalAccess.totalPolicies > 0) {
    return {
      rating: 'warn',
      message: 'Security defaults enabled alongside CA policies -- potential conflict.',
      action: 'Disable security defaults when using Conditional Access.',
      settingName: 'Security Baseline Strategy',
      currentValue: 'Security defaults + CA policies both active',
      expectedValue: 'CA policies active or security defaults enabled',
    };
  }
  if (facts.securityDefaults.enabled) {
    return {
      rating: 'warn',
      message: 'Security defaults enabled (basic baseline). Consider CA for granular control.',
      action: 'Upgrade to Conditional Access policies for full ZTA control.',
      settingName: 'Security Baseline Strategy',
      currentValue: 'Security defaults only',
      expectedValue: 'CA policies active',
    };
  }

  return {
    rating: 'fail',
    message: 'Neither security defaults nor CA policies are active.',
    action: 'Enable security defaults or deploy Conditional Access policies.',
    settingName: 'Security Baseline Strategy',
    currentValue: 'No baseline active',
    expectedValue: 'CA policies active or security defaults enabled',
  };
};

/** T2.3 -- Named locations don't grant blanket trust */
export const evaluateZTA_T2_3: EvaluatorFn = (facts) => {
  if (!facts.namedLocations.available || !facts.conditionalAccess.available) {
    return {
      rating: 'na',
      message: 'Could not evaluate named location trust configuration.',
      settingName: 'Network Trust Posture',
      currentValue: 'Unknown',
      expectedValue: 'No trusted named locations',
    };
  }

  const trustedCount = facts.namedLocations.locations.filter((l) => l.isTrusted).length;
  if (trustedCount === 0) {
    return {
      rating: 'pass',
      message: 'No trusted named locations configured -- no network-based trust bypass.',
      settingName: 'Network Trust Posture',
      currentValue: '0 trusted locations',
      expectedValue: 'No trusted named locations',
    };
  }
  return {
    rating: 'warn',
    message: `${trustedCount} trusted named location(s) configured.`,
    action: 'Review trusted locations to ensure they don\'t bypass MFA or other controls.',
    settingName: 'Network Trust Posture',
    currentValue: `${trustedCount} trusted locations`,
    expectedValue: 'No trusted named locations',
  };
};

/** T2.4 -- Modern auth enforced */
export const evaluateZTA_T2_4: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available || !facts.licenses.available) {
    return {
      rating: 'na',
      message: 'Could not verify modern auth enforcement.',
      settingName: 'Modern Auth Enforcement',
      currentValue: 'Unknown',
      expectedValue: 'CA policies active with qualifying license',
    };
  }

  if (facts.conditionalAccess.totalPolicies > 0 && facts.licenses.hasQualifyingSku) {
    return {
      rating: 'pass',
      message: 'CA policies active with qualifying license -- modern auth enforced.',
      settingName: 'Modern Auth Enforcement',
      currentValue: `${facts.conditionalAccess.totalPolicies} CA policies, qualifying SKU`,
      expectedValue: 'CA policies active with qualifying license',
    };
  }
  return {
    rating: 'warn',
    message: 'Verify modern authentication is enforced for all workloads.',
    action: 'Ensure CA policies enforce modern authentication across Exchange, SharePoint, and Teams.',
    settingName: 'Modern Auth Enforcement',
    currentValue: 'Conditions not met',
    expectedValue: 'CA policies active with qualifying license',
  };
};

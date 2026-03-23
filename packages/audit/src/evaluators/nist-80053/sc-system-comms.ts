/**
 * NIST 800-53 SC (System and Communications Protection) evaluators.
 * 3 controls: SC-7, SC-8, SC-13
 *
 * INDEPENDENT: These are NOT derived from CISA evaluator results.
 */
import type { EvaluatorFn } from '../types.js';

/** SC-7: Boundary Protection -- pass when legacy auth blocked */
export const evaluate80053_SC7: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'na',
      message: 'Conditional Access data unavailable.',
      action: 'Grant Policy.Read.All permission.',
      settingName: 'Boundary Protection (SC-7)',
      currentValue: 'Unknown',
      expectedValue: 'Legacy authentication blocked via CA policy',
      requiredPermission: 'Policy.Read.All',
    };
  }
  const hasLegacyBlock = facts.conditionalAccess.policies.some((p) => {
    if (p.state !== 'enabled') return false;
    const legacyClients = p.conditions?.clientAppTypes ?? [];
    const isLegacy = legacyClients.includes('exchangeActiveSync') || legacyClients.includes('other');
    const blocks = p.grantControls?.builtInControls?.includes('block');
    return isLegacy && blocks;
  });
  if (hasLegacyBlock) {
    return {
      rating: 'pass',
      message: 'Legacy authentication blocked via CA policy (boundary protection).',
      settingName: 'Boundary Protection (SC-7)',
      currentValue: 'Legacy auth blocked',
      expectedValue: 'Legacy authentication blocked via CA policy',
    };
  }
  return {
    rating: 'fail',
    message: 'No CA policy blocks legacy authentication protocols.',
    action: 'Create a CA policy blocking legacy authentication (exchangeActiveSync, other).',
    settingName: 'Boundary Protection (SC-7)',
    currentValue: 'Legacy auth not blocked',
    expectedValue: 'Legacy authentication blocked via CA policy',
  };
};

/** SC-8: Transmission Confidentiality -- pass when modern auth enforced (implies TLS) */
export const evaluate80053_SC8: EvaluatorFn = (facts) => {
  if (!facts.authMethods.available) {
    return {
      rating: 'na',
      message: 'Authentication methods data unavailable.',
      action: 'Grant Policy.Read.All permission.',
      settingName: 'Transmission Confidentiality (SC-8)',
      currentValue: 'Unknown',
      expectedValue: 'Modern auth enforced (migration complete)',
      requiredPermission: 'Policy.Read.All',
    };
  }
  if (facts.authMethods.migrationState === 'migrationComplete') {
    return {
      rating: 'pass',
      message: 'Modern authentication enforced (migration complete); TLS is implied.',
      settingName: 'Transmission Confidentiality (SC-8)',
      currentValue: 'migrationComplete',
      expectedValue: 'migrationComplete',
    };
  }
  return {
    rating: 'warn',
    message: `Auth methods migration state: ${facts.authMethods.migrationState ?? 'unknown'}; modern auth not fully enforced.`,
    action: 'Complete authentication methods migration to enforce modern auth and TLS.',
    settingName: 'Transmission Confidentiality (SC-8)',
    currentValue: facts.authMethods.migrationState ?? 'unknown',
    expectedValue: 'migrationComplete',
  };
};

/** SC-13: Cryptographic Protection -- pass when auth strength uses phishing-resistant methods */
export const evaluate80053_SC13: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'na',
      message: 'Conditional Access data unavailable.',
      action: 'Grant Policy.Read.All permission.',
      settingName: 'Cryptographic Protection (SC-13)',
      currentValue: 'Unknown',
      expectedValue: 'Phishing-resistant auth strength configured',
      requiredPermission: 'Policy.Read.All',
    };
  }
  const hasPhishingResistant = facts.conditionalAccess.policies.some((p) => {
    if (p.state !== 'enabled') return false;
    return p.grantControls?.authenticationStrength != null;
  });
  if (hasPhishingResistant) {
    return {
      rating: 'pass',
      message: 'CA policy requires authentication strength (phishing-resistant cryptographic method).',
      settingName: 'Cryptographic Protection (SC-13)',
      currentValue: 'Auth strength configured',
      expectedValue: 'Phishing-resistant auth strength configured',
    };
  }
  return {
    rating: 'warn',
    message: 'No CA policy uses authentication strength requirement.',
    action: 'Add authentication strength (phishing-resistant MFA) to CA policies.',
    settingName: 'Cryptographic Protection (SC-13)',
    currentValue: 'No auth strength policy',
    expectedValue: 'Phishing-resistant auth strength configured',
  };
};

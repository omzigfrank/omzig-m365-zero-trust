/**
 * NIST CSF 2.0 Detect (DE) function evaluators.
 * 5 evaluators covering continuous monitoring, adverse event analysis, and correlation.
 *
 * These are INDEPENDENT evaluators -- NOT derived from CISA or ZTA results.
 */
import type { EvaluatorFn } from '../types.js';

/**
 * DE.CM-1 -- Continuous Monitoring Networks
 * Pass when qualifying SKU provides audit logging capability,
 * fail when no qualifying SKU.
 */
export const evaluateCSF_DE_CM1: EvaluatorFn = (facts) => {
  if (!facts.licenses.available) {
    return {
      rating: 'na',
      message: 'License data unavailable.',
      action: 'Grant Organization.Read.All permission to evaluate monitoring capability.',
      settingName: 'Audit Logging SKU',
      currentValue: 'Unknown',
      expectedValue: 'Qualifying SKU with audit logging',
      requiredPermission: 'Organization.Read.All',
    };
  }
  if (facts.licenses.hasQualifyingSku) {
    return {
      rating: 'pass',
      message: 'Qualifying SKU provides audit logging capability for continuous monitoring.',
      settingName: 'Audit Logging SKU',
      currentValue: 'Qualifying SKU present',
      expectedValue: 'Qualifying SKU with audit logging',
    };
  }
  return {
    rating: 'fail',
    message: 'No qualifying SKU found -- audit logging may be limited.',
    action: 'Obtain a qualifying M365 SKU (E3/E5/A5) with audit logging per DE.CM-1.',
    settingName: 'Audit Logging SKU',
    currentValue: 'No qualifying SKU',
    expectedValue: 'Qualifying SKU with audit logging',
  };
};

/**
 * DE.CM-3 -- Continuous Monitoring Personnel
 * Pass when MFA coverage >= 95%, warn 80-94%, fail < 80%.
 */
export const evaluateCSF_DE_CM3: EvaluatorFn = (facts) => {
  if (!facts.mfa.available) {
    return {
      rating: 'na',
      message: 'MFA registration data unavailable.',
      action: 'Grant Reports.Read.All permission to evaluate MFA coverage.',
      settingName: 'MFA Coverage',
      currentValue: 'Unknown',
      expectedValue: '>= 95% MFA registration',
      requiredPermission: 'Reports.Read.All',
    };
  }
  const pct = facts.mfa.percentage;
  if (pct >= 95) {
    return {
      rating: 'pass',
      message: `MFA coverage at ${pct}% -- meets personnel monitoring threshold.`,
      settingName: 'MFA Coverage',
      currentValue: `${pct}%`,
      expectedValue: '>= 95%',
    };
  }
  if (pct >= 80) {
    return {
      rating: 'warn',
      message: `MFA coverage at ${pct}% -- below 95% target.`,
      action: 'Increase MFA adoption to >= 95% per DE.CM-3.',
      settingName: 'MFA Coverage',
      currentValue: `${pct}%`,
      expectedValue: '>= 95%',
    };
  }
  return {
    rating: 'fail',
    message: `MFA coverage at ${pct}% -- critically low.`,
    action: 'Urgently increase MFA registration to at least 80% per DE.CM-3.',
    settingName: 'MFA Coverage',
    currentValue: `${pct}%`,
    expectedValue: '>= 95%',
  };
};

/**
 * DE.CM-6 -- Monitoring for Unauthorized Activity
 * Pass when risk-based CA policies exist (userRiskLevels or signInRiskLevels),
 * warn when no risk-based policies found.
 */
export const evaluateCSF_DE_CM6: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'na',
      message: 'Conditional Access data unavailable.',
      action: 'Grant Policy.Read.All permission to evaluate risk monitoring.',
      settingName: 'Risk-Based CA Policies',
      currentValue: 'Unknown',
      expectedValue: 'Risk-based CA policies active',
      requiredPermission: 'Policy.Read.All',
    };
  }
  const riskPolicies = facts.conditionalAccess.policies.filter(
    (p) =>
      (p.state === 'enabled' || p.state === 'enabledForReportingButNotEnforced') &&
      ((p.conditions?.userRiskLevels?.length ?? 0) > 0 || (p.conditions?.signInRiskLevels?.length ?? 0) > 0),
  );
  if (riskPolicies.length > 0) {
    return {
      rating: 'pass',
      message: `${riskPolicies.length} risk-based CA policy(ies) monitor for unauthorized activity.`,
      settingName: 'Risk-Based CA Policies',
      currentValue: `${riskPolicies.length} risk policies`,
      expectedValue: 'At least 1 risk-based CA policy',
    };
  }
  return {
    rating: 'warn',
    message: 'No risk-based CA policies found.',
    action: 'Create CA policies with user/sign-in risk conditions per DE.CM-6.',
    settingName: 'Risk-Based CA Policies',
    currentValue: '0 risk-based policies',
    expectedValue: 'At least 1 risk-based CA policy',
  };
};

/**
 * DE.AE-2 -- Adverse Event Analysis
 * Pass when P2 licensed (enables Identity Protection risk detections),
 * warn when no P2.
 */
export const evaluateCSF_DE_AE2: EvaluatorFn = (facts) => {
  if (!facts.licenses.available) {
    return {
      rating: 'na',
      message: 'License data unavailable.',
      action: 'Grant Organization.Read.All permission to evaluate adverse event analysis capability.',
      settingName: 'Identity Protection (P2)',
      currentValue: 'Unknown',
      expectedValue: 'Entra ID P2 licensed',
      requiredPermission: 'Organization.Read.All',
    };
  }
  if (facts.licenses.hasP2) {
    return {
      rating: 'pass',
      message: 'Entra ID P2 licensed -- Identity Protection risk detection available for adverse event analysis.',
      settingName: 'Identity Protection (P2)',
      currentValue: 'P2 licensed',
      expectedValue: 'Entra ID P2 licensed',
    };
  }
  return {
    rating: 'warn',
    message: 'No Entra ID P2 license -- Identity Protection risk detection unavailable.',
    action: 'License Entra ID P2 to enable risk-based analysis per DE.AE-2.',
    settingName: 'Identity Protection (P2)',
    currentValue: 'No P2 license',
    expectedValue: 'Entra ID P2 licensed',
  };
};

/**
 * DE.AE-3 -- Correlation
 * Pass when >= 5 telemetry sources, warn 3-4, fail < 3.
 * Telemetry sources: qualifying SKU, P2, Intune, Defender for O365, Defender for Endpoint.
 */
export const evaluateCSF_DE_AE3: EvaluatorFn = (facts) => {
  if (!facts.licenses.available) {
    return {
      rating: 'na',
      message: 'License data unavailable.',
      action: 'Grant Organization.Read.All permission to evaluate telemetry correlation.',
      settingName: 'Telemetry Correlation Sources',
      currentValue: 'Unknown',
      expectedValue: '>= 5 telemetry sources',
      requiredPermission: 'Organization.Read.All',
    };
  }
  const sources = [
    facts.licenses.hasQualifyingSku,
    facts.licenses.hasP2,
    facts.licenses.hasIntune,
    facts.licenses.hasDefenderO365,
    facts.licenses.hasDefenderEndpt,
  ].filter(Boolean).length;
  if (sources >= 5) {
    return {
      rating: 'pass',
      message: `${sources} telemetry sources enable comprehensive event correlation.`,
      settingName: 'Telemetry Correlation Sources',
      currentValue: `${sources} sources`,
      expectedValue: '>= 5 sources',
    };
  }
  if (sources >= 3) {
    return {
      rating: 'warn',
      message: `${sources} of 5 telemetry sources available -- limited correlation capability.`,
      action: 'License additional security products to improve correlation per DE.AE-3.',
      settingName: 'Telemetry Correlation Sources',
      currentValue: `${sources} sources`,
      expectedValue: '>= 5 sources',
    };
  }
  return {
    rating: 'fail',
    message: `Only ${sources} telemetry sources -- insufficient for event correlation.`,
    action: 'License at least 3 security products to enable basic correlation per DE.AE-3.',
    settingName: 'Telemetry Correlation Sources',
    currentValue: `${sources} sources`,
    expectedValue: '>= 5 sources',
  };
};

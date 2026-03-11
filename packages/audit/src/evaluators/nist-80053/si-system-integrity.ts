/**
 * NIST 800-53 SI (System and Information Integrity) evaluators.
 * 3 controls: SI-2, SI-3, SI-4
 *
 * INDEPENDENT: These are NOT derived from CISA evaluator results.
 */
import type { EvaluatorFn } from '../types.js';

/** SI-2: Flaw Remediation -- pass when Defender for Endpoint licensed */
export const evaluate80053_SI2: EvaluatorFn = (facts) => {
  if (!facts.licenses.available) {
    return {
      rating: 'na',
      message: 'License data unavailable.',
      action: 'Grant Organization.Read.All permission.',
      settingName: 'Flaw Remediation (SI-2)',
      currentValue: 'Unknown',
      expectedValue: 'Defender for Endpoint licensed',
      requiredPermission: 'Organization.Read.All',
    };
  }
  if (facts.licenses.hasDefenderEndpt) {
    return {
      rating: 'pass',
      message: 'Defender for Endpoint licensed -- vulnerability management and patching available.',
      settingName: 'Flaw Remediation (SI-2)',
      currentValue: 'Defender for Endpoint licensed',
      expectedValue: 'Defender for Endpoint',
    };
  }
  return {
    rating: 'warn',
    message: 'No Defender for Endpoint license; flaw remediation tooling limited.',
    action: 'Obtain Defender for Endpoint for vulnerability management and patch compliance.',
    settingName: 'Flaw Remediation (SI-2)',
    currentValue: 'No Defender for Endpoint',
    expectedValue: 'Defender for Endpoint',
  };
};

/** SI-3: Malicious Code Protection -- pass when Defender for O365 licensed */
export const evaluate80053_SI3: EvaluatorFn = (facts) => {
  if (!facts.licenses.available) {
    return {
      rating: 'na',
      message: 'License data unavailable.',
      action: 'Grant Organization.Read.All permission.',
      settingName: 'Malicious Code Protection (SI-3)',
      currentValue: 'Unknown',
      expectedValue: 'Defender for Office 365 licensed',
      requiredPermission: 'Organization.Read.All',
    };
  }
  if (facts.licenses.hasDefenderO365) {
    return {
      rating: 'pass',
      message: 'Defender for Office 365 licensed -- Safe Links, Safe Attachments available.',
      settingName: 'Malicious Code Protection (SI-3)',
      currentValue: 'Defender for O365 licensed',
      expectedValue: 'Defender for Office 365',
    };
  }
  return {
    rating: 'warn',
    message: 'No Defender for Office 365 license; email and document malware protection limited.',
    action: 'Obtain Defender for Office 365 for Safe Links and Safe Attachments.',
    settingName: 'Malicious Code Protection (SI-3)',
    currentValue: 'No Defender for O365',
    expectedValue: 'Defender for Office 365',
  };
};

/** SI-4: System Monitoring -- pass when P2 licensed (advanced monitoring) */
export const evaluate80053_SI4: EvaluatorFn = (facts) => {
  if (!facts.licenses.available) {
    return {
      rating: 'na',
      message: 'License data unavailable.',
      action: 'Grant Organization.Read.All permission.',
      settingName: 'System Monitoring (SI-4)',
      currentValue: 'Unknown',
      expectedValue: 'Entra ID P2 for advanced monitoring',
      requiredPermission: 'Organization.Read.All',
    };
  }
  if (facts.licenses.hasP2) {
    return {
      rating: 'pass',
      message: 'Entra ID P2 licensed -- Identity Protection, risk-based CA, and advanced monitoring available.',
      settingName: 'System Monitoring (SI-4)',
      currentValue: 'P2 licensed',
      expectedValue: 'Entra ID P2',
    };
  }
  return {
    rating: 'warn',
    message: 'No Entra ID P2; system monitoring limited to basic audit logs.',
    action: 'Consider Entra ID P2 for Identity Protection and risk-based monitoring.',
    settingName: 'System Monitoring (SI-4)',
    currentValue: 'No P2 license',
    expectedValue: 'Entra ID P2',
  };
};

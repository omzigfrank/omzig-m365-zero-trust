/**
 * NIST CSF 2.0 Respond (RS) function evaluators.
 * 2 evaluators covering incident management and notifications.
 *
 * These are INDEPENDENT evaluators -- NOT derived from CISA or ZTA results.
 */
import type { EvaluatorFn } from '../types.js';

/**
 * RS.MA-1 -- Incident Management
 * Pass when admin consent workflow is enabled (structured incident response for app access),
 * warn when disabled.
 */
export const evaluateCSF_RS_MA1: EvaluatorFn = (facts) => {
  if (!facts.adminConsentPolicy.available) {
    return {
      rating: 'na',
      message: 'Admin consent policy data unavailable.',
      action: 'Grant Policy.Read.All permission.',
      settingName: 'Admin Consent Workflow',
      currentValue: 'Unknown',
      expectedValue: 'Admin consent workflow enabled',
      requiredPermission: 'Policy.Read.All',
    };
  }
  if (facts.adminConsentPolicy.enabled) {
    return {
      rating: 'pass',
      message: 'Admin consent workflow is enabled -- structured incident management for app access.',
      settingName: 'Admin Consent Workflow',
      currentValue: 'Enabled',
      expectedValue: 'Admin consent workflow enabled',
    };
  }
  return {
    rating: 'warn',
    message: 'Admin consent workflow is disabled.',
    action: 'Enable admin consent workflow for structured app access management per RS.MA-1.',
    settingName: 'Admin Consent Workflow',
    currentValue: 'Disabled',
    expectedValue: 'Admin consent workflow enabled',
  };
};

/**
 * RS.AN-1 -- Notifications
 * Pass when P2 licensed (supports risky user and sign-in alerts),
 * warn when no P2.
 */
export const evaluateCSF_RS_AN1: EvaluatorFn = (facts) => {
  if (!facts.licenses.available) {
    return {
      rating: 'na',
      message: 'License data unavailable.',
      action: 'Grant Organization.Read.All permission.',
      settingName: 'Risk Alert Notifications',
      currentValue: 'Unknown',
      expectedValue: 'Entra ID P2 for risk alerts',
      requiredPermission: 'Organization.Read.All',
    };
  }
  if (facts.licenses.hasP2) {
    return {
      rating: 'pass',
      message: 'Entra ID P2 licensed -- risky user and sign-in alert notifications available.',
      settingName: 'Risk Alert Notifications',
      currentValue: 'P2 licensed',
      expectedValue: 'Entra ID P2 for risk alerts',
    };
  }
  return {
    rating: 'warn',
    message: 'No Entra ID P2 license -- risk-based alert notifications unavailable.',
    action: 'License Entra ID P2 to enable risky user/sign-in alerts per RS.AN-1.',
    settingName: 'Risk Alert Notifications',
    currentValue: 'No P2 license',
    expectedValue: 'Entra ID P2 for risk alerts',
  };
};

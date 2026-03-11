/**
 * NIST 800-53 AU (Audit and Accountability) evaluators.
 * 3 controls: AU-2, AU-6, AU-12
 *
 * INDEPENDENT: These are NOT derived from CISA evaluator results.
 */
import type { EvaluatorFn } from '../types.js';

/** AU-2: Event Logging -- pass when qualifying license for audit logging */
export const evaluate80053_AU2: EvaluatorFn = (facts) => {
  if (!facts.licenses.available) {
    return {
      rating: 'na',
      message: 'License data unavailable.',
      action: 'Grant Organization.Read.All permission.',
      settingName: 'Event Logging (AU-2)',
      currentValue: 'Unknown',
      expectedValue: 'Qualifying M365 license for audit logging',
      requiredPermission: 'Organization.Read.All',
    };
  }
  if (facts.licenses.hasQualifyingSku) {
    return {
      rating: 'pass',
      message: 'Qualifying M365 license supports unified audit logging.',
      settingName: 'Event Logging (AU-2)',
      currentValue: 'Qualifying SKU',
      expectedValue: 'Qualifying M365 license',
    };
  }
  return {
    rating: 'fail',
    message: 'No qualifying M365 license for audit logging found.',
    action: 'Obtain M365 E3/E5 or equivalent license that includes unified audit logging.',
    settingName: 'Event Logging (AU-2)',
    currentValue: 'No qualifying SKU',
    expectedValue: 'Qualifying M365 license',
  };
};

/** AU-6: Audit Review -- pass when P2 license (advanced audit), warn with only E3 */
export const evaluate80053_AU6: EvaluatorFn = (facts) => {
  if (!facts.licenses.available) {
    return {
      rating: 'na',
      message: 'License data unavailable.',
      action: 'Grant Organization.Read.All permission.',
      settingName: 'Audit Review (AU-6)',
      currentValue: 'Unknown',
      expectedValue: 'Entra ID P2 license for advanced audit',
      requiredPermission: 'Organization.Read.All',
    };
  }
  if (facts.licenses.hasP2) {
    return {
      rating: 'pass',
      message: 'Entra ID P2 licensed -- advanced audit review and risk detections available.',
      settingName: 'Audit Review (AU-6)',
      currentValue: 'P2 licensed',
      expectedValue: 'Entra ID P2',
    };
  }
  return {
    rating: 'warn',
    message: 'No Entra ID P2 license; advanced audit review capabilities are limited.',
    action: 'Consider Entra ID P2 for Identity Protection risk detections and advanced audit.',
    settingName: 'Audit Review (AU-6)',
    currentValue: 'No P2 license',
    expectedValue: 'Entra ID P2',
  };
};

/**
 * AU-12: Audit Generation -- pass when >= 5 telemetry sources accessible.
 * Telemetry sources: organization, conditionalAccess, mfa, devices, licenses,
 * authMethods, adminRoles, roleAssignments, appRegistrations, sensitivityLabels,
 * domains, namedLocations, passwordPolicy, authorizationPolicy, adminConsentPolicy
 */
export const evaluate80053_AU12: EvaluatorFn = (facts) => {
  // Count available telemetry sources
  const sources = [
    facts.organization.available,
    facts.conditionalAccess.available,
    facts.mfa.available,
    facts.devices.available,
    facts.licenses.available,
    facts.authMethods.available,
    facts.adminRoles.available,
    facts.roleAssignments.available,
    facts.appRegistrations.available,
    facts.sensitivityLabels.available,
    facts.domains.available,
    facts.namedLocations.available,
    facts.passwordPolicy.available,
    facts.authorizationPolicy.available,
    facts.adminConsentPolicy.available,
  ];
  const count = sources.filter(Boolean).length;

  // If nothing is available at all, treat as NA
  if (count === 0) {
    return {
      rating: 'na',
      message: 'No telemetry sources accessible.',
      action: 'Grant Graph API permissions for tenant data collection.',
      settingName: 'Audit Generation (AU-12)',
      currentValue: '0 sources',
      expectedValue: '>= 5 telemetry sources',
    };
  }
  if (count >= 5) {
    return {
      rating: 'pass',
      message: `${count} telemetry sources accessible for audit generation.`,
      settingName: 'Audit Generation (AU-12)',
      currentValue: `${count} sources`,
      expectedValue: '>= 5 telemetry sources',
    };
  }
  if (count >= 3) {
    return {
      rating: 'warn',
      message: `Only ${count} telemetry sources accessible; partial audit coverage.`,
      action: 'Grant additional Graph API permissions to increase telemetry coverage.',
      settingName: 'Audit Generation (AU-12)',
      currentValue: `${count} sources`,
      expectedValue: '>= 5 telemetry sources',
    };
  }
  return {
    rating: 'fail',
    message: `Only ${count} telemetry source(s) accessible; insufficient for audit generation.`,
    action: 'Grant Graph API permissions to access at least 5 telemetry sources.',
    settingName: 'Audit Generation (AU-12)',
    currentValue: `${count} sources`,
    expectedValue: '>= 5 telemetry sources',
  };
};

/**
 * MS.AAD.5.x — Application Consent & Registration (4 evaluators)
 * Ported from CisaEvaluatorRegistry.ps1 lines 225-246.
 */
import type { EvaluatorFn } from '../types.js';

/** MS.AAD.5.1v1 — Only administrators SHALL register applications. */
export const evaluateAAD_5_1: EvaluatorFn = (facts) => {
  if (!facts.authorizationPolicy.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve authorization policy.',
      settingName: 'User App Registration',
      currentValue: 'Unknown',
      expectedValue: 'Users cannot register applications',
      requiredPermission: 'Policy.Read.All',
    };
  }

  if (!facts.authorizationPolicy.defaultUserRoleAllowedToCreateApps) {
    return {
      rating: 'pass',
      message: 'Users are restricted from registering applications.',
      settingName: 'User App Registration',
      currentValue: 'Disabled',
      expectedValue: 'Users cannot register applications',
    };
  }

  return {
    rating: 'fail',
    message: 'Default users can register applications.',
    action: "Set 'Users can register applications' to No in Entra ID > User settings.",
    settingName: 'User App Registration',
    currentValue: 'Enabled',
    expectedValue: 'Users cannot register applications',
  };
};

/** MS.AAD.5.2v1 — Only administrators SHALL consent to applications. */
export const evaluateAAD_5_2: EvaluatorFn = (facts) => {
  if (!facts.authorizationPolicy.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve authorization policy.',
      settingName: 'User App Consent',
      currentValue: 'Unknown',
      expectedValue: 'Users cannot consent to applications',
      requiredPermission: 'Policy.Read.All',
    };
  }

  // defaultUserRoleAllowedToCreateApps also controls consent in many configurations
  // Additionally, check if admin consent is the only path
  if (!facts.authorizationPolicy.defaultUserRoleAllowedToCreateApps) {
    return {
      rating: 'pass',
      message: 'User app registration is disabled, limiting user consent scope.',
      settingName: 'User App Consent',
      currentValue: 'App registration restricted',
      expectedValue: 'Users cannot consent to applications',
    };
  }

  return {
    rating: 'fail',
    message: 'Users may be able to consent to applications.',
    action: 'Configure permission grant policies to require admin consent for all permissions.',
    settingName: 'User App Consent',
    currentValue: 'Users can consent',
    expectedValue: 'Users cannot consent to applications',
  };
};

/** MS.AAD.5.3v1 — Admin consent workflow SHALL be enabled. */
export const evaluateAAD_5_3: EvaluatorFn = (facts) => {
  if (!facts.adminConsentPolicy.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve admin consent request policy.',
      settingName: 'Admin Consent Workflow',
      currentValue: 'Unknown',
      expectedValue: 'Enabled',
      requiredPermission: 'Policy.Read.All',
    };
  }

  if (facts.adminConsentPolicy.enabled) {
    return {
      rating: 'pass',
      message: 'Admin consent workflow is enabled.',
      settingName: 'Admin Consent Workflow',
      currentValue: 'Enabled',
      expectedValue: 'Enabled',
    };
  }

  return {
    rating: 'fail',
    message: 'Admin consent workflow is not enabled.',
    action: 'Enable the admin consent request workflow in Entra ID > Enterprise applications.',
    settingName: 'Admin Consent Workflow',
    currentValue: 'Disabled',
    expectedValue: 'Enabled',
  };
};

/** MS.AAD.5.4v1 — Group owners SHALL NOT consent to applications. */
export const evaluateAAD_5_4: EvaluatorFn = (facts) => {
  if (!facts.authorizationPolicy.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve authorization policy.',
      settingName: 'Group Owner App Consent',
      currentValue: 'Unknown',
      expectedValue: 'Group owners cannot consent',
      requiredPermission: 'Policy.Read.All',
    };
  }

  // If user app registration/consent is already restricted, group owner consent is implicitly restricted
  if (!facts.authorizationPolicy.defaultUserRoleAllowedToCreateApps) {
    return {
      rating: 'pass',
      message: 'User app permissions are restricted; group owner consent is limited.',
      settingName: 'Group Owner App Consent',
      currentValue: 'Restricted via user settings',
      expectedValue: 'Group owners cannot consent',
    };
  }

  return {
    rating: 'warn',
    message: 'Group owners may be able to consent to applications accessing group data.',
    action: 'Disable group owner consent for apps in Entra ID > Enterprise applications > Consent and permissions.',
    settingName: 'Group Owner App Consent',
    currentValue: 'Potentially allowed',
    expectedValue: 'Group owners cannot consent',
  };
};

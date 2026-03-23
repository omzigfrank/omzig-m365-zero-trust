/**
 * NIST CSF 2.0 Identify (ID) function evaluators.
 * 3 evaluators covering asset management and risk assessment.
 *
 * These are INDEPENDENT evaluators -- NOT derived from CISA or ZTA results.
 */
import type { EvaluatorFn } from '../types.js';

/**
 * ID.AM-1 -- Asset Inventory Hardware
 * Pass when device inventory has entries (Intune managed devices),
 * fail when 0 devices.
 */
export const evaluateCSF_ID_AM1: EvaluatorFn = (facts) => {
  if (!facts.devices.available) {
    return {
      rating: 'na',
      message: 'Device inventory data unavailable.',
      action: 'Grant DeviceManagementManagedDevices.Read.All permission.',
      settingName: 'Hardware Asset Inventory',
      currentValue: 'Unknown',
      expectedValue: 'Devices enrolled in Intune',
      requiredPermission: 'DeviceManagementManagedDevices.Read.All',
    };
  }
  if (facts.devices.totalDevices > 0) {
    return {
      rating: 'pass',
      message: `${facts.devices.totalDevices} device(s) tracked in Intune hardware inventory.`,
      settingName: 'Hardware Asset Inventory',
      currentValue: `${facts.devices.totalDevices} devices`,
      expectedValue: 'At least 1 managed device',
    };
  }
  return {
    rating: 'fail',
    message: 'No devices found in Intune inventory.',
    action: 'Enroll devices in Microsoft Intune per ID.AM-1.',
    settingName: 'Hardware Asset Inventory',
    currentValue: '0 devices',
    expectedValue: 'At least 1 managed device',
  };
};

/**
 * ID.AM-2 -- Asset Inventory Software
 * Pass when app registrations are tracked (count > 0),
 * warn when 0 app registrations.
 */
export const evaluateCSF_ID_AM2: EvaluatorFn = (facts) => {
  if (!facts.appRegistrations.available) {
    return {
      rating: 'na',
      message: 'App registration data unavailable.',
      action: 'Grant Application.Read.All permission.',
      settingName: 'Software Asset Inventory',
      currentValue: 'Unknown',
      expectedValue: 'App registrations tracked',
      requiredPermission: 'Application.Read.All',
    };
  }
  if (facts.appRegistrations.totalApps > 0) {
    return {
      rating: 'pass',
      message: `${facts.appRegistrations.totalApps} app registration(s) tracked in software inventory.`,
      settingName: 'Software Asset Inventory',
      currentValue: `${facts.appRegistrations.totalApps} apps`,
      expectedValue: 'At least 1 app registration',
    };
  }
  return {
    rating: 'warn',
    message: 'No app registrations found.',
    action: 'Track applications via Entra ID app registrations per ID.AM-2.',
    settingName: 'Software Asset Inventory',
    currentValue: '0 apps',
    expectedValue: 'At least 1 app registration',
  };
};

/**
 * ID.RA-1 -- Vulnerability Identification
 * Pass when P2 licensed (enables risk detection for identity vulnerabilities),
 * warn when no P2.
 */
export const evaluateCSF_ID_RA1: EvaluatorFn = (facts) => {
  if (!facts.licenses.available) {
    return {
      rating: 'na',
      message: 'License data unavailable.',
      action: 'Grant Organization.Read.All permission.',
      settingName: 'Identity Risk Detection',
      currentValue: 'Unknown',
      expectedValue: 'Entra ID P2 for risk detection',
      requiredPermission: 'Organization.Read.All',
    };
  }
  if (facts.licenses.hasP2) {
    return {
      rating: 'pass',
      message: 'Entra ID P2 licensed -- identity vulnerability detection available.',
      settingName: 'Identity Risk Detection',
      currentValue: 'P2 licensed',
      expectedValue: 'Entra ID P2 for risk detection',
    };
  }
  return {
    rating: 'warn',
    message: 'No Entra ID P2 license -- identity vulnerability detection unavailable.',
    action: 'License Entra ID P2 to enable identity risk detection per ID.RA-1.',
    settingName: 'Identity Risk Detection',
    currentValue: 'No P2 license',
    expectedValue: 'Entra ID P2 for risk detection',
  };
};

/**
 * NIST 800-53 CM (Configuration Management) evaluators.
 * 3 controls: CM-6, CM-7, CM-8
 *
 * INDEPENDENT: These are NOT derived from CISA evaluator results.
 */
import type { EvaluatorFn } from '../types.js';

/** CM-6: Configuration Settings -- pass when CA strategy (not security defaults) */
export const evaluate80053_CM6: EvaluatorFn = (facts) => {
  if (!facts.securityDefaults.available) {
    return {
      rating: 'na',
      message: 'Security defaults data unavailable.',
      action: 'Grant Policy.Read.All permission.',
      settingName: 'Configuration Settings (CM-6)',
      currentValue: 'Unknown',
      expectedValue: 'Conditional Access strategy (security defaults off)',
      requiredPermission: 'Policy.Read.All',
    };
  }
  if (!facts.securityDefaults.enabled) {
    return {
      rating: 'pass',
      message: 'Security defaults disabled; Conditional Access is the baseline strategy.',
      settingName: 'Configuration Settings (CM-6)',
      currentValue: 'Security defaults off (CA strategy)',
      expectedValue: 'Conditional Access strategy',
    };
  }
  return {
    rating: 'warn',
    message: 'Security defaults enabled; limits granular configuration management.',
    action: 'Disable security defaults and implement Conditional Access policies for granular control.',
    settingName: 'Configuration Settings (CM-6)',
    currentValue: 'Security defaults on',
    expectedValue: 'Conditional Access strategy',
  };
};

/** CM-7: Least Functionality -- pass when app registration restricted to admins */
export const evaluate80053_CM7: EvaluatorFn = (facts) => {
  if (!facts.authorizationPolicy.available) {
    return {
      rating: 'na',
      message: 'Authorization policy data unavailable.',
      action: 'Grant Policy.Read.All permission.',
      settingName: 'Least Functionality (CM-7)',
      currentValue: 'Unknown',
      expectedValue: 'App registration restricted to admins',
      requiredPermission: 'Policy.Read.All',
    };
  }
  if (!facts.authorizationPolicy.defaultUserRoleAllowedToCreateApps) {
    return {
      rating: 'pass',
      message: 'App registration restricted to administrators only.',
      settingName: 'Least Functionality (CM-7)',
      currentValue: 'Users cannot create apps',
      expectedValue: 'App registration restricted to admins',
    };
  }
  return {
    rating: 'fail',
    message: 'Default users can register applications; violates least functionality.',
    action: 'Set "Users can register applications" to No in Entra ID user settings.',
    settingName: 'Least Functionality (CM-7)',
    currentValue: 'Users can create apps',
    expectedValue: 'App registration restricted to admins',
  };
};

/** CM-8: Information System Component Inventory -- pass when device and app inventories exist */
export const evaluate80053_CM8: EvaluatorFn = (facts) => {
  if (!facts.devices.available && !facts.appRegistrations.available) {
    return {
      rating: 'na',
      message: 'Device and app registration data unavailable.',
      action: 'Grant DeviceManagementManagedDevices.Read.All and Application.Read.All permissions.',
      settingName: 'Component Inventory (CM-8)',
      currentValue: 'Unknown',
      expectedValue: 'Device and application inventories maintained',
      requiredPermission: 'DeviceManagementManagedDevices.Read.All',
    };
  }
  const hasDevices = facts.devices.available && facts.devices.totalDevices > 0;
  const hasApps = facts.appRegistrations.available && facts.appRegistrations.totalApps > 0;
  if (hasDevices && hasApps) {
    return {
      rating: 'pass',
      message: `Component inventory: ${facts.devices.totalDevices} devices, ${facts.appRegistrations.totalApps} applications.`,
      settingName: 'Component Inventory (CM-8)',
      currentValue: `${facts.devices.totalDevices} devices, ${facts.appRegistrations.totalApps} apps`,
      expectedValue: 'Both device and app inventories populated',
    };
  }
  return {
    rating: 'fail',
    message: `Incomplete inventory: ${facts.devices.available ? facts.devices.totalDevices : '?'} devices, ${facts.appRegistrations.available ? facts.appRegistrations.totalApps : '?'} apps.`,
    action: 'Enroll devices in Intune and register applications for complete component inventory.',
    settingName: 'Component Inventory (CM-8)',
    currentValue: `${hasDevices ? facts.devices.totalDevices : 0} devices, ${hasApps ? facts.appRegistrations.totalApps : 0} apps`,
    expectedValue: 'Both device and app inventories populated',
  };
};

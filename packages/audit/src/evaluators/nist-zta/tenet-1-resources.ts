/**
 * NIST 800-207 Tenet 1: All data sources and computing services are resources.
 * (Asset Awareness)
 * Ported from NistEvaluatorRegistry.ps1 lines 14-66.
 */
import type { EvaluatorFn } from '../types.js';

/** T1.1 -- Device inventory completeness */
export const evaluateZTA_T1_1: EvaluatorFn = (facts) => {
  if (!facts.devices.available) {
    return {
      rating: 'fail',
      message: 'Could not retrieve device inventory.',
      action: 'Verify Intune permissions (DeviceManagementManagedDevices.Read.All).',
      settingName: 'Device Inventory',
      currentValue: 'Unknown',
      expectedValue: 'At least 1 managed device',
      requiredPermission: 'DeviceManagementManagedDevices.Read.All',
    };
  }
  if (facts.devices.totalDevices > 0) {
    return {
      rating: 'pass',
      message: `${facts.devices.totalDevices} managed devices in Intune inventory.`,
      settingName: 'Device Inventory',
      currentValue: `${facts.devices.totalDevices} devices`,
      expectedValue: 'At least 1 managed device',
    };
  }
  return {
    rating: 'fail',
    message: 'No managed devices found in Intune.',
    action: 'Enroll devices in Intune to establish a device inventory.',
    settingName: 'Device Inventory',
    currentValue: '0 devices',
    expectedValue: 'At least 1 managed device',
  };
};

/** T1.2 -- Application inventory tracked */
export const evaluateZTA_T1_2: EvaluatorFn = (facts) => {
  if (!facts.appRegistrations.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve app registrations.',
      action: 'Grant Application.Read.All permission.',
      settingName: 'Application Inventory',
      currentValue: 'Unknown',
      expectedValue: 'App registrations tracked',
      requiredPermission: 'Application.Read.All',
    };
  }
  if (facts.appRegistrations.totalApps > 0) {
    return {
      rating: 'pass',
      message: `${facts.appRegistrations.totalApps} app registration(s) tracked.`,
      settingName: 'Application Inventory',
      currentValue: `${facts.appRegistrations.totalApps} apps`,
      expectedValue: 'At least 1 app registration',
    };
  }
  return {
    rating: 'warn',
    message: 'No app registrations found.',
    action: 'Track applications via Entra ID app registrations for visibility.',
    settingName: 'Application Inventory',
    currentValue: '0 apps',
    expectedValue: 'At least 1 app registration',
  };
};

/** T1.3 -- Data classification deployed */
export const evaluateZTA_T1_3: EvaluatorFn = (facts) => {
  if (!facts.sensitivityLabels.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve sensitivity labels.',
      action: 'Grant InformationProtection permissions or use Microsoft Purview.',
      settingName: 'Data Classification',
      currentValue: 'Unknown',
      expectedValue: 'Sensitivity labels deployed',
      requiredPermission: 'InformationProtectionPolicy.Read.All',
    };
  }
  if (facts.sensitivityLabels.totalLabels > 0) {
    return {
      rating: 'pass',
      message: `${facts.sensitivityLabels.totalLabels} sensitivity label(s) deployed.`,
      settingName: 'Data Classification',
      currentValue: `${facts.sensitivityLabels.totalLabels} labels`,
      expectedValue: 'At least 1 sensitivity label',
    };
  }
  return {
    rating: 'warn',
    message: 'No sensitivity labels found.',
    action: 'Create and publish sensitivity labels for data classification.',
    settingName: 'Data Classification',
    currentValue: '0 labels',
    expectedValue: 'At least 1 sensitivity label',
  };
};

/** T1.4 -- Domain inventory complete */
export const evaluateZTA_T1_4: EvaluatorFn = (facts) => {
  if (!facts.domains.available) {
    return {
      rating: 'fail',
      message: 'Could not retrieve domain information.',
      action: 'Verify directory read permissions.',
      settingName: 'Domain Inventory',
      currentValue: 'Unknown',
      expectedValue: 'Custom domain(s) verified',
      requiredPermission: 'Domain.Read.All',
    };
  }
  if (facts.domains.customDomainCount > 0) {
    return {
      rating: 'pass',
      message: `${facts.domains.customDomainCount} custom domain(s) verified.`,
      settingName: 'Domain Inventory',
      currentValue: `${facts.domains.customDomainCount} custom domains`,
      expectedValue: 'At least 1 custom domain',
    };
  }
  return {
    rating: 'warn',
    message: 'Only .onmicrosoft.com domain found.',
    action: 'Add and verify custom domains for production use.',
    settingName: 'Domain Inventory',
    currentValue: 'Only .onmicrosoft.com',
    expectedValue: 'At least 1 custom domain',
  };
};

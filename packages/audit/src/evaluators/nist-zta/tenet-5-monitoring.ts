/**
 * NIST 800-207 Tenet 5: Enterprise monitors and measures integrity/security posture.
 * (Visibility & Monitoring)
 * Ported from NistEvaluatorRegistry.ps1 lines 361-423.
 */
import type { EvaluatorFn } from '../types.js';

/** T5.1 -- Unified audit logging */
export const evaluateZTA_T5_1: EvaluatorFn = (facts) => {
  if (!facts.licenses.available) {
    return {
      rating: 'na',
      message: 'Could not verify audit logging licensing.',
      settingName: 'Audit Logging',
      currentValue: 'Unknown',
      expectedValue: 'Qualifying license for audit logging',
    };
  }

  if (facts.licenses.hasQualifyingSku) {
    const tier = facts.licenses.hasP2 ? 'E5/P2 (advanced audit)' : 'E3 (standard audit)';
    return {
      rating: 'pass',
      message: `Audit logging supported by ${tier} licensing.`,
      settingName: 'Audit Logging',
      currentValue: tier,
      expectedValue: 'Qualifying license for audit logging',
    };
  }
  return {
    rating: 'fail',
    message: 'No qualifying license for unified audit logging.',
    action: 'Upgrade to M365 E3/E5 for audit logging.',
    settingName: 'Audit Logging',
    currentValue: 'No qualifying license',
    expectedValue: 'M365 E3/E5 or equivalent',
  };
};

/** T5.2 -- Defender for Endpoint deployed */
export const evaluateZTA_T5_2: EvaluatorFn = (facts) => {
  if (!facts.licenses.available) {
    return {
      rating: 'na',
      message: 'Could not verify endpoint protection licensing.',
      settingName: 'Endpoint Detection',
      currentValue: 'Unknown',
      expectedValue: 'Defender for Endpoint licensed',
    };
  }

  if (facts.licenses.hasDefenderEndpt) {
    return {
      rating: 'pass',
      message: 'Defender for Endpoint is licensed.',
      settingName: 'Endpoint Detection',
      currentValue: 'Defender for Endpoint active',
      expectedValue: 'Defender for Endpoint licensed',
    };
  }
  return {
    rating: 'warn',
    message: 'No Defender for Endpoint license detected.',
    action: 'Add Defender for Endpoint for device-level threat detection.',
    settingName: 'Endpoint Detection',
    currentValue: 'Not licensed',
    expectedValue: 'Defender for Endpoint licensed',
  };
};

/** T5.3 -- Defender for Office 365 */
export const evaluateZTA_T5_3: EvaluatorFn = (facts) => {
  if (!facts.licenses.available) {
    return {
      rating: 'na',
      message: 'Could not verify email protection licensing.',
      settingName: 'Email Threat Protection',
      currentValue: 'Unknown',
      expectedValue: 'Defender for Office 365 licensed',
    };
  }

  if (facts.licenses.hasDefenderO365) {
    return {
      rating: 'pass',
      message: 'Defender for Office 365 is licensed.',
      settingName: 'Email Threat Protection',
      currentValue: 'Defender for O365 active',
      expectedValue: 'Defender for Office 365 licensed',
    };
  }
  return {
    rating: 'warn',
    message: 'No Defender for Office 365 license detected.',
    action: 'Add Defender for Office 365 for email threat protection.',
    settingName: 'Email Threat Protection',
    currentValue: 'Not licensed',
    expectedValue: 'Defender for Office 365 licensed',
  };
};

/** T5.4 -- Telemetry sources available */
export const evaluateZTA_T5_4: EvaluatorFn = (facts) => {
  let signals = 0;
  if (facts.conditionalAccess.available) signals++;
  if (facts.mfa.available) signals++;
  if (facts.devices.available) signals++;
  if (facts.licenses.available) signals++;
  if (facts.authMethods.available) signals++;
  if (facts.adminRoles.available) signals++;

  if (signals >= 5) {
    return {
      rating: 'pass',
      message: `${signals} of 6 telemetry sources accessible.`,
      settingName: 'Telemetry Coverage',
      currentValue: `${signals}/6 sources`,
      expectedValue: '>= 5 of 6 sources',
    };
  }
  if (signals >= 3) {
    return {
      rating: 'warn',
      message: `${signals} of 6 telemetry sources accessible.`,
      action: 'Broaden Graph API access for comprehensive monitoring.',
      settingName: 'Telemetry Coverage',
      currentValue: `${signals}/6 sources`,
      expectedValue: '>= 5 of 6 sources',
    };
  }
  return {
    rating: 'fail',
    message: `Only ${signals} of 6 telemetry sources accessible.`,
    action: 'Grant additional Graph permissions for audit visibility.',
    settingName: 'Telemetry Coverage',
    currentValue: `${signals}/6 sources`,
    expectedValue: '>= 5 of 6 sources',
  };
};

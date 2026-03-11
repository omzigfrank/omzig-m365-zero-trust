/**
 * NIST 800-207 Tenet 7: Enterprise collects as much information as possible to improve security.
 * (Continuous Improvement)
 * Ported from NistEvaluatorRegistry.ps1 lines 540-601.
 */
import type { EvaluatorFn } from '../types.js';

/** T7.1 -- Entra ID P2 (Identity Protection) */
export const evaluateZTA_T7_1: EvaluatorFn = (facts) => {
  if (!facts.licenses.available) {
    return {
      rating: 'na',
      message: 'Could not verify licensing.',
      settingName: 'Identity Protection Licensing',
      currentValue: 'Unknown',
      expectedValue: 'Entra ID P2 licensed',
    };
  }

  if (facts.licenses.hasP2) {
    return {
      rating: 'pass',
      message: 'Entra ID P2 licensed for Identity Protection capabilities.',
      settingName: 'Identity Protection Licensing',
      currentValue: 'P2 licensed',
      expectedValue: 'Entra ID P2 licensed',
    };
  }
  return {
    rating: 'warn',
    message: 'No Entra ID P2 license detected.',
    action: 'Add P2 for risk-based CA, risky user/sign-in reports, and Identity Protection.',
    settingName: 'Identity Protection Licensing',
    currentValue: 'No P2 license',
    expectedValue: 'Entra ID P2 licensed',
  };
};

/** T7.2 -- Guest access governance */
export const evaluateZTA_T7_2: EvaluatorFn = (facts) => {
  if (!facts.authorizationPolicy.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve authorization policy.',
      settingName: 'Guest Access Governance',
      currentValue: 'Unknown',
      expectedValue: 'Guest invitations restricted',
    };
  }

  const invitePolicy = facts.authorizationPolicy.allowInvitesFrom;
  if (invitePolicy === 'adminsAndGuestInviters' || invitePolicy === 'none') {
    return {
      rating: 'pass',
      message: `Guest invitations restricted (${invitePolicy}).`,
      settingName: 'Guest Access Governance',
      currentValue: invitePolicy,
      expectedValue: 'adminsAndGuestInviters or none',
    };
  }
  if (invitePolicy === 'adminsGuestInvitersAndAllMembers') {
    return {
      rating: 'warn',
      message: 'All members can invite guests.',
      action: 'Restrict guest invitations to admins and guest inviters.',
      settingName: 'Guest Access Governance',
      currentValue: invitePolicy,
      expectedValue: 'adminsAndGuestInviters or none',
    };
  }
  return {
    rating: 'warn',
    message: `Guest invitation policy: ${invitePolicy}.`,
    action: 'Review and restrict guest invitation permissions.',
    settingName: 'Guest Access Governance',
    currentValue: invitePolicy ?? 'Unknown',
    expectedValue: 'adminsAndGuestInviters or none',
  };
};

/** T7.3 -- App registration governance */
export const evaluateZTA_T7_3: EvaluatorFn = (facts) => {
  if (!facts.authorizationPolicy.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve authorization policy.',
      settingName: 'App Registration Governance',
      currentValue: 'Unknown',
      expectedValue: 'Users restricted from registering apps',
    };
  }

  if (!facts.authorizationPolicy.defaultUserRoleAllowedToCreateApps) {
    return {
      rating: 'pass',
      message: 'Users are restricted from registering applications.',
      settingName: 'App Registration Governance',
      currentValue: 'Restricted',
      expectedValue: 'Users restricted from registering apps',
    };
  }
  return {
    rating: 'fail',
    message: 'Default users can register applications.',
    action: 'Restrict app registration to admins only.',
    settingName: 'App Registration Governance',
    currentValue: 'Users can register apps',
    expectedValue: 'Users restricted from registering apps',
  };
};

/** T7.4 -- Password policy modernized (NIST 800-63B aligned) */
export const evaluateZTA_T7_4: EvaluatorFn = (facts) => {
  if (!facts.passwordPolicy.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve password policy.',
      settingName: 'Password Policy Modernized',
      currentValue: 'Unknown',
      expectedValue: 'Passwords do not expire',
    };
  }

  const validity = facts.passwordPolicy.passwordValidityPeriodInDays;
  if (validity === null || validity === 0 || validity === 2147483647) {
    return {
      rating: 'pass',
      message: 'Passwords do not expire (NIST 800-63B aligned).',
      settingName: 'Password Policy Modernized',
      currentValue: 'No expiration',
      expectedValue: 'Passwords do not expire',
    };
  }
  return {
    rating: 'warn',
    message: `Passwords expire every ${validity} days.`,
    action: 'Remove forced expiration per NIST 800-63B guidance.',
    settingName: 'Password Policy Modernized',
    currentValue: `${validity}-day expiration`,
    expectedValue: 'Passwords do not expire',
  };
};

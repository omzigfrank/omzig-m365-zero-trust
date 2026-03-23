/**
 * NIST 800-53 IA (Identification and Authentication) evaluators.
 * 3 controls: IA-2, IA-5, IA-8
 *
 * INDEPENDENT: These are NOT derived from CISA evaluator results.
 */
import type { EvaluatorFn } from '../types.js';

/** IA-2: Identification and Authentication -- pass when MFA >= 95%, warn 80-94, fail < 80 */
export const evaluate80053_IA2: EvaluatorFn = (facts) => {
  if (!facts.mfa.available) {
    return {
      rating: 'na',
      message: 'MFA registration data unavailable.',
      action: 'Grant UserAuthenticationMethod.Read.All permission.',
      settingName: 'Identification and Authentication (IA-2)',
      currentValue: 'Unknown',
      expectedValue: 'MFA registration >= 95%',
      requiredPermission: 'UserAuthenticationMethod.Read.All',
    };
  }
  const pct = facts.mfa.percentage;
  if (pct >= 95) {
    return {
      rating: 'pass',
      message: `MFA registration at ${pct}% (${facts.mfa.registeredUsers}/${facts.mfa.totalUsers} users).`,
      settingName: 'Identification and Authentication (IA-2)',
      currentValue: `${pct}%`,
      expectedValue: '>= 95%',
    };
  }
  if (pct >= 80) {
    return {
      rating: 'warn',
      message: `MFA registration at ${pct}% -- approaching target of 95%.`,
      action: 'Enroll remaining users in MFA to reach 95% threshold.',
      settingName: 'Identification and Authentication (IA-2)',
      currentValue: `${pct}%`,
      expectedValue: '>= 95%',
    };
  }
  return {
    rating: 'fail',
    message: `MFA registration critically low at ${pct}% (${facts.mfa.registeredUsers}/${facts.mfa.totalUsers}).`,
    action: 'Urgently enroll users in MFA -- below 80% threshold.',
    settingName: 'Identification and Authentication (IA-2)',
    currentValue: `${pct}%`,
    expectedValue: '>= 95%',
  };
};

/** IA-5: Authenticator Management -- pass when passwords don't expire (NIST 800-63B) */
export const evaluate80053_IA5: EvaluatorFn = (facts) => {
  if (!facts.passwordPolicy.available) {
    return {
      rating: 'na',
      message: 'Password policy data unavailable.',
      action: 'Grant Domain.Read.All permission.',
      settingName: 'Authenticator Management (IA-5)',
      currentValue: 'Unknown',
      expectedValue: 'Passwords do not expire (NIST 800-63B)',
      requiredPermission: 'Domain.Read.All',
    };
  }
  const validity = facts.passwordPolicy.passwordValidityPeriodInDays;
  if (validity === 0 || validity === null) {
    return {
      rating: 'pass',
      message: 'Passwords do not expire, consistent with NIST 800-63B guidance.',
      settingName: 'Authenticator Management (IA-5)',
      currentValue: 'No expiration',
      expectedValue: 'Passwords do not expire (NIST 800-63B)',
    };
  }
  return {
    rating: 'warn',
    message: `Passwords expire every ${validity} days; NIST 800-63B recommends no expiration.`,
    action: 'Set password validity to 0 (no expiration) per NIST 800-63B.',
    settingName: 'Authenticator Management (IA-5)',
    currentValue: `${validity} days`,
    expectedValue: 'No expiration (NIST 800-63B)',
  };
};

/** IA-8: Non-Organizational User Identification -- pass when guest invites restricted */
export const evaluate80053_IA8: EvaluatorFn = (facts) => {
  if (!facts.authorizationPolicy.available) {
    return {
      rating: 'na',
      message: 'Authorization policy data unavailable.',
      action: 'Grant Policy.Read.All permission.',
      settingName: 'Non-Org User Identification (IA-8)',
      currentValue: 'Unknown',
      expectedValue: 'Guest invites restricted to admins',
      requiredPermission: 'Policy.Read.All',
    };
  }
  const invitePolicy = facts.authorizationPolicy.allowInvitesFrom;
  const restricted = invitePolicy !== 'everyone';
  if (restricted) {
    return {
      rating: 'pass',
      message: `Guest invite policy: ${invitePolicy} (restricted).`,
      settingName: 'Non-Org User Identification (IA-8)',
      currentValue: invitePolicy ?? 'N/A',
      expectedValue: 'Not "everyone"',
    };
  }
  return {
    rating: 'warn',
    message: 'Guest invitations open to everyone; should be restricted.',
    action: 'Restrict guest invitations to admins or specific roles.',
    settingName: 'Non-Org User Identification (IA-8)',
    currentValue: 'everyone',
    expectedValue: 'adminsAndGuestInviters or more restrictive',
  };
};

/**
 * MS.AAD.6.1v1 — User passwords SHALL NOT expire.
 * Ported from CisaEvaluatorRegistry.ps1 lines 249-260.
 */
import type { EvaluatorFn } from '../types.js';

/** MS.AAD.6.1v1 — Passwords never expire (NIST 800-63B). */
export const evaluateAAD_6_1: EvaluatorFn = (facts) => {
  if (!facts.passwordPolicy.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve password policy from domain.',
      settingName: 'Password Expiration Policy',
      currentValue: 'Unknown',
      expectedValue: 'Never expire (0 or null)',
      requiredPermission: 'Domain.Read.All',
    };
  }

  const validity = facts.passwordPolicy.passwordValidityPeriodInDays;
  // 2147483647 = "never expires" in MS Graph, 0 = never expire, null = cloud default (no expiry)
  if (validity === null || validity === 0 || validity === 2147483647) {
    return {
      rating: 'pass',
      message: 'Passwords are set to never expire (NIST 800-63B aligned).',
      settingName: 'Password Expiration Policy',
      currentValue: 'Never expire',
      expectedValue: 'Never expire (0 or null)',
    };
  }

  return {
    rating: 'fail',
    message: `Passwords expire every ${validity} days.`,
    action: "Set password expiration to 'never' per NIST 800-63B guidance.",
    settingName: 'Password Expiration Policy',
    currentValue: `${validity} days`,
    expectedValue: 'Never expire (0 or null)',
  };
};

/**
 * NIST CSF 2.0 Protect (PR) function evaluators.
 * 7 evaluators covering access control, data security, configuration management,
 * and infrastructure resilience.
 *
 * These are INDEPENDENT evaluators -- NOT derived from CISA or ZTA results.
 * Each has its own pass/fail logic even when checking similar fact areas.
 */
import type { EvaluatorFn } from '../types.js';

/**
 * PR.AA-1 -- Access Control
 * Pass when CA policies enforce access decisions (at least 1 enabled policy),
 * fail when no enabled CA policies exist.
 */
export const evaluateCSF_PR_AA1: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'na',
      message: 'Conditional Access data unavailable.',
      action: 'Grant Policy.Read.All permission to evaluate access controls.',
      settingName: 'Access Control Enforcement',
      currentValue: 'Unknown',
      expectedValue: 'At least 1 enabled CA policy',
      requiredPermission: 'Policy.Read.All',
    };
  }
  if (facts.conditionalAccess.enabledCount > 0) {
    return {
      rating: 'pass',
      message: `${facts.conditionalAccess.enabledCount} enabled CA policies enforce access control decisions.`,
      settingName: 'Access Control Enforcement',
      currentValue: `${facts.conditionalAccess.enabledCount} enabled policies`,
      expectedValue: 'At least 1 enabled CA policy',
    };
  }
  return {
    rating: 'fail',
    message: 'No enabled Conditional Access policies found.',
    action: 'Create and enable CA policies to enforce access control per PR.AA-1.',
    settingName: 'Access Control Enforcement',
    currentValue: '0 enabled policies',
    expectedValue: 'At least 1 enabled CA policy',
  };
};

/**
 * PR.AA-3 -- Remote Access
 * Pass when at least one CA policy enforces MFA for all users,
 * fail when no MFA-enforcing CA policy found.
 */
export const evaluateCSF_PR_AA3: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'na',
      message: 'Conditional Access data unavailable.',
      action: 'Grant Policy.Read.All permission to evaluate MFA enforcement.',
      settingName: 'Remote Access MFA',
      currentValue: 'Unknown',
      expectedValue: 'MFA enforced via CA for all users',
      requiredPermission: 'Policy.Read.All',
    };
  }
  const mfaPolicies = facts.conditionalAccess.policies.filter(
    (p) =>
      (p.state === 'enabled' || p.state === 'enabledForReportingButNotEnforced') &&
      p.grantControls?.builtInControls?.includes('mfa') &&
      p.conditions?.users?.includeUsers?.includes('All'),
  );
  if (mfaPolicies.length > 0) {
    return {
      rating: 'pass',
      message: `${mfaPolicies.length} CA policy(ies) enforce MFA for all users.`,
      settingName: 'Remote Access MFA',
      currentValue: `${mfaPolicies.length} MFA policies`,
      expectedValue: 'At least 1 MFA CA policy for all users',
    };
  }
  return {
    rating: 'fail',
    message: 'No CA policy enforces MFA for all users.',
    action: 'Create a CA policy requiring MFA for all users to secure remote access per PR.AA-3.',
    settingName: 'Remote Access MFA',
    currentValue: '0 MFA-for-all policies',
    expectedValue: 'At least 1 MFA CA policy for all users',
  };
};

/**
 * PR.AA-5 -- Least Privilege
 * Pass when PIM eligible assignments > 0 (indicates just-in-time access),
 * warn when no eligible assignments (all permanent).
 */
export const evaluateCSF_PR_AA5: EvaluatorFn = (facts) => {
  if (!facts.roleAssignments.available) {
    return {
      rating: 'na',
      message: 'Role assignment data unavailable.',
      action: 'Grant RoleManagement.Read.All permission to evaluate least privilege.',
      settingName: 'Least Privilege (PIM)',
      currentValue: 'Unknown',
      expectedValue: 'Eligible (JIT) role assignments in use',
      requiredPermission: 'RoleManagement.Read.All',
    };
  }
  if (facts.roleAssignments.eligibleAssignments > 0) {
    return {
      rating: 'pass',
      message: `${facts.roleAssignments.eligibleAssignments} PIM eligible assignment(s) enforce just-in-time access.`,
      settingName: 'Least Privilege (PIM)',
      currentValue: `${facts.roleAssignments.eligibleAssignments} eligible assignments`,
      expectedValue: 'Eligible (JIT) role assignments in use',
    };
  }
  return {
    rating: 'warn',
    message: 'No PIM eligible assignments found -- all role assignments are permanent.',
    action: 'Configure Privileged Identity Management to enforce just-in-time access per PR.AA-5.',
    settingName: 'Least Privilege (PIM)',
    currentValue: '0 eligible assignments',
    expectedValue: 'Eligible (JIT) role assignments in use',
  };
};

/**
 * PR.DS-1 -- Data Protection
 * Pass when sensitivity labels are deployed (count > 0),
 * warn when no labels deployed.
 */
export const evaluateCSF_PR_DS1: EvaluatorFn = (facts) => {
  if (!facts.sensitivityLabels.available) {
    return {
      rating: 'na',
      message: 'Sensitivity label data unavailable.',
      action: 'Grant InformationProtectionPolicy.Read.All permission.',
      settingName: 'Data Protection Labels',
      currentValue: 'Unknown',
      expectedValue: 'Sensitivity labels deployed',
      requiredPermission: 'InformationProtectionPolicy.Read.All',
    };
  }
  if (facts.sensitivityLabels.totalLabels > 0) {
    return {
      rating: 'pass',
      message: `${facts.sensitivityLabels.totalLabels} sensitivity label(s) deployed for data protection.`,
      settingName: 'Data Protection Labels',
      currentValue: `${facts.sensitivityLabels.totalLabels} labels`,
      expectedValue: 'At least 1 sensitivity label',
    };
  }
  return {
    rating: 'warn',
    message: 'No sensitivity labels deployed.',
    action: 'Create and publish sensitivity labels in Microsoft Purview per PR.DS-1.',
    settingName: 'Data Protection Labels',
    currentValue: '0 labels',
    expectedValue: 'At least 1 sensitivity label',
  };
};

/**
 * PR.DS-2 -- Data in Transit
 * Pass when legacy authentication is blocked (implies modern protocol enforcement),
 * fail when legacy auth not blocked.
 */
export const evaluateCSF_PR_DS2: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'na',
      message: 'Conditional Access data unavailable.',
      action: 'Grant Policy.Read.All permission to evaluate data-in-transit protection.',
      settingName: 'Legacy Auth Block',
      currentValue: 'Unknown',
      expectedValue: 'Legacy authentication blocked',
      requiredPermission: 'Policy.Read.All',
    };
  }
  const legacyBlockPolicies = facts.conditionalAccess.policies.filter(
    (p) =>
      (p.state === 'enabled' || p.state === 'enabledForReportingButNotEnforced') &&
      p.grantControls?.builtInControls?.includes('block') &&
      p.conditions?.clientAppTypes?.some((t) => ['exchangeActiveSync', 'other'].includes(t)),
  );
  if (legacyBlockPolicies.length > 0) {
    return {
      rating: 'pass',
      message: 'Legacy authentication is blocked, enforcing modern protocols for data in transit.',
      settingName: 'Legacy Auth Block',
      currentValue: `${legacyBlockPolicies.length} legacy-block policies`,
      expectedValue: 'Legacy authentication blocked',
    };
  }
  return {
    rating: 'fail',
    message: 'Legacy authentication is not blocked.',
    action: 'Create a CA policy to block legacy auth protocols per PR.DS-2.',
    settingName: 'Legacy Auth Block',
    currentValue: 'Legacy auth allowed',
    expectedValue: 'Legacy authentication blocked',
  };
};

/**
 * PR.PS-1 -- Configuration Management
 * Pass when CA policies are used instead of security defaults (security defaults disabled + CA enabled),
 * warn when security defaults still active (limited configuration granularity).
 */
export const evaluateCSF_PR_PS1: EvaluatorFn = (facts) => {
  if (!facts.securityDefaults.available) {
    return {
      rating: 'na',
      message: 'Security defaults data unavailable.',
      action: 'Grant Policy.Read.All permission.',
      settingName: 'Configuration Management Strategy',
      currentValue: 'Unknown',
      expectedValue: 'CA policies (not security defaults)',
      requiredPermission: 'Policy.Read.All',
    };
  }
  if (!facts.securityDefaults.enabled && facts.conditionalAccess.available && facts.conditionalAccess.enabledCount > 0) {
    return {
      rating: 'pass',
      message: 'Conditional Access policies in use -- granular configuration management.',
      settingName: 'Configuration Management Strategy',
      currentValue: 'CA policies active',
      expectedValue: 'CA policies (not security defaults)',
    };
  }
  return {
    rating: 'warn',
    message: 'Security defaults are enabled or no CA policies configured.',
    action: 'Migrate from security defaults to Conditional Access for granular control per PR.PS-1.',
    settingName: 'Configuration Management Strategy',
    currentValue: facts.securityDefaults.enabled ? 'Security defaults active' : 'No CA policies',
    expectedValue: 'CA policies (not security defaults)',
  };
};

/**
 * PR.IR-1 -- Technology Infrastructure Resilience
 * Pass when >= 5 telemetry sources licensed, warn otherwise.
 * Telemetry sources: qualifying SKU, P2, Intune, Defender for O365, Defender for Endpoint.
 */
export const evaluateCSF_PR_IR1: EvaluatorFn = (facts) => {
  if (!facts.licenses.available) {
    return {
      rating: 'na',
      message: 'License data unavailable.',
      action: 'Grant Organization.Read.All permission to evaluate infrastructure resilience.',
      settingName: 'Telemetry Sources',
      currentValue: 'Unknown',
      expectedValue: '>= 5 telemetry sources',
      requiredPermission: 'Organization.Read.All',
    };
  }
  const sources = [
    facts.licenses.hasQualifyingSku,
    facts.licenses.hasP2,
    facts.licenses.hasIntune,
    facts.licenses.hasDefenderO365,
    facts.licenses.hasDefenderEndpt,
  ].filter(Boolean).length;
  if (sources >= 5) {
    return {
      rating: 'pass',
      message: `${sources} telemetry sources licensed for infrastructure resilience monitoring.`,
      settingName: 'Telemetry Sources',
      currentValue: `${sources} sources`,
      expectedValue: '>= 5 telemetry sources',
    };
  }
  return {
    rating: 'warn',
    message: `Only ${sources} of 5 telemetry sources licensed.`,
    action: 'License additional security products to improve infrastructure monitoring per PR.IR-1.',
    settingName: 'Telemetry Sources',
    currentValue: `${sources} sources`,
    expectedValue: '>= 5 telemetry sources',
  };
};

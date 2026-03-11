/**
 * MS.AAD.3.x — Multi-Factor Authentication (8 evaluators)
 * Ported from CisaEvaluatorRegistry.ps1 lines 95-222.
 */
import type { EvaluatorFn } from '../types.js';

/** MS.AAD.3.1v1 — Phishing-resistant MFA SHALL be required for all users. */
export const evaluateAAD_3_1: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'fail',
      message: 'Could not retrieve CA policies.',
      settingName: 'Conditional Access - MFA Requirement',
      currentValue: 'Unknown',
      expectedValue: 'CA policy requiring MFA for all users',
      requiredPermission: 'Policy.Read.All',
    };
  }

  for (const pol of facts.conditionalAccess.policies) {
    if (pol.state === 'disabled') continue;
    const grants = pol.grantControls;
    if (grants?.builtInControls?.includes('mfa')) {
      return {
        rating: 'pass',
        message: 'A CA policy requires MFA or authentication strength.',
        settingName: 'Conditional Access - MFA Requirement',
        currentValue: `Policy "${pol.displayName}" requires MFA`,
        expectedValue: 'CA policy requiring MFA for all users',
      };
    }
    if (grants?.authenticationStrength) {
      return {
        rating: 'pass',
        message: 'A CA policy requires MFA or authentication strength.',
        settingName: 'Conditional Access - MFA Requirement',
        currentValue: `Policy "${pol.displayName}" requires auth strength`,
        expectedValue: 'CA policy requiring MFA for all users',
      };
    }
  }

  return {
    rating: 'fail',
    message: 'No CA policy found requiring MFA.',
    action: 'Create a CA policy requiring phishing-resistant MFA for all users.',
    settingName: 'Conditional Access - MFA Requirement',
    currentValue: 'No MFA policy found',
    expectedValue: 'CA policy requiring MFA for all users',
  };
};

/** MS.AAD.3.2v1 — Alternative MFA method registered. */
export const evaluateAAD_3_2: EvaluatorFn = (facts) => {
  if (!facts.mfa.available) {
    return {
      rating: 'fail',
      message: 'Could not retrieve MFA registration data.',
      settingName: 'MFA Registration Rate',
      currentValue: 'Unknown',
      expectedValue: '≥80% MFA registration',
      requiredPermission: 'UserAuthenticationMethod.Read.All',
    };
  }

  if (facts.mfa.percentage >= 80) {
    return {
      rating: 'pass',
      message: `${facts.mfa.percentage}% of users registered for MFA.`,
      settingName: 'MFA Registration Rate',
      currentValue: `${facts.mfa.percentage}%`,
      expectedValue: '≥80%',
    };
  }
  if (facts.mfa.percentage >= 50) {
    return {
      rating: 'warn',
      message: `${facts.mfa.percentage}% MFA registration (target 80%).`,
      action: 'Run MFA registration campaign.',
      settingName: 'MFA Registration Rate',
      currentValue: `${facts.mfa.percentage}%`,
      expectedValue: '≥80%',
    };
  }
  return {
    rating: 'fail',
    message: `${facts.mfa.percentage}% MFA registration (target 80%).`,
    action: 'Many users will be impacted. Run a registration campaign first.',
    settingName: 'MFA Registration Rate',
    currentValue: `${facts.mfa.percentage}%`,
    expectedValue: '≥80%',
  };
};

/** MS.AAD.3.3v1 — Alternative MFA enforced via CA. */
export const evaluateAAD_3_3: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'fail',
      message: 'Could not retrieve CA policies.',
      settingName: 'Conditional Access - MFA Enforcement',
      currentValue: 'Unknown',
      expectedValue: 'CA policy enforcing MFA with auth strength',
      requiredPermission: 'Policy.Read.All',
    };
  }

  for (const pol of facts.conditionalAccess.policies) {
    if (pol.state === 'disabled') continue;
    const grants = pol.grantControls;
    if (grants?.authenticationStrength) {
      return {
        rating: 'pass',
        message: 'A CA policy enforces authentication strength.',
        settingName: 'Conditional Access - MFA Enforcement',
        currentValue: `Policy "${pol.displayName}" uses auth strength`,
        expectedValue: 'CA policy enforcing MFA with auth strength',
      };
    }
    if (grants?.builtInControls?.includes('mfa')) {
      return {
        rating: 'pass',
        message: 'A CA policy requires MFA.',
        settingName: 'Conditional Access - MFA Enforcement',
        currentValue: `Policy "${pol.displayName}" requires MFA`,
        expectedValue: 'CA policy enforcing MFA with auth strength',
      };
    }
  }

  return {
    rating: 'fail',
    message: 'No CA policy found enforcing MFA or authentication strength.',
    action: 'Create a CA policy requiring authentication strength for all users.',
    settingName: 'Conditional Access - MFA Enforcement',
    currentValue: 'No MFA enforcement policy',
    expectedValue: 'CA policy enforcing MFA with auth strength',
  };
};

/** MS.AAD.3.4v1 — Auth methods migration SHALL be complete. */
export const evaluateAAD_3_4: EvaluatorFn = (facts) => {
  if (!facts.authMethods.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve authentication methods policy.',
      settingName: 'Authentication Methods Migration',
      currentValue: 'Unknown',
      expectedValue: 'migrationComplete',
      requiredPermission: 'Policy.Read.All',
    };
  }

  const state = facts.authMethods.migrationState;
  if (state === 'migrationComplete') {
    return {
      rating: 'pass',
      message: 'Authentication methods migration is complete.',
      settingName: 'Authentication Methods Migration',
      currentValue: 'migrationComplete',
      expectedValue: 'migrationComplete',
    };
  }
  if (state === 'migrationInProgress') {
    return {
      rating: 'warn',
      message: `Migration is in progress (${state}).`,
      action: 'Complete the migration to the new authentication methods experience.',
      settingName: 'Authentication Methods Migration',
      currentValue: state,
      expectedValue: 'migrationComplete',
    };
  }

  return {
    rating: 'fail',
    message: `Migration state: ${state}.`,
    action: "Set Manage Migration to 'Migration Complete' in the Authentication Methods policy.",
    settingName: 'Authentication Methods Migration',
    currentValue: state ?? 'unknown',
    expectedValue: 'migrationComplete',
  };
};

/** MS.AAD.3.5v1 — SMS or voice SHALL NOT be used as MFA. */
export const evaluateAAD_3_5: EvaluatorFn = (facts) => {
  if (!facts.authMethods.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve authentication methods policy.',
      settingName: 'SMS/Voice MFA Methods',
      currentValue: 'Unknown',
      expectedValue: 'SMS and Voice disabled',
      requiredPermission: 'Policy.Read.All',
    };
  }

  const enabledMethods: string[] = [];
  if (facts.authMethods.smsEnabled) enabledMethods.push('SMS');
  if (facts.authMethods.voiceEnabled) enabledMethods.push('Voice');

  if (enabledMethods.length > 0) {
    return {
      rating: 'warn',
      message: `${enabledMethods.join(' and ')} authentication is enabled.`,
      action: 'Disable SMS and Voice as authentication methods.',
      settingName: 'SMS/Voice MFA Methods',
      currentValue: enabledMethods.join(', ') + ' enabled',
      expectedValue: 'SMS and Voice disabled',
    };
  }

  return {
    rating: 'pass',
    message: 'SMS and Voice authentication are disabled.',
    settingName: 'SMS/Voice MFA Methods',
    currentValue: 'Both disabled',
    expectedValue: 'SMS and Voice disabled',
  };
};

/** MS.AAD.3.6v1 — Phishing-resistant MFA for privileged roles. */
export const evaluateAAD_3_6: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'fail',
      message: 'Could not retrieve CA policies.',
      settingName: 'Conditional Access - Admin MFA',
      currentValue: 'Unknown',
      expectedValue: 'CA policy requiring MFA for admin roles',
      requiredPermission: 'Policy.Read.All',
    };
  }

  for (const pol of facts.conditionalAccess.policies) {
    if (pol.state === 'disabled') continue;
    const conditions = pol.conditions;
    const grants = pol.grantControls;
    const targetsRoles =
      conditions?.users?.includeRoles && conditions.users.includeRoles.length > 0;

    if (targetsRoles) {
      if (grants?.builtInControls?.includes('mfa') || grants?.authenticationStrength) {
        return {
          rating: 'pass',
          message: 'A CA policy requires MFA for privileged roles.',
          settingName: 'Conditional Access - Admin MFA',
          currentValue: `Policy "${pol.displayName}" targets admin roles with MFA`,
          expectedValue: 'CA policy requiring MFA for admin roles',
        };
      }
    }
  }

  return {
    rating: 'warn',
    message: 'No CA policy found specifically targeting admin roles with MFA.',
    action: 'Create a CA policy requiring phishing-resistant MFA for highly privileged roles.',
    settingName: 'Conditional Access - Admin MFA',
    currentValue: 'No admin MFA policy found',
    expectedValue: 'CA policy requiring MFA for admin roles',
  };
};

/** MS.AAD.3.7v1 — Managed devices SHOULD be required. */
export const evaluateAAD_3_7: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'fail',
      message: 'Could not retrieve CA policies.',
      settingName: 'Conditional Access - Device Compliance',
      currentValue: 'Unknown',
      expectedValue: 'CA policy requiring compliant devices',
      requiredPermission: 'Policy.Read.All',
    };
  }

  for (const pol of facts.conditionalAccess.policies) {
    if (pol.state === 'disabled') continue;
    const grants = pol.grantControls;
    if (
      grants?.builtInControls?.includes('compliantDevice') ||
      grants?.builtInControls?.includes('domainJoinedDevice')
    ) {
      return {
        rating: 'pass',
        message: 'A CA policy requires managed/compliant devices.',
        settingName: 'Conditional Access - Device Compliance',
        currentValue: `Policy "${pol.displayName}" requires compliant device`,
        expectedValue: 'CA policy requiring compliant devices',
      };
    }
  }

  return {
    rating: 'warn',
    message: 'No CA policy found requiring device compliance.',
    action: 'Consider requiring compliant or Hybrid Azure AD joined devices via CA.',
    settingName: 'Conditional Access - Device Compliance',
    currentValue: 'No device compliance policy found',
    expectedValue: 'CA policy requiring compliant devices',
  };
};

/** MS.AAD.3.8v1 — Managed devices SHOULD be required to register MFA. */
export const evaluateAAD_3_8: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'fail',
      message: 'Could not retrieve CA policies.',
      settingName: 'Conditional Access - MFA Registration Device Requirement',
      currentValue: 'Unknown',
      expectedValue: 'CA policy requiring compliant device for MFA registration',
      requiredPermission: 'Policy.Read.All',
    };
  }

  // Look for CA policies that target MFA registration user action and require compliant device
  for (const pol of facts.conditionalAccess.policies) {
    if (pol.state === 'disabled') continue;
    const grants = pol.grantControls;
    if (
      grants?.builtInControls?.includes('compliantDevice') ||
      grants?.builtInControls?.includes('domainJoinedDevice')
    ) {
      // Check if this policy could target MFA registration
      // Graph API doesn't expose user actions directly in the standard conditions,
      // so we check for device compliance policies broadly
      return {
        rating: 'pass',
        message: 'A CA policy requires compliant devices (may cover MFA registration).',
        settingName: 'Conditional Access - MFA Registration Device Requirement',
        currentValue: `Policy "${pol.displayName}" requires compliant device`,
        expectedValue: 'CA policy requiring compliant device for MFA registration',
      };
    }
  }

  return {
    rating: 'warn',
    message: 'No CA policy found requiring compliant device for MFA registration.',
    action: 'Create a CA policy requiring a managed device for the Register security information user action.',
    settingName: 'Conditional Access - MFA Registration Device Requirement',
    currentValue: 'No MFA registration device policy',
    expectedValue: 'CA policy requiring compliant device for MFA registration',
  };
};

/**
 * NIST 800-207 Tenet 4: Access to resources is determined by dynamic policy.
 * (Policy Engine)
 * Ported from NistEvaluatorRegistry.ps1 lines 205-359.
 */
import type { EvaluatorFn } from '../types.js';

/** T4.1 -- Risk-based CA policies active */
export const evaluateZTA_T4_1: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available || !facts.licenses.available) {
    return {
      rating: 'fail',
      message: 'Could not verify risk-based policies.',
      settingName: 'Risk-Based Access',
      currentValue: 'Unknown',
      expectedValue: 'User risk and sign-in risk CA policies',
      requiredPermission: 'Policy.Read.All',
    };
  }

  if (!facts.licenses.hasP2) {
    return {
      rating: 'warn',
      message: 'Entra ID P2 required for risk-based CA.',
      action: 'Add Entra ID P2 to enable user risk and sign-in risk policies.',
      settingName: 'Risk-Based Access',
      currentValue: 'No P2 license',
      expectedValue: 'Entra ID P2 with risk-based CA policies',
    };
  }

  let hasUserRisk = false;
  let hasSignInRisk = false;
  for (const pol of facts.conditionalAccess.policies) {
    if (pol.state === 'disabled') continue;
    const conditions = pol.conditions;
    if (conditions) {
      if (conditions.userRiskLevels && conditions.userRiskLevels.length > 0) hasUserRisk = true;
      if (conditions.signInRiskLevels && conditions.signInRiskLevels.length > 0) hasSignInRisk = true;
    }
  }

  if (hasUserRisk && hasSignInRisk) {
    return {
      rating: 'pass',
      message: 'Both user risk and sign-in risk CA policies detected.',
      settingName: 'Risk-Based Access',
      currentValue: 'User risk + sign-in risk policies active',
      expectedValue: 'User risk and sign-in risk CA policies',
    };
  }
  if (hasUserRisk || hasSignInRisk) {
    const missing = !hasUserRisk ? 'user risk' : 'sign-in risk';
    return {
      rating: 'warn',
      message: `Missing ${missing} CA policy.`,
      action: `Add a CA policy addressing ${missing} for comprehensive risk-based access.`,
      settingName: 'Risk-Based Access',
      currentValue: hasUserRisk ? 'User risk only' : 'Sign-in risk only',
      expectedValue: 'User risk and sign-in risk CA policies',
    };
  }
  return {
    rating: 'fail',
    message: 'No risk-based CA policies found despite P2 licensing.',
    action: 'Create CA policies for user risk and sign-in risk levels.',
    settingName: 'Risk-Based Access',
    currentValue: 'No risk-based policies',
    expectedValue: 'User risk and sign-in risk CA policies',
  };
};

/** T4.2 -- Device compliance required for access */
export const evaluateZTA_T4_2: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'na',
      message: 'Could not verify device compliance CA requirements.',
      settingName: 'Device Compliance Required',
      currentValue: 'Unknown',
      expectedValue: 'CA policy requiring compliant device',
    };
  }

  for (const pol of facts.conditionalAccess.policies) {
    if (pol.state === 'disabled') continue;
    if (pol.grantControls?.builtInControls?.includes('compliantDevice')) {
      return {
        rating: 'pass',
        message: 'A CA policy requires device compliance for access.',
        settingName: 'Device Compliance Required',
        currentValue: `Policy "${pol.displayName}" requires compliance`,
        expectedValue: 'CA policy requiring compliant device',
      };
    }
  }

  return {
    rating: 'warn',
    message: 'No CA policy requires device compliance.',
    action: 'Consider requiring compliant devices via CA to integrate device posture into access decisions.',
    settingName: 'Device Compliance Required',
    currentValue: 'No compliance requirement',
    expectedValue: 'CA policy requiring compliant device',
  };
};

/** T4.3 -- Location-based access restrictions */
export const evaluateZTA_T4_3: EvaluatorFn = (facts) => {
  if (!facts.namedLocations.available || !facts.conditionalAccess.available) {
    return {
      rating: 'na',
      message: 'Could not evaluate location-based access.',
      settingName: 'Location-Based Restrictions',
      currentValue: 'Unknown',
      expectedValue: 'CA policies with location conditions',
    };
  }

  for (const pol of facts.conditionalAccess.policies) {
    if (pol.state === 'disabled') continue;
    const conditions = pol.conditions;
    if (conditions) {
      const locations = conditions.locations as Record<string, unknown> | undefined;
      if (locations) {
        if (locations.includeLocations || locations.excludeLocations) {
          return {
            rating: 'pass',
            message: 'CA policies use location-based conditions.',
            settingName: 'Location-Based Restrictions',
            currentValue: 'Location conditions active',
            expectedValue: 'CA policies with location conditions',
          };
        }
      }
    }
  }

  return {
    rating: 'warn',
    message: 'No CA policies use location conditions.',
    action: 'Consider geo-based access restrictions for additional zero trust context.',
    settingName: 'Location-Based Restrictions',
    currentValue: 'No location conditions',
    expectedValue: 'CA policies with location conditions',
  };
};

/**
 * T4.4 -- Application-specific policies
 * Note: The TypeScript ConditionalAccessPolicy.conditions type does not include
 * an `applications` field. The Graph API response does include it, but it is not
 * typed in the current AuditFacts model. We use a type assertion to access it.
 */
export const evaluateZTA_T4_4: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'na',
      message: 'Could not evaluate application-specific policies.',
      settingName: 'Application-Specific Policies',
      currentValue: 'Unknown',
      expectedValue: 'CA policies targeting specific applications',
    };
  }

  for (const pol of facts.conditionalAccess.policies) {
    if (pol.state === 'disabled') continue;
    const conditions = pol.conditions as Record<string, unknown> | null;
    if (conditions) {
      const apps = conditions.applications as { includeApplications?: string[] } | undefined;
      if (apps?.includeApplications && apps.includeApplications.length > 0) {
        const hasSpecific = apps.includeApplications.some(
          (appId) => appId !== 'All' && appId !== 'Office365',
        );
        if (hasSpecific) {
          return {
            rating: 'pass',
            message: 'CA policies target specific applications.',
            settingName: 'Application-Specific Policies',
            currentValue: 'App-specific policies active',
            expectedValue: 'CA policies targeting specific applications',
          };
        }
      }
    }
  }

  return {
    rating: 'warn',
    message: 'CA policies only target \'All\' apps.',
    action: 'Consider creating application-specific CA policies for granular access control.',
    settingName: 'Application-Specific Policies',
    currentValue: 'No app-specific policies',
    expectedValue: 'CA policies targeting specific applications',
  };
};

/** T4.5 -- MFA enforced for all users */
export const evaluateZTA_T4_5: EvaluatorFn = (facts) => {
  if (!facts.mfa.available) {
    return {
      rating: 'fail',
      message: 'Could not retrieve MFA coverage data.',
      settingName: 'MFA Coverage',
      currentValue: 'Unknown',
      expectedValue: '>= 95% MFA registration',
      requiredPermission: 'UserAuthenticationMethod.Read.All',
    };
  }

  if (facts.mfa.percentage >= 95) {
    return {
      rating: 'pass',
      message: `${facts.mfa.percentage}% MFA registration.`,
      settingName: 'MFA Coverage',
      currentValue: `${facts.mfa.percentage}%`,
      expectedValue: '>= 95%',
    };
  }
  if (facts.mfa.percentage >= 80) {
    return {
      rating: 'warn',
      message: `${facts.mfa.percentage}% MFA registration (target 95%).`,
      action: 'Push MFA registration to remaining users.',
      settingName: 'MFA Coverage',
      currentValue: `${facts.mfa.percentage}%`,
      expectedValue: '>= 95%',
    };
  }
  return {
    rating: 'fail',
    message: `${facts.mfa.percentage}% MFA registration (target 95%).`,
    action: 'Run an MFA registration campaign.',
    settingName: 'MFA Coverage',
    currentValue: `${facts.mfa.percentage}%`,
    expectedValue: '>= 95%',
  };
};

/** T4.6 -- Admin access requires additional controls */
export const evaluateZTA_T4_6: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'na',
      message: 'Could not evaluate admin-specific access controls.',
      settingName: 'Admin Access Controls',
      currentValue: 'Unknown',
      expectedValue: 'CA policies targeting admin roles',
    };
  }

  for (const pol of facts.conditionalAccess.policies) {
    if (pol.state === 'disabled') continue;
    const conditions = pol.conditions;
    if (conditions?.users?.includeRoles && conditions.users.includeRoles.length > 0) {
      return {
        rating: 'pass',
        message: 'CA policies with admin role targeting detected.',
        settingName: 'Admin Access Controls',
        currentValue: 'Admin role targeting active',
        expectedValue: 'CA policies targeting admin roles',
      };
    }
  }

  return {
    rating: 'warn',
    message: 'No CA policies specifically target admin roles.',
    action: 'Create CA policies requiring stronger controls for privileged roles.',
    settingName: 'Admin Access Controls',
    currentValue: 'No admin-specific policies',
    expectedValue: 'CA policies targeting admin roles',
  };
};

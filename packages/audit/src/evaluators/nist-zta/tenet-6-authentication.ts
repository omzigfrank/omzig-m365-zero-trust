/**
 * NIST 800-207 Tenet 6: All authentication and authorization are dynamic and strictly enforced.
 * (Strong Authentication)
 * Ported from NistEvaluatorRegistry.ps1 lines 425-538.
 */
import type { EvaluatorFn } from '../types.js';

/**
 * T6.1 -- MFA enforcement / registration coverage.
 *
 * Primary: checks MFA registration rate from /reports/authenticationMethods.
 * Fallback: if that endpoint is unavailable, analyses Conditional Access
 * policies for MFA enforcement (builtInControls includes 'mfa' or
 * authenticationStrength is set).  This covers the common case where
 * MFA is enforced via CA policies rather than per-user MFA.
 */
export const evaluateZTA_T6_1: EvaluatorFn = (facts) => {
  // ── Primary path: MFA registration data available ──────────────────
  if (facts.mfa.available) {
    if (facts.mfa.percentage >= 95) {
      return {
        rating: 'pass',
        message: `${facts.mfa.percentage}% users MFA-registered.`,
        settingName: 'MFA Registration',
        currentValue: `${facts.mfa.percentage}%`,
        expectedValue: '>= 95%',
      };
    }
    if (facts.mfa.percentage >= 80) {
      return {
        rating: 'warn',
        message: `${facts.mfa.percentage}% MFA (target 95%).`,
        action: 'Continue MFA enrollment campaign.',
        settingName: 'MFA Registration',
        currentValue: `${facts.mfa.percentage}%`,
        expectedValue: '>= 95%',
      };
    }
    return {
      rating: 'fail',
      message: `${facts.mfa.percentage}% MFA (target 95%).`,
      action: 'Immediately begin MFA registration campaign.',
      settingName: 'MFA Registration',
      currentValue: `${facts.mfa.percentage}%`,
      expectedValue: '>= 95%',
    };
  }

  // ── Fallback: analyse Conditional Access policies for MFA enforcement ──
  if (facts.conditionalAccess.available && facts.conditionalAccess.policies.length > 0) {
    const mfaPolicies = facts.conditionalAccess.policies.filter((p) => {
      const controls = p.grantControls?.builtInControls ?? [];
      const hasAuthStrength = p.grantControls?.authenticationStrength != null;
      return controls.includes('mfa') || hasAuthStrength;
    });

    const enabledMfa = mfaPolicies.filter((p) => p.state === 'enabled');
    const reportOnlyMfa = mfaPolicies.filter((p) => p.state === 'enabledForReportingButNotEnforced');

    // Check if any enabled MFA policy targets All Users + All Cloud Apps
    const broadEnabled = enabledMfa.filter((p) => {
      const users = p.conditions?.users?.includeUsers ?? [];
      return users.includes('All');
    });

    const totalMfa = enabledMfa.length + reportOnlyMfa.length;
    const policyNames = mfaPolicies.map((p) => p.displayName).join(', ');

    if (broadEnabled.length > 0) {
      return {
        rating: 'pass',
        message: `MFA enforced via ${enabledMfa.length} enabled CA policy(ies) targeting All Users: ${policyNames}.`,
        settingName: 'MFA Enforcement (CA Policy)',
        currentValue: `${enabledMfa.length} enabled, ${reportOnlyMfa.length} report-only`,
        expectedValue: 'MFA required via CA policy',
      };
    }
    if (enabledMfa.length > 0) {
      return {
        rating: 'pass',
        message: `MFA enforced via ${enabledMfa.length} enabled CA policy(ies): ${policyNames}. Consider expanding to All Users.`,
        settingName: 'MFA Enforcement (CA Policy)',
        currentValue: `${enabledMfa.length} enabled, ${reportOnlyMfa.length} report-only`,
        expectedValue: 'MFA required via CA policy',
      };
    }
    if (reportOnlyMfa.length > 0) {
      return {
        rating: 'warn',
        message: `${reportOnlyMfa.length} MFA CA policy(ies) in report-only mode: ${policyNames}. Enable to enforce.`,
        action: 'Switch MFA CA policies from report-only to enabled.',
        settingName: 'MFA Enforcement (CA Policy)',
        currentValue: `${totalMfa} total (all report-only)`,
        expectedValue: 'MFA required via enabled CA policy',
      };
    }

    return {
      rating: 'fail',
      message: 'No CA policies require MFA. MFA registration endpoint also unavailable.',
      action: 'Create a Conditional Access policy requiring MFA for All Users.',
      settingName: 'MFA Enforcement',
      currentValue: 'No MFA policies found',
      expectedValue: 'MFA required via CA policy or registration >= 95%',
    };
  }

  // Neither source available
  return {
    rating: 'na',
    message: 'MFA registration endpoint unavailable and no CA policies found. Cannot assess MFA coverage.',
    settingName: 'MFA Enforcement',
    currentValue: 'Unknown',
    expectedValue: 'MFA required via CA policy or registration >= 95%',
    requiredPermission: 'UserAuthenticationMethod.Read.All',
  };
};

/** T6.2 -- Privileged role count controlled */
export const evaluateZTA_T6_2: EvaluatorFn = (facts) => {
  if (!facts.adminRoles.available) {
    return {
      rating: 'fail',
      message: 'Could not verify admin role counts.',
      settingName: 'Privileged Role Control',
      currentValue: 'Unknown',
      expectedValue: '2-5 Global Admins',
      requiredPermission: 'RoleManagement.Read.Directory',
    };
  }

  const count = facts.adminRoles.globalAdminCount;
  if (count >= 2 && count <= 5) {
    return {
      rating: 'pass',
      message: `${count} Global Admins (ideal 2-5 range).`,
      settingName: 'Privileged Role Control',
      currentValue: `${count} Global Admins`,
      expectedValue: '2-5 Global Admins',
    };
  }
  if (count === 1) {
    return {
      rating: 'warn',
      message: 'Only 1 Global Admin -- resilience risk.',
      action: 'Add a second Global Admin for redundancy.',
      settingName: 'Privileged Role Control',
      currentValue: '1 Global Admin',
      expectedValue: '2-5 Global Admins',
    };
  }
  return {
    rating: 'warn',
    message: `${count} Global Admins (recommended 2-5).`,
    action: 'Reduce excessive Global Admin assignments.',
    settingName: 'Privileged Role Control',
    currentValue: `${count} Global Admins`,
    expectedValue: '2-5 Global Admins',
  };
};

/**
 * T6.3 -- Emergency access resilience
 * Advisory check: Break-glass group data is not available in the current AuditFacts.
 * Per PITFALL 5 from research, this returns 'warn' as an advisory.
 */
export const evaluateZTA_T6_3: EvaluatorFn = (_facts) => {
  return {
    rating: 'warn',
    message: 'Break-glass group verification requires additional fact collection not available in current AuditFacts.',
    action: 'Create emergency access accounts and exclude from CA policies.',
    settingName: 'Emergency Access',
    currentValue: 'Not verifiable',
    expectedValue: 'Break-glass accounts configured and excluded from CA',
  };
};

/** T6.4 -- Authentication methods modernized */
export const evaluateZTA_T6_4: EvaluatorFn = (facts) => {
  if (!facts.authMethods.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve authentication methods policy.',
      settingName: 'Auth Methods Modernized',
      currentValue: 'Unknown',
      expectedValue: 'Migration complete',
    };
  }

  if (facts.authMethods.migrationState === 'migrationComplete') {
    return {
      rating: 'pass',
      message: 'Authentication methods migration is complete.',
      settingName: 'Auth Methods Modernized',
      currentValue: 'migrationComplete',
      expectedValue: 'migrationComplete',
    };
  }
  if (facts.authMethods.migrationState) {
    return {
      rating: 'warn',
      message: `Migration state: ${facts.authMethods.migrationState}.`,
      action: 'Complete migration to the new authentication methods experience.',
      settingName: 'Auth Methods Modernized',
      currentValue: facts.authMethods.migrationState,
      expectedValue: 'migrationComplete',
    };
  }
  return {
    rating: 'warn',
    message: 'Migration state unknown.',
    action: 'Check Authentication Methods policy migration state.',
    settingName: 'Auth Methods Modernized',
    currentValue: 'Unknown',
    expectedValue: 'migrationComplete',
  };
};

/** T6.5 -- SMS/voice discouraged */
export const evaluateZTA_T6_5: EvaluatorFn = (facts) => {
  if (!facts.authMethods.available) {
    return {
      rating: 'na',
      message: 'Could not verify authentication method configuration.',
      settingName: 'Weak Auth Methods Disabled',
      currentValue: 'Unknown',
      expectedValue: 'SMS and Voice disabled',
    };
  }

  if (!facts.authMethods.smsEnabled && !facts.authMethods.voiceEnabled) {
    return {
      rating: 'pass',
      message: 'SMS and Voice authentication are disabled.',
      settingName: 'Weak Auth Methods Disabled',
      currentValue: 'SMS: disabled, Voice: disabled',
      expectedValue: 'SMS and Voice disabled',
    };
  }

  const enabled: string[] = [];
  if (facts.authMethods.smsEnabled) enabled.push('SMS');
  if (facts.authMethods.voiceEnabled) enabled.push('Voice');
  return {
    rating: 'warn',
    message: `${enabled.join(' and ')} still enabled.`,
    action: 'Disable SMS and Voice authentication in favor of phishing-resistant methods.',
    settingName: 'Weak Auth Methods Disabled',
    currentValue: `${enabled.join(', ')} enabled`,
    expectedValue: 'SMS and Voice disabled',
  };
};

/** T6.6 -- PIM configured */
export const evaluateZTA_T6_6: EvaluatorFn = (facts) => {
  if (!facts.roleAssignments.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve PIM role assignment data.',
      settingName: 'PIM Configured',
      currentValue: 'Unknown',
      expectedValue: 'Eligible PIM assignments present',
    };
  }

  if (facts.roleAssignments.eligibleAssignments > 0) {
    return {
      rating: 'pass',
      message: `${facts.roleAssignments.eligibleAssignments} eligible PIM assignment(s) detected.`,
      settingName: 'PIM Configured',
      currentValue: `${facts.roleAssignments.eligibleAssignments} eligible assignments`,
      expectedValue: 'Eligible PIM assignments present',
    };
  }
  if (facts.roleAssignments.totalAssignments > 0) {
    return {
      rating: 'warn',
      message: 'Role assignments exist but no PIM eligible assignments detected.',
      action: 'Use PIM for just-in-time privileged access.',
      settingName: 'PIM Configured',
      currentValue: `${facts.roleAssignments.totalAssignments} active, 0 eligible`,
      expectedValue: 'Eligible PIM assignments present',
    };
  }
  return {
    rating: 'na',
    message: 'No role assignments found to evaluate PIM.',
    settingName: 'PIM Configured',
    currentValue: 'No role assignments',
    expectedValue: 'Eligible PIM assignments present',
  };
};

/** T6.7 -- Admin consent workflow enabled */
export const evaluateZTA_T6_7: EvaluatorFn = (facts) => {
  if (!facts.adminConsentPolicy.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve admin consent policy.',
      settingName: 'Admin Consent Workflow',
      currentValue: 'Unknown',
      expectedValue: 'Admin consent workflow enabled',
    };
  }

  if (facts.adminConsentPolicy.enabled) {
    return {
      rating: 'pass',
      message: 'Admin consent workflow is enabled.',
      settingName: 'Admin Consent Workflow',
      currentValue: 'Enabled',
      expectedValue: 'Admin consent workflow enabled',
    };
  }
  return {
    rating: 'warn',
    message: 'Admin consent workflow is not enabled.',
    action: 'Enable admin consent workflow for controlled application authorization.',
    settingName: 'Admin Consent Workflow',
    currentValue: 'Disabled',
    expectedValue: 'Admin consent workflow enabled',
  };
};

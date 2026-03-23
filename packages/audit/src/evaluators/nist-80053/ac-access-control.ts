/**
 * NIST 800-53 AC (Access Control) evaluators.
 * 6 controls: AC-2, AC-3, AC-6, AC-7, AC-11, AC-17
 *
 * INDEPENDENT: These are NOT derived from CISA evaluator results.
 * Each has its own pass/fail logic against AuditFacts.
 */
import type { EvaluatorFn } from '../types.js';

/** AC-2: Account Management -- pass when globalAdminCount is 2-8 */
export const evaluate80053_AC2: EvaluatorFn = (facts) => {
  if (!facts.adminRoles.available) {
    return {
      rating: 'na',
      message: 'Admin role data unavailable.',
      action: 'Grant Directory.Read.All permission.',
      settingName: 'Account Management (AC-2)',
      currentValue: 'Unknown',
      expectedValue: '2-8 Global Admins',
      requiredPermission: 'Directory.Read.All',
    };
  }
  const count = facts.adminRoles.globalAdminCount;
  if (count >= 2 && count <= 8) {
    return {
      rating: 'pass',
      message: `${count} Global Administrators provisioned (within 2-8 range).`,
      settingName: 'Account Management (AC-2)',
      currentValue: `${count} Global Admins`,
      expectedValue: '2-8 Global Admins',
    };
  }
  return {
    rating: 'fail',
    message: `${count} Global Administrator(s) found; expected 2-8.`,
    action: count < 2
      ? 'Provision at least 2 Global Administrators for continuity.'
      : 'Reduce Global Administrators to 8 or fewer to limit blast radius.',
    settingName: 'Account Management (AC-2)',
    currentValue: `${count} Global Admins`,
    expectedValue: '2-8 Global Admins',
  };
};

/** AC-3: Access Enforcement -- pass when CA policies with grant controls exist */
export const evaluate80053_AC3: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'na',
      message: 'Conditional Access data unavailable.',
      action: 'Grant Policy.Read.All permission.',
      settingName: 'Access Enforcement (AC-3)',
      currentValue: 'Unknown',
      expectedValue: 'Active CA policies with grant controls',
      requiredPermission: 'Policy.Read.All',
    };
  }
  const active = facts.conditionalAccess.policies.filter(
    (p) => p.state === 'enabled' && p.grantControls !== null,
  );
  if (active.length > 0) {
    return {
      rating: 'pass',
      message: `${active.length} active CA polic${active.length === 1 ? 'y' : 'ies'} enforcing access controls.`,
      settingName: 'Access Enforcement (AC-3)',
      currentValue: `${active.length} active policies`,
      expectedValue: 'At least 1 active CA policy with grant controls',
    };
  }
  return {
    rating: 'fail',
    message: 'No active Conditional Access policies with grant controls found.',
    action: 'Create and enable Conditional Access policies with MFA or device compliance grant controls.',
    settingName: 'Access Enforcement (AC-3)',
    currentValue: '0 active policies',
    expectedValue: 'At least 1 active CA policy with grant controls',
  };
};

/** AC-6: Least Privilege -- pass when eligible > active (PIM usage) */
export const evaluate80053_AC6: EvaluatorFn = (facts) => {
  if (!facts.roleAssignments.available) {
    return {
      rating: 'na',
      message: 'Role assignment data unavailable.',
      action: 'Grant RoleManagement.Read.Directory permission.',
      settingName: 'Least Privilege (AC-6)',
      currentValue: 'Unknown',
      expectedValue: 'Eligible assignments > active assignments (PIM)',
      requiredPermission: 'RoleManagement.Read.Directory',
    };
  }
  const { eligibleAssignments, activeAssignments } = facts.roleAssignments;
  if (eligibleAssignments > activeAssignments) {
    return {
      rating: 'pass',
      message: `PIM in use: ${eligibleAssignments} eligible vs ${activeAssignments} active role assignments.`,
      settingName: 'Least Privilege (AC-6)',
      currentValue: `${eligibleAssignments} eligible / ${activeAssignments} active`,
      expectedValue: 'Eligible > active (PIM adoption)',
    };
  }
  return {
    rating: 'warn',
    message: `${activeAssignments} active vs ${eligibleAssignments} eligible assignments; PIM may not be adopted.`,
    action: 'Adopt Privileged Identity Management to convert permanent active assignments to eligible.',
    settingName: 'Least Privilege (AC-6)',
    currentValue: `${eligibleAssignments} eligible / ${activeAssignments} active`,
    expectedValue: 'Eligible > active (PIM adoption)',
  };
};

/** AC-7: Unsuccessful Login Attempts -- pass when CA blocks high-risk sign-ins */
export const evaluate80053_AC7: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'na',
      message: 'Conditional Access data unavailable.',
      action: 'Grant Policy.Read.All permission.',
      settingName: 'Unsuccessful Login Response (AC-7)',
      currentValue: 'Unknown',
      expectedValue: 'CA policy blocking high-risk sign-ins',
      requiredPermission: 'Policy.Read.All',
    };
  }
  const hasHighRiskBlock = facts.conditionalAccess.policies.some((p) => {
    if (p.state !== 'enabled') return false;
    const hasHighRisk = p.conditions?.signInRiskLevels?.includes('high');
    const blocks = p.grantControls?.builtInControls?.includes('block');
    return hasHighRisk && blocks;
  });
  if (hasHighRiskBlock) {
    return {
      rating: 'pass',
      message: 'CA policy blocks high-risk sign-in attempts.',
      settingName: 'Unsuccessful Login Response (AC-7)',
      currentValue: 'High-risk sign-ins blocked',
      expectedValue: 'CA policy blocking high-risk sign-ins',
    };
  }
  return {
    rating: 'fail',
    message: 'No active CA policy blocks high-risk sign-in attempts.',
    action: 'Create a CA policy that blocks sign-ins when sign-in risk is high.',
    settingName: 'Unsuccessful Login Response (AC-7)',
    currentValue: 'No high-risk sign-in blocking',
    expectedValue: 'CA policy blocking high-risk sign-ins',
  };
};

/** AC-11: Session Lock -- pass when CA session controls are configured */
export const evaluate80053_AC11: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'na',
      message: 'Conditional Access data unavailable.',
      action: 'Grant Policy.Read.All permission.',
      settingName: 'Session Lock (AC-11)',
      currentValue: 'Unknown',
      expectedValue: 'CA session controls configured',
      requiredPermission: 'Policy.Read.All',
    };
  }
  const hasSessionControls = facts.conditionalAccess.policies.some((p) => {
    if (p.state !== 'enabled') return false;
    const sc = p.sessionControls as Record<string, unknown> | null;
    if (!sc) return false;
    const freq = sc.signInFrequency as Record<string, unknown> | undefined;
    return freq?.isEnabled === true;
  });
  if (hasSessionControls) {
    return {
      rating: 'pass',
      message: 'CA session frequency controls are configured.',
      settingName: 'Session Lock (AC-11)',
      currentValue: 'Session controls active',
      expectedValue: 'CA session controls configured',
    };
  }
  return {
    rating: 'warn',
    message: 'No CA policies configure sign-in frequency session controls.',
    action: 'Add sign-in frequency controls to CA policies for session timeout enforcement.',
    settingName: 'Session Lock (AC-11)',
    currentValue: 'No session controls',
    expectedValue: 'CA session controls configured',
  };
};

/** AC-17: Remote Access -- pass when CA enforces MFA for all users */
export const evaluate80053_AC17: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'na',
      message: 'Conditional Access data unavailable.',
      action: 'Grant Policy.Read.All permission.',
      settingName: 'Remote Access (AC-17)',
      currentValue: 'Unknown',
      expectedValue: 'CA enforcing MFA for all users',
      requiredPermission: 'Policy.Read.All',
    };
  }
  const hasMfaForAll = facts.conditionalAccess.policies.some((p) => {
    if (p.state !== 'enabled') return false;
    const targetsAll = p.conditions?.users?.includeUsers?.includes('All');
    const requiresMfa = p.grantControls?.builtInControls?.includes('mfa');
    return targetsAll && requiresMfa;
  });
  if (hasMfaForAll) {
    return {
      rating: 'pass',
      message: 'CA policy enforces MFA for all users (remote access secured).',
      settingName: 'Remote Access (AC-17)',
      currentValue: 'MFA enforced for all users',
      expectedValue: 'CA enforcing MFA for all users',
    };
  }
  return {
    rating: 'fail',
    message: 'No active CA policy requires MFA for all users.',
    action: 'Create a CA policy requiring MFA for all users to secure remote access.',
    settingName: 'Remote Access (AC-17)',
    currentValue: 'No MFA-for-all policy',
    expectedValue: 'CA enforcing MFA for all users',
  };
};

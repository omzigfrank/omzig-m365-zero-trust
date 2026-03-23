/**
 * MS.AAD.7.x — Privileged Roles & PIM (9 evaluators)
 * Ported from CisaEvaluatorRegistry.ps1 lines 263-291 + new evaluators.
 */
import type { EvaluatorFn } from '../types.js';

/** MS.AAD.7.1v1 — 2-8 Global Administrators. */
export const evaluateAAD_7_1: EvaluatorFn = (facts) => {
  if (!facts.adminRoles.available) {
    return {
      rating: 'fail',
      message: 'Could not verify Global Administrator membership.',
      settingName: 'Global Administrator Count',
      currentValue: 'Unknown',
      expectedValue: '2-8 Global Administrators',
      requiredPermission: 'Directory.Read.All',
    };
  }

  const count = facts.adminRoles.globalAdminCount;
  if (count >= 2 && count <= 8) {
    return {
      rating: 'pass',
      message: `${count} Global Administrators (within 2-8 range).`,
      settingName: 'Global Administrator Count',
      currentValue: `${count}`,
      expectedValue: '2-8',
    };
  }
  if (count < 2) {
    return {
      rating: 'fail',
      message: `Only ${count} Global Administrator(s).`,
      action: 'Provision at least 2 Global Administrators for redundancy.',
      settingName: 'Global Administrator Count',
      currentValue: `${count}`,
      expectedValue: '2-8',
    };
  }
  return {
    rating: 'warn',
    message: `${count} Global Administrators (exceeds recommended 8).`,
    action: 'Reduce excessive Global Administrator count.',
    settingName: 'Global Administrator Count',
    currentValue: `${count}`,
    expectedValue: '2-8',
  };
};

/** MS.AAD.7.2v1 — Privileged users via PIM. */
export const evaluateAAD_7_2: EvaluatorFn = (facts) => {
  if (!facts.roleAssignments.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve PIM role assignments.',
      settingName: 'PIM Eligible Assignments',
      currentValue: 'Unknown',
      expectedValue: 'Eligible PIM assignments exist',
      requiredPermission: 'RoleManagement.Read.Directory',
    };
  }

  if (facts.roleAssignments.eligibleAssignments > 0) {
    return {
      rating: 'pass',
      message: `${facts.roleAssignments.eligibleAssignments} eligible PIM assignments found.`,
      settingName: 'PIM Eligible Assignments',
      currentValue: `${facts.roleAssignments.eligibleAssignments} eligible`,
      expectedValue: 'Eligible PIM assignments exist',
    };
  }
  if (facts.roleAssignments.totalAssignments > 0) {
    return {
      rating: 'warn',
      message: 'Role assignments exist but no eligible (PIM) assignments detected.',
      action: 'Use PIM for eligible role assignments instead of standing access.',
      settingName: 'PIM Eligible Assignments',
      currentValue: `${facts.roleAssignments.totalAssignments} total, 0 eligible`,
      expectedValue: 'Eligible PIM assignments exist',
    };
  }
  return {
    rating: 'na',
    message: 'No role assignments found to evaluate PIM usage.',
    settingName: 'PIM Eligible Assignments',
    currentValue: 'No assignments',
    expectedValue: 'Eligible PIM assignments exist',
  };
};

/** MS.AAD.7.3v1 — GA activation needs approval. */
export const evaluateAAD_7_3: EvaluatorFn = (facts) => {
  if (!facts.licenses.hasP2) {
    return {
      rating: 'na',
      message: 'Requires Entra ID P2 for PIM approval policies.',
      settingName: 'PIM GA Activation Approval',
      currentValue: 'No P2 license',
      expectedValue: 'Approval required for GA activation',
    };
  }
  if (!facts.roleAssignments.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve PIM data to verify approval settings.',
      settingName: 'PIM GA Activation Approval',
      currentValue: 'Unknown',
      expectedValue: 'Approval required for GA activation',
      requiredPermission: 'RoleManagement.Read.Directory',
    };
  }
  return {
    rating: 'warn',
    message: 'Verify that Global Administrator role activation requires approval in PIM settings.',
    action: 'Configure PIM to require approval for Global Administrator role activation.',
    settingName: 'PIM GA Activation Approval',
    currentValue: 'Not verifiable via standard Graph API',
    expectedValue: 'Approval required for GA activation',
  };
};

/** MS.AAD.7.4v1 — Monthly role audit. Advisory. */
export const evaluateAAD_7_4: EvaluatorFn = () => {
  return {
    rating: 'warn',
    message: 'Verify that eligible and active role assignments are audited monthly.',
    action: 'Establish a monthly access review schedule for privileged roles in PIM.',
    settingName: 'Privileged Role Audit Schedule',
    currentValue: 'Not verifiable via Graph API',
    expectedValue: 'Monthly audit configured',
  };
};

/** MS.AAD.7.5v1 — No permanent active assignments. */
export const evaluateAAD_7_5: EvaluatorFn = (facts) => {
  if (!facts.roleAssignments.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve role assignment data.',
      settingName: 'Permanent Active Assignments',
      currentValue: 'Unknown',
      expectedValue: 'No permanent active assignments',
      requiredPermission: 'RoleManagement.Read.Directory',
    };
  }

  const { activeAssignments, eligibleAssignments, totalAssignments } = facts.roleAssignments;
  if (totalAssignments === 0) {
    return {
      rating: 'na',
      message: 'No role assignments found.',
      settingName: 'Permanent Active Assignments',
      currentValue: 'No assignments',
      expectedValue: 'No permanent active assignments',
    };
  }

  if (activeAssignments === 0 || eligibleAssignments >= activeAssignments) {
    return {
      rating: 'pass',
      message: 'Role assignments are managed through PIM (eligible-based).',
      settingName: 'Permanent Active Assignments',
      currentValue: `${activeAssignments} active, ${eligibleAssignments} eligible`,
      expectedValue: 'No permanent active assignments',
    };
  }

  return {
    rating: 'warn',
    message: `${activeAssignments} permanent active role assignments detected.`,
    action: 'Convert permanent active assignments to eligible (time-limited) assignments via PIM.',
    settingName: 'Permanent Active Assignments',
    currentValue: `${activeAssignments} active`,
    expectedValue: 'No permanent active assignments',
  };
};

/** MS.AAD.7.6v1 — MFA for privileged activation. */
export const evaluateAAD_7_6: EvaluatorFn = (facts) => {
  if (!facts.licenses.hasP2) {
    return {
      rating: 'na',
      message: 'Requires Entra ID P2 for PIM MFA policies.',
      settingName: 'PIM Activation MFA',
      currentValue: 'No P2 license',
      expectedValue: 'MFA required for role activation',
    };
  }
  if (!facts.roleAssignments.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve PIM data.',
      settingName: 'PIM Activation MFA',
      currentValue: 'Unknown',
      expectedValue: 'MFA required for role activation',
      requiredPermission: 'RoleManagement.Read.Directory',
    };
  }
  return {
    rating: 'warn',
    message: 'Verify that highly privileged role activation requires MFA in PIM settings.',
    action: 'Configure PIM to require MFA on activation for all highly privileged roles.',
    settingName: 'PIM Activation MFA',
    currentValue: 'Not verifiable via standard Graph API',
    expectedValue: 'MFA required for role activation',
  };
};

/** MS.AAD.7.7v1 — No assignments outside PIM. */
export const evaluateAAD_7_7: EvaluatorFn = (facts) => {
  if (!facts.roleAssignments.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve role assignment data.',
      settingName: 'Role Assignments Outside PIM',
      currentValue: 'Unknown',
      expectedValue: 'All assignments via PIM',
      requiredPermission: 'RoleManagement.Read.Directory',
    };
  }

  const { activeAssignments, eligibleAssignments, totalAssignments } = facts.roleAssignments;
  if (totalAssignments === 0) {
    return {
      rating: 'na',
      message: 'No role assignments found.',
      settingName: 'Role Assignments Outside PIM',
      currentValue: 'No assignments',
      expectedValue: 'All assignments via PIM',
    };
  }

  if (eligibleAssignments > 0 && activeAssignments <= 2) {
    // Allow up to 2 permanent (break-glass accounts)
    return {
      rating: 'pass',
      message: `${eligibleAssignments} PIM-managed assignments. ${activeAssignments} permanent (break-glass allowance).`,
      settingName: 'Role Assignments Outside PIM',
      currentValue: `${eligibleAssignments} eligible, ${activeAssignments} permanent`,
      expectedValue: 'All assignments via PIM',
    };
  }

  return {
    rating: 'warn',
    message: `${activeAssignments} role assignments may exist outside PIM.`,
    action: 'Provision privileged users through PIM eligible assignments, not direct role assignment.',
    settingName: 'Role Assignments Outside PIM',
    currentValue: `${activeAssignments} direct assignments`,
    expectedValue: 'All assignments via PIM',
  };
};

/** MS.AAD.7.8v1 — Alert on privileged activation. Advisory. */
export const evaluateAAD_7_8: EvaluatorFn = () => {
  return {
    rating: 'warn',
    message: 'Verify that alerts are configured for highly privileged role activations.',
    action: 'Configure PIM notifications to alert on Global Administrator and other highly privileged role activations.',
    settingName: 'PIM Activation Alerts',
    currentValue: 'Not verifiable via Graph API',
    expectedValue: 'Alerts configured for privileged activations',
  };
};

/** MS.AAD.7.9v1 — GA activation approval (specific to GA role). */
export const evaluateAAD_7_9: EvaluatorFn = (facts) => {
  if (!facts.licenses.hasP2) {
    return {
      rating: 'na',
      message: 'Requires Entra ID P2 for PIM approval policies.',
      settingName: 'PIM GA Activation Approval (Specific)',
      currentValue: 'No P2 license',
      expectedValue: 'Approval required for GA activation',
    };
  }
  if (!facts.roleAssignments.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve PIM data.',
      settingName: 'PIM GA Activation Approval (Specific)',
      currentValue: 'Unknown',
      expectedValue: 'Approval required for GA activation',
      requiredPermission: 'RoleManagement.Read.Directory',
    };
  }
  return {
    rating: 'warn',
    message: 'Verify that user activation of the Global Administrator role specifically requires approval.',
    action: 'In PIM, set the Global Administrator role to require approval for activation.',
    settingName: 'PIM GA Activation Approval (Specific)',
    currentValue: 'Not verifiable via standard Graph API',
    expectedValue: 'Approval required for GA activation',
  };
};

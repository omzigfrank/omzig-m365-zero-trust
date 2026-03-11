/**
 * MS.AAD.8.x — Guest Access (3 evaluators)
 * Ported from CisaEvaluatorRegistry.ps1 lines 294-321.
 */
import type { EvaluatorFn } from '../types.js';

// Well-known guest user role GUIDs
const GUEST_ROLE_RESTRICTED = '2af84b1e-32c8-42b7-82bc-daa8c0e1b7cb';
const GUEST_ROLE_LIMITED = '10dae51f-b6af-4016-8d66-8c2a99b929b3';

/** MS.AAD.8.1v1 — Guest user access SHOULD be restricted. */
export const evaluateAAD_8_1: EvaluatorFn = (facts) => {
  if (!facts.authorizationPolicy.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve authorization policy.',
      settingName: 'Guest User Access Level',
      currentValue: 'Unknown',
      expectedValue: 'Most restrictive guest access',
      requiredPermission: 'Policy.Read.All',
    };
  }

  const guestRoleId = facts.authorizationPolicy.guestUserRoleId;
  if (guestRoleId === GUEST_ROLE_RESTRICTED) {
    return {
      rating: 'pass',
      message: 'Guest user access is set to most restrictive.',
      settingName: 'Guest User Access Level',
      currentValue: 'Most restrictive',
      expectedValue: 'Most restrictive guest access',
    };
  }
  if (guestRoleId === GUEST_ROLE_LIMITED) {
    return {
      rating: 'warn',
      message: 'Guest user access is limited (not most restrictive).',
      action: "Consider setting guest access to 'Most restrictive' in Entra ID.",
      settingName: 'Guest User Access Level',
      currentValue: 'Limited',
      expectedValue: 'Most restrictive guest access',
    };
  }

  return {
    rating: 'fail',
    message: 'Guest users have same access as members.',
    action: 'Restrict guest user access in External Identities settings.',
    settingName: 'Guest User Access Level',
    currentValue: 'Same as members',
    expectedValue: 'Most restrictive guest access',
  };
};

/** MS.AAD.8.2v1 — Guest invites from specific admin roles. */
export const evaluateAAD_8_2: EvaluatorFn = (facts) => {
  if (!facts.authorizationPolicy.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve authorization policy.',
      settingName: 'Guest Invitation Policy',
      currentValue: 'Unknown',
      expectedValue: 'Restricted to admins',
      requiredPermission: 'Policy.Read.All',
    };
  }

  const invitePolicy = facts.authorizationPolicy.allowInvitesFrom;
  if (invitePolicy === 'adminsAndGuestInviters' || invitePolicy === 'none') {
    return {
      rating: 'pass',
      message: `Guest invitations restricted to admins (${invitePolicy}).`,
      settingName: 'Guest Invitation Policy',
      currentValue: invitePolicy,
      expectedValue: 'Restricted to admins',
    };
  }

  return {
    rating: 'warn',
    message: `Guest invitation policy: ${invitePolicy}.`,
    action: 'Restrict guest invitations to specific admin roles.',
    settingName: 'Guest Invitation Policy',
    currentValue: invitePolicy ?? 'unknown',
    expectedValue: 'Restricted to admins',
  };
};

/** MS.AAD.8.3v1 — Guest user access SHALL be restricted further. */
export const evaluateAAD_8_3: EvaluatorFn = (facts) => {
  if (!facts.authorizationPolicy.available) {
    return {
      rating: 'na',
      message: 'Could not retrieve authorization policy.',
      settingName: 'Guest User Access Restriction',
      currentValue: 'Unknown',
      expectedValue: 'Most restrictive GUID',
      requiredPermission: 'Policy.Read.All',
    };
  }

  const guestRoleId = facts.authorizationPolicy.guestUserRoleId;
  if (guestRoleId === GUEST_ROLE_RESTRICTED) {
    return {
      rating: 'pass',
      message: 'Guest user access uses the most restrictive role.',
      settingName: 'Guest User Access Restriction',
      currentValue: 'Most restrictive',
      expectedValue: 'Most restrictive GUID',
    };
  }

  return {
    rating: 'warn',
    message: 'Guest user access is not at the most restrictive level.',
    action: "Set guest user access to 'Guest user access is restricted to properties and memberships of their own directory objects' in External Identities.",
    settingName: 'Guest User Access Restriction',
    currentValue: guestRoleId === GUEST_ROLE_LIMITED ? 'Limited' : 'Same as members',
    expectedValue: 'Most restrictive GUID',
  };
};

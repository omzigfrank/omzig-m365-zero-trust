/**
 * Tests for all 29 CISA SCuBA Entra ID evaluators.
 * Grouped by control family (AAD.1 through AAD.8).
 */

import { describe, it, expect } from 'vitest';
import type { AuditFacts, EvaluatorResult } from '../types.js';
import { createEmptyFacts } from '../types.js';
import { ENTRA_ID_CONTROLS } from '../registry/entra-id-controls.js';
import { entraIdEvaluators } from '../evaluators/entra-id/index.js';
import { evaluateAAD_1_1 } from '../evaluators/entra-id/aad-1-legacy-auth.js';
import { evaluateAAD_2_1, evaluateAAD_2_3 } from '../evaluators/entra-id/aad-2-risk-policies.js';
import {
  evaluateAAD_3_1, evaluateAAD_3_2, evaluateAAD_3_3, evaluateAAD_3_4,
  evaluateAAD_3_5, evaluateAAD_3_6, evaluateAAD_3_7, evaluateAAD_3_8,
} from '../evaluators/entra-id/aad-3-mfa.js';
import { evaluateAAD_4_1 } from '../evaluators/entra-id/aad-4-logging.js';
import { evaluateAAD_5_1, evaluateAAD_5_2, evaluateAAD_5_3, evaluateAAD_5_4 } from '../evaluators/entra-id/aad-5-applications.js';
import { evaluateAAD_6_1 } from '../evaluators/entra-id/aad-6-passwords.js';
import {
  evaluateAAD_7_1, evaluateAAD_7_2, evaluateAAD_7_3, evaluateAAD_7_4,
  evaluateAAD_7_5, evaluateAAD_7_6, evaluateAAD_7_7, evaluateAAD_7_8, evaluateAAD_7_9,
} from '../evaluators/entra-id/aad-7-privileged-roles.js';
import { evaluateAAD_8_1, evaluateAAD_8_2, evaluateAAD_8_3 } from '../evaluators/entra-id/aad-8-guest-access.js';

function createPassingFacts(): AuditFacts {
  const facts = createEmptyFacts();
  facts.organization = { available: true, tenantId: 't1', displayName: 'Test', primaryDomain: 'test.com' };
  facts.conditionalAccess = {
    available: true, totalPolicies: 6, enabledCount: 6, reportOnlyCount: 0, disabledCount: 0,
    policies: [
      { id: 'p1', displayName: 'Block Legacy', state: 'enabled', conditions: { clientAppTypes: ['exchangeActiveSync', 'other'], users: { includeUsers: ['All'] } }, grantControls: { operator: 'OR', builtInControls: ['block'] }, sessionControls: null },
      { id: 'p2', displayName: 'MFA All', state: 'enabled', conditions: { clientAppTypes: ['all'], users: { includeUsers: ['All'] }, userRiskLevels: ['high'] }, grantControls: { operator: 'OR', builtInControls: ['mfa'] }, sessionControls: null },
      { id: 'p3', displayName: 'Risk Sign-In', state: 'enabled', conditions: { clientAppTypes: ['all'], users: { includeUsers: ['All'] }, signInRiskLevels: ['high'] }, grantControls: { operator: 'OR', builtInControls: ['block'] }, sessionControls: null },
      { id: 'p4', displayName: 'Admin MFA', state: 'enabled', conditions: { clientAppTypes: ['all'], users: { includeRoles: ['ga-role'] } }, grantControls: { operator: 'OR', builtInControls: ['mfa'], authenticationStrength: { id: 'pr' } }, sessionControls: null },
      { id: 'p5', displayName: 'Compliant Device', state: 'enabled', conditions: { clientAppTypes: ['all'], users: { includeUsers: ['All'] } }, grantControls: { operator: 'OR', builtInControls: ['compliantDevice'] }, sessionControls: null },
      { id: 'p6', displayName: 'Auth Strength', state: 'enabled', conditions: { clientAppTypes: ['all'], users: { includeUsers: ['All'] } }, grantControls: { operator: 'OR', builtInControls: [], authenticationStrength: { id: 'pr-mfa' } }, sessionControls: null },
    ],
  };
  facts.mfa = { available: true, totalUsers: 100, registeredUsers: 90, percentage: 90 };
  facts.authMethods = { available: true, migrationState: 'migrationComplete', smsEnabled: false, voiceEnabled: false, microsoftAuthEnabled: true, fido2Enabled: true };
  facts.authorizationPolicy = { available: true, defaultUserRoleAllowedToCreateApps: false, allowInvitesFrom: 'adminsAndGuestInviters', guestUserRoleId: '2af84b1e-32c8-42b7-82bc-daa8c0e1b7cb' };
  facts.adminConsentPolicy = { available: true, enabled: true };
  facts.passwordPolicy = { available: true, passwordValidityPeriodInDays: 0, passwordNotificationWindowInDays: 14 };
  facts.adminRoles = { available: true, globalAdminCount: 3, globalAdminRoleId: 'ga' };
  facts.roleAssignments = { available: true, totalAssignments: 10, eligibleAssignments: 8, activeAssignments: 2 };
  facts.devices = { available: true, totalDevices: 50, compliantDevices: 45, nonCompliantDevices: 5 };
  facts.licenses = { available: true, hasQualifyingSku: true, hasP2: true, hasIntune: true, hasDefenderO365: true, hasDefenderEndpt: true, licenses: [] };
  facts.securityDefaults = { available: true, enabled: false };
  facts.domains = { available: true, totalDomains: 2, customDomainCount: 1, hasOnlyOnmicrosoft: false };
  facts.appRegistrations = { available: true, totalApps: 5 };
  facts.sensitivityLabels = { available: true, totalLabels: 3 };
  return facts;
}

function createFailingFacts(): AuditFacts {
  const facts = createEmptyFacts();
  facts.organization = { available: true, tenantId: 't2', displayName: 'Fail', primaryDomain: 'fail.com' };
  facts.conditionalAccess = { available: true, totalPolicies: 1, enabledCount: 0, reportOnlyCount: 0, disabledCount: 1, policies: [{ id: 'd1', displayName: 'Disabled', state: 'disabled', conditions: { clientAppTypes: ['all'] }, grantControls: null, sessionControls: null }] };
  facts.mfa = { available: true, totalUsers: 100, registeredUsers: 20, percentage: 20 };
  facts.authMethods = { available: true, migrationState: 'preMigration', smsEnabled: true, voiceEnabled: true, microsoftAuthEnabled: false, fido2Enabled: false };
  facts.authorizationPolicy = { available: true, defaultUserRoleAllowedToCreateApps: true, allowInvitesFrom: 'everyone', guestUserRoleId: 'a0b1b346-4d3e-4e8b-98f8-753987be4970' };
  facts.adminConsentPolicy = { available: true, enabled: false };
  facts.passwordPolicy = { available: true, passwordValidityPeriodInDays: 90, passwordNotificationWindowInDays: 14 };
  facts.adminRoles = { available: true, globalAdminCount: 1, globalAdminRoleId: 'ga' };
  facts.roleAssignments = { available: true, totalAssignments: 5, eligibleAssignments: 0, activeAssignments: 5 };
  facts.devices = { available: true, totalDevices: 10, compliantDevices: 2, nonCompliantDevices: 8 };
  facts.licenses = { available: true, hasQualifyingSku: true, hasP2: true, hasIntune: false, hasDefenderO365: false, hasDefenderEndpt: false, licenses: [] };
  facts.securityDefaults = { available: true, enabled: true };
  facts.domains = { available: true, totalDomains: 1, customDomainCount: 0, hasOnlyOnmicrosoft: true };
  facts.appRegistrations = { available: true, totalApps: 10 };
  facts.sensitivityLabels = { available: true, totalLabels: 0 };
  return facts;
}

function assertResult(r: EvaluatorResult) {
  expect(r.message).toBeTruthy();
  expect(['pass', 'fail', 'warn', 'na']).toContain(r.rating);
}

describe('Registry completeness', () => {
  it('has 29 controls', () => expect(ENTRA_ID_CONTROLS).toHaveLength(29));
  it('has 29 evaluators in map', () => expect(entraIdEvaluators.size).toBe(29));
  it('no placeholder evaluators', () => {
    const f = createPassingFacts();
    for (const c of ENTRA_ID_CONTROLS) {
      expect(c.evaluator(f).message).not.toBe('Evaluator not yet implemented');
    }
  });
  it('every evaluator populates settingName', () => {
    const f = createPassingFacts();
    for (const c of ENTRA_ID_CONTROLS) expect(c.evaluator(f).settingName).toBeTruthy();
  });
});

describe('AAD.1 Legacy Auth', () => {
  it('1.1 pass with blocking policy', () => { const r = evaluateAAD_1_1(createPassingFacts()); assertResult(r); expect(r.rating).toBe('pass'); });
  it('1.1 fail without blocking policy', () => { const r = evaluateAAD_1_1(createFailingFacts()); assertResult(r); expect(r.rating).toBe('fail'); });
  it('1.1 fail+perm when CA unavailable', () => { const f = createEmptyFacts(); const r = evaluateAAD_1_1(f); expect(r.rating).toBe('fail'); expect(r.requiredPermission).toBe('Policy.Read.All'); });
});

describe('AAD.2 Risk Policies', () => {
  it('2.1 pass with user risk policy', () => { assertResult(evaluateAAD_2_1(createPassingFacts())); expect(evaluateAAD_2_1(createPassingFacts()).rating).toBe('pass'); });
  it('2.1 na without P2', () => { const f = createPassingFacts(); f.licenses.hasP2 = false; expect(evaluateAAD_2_1(f).rating).toBe('na'); });
  it('2.1 fail without risk policy', () => expect(evaluateAAD_2_1(createFailingFacts()).rating).toBe('fail'));
  it('2.3 pass with sign-in risk policy', () => expect(evaluateAAD_2_3(createPassingFacts()).rating).toBe('pass'));
  it('2.3 na without P2', () => { const f = createPassingFacts(); f.licenses.hasP2 = false; expect(evaluateAAD_2_3(f).rating).toBe('na'); });
});

describe('AAD.3 MFA', () => {
  it('3.1 pass with MFA policy', () => expect(evaluateAAD_3_1(createPassingFacts()).rating).toBe('pass'));
  it('3.1 fail without MFA', () => expect(evaluateAAD_3_1(createFailingFacts()).rating).toBe('fail'));
  it('3.2 pass >=80%', () => expect(evaluateAAD_3_2(createPassingFacts()).rating).toBe('pass'));
  it('3.2 fail <50%', () => expect(evaluateAAD_3_2(createFailingFacts()).rating).toBe('fail'));
  it('3.3 pass with auth strength', () => expect(evaluateAAD_3_3(createPassingFacts()).rating).toBe('pass'));
  it('3.4 pass migration complete', () => expect(evaluateAAD_3_4(createPassingFacts()).rating).toBe('pass'));
  it('3.4 fail pre-migration', () => expect(evaluateAAD_3_4(createFailingFacts()).rating).toBe('fail'));
  it('3.5 pass SMS/voice disabled', () => expect(evaluateAAD_3_5(createPassingFacts()).rating).toBe('pass'));
  it('3.5 warn SMS enabled', () => expect(evaluateAAD_3_5(createFailingFacts()).rating).toBe('warn'));
  it('3.6 pass admin MFA', () => expect(evaluateAAD_3_6(createPassingFacts()).rating).toBe('pass'));
  it('3.6 warn no admin MFA', () => expect(evaluateAAD_3_6(createFailingFacts()).rating).toBe('warn'));
  it('3.7 pass compliant device', () => expect(evaluateAAD_3_7(createPassingFacts()).rating).toBe('pass'));
  it('3.7 warn no device policy', () => expect(evaluateAAD_3_7(createFailingFacts()).rating).toBe('warn'));
  it('3.8 pass MFA reg device', () => expect(evaluateAAD_3_8(createPassingFacts()).rating).toBe('pass'));
  it('3.8 warn no reg policy', () => expect(evaluateAAD_3_8(createFailingFacts()).rating).toBe('warn'));
});

describe('AAD.4 Logging', () => {
  it('4.1 always warn (advisory)', () => expect(evaluateAAD_4_1(createPassingFacts()).rating).toBe('warn'));
});

describe('AAD.5 Applications', () => {
  it('5.1 pass users cant register', () => expect(evaluateAAD_5_1(createPassingFacts()).rating).toBe('pass'));
  it('5.1 fail users can register', () => expect(evaluateAAD_5_1(createFailingFacts()).rating).toBe('fail'));
  it('5.2 pass admin consent only', () => expect(evaluateAAD_5_2(createPassingFacts()).rating).toBe('pass'));
  it('5.2 fail users consent', () => expect(evaluateAAD_5_2(createFailingFacts()).rating).toBe('fail'));
  it('5.3 pass workflow enabled', () => expect(evaluateAAD_5_3(createPassingFacts()).rating).toBe('pass'));
  it('5.3 fail workflow disabled', () => expect(evaluateAAD_5_3(createFailingFacts()).rating).toBe('fail'));
  it('5.4 pass group consent restricted', () => expect(evaluateAAD_5_4(createPassingFacts()).rating).toBe('pass'));
  it('5.4 warn group consent open', () => expect(evaluateAAD_5_4(createFailingFacts()).rating).toBe('warn'));
});

describe('AAD.6 Passwords', () => {
  it('6.1 pass never expire (0)', () => expect(evaluateAAD_6_1(createPassingFacts()).rating).toBe('pass'));
  it('6.1 pass null', () => { const f = createPassingFacts(); f.passwordPolicy.passwordValidityPeriodInDays = null; expect(evaluateAAD_6_1(f).rating).toBe('pass'); });
  it('6.1 fail 90 days', () => expect(evaluateAAD_6_1(createFailingFacts()).rating).toBe('fail'));
});

describe('AAD.7 Privileged Roles', () => {
  it('7.1 pass 2-8 admins', () => expect(evaluateAAD_7_1(createPassingFacts()).rating).toBe('pass'));
  it('7.1 fail 1 admin', () => expect(evaluateAAD_7_1(createFailingFacts()).rating).toBe('fail'));
  it('7.1 warn >8', () => { const f = createPassingFacts(); f.adminRoles.globalAdminCount = 12; expect(evaluateAAD_7_1(f).rating).toBe('warn'); });
  it('7.2 pass eligible PIM', () => expect(evaluateAAD_7_2(createPassingFacts()).rating).toBe('pass'));
  it('7.2 na unavailable', () => { const f = createPassingFacts(); f.roleAssignments.available = false; expect(evaluateAAD_7_2(f).rating).toBe('na'); });
  it('7.2 warn no eligible', () => expect(evaluateAAD_7_2(createFailingFacts()).rating).toBe('warn'));
  it('7.3 warn advisory', () => expect(['warn', 'na']).toContain(evaluateAAD_7_3(createPassingFacts()).rating));
  it('7.4 warn advisory', () => expect(evaluateAAD_7_4(createPassingFacts()).rating).toBe('warn'));
  it('7.5 pass PIM-managed', () => expect(evaluateAAD_7_5(createPassingFacts()).rating).toBe('pass'));
  it('7.5 warn all active', () => expect(evaluateAAD_7_5(createFailingFacts()).rating).toBe('warn'));
  it('7.6 warn advisory', () => expect(['warn', 'na']).toContain(evaluateAAD_7_6(createPassingFacts()).rating));
  it('7.7 pass with PIM', () => expect(evaluateAAD_7_7(createPassingFacts()).rating).toBe('pass'));
  it('7.8 warn advisory', () => expect(evaluateAAD_7_8(createPassingFacts()).rating).toBe('warn'));
  it('7.9 warn advisory', () => expect(['warn', 'na']).toContain(evaluateAAD_7_9(createPassingFacts()).rating));
});

describe('AAD.8 Guest Access', () => {
  it('8.1 pass restricted', () => expect(evaluateAAD_8_1(createPassingFacts()).rating).toBe('pass'));
  it('8.1 fail same as member', () => expect(evaluateAAD_8_1(createFailingFacts()).rating).toBe('fail'));
  it('8.2 pass admin invites', () => expect(evaluateAAD_8_2(createPassingFacts()).rating).toBe('pass'));
  it('8.2 warn everyone invites', () => expect(evaluateAAD_8_2(createFailingFacts()).rating).toBe('warn'));
  it('8.3 pass most restrictive', () => expect(evaluateAAD_8_3(createPassingFacts()).rating).toBe('pass'));
  it('8.3 warn not restrictive', () => expect(evaluateAAD_8_3(createFailingFacts()).rating).toBe('warn'));
});

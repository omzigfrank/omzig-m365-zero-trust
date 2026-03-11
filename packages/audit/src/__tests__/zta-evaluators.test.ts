/**
 * Tests for all 31 NIST 800-207 ZTA evaluators.
 * Grouped by tenet (T1 through T7).
 */

import { describe, it, expect } from 'vitest';
import type { AuditFacts, EvaluatorResult } from '../types.js';
import { createEmptyFacts } from '../types.js';
import { NIST_ZTA_CONTROLS } from '../registry/nist-zta-controls.js';
import { ztaEvaluators } from '../evaluators/nist-zta/index.js';
import {
  evaluateZTA_T1_1,
  evaluateZTA_T1_2,
  evaluateZTA_T1_3,
  evaluateZTA_T1_4,
} from '../evaluators/nist-zta/tenet-1-resources.js';
import {
  evaluateZTA_T2_1,
  evaluateZTA_T2_2,
  evaluateZTA_T2_3,
  evaluateZTA_T2_4,
} from '../evaluators/nist-zta/tenet-2-communication.js';
import {
  evaluateZTA_T3_1,
  evaluateZTA_T3_2,
} from '../evaluators/nist-zta/tenet-3-per-session.js';
import {
  evaluateZTA_T4_1,
  evaluateZTA_T4_2,
  evaluateZTA_T4_3,
  evaluateZTA_T4_4,
  evaluateZTA_T4_5,
  evaluateZTA_T4_6,
} from '../evaluators/nist-zta/tenet-4-dynamic-policy.js';
import {
  evaluateZTA_T5_1,
  evaluateZTA_T5_2,
  evaluateZTA_T5_3,
  evaluateZTA_T5_4,
} from '../evaluators/nist-zta/tenet-5-monitoring.js';
import {
  evaluateZTA_T6_1,
  evaluateZTA_T6_2,
  evaluateZTA_T6_3,
  evaluateZTA_T6_4,
  evaluateZTA_T6_5,
  evaluateZTA_T6_6,
  evaluateZTA_T6_7,
} from '../evaluators/nist-zta/tenet-6-authentication.js';
import {
  evaluateZTA_T7_1,
  evaluateZTA_T7_2,
  evaluateZTA_T7_3,
  evaluateZTA_T7_4,
} from '../evaluators/nist-zta/tenet-7-improvement.js';

function createPassingFacts(): AuditFacts {
  const facts = createEmptyFacts();
  facts.organization = { available: true, tenantId: 't1', displayName: 'Test', primaryDomain: 'test.com' };
  facts.conditionalAccess = {
    available: true, totalPolicies: 6, enabledCount: 6, reportOnlyCount: 0, disabledCount: 0,
    policies: [
      {
        id: 'p1', displayName: 'Block Legacy', state: 'enabled',
        conditions: { clientAppTypes: ['exchangeActiveSync', 'other'], users: { includeUsers: ['All'] } },
        grantControls: { operator: 'OR', builtInControls: ['block'] }, sessionControls: null,
      },
      {
        id: 'p2', displayName: 'MFA All', state: 'enabled',
        conditions: { clientAppTypes: ['all'], users: { includeUsers: ['All'] }, userRiskLevels: ['high'] },
        grantControls: { operator: 'OR', builtInControls: ['mfa'] }, sessionControls: null,
      },
      {
        id: 'p3', displayName: 'Risk Sign-In', state: 'enabled',
        conditions: { clientAppTypes: ['all'], users: { includeUsers: ['All'] }, signInRiskLevels: ['high'] },
        grantControls: { operator: 'OR', builtInControls: ['block'] }, sessionControls: null,
      },
      {
        id: 'p4', displayName: 'Admin MFA', state: 'enabled',
        conditions: { clientAppTypes: ['all'], users: { includeRoles: ['ga-role'] } },
        grantControls: { operator: 'OR', builtInControls: ['mfa'] }, sessionControls: null,
      },
      {
        id: 'p5', displayName: 'Compliant Device', state: 'enabled',
        conditions: { clientAppTypes: ['all'], users: { includeUsers: ['All'] }, locations: { includeLocations: ['AllTrusted'] } },
        grantControls: { operator: 'OR', builtInControls: ['compliantDevice'] },
        sessionControls: { signInFrequency: { isEnabled: true, value: 4, type: 'hours' } },
      },
      {
        id: 'p6', displayName: 'App-Specific', state: 'enabled',
        conditions: { clientAppTypes: ['all'], users: { includeUsers: ['All'] }, applications: { includeApplications: ['specific-app-id'] } },
        grantControls: { operator: 'OR', builtInControls: ['mfa'] }, sessionControls: null,
      },
    ],
  };
  facts.namedLocations = { available: true, totalLocations: 2, locations: [{ id: 'l1', displayName: 'Office', isTrusted: false }, { id: 'l2', displayName: 'VPN', isTrusted: false }] };
  facts.mfa = { available: true, totalUsers: 100, registeredUsers: 98, percentage: 98 };
  facts.authMethods = { available: true, migrationState: 'migrationComplete', smsEnabled: false, voiceEnabled: false, microsoftAuthEnabled: true, fido2Enabled: true };
  facts.authorizationPolicy = { available: true, defaultUserRoleAllowedToCreateApps: false, allowInvitesFrom: 'adminsAndGuestInviters', guestUserRoleId: '2af84b1e' };
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
  facts.conditionalAccess = {
    available: true, totalPolicies: 1, enabledCount: 0, reportOnlyCount: 0, disabledCount: 1,
    policies: [
      { id: 'd1', displayName: 'Disabled', state: 'disabled', conditions: { clientAppTypes: ['all'] }, grantControls: null, sessionControls: null },
    ],
  };
  facts.namedLocations = { available: true, totalLocations: 2, locations: [{ id: 'l1', displayName: 'Office', isTrusted: true }, { id: 'l2', displayName: 'Home', isTrusted: true }] };
  facts.mfa = { available: true, totalUsers: 100, registeredUsers: 20, percentage: 20 };
  facts.authMethods = { available: true, migrationState: 'preMigration', smsEnabled: true, voiceEnabled: true, microsoftAuthEnabled: false, fido2Enabled: false };
  facts.authorizationPolicy = { available: true, defaultUserRoleAllowedToCreateApps: true, allowInvitesFrom: 'everyone', guestUserRoleId: 'a0b1b346' };
  facts.adminConsentPolicy = { available: true, enabled: false };
  facts.passwordPolicy = { available: true, passwordValidityPeriodInDays: 90, passwordNotificationWindowInDays: 14 };
  facts.adminRoles = { available: true, globalAdminCount: 1, globalAdminRoleId: 'ga' };
  facts.roleAssignments = { available: true, totalAssignments: 5, eligibleAssignments: 0, activeAssignments: 5 };
  facts.devices = { available: true, totalDevices: 0, compliantDevices: 0, nonCompliantDevices: 0 };
  facts.licenses = { available: true, hasQualifyingSku: false, hasP2: false, hasIntune: false, hasDefenderO365: false, hasDefenderEndpt: false, licenses: [] };
  facts.securityDefaults = { available: true, enabled: true };
  facts.domains = { available: true, totalDomains: 1, customDomainCount: 0, hasOnlyOnmicrosoft: true };
  facts.appRegistrations = { available: true, totalApps: 0 };
  facts.sensitivityLabels = { available: true, totalLabels: 0 };
  return facts;
}

function assertResult(r: EvaluatorResult) {
  expect(r.message).toBeTruthy();
  expect(['pass', 'fail', 'warn', 'na']).toContain(r.rating);
}

// ======================================================================
// Registry completeness
// ======================================================================

describe('ZTA Registry completeness', () => {
  it('has exactly 31 controls', () => expect(NIST_ZTA_CONTROLS).toHaveLength(31));
  it('has 31 evaluators in map', () => expect(ztaEvaluators.size).toBe(31));
  it('all controls have product ZTA', () => {
    for (const c of NIST_ZTA_CONTROLS) expect(c.product).toBe('ZTA');
  });
  it('all 7 tenets represented', () => {
    const tenets = new Set(NIST_ZTA_CONTROLS.map((c) => c.nist800207Tenet));
    expect(tenets).toEqual(new Set(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']));
  });
  it('every evaluator populates settingName', () => {
    const f = createPassingFacts();
    for (const c of NIST_ZTA_CONTROLS) expect(c.evaluator(f).settingName).toBeTruthy();
  });
});

// ======================================================================
// Tenet 1: Resource Awareness
// ======================================================================

describe('ZTA Tenet 1: Resource Awareness', () => {
  it('T1.1 pass with managed devices', () => {
    const r = evaluateZTA_T1_1(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T1.1 fail with no devices', () => {
    const facts = createPassingFacts();
    facts.devices.totalDevices = 0;
    expect(evaluateZTA_T1_1(facts).rating).toBe('fail');
  });
  it('T1.1 fail when unavailable', () => {
    const facts = createEmptyFacts();
    expect(evaluateZTA_T1_1(facts).rating).toBe('fail');
  });

  it('T1.2 pass with app registrations', () => {
    const r = evaluateZTA_T1_2(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T1.2 warn with no apps', () => {
    const facts = createPassingFacts();
    facts.appRegistrations.totalApps = 0;
    expect(evaluateZTA_T1_2(facts).rating).toBe('warn');
  });
  it('T1.2 na when unavailable', () => {
    const facts = createEmptyFacts();
    expect(evaluateZTA_T1_2(facts).rating).toBe('na');
  });

  it('T1.3 pass with sensitivity labels', () => {
    const r = evaluateZTA_T1_3(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T1.3 warn with no labels', () => {
    const facts = createPassingFacts();
    facts.sensitivityLabels.totalLabels = 0;
    expect(evaluateZTA_T1_3(facts).rating).toBe('warn');
  });
  it('T1.3 na when unavailable', () => {
    const facts = createEmptyFacts();
    expect(evaluateZTA_T1_3(facts).rating).toBe('na');
  });

  it('T1.4 pass with custom domain', () => {
    const r = evaluateZTA_T1_4(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T1.4 warn with only onmicrosoft', () => {
    const facts = createPassingFacts();
    facts.domains.customDomainCount = 0;
    expect(evaluateZTA_T1_4(facts).rating).toBe('warn');
  });
  it('T1.4 fail when unavailable', () => {
    const facts = createEmptyFacts();
    expect(evaluateZTA_T1_4(facts).rating).toBe('fail');
  });
});

// ======================================================================
// Tenet 2: Secure Communication
// ======================================================================

describe('ZTA Tenet 2: Secure Communication', () => {
  it('T2.1 pass with legacy auth blocked', () => {
    const r = evaluateZTA_T2_1(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T2.1 fail without block policy', () => {
    expect(evaluateZTA_T2_1(createFailingFacts()).rating).toBe('fail');
  });
  it('T2.1 fail when unavailable', () => {
    expect(evaluateZTA_T2_1(createEmptyFacts()).rating).toBe('fail');
  });

  it('T2.2 pass with CA and no security defaults', () => {
    const r = evaluateZTA_T2_2(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T2.2 fail with neither active', () => {
    const facts = createFailingFacts();
    facts.securityDefaults.enabled = false;
    facts.conditionalAccess.totalPolicies = 0;
    expect(evaluateZTA_T2_2(facts).rating).toBe('fail');
  });
  it('T2.2 fail when unavailable', () => {
    expect(evaluateZTA_T2_2(createEmptyFacts()).rating).toBe('fail');
  });

  it('T2.3 pass with no trusted locations', () => {
    const r = evaluateZTA_T2_3(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T2.3 warn with trusted locations', () => {
    expect(evaluateZTA_T2_3(createFailingFacts()).rating).toBe('warn');
  });
  it('T2.3 na when unavailable', () => {
    expect(evaluateZTA_T2_3(createEmptyFacts()).rating).toBe('na');
  });

  it('T2.4 pass with CA and qualifying license', () => {
    const r = evaluateZTA_T2_4(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T2.4 warn without qualifying conditions', () => {
    expect(evaluateZTA_T2_4(createFailingFacts()).rating).toBe('warn');
  });
  it('T2.4 na when unavailable', () => {
    expect(evaluateZTA_T2_4(createEmptyFacts()).rating).toBe('na');
  });
});

// ======================================================================
// Tenet 3: Per-Session Access
// ======================================================================

describe('ZTA Tenet 3: Per-Session Access', () => {
  it('T3.1 pass with >= 3 enabled/reportOnly CA policies', () => {
    const r = evaluateZTA_T3_1(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T3.1 fail with 0 active policies', () => {
    expect(evaluateZTA_T3_1(createFailingFacts()).rating).toBe('fail');
  });
  it('T3.1 warn with 1-2 policies', () => {
    const facts = createPassingFacts();
    facts.conditionalAccess.enabledCount = 2;
    facts.conditionalAccess.reportOnlyCount = 0;
    expect(evaluateZTA_T3_1(facts).rating).toBe('warn');
  });
  it('T3.1 fail when unavailable', () => {
    expect(evaluateZTA_T3_1(createEmptyFacts()).rating).toBe('fail');
  });

  it('T3.2 pass with session controls', () => {
    const r = evaluateZTA_T3_2(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T3.2 warn without session controls', () => {
    expect(evaluateZTA_T3_2(createFailingFacts()).rating).toBe('warn');
  });
  it('T3.2 na when unavailable', () => {
    expect(evaluateZTA_T3_2(createEmptyFacts()).rating).toBe('na');
  });
});

// ======================================================================
// Tenet 4: Dynamic Policy
// ======================================================================

describe('ZTA Tenet 4: Dynamic Policy', () => {
  it('T4.1 pass with both risk policies', () => {
    const r = evaluateZTA_T4_1(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T4.1 warn without P2', () => {
    const facts = createPassingFacts();
    facts.licenses.hasP2 = false;
    expect(evaluateZTA_T4_1(facts).rating).toBe('warn');
  });
  it('T4.1 fail with P2 but no risk policies', () => {
    const facts = createFailingFacts();
    facts.licenses.hasP2 = true;
    expect(evaluateZTA_T4_1(facts).rating).toBe('fail');
  });
  it('T4.1 fail when unavailable', () => {
    expect(evaluateZTA_T4_1(createEmptyFacts()).rating).toBe('fail');
  });

  it('T4.2 pass with compliant device requirement', () => {
    const r = evaluateZTA_T4_2(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T4.2 warn without compliant device policy', () => {
    expect(evaluateZTA_T4_2(createFailingFacts()).rating).toBe('warn');
  });
  it('T4.2 na when unavailable', () => {
    expect(evaluateZTA_T4_2(createEmptyFacts()).rating).toBe('na');
  });

  it('T4.3 pass with location conditions', () => {
    const r = evaluateZTA_T4_3(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T4.3 warn without location conditions', () => {
    expect(evaluateZTA_T4_3(createFailingFacts()).rating).toBe('warn');
  });
  it('T4.3 na when unavailable', () => {
    expect(evaluateZTA_T4_3(createEmptyFacts()).rating).toBe('na');
  });

  it('T4.4 pass with app-specific policies', () => {
    const r = evaluateZTA_T4_4(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T4.4 warn without app-specific policies', () => {
    expect(evaluateZTA_T4_4(createFailingFacts()).rating).toBe('warn');
  });
  it('T4.4 na when unavailable', () => {
    expect(evaluateZTA_T4_4(createEmptyFacts()).rating).toBe('na');
  });

  it('T4.5 pass with >= 95% MFA', () => {
    const r = evaluateZTA_T4_5(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T4.5 warn with 80-94% MFA', () => {
    const facts = createPassingFacts();
    facts.mfa.percentage = 85;
    expect(evaluateZTA_T4_5(facts).rating).toBe('warn');
  });
  it('T4.5 fail with < 80% MFA', () => {
    expect(evaluateZTA_T4_5(createFailingFacts()).rating).toBe('fail');
  });
  it('T4.5 fail when unavailable', () => {
    expect(evaluateZTA_T4_5(createEmptyFacts()).rating).toBe('fail');
  });

  it('T4.6 pass with admin role targeting', () => {
    const r = evaluateZTA_T4_6(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T4.6 warn without admin targeting', () => {
    expect(evaluateZTA_T4_6(createFailingFacts()).rating).toBe('warn');
  });
  it('T4.6 na when unavailable', () => {
    expect(evaluateZTA_T4_6(createEmptyFacts()).rating).toBe('na');
  });
});

// ======================================================================
// Tenet 5: Integrity Monitoring
// ======================================================================

describe('ZTA Tenet 5: Integrity Monitoring', () => {
  it('T5.1 pass with qualifying license', () => {
    const r = evaluateZTA_T5_1(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T5.1 fail without qualifying license', () => {
    expect(evaluateZTA_T5_1(createFailingFacts()).rating).toBe('fail');
  });
  it('T5.1 na when unavailable', () => {
    expect(evaluateZTA_T5_1(createEmptyFacts()).rating).toBe('na');
  });

  it('T5.2 pass with Defender for Endpoint', () => {
    const r = evaluateZTA_T5_2(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T5.2 warn without Defender for Endpoint', () => {
    expect(evaluateZTA_T5_2(createFailingFacts()).rating).toBe('warn');
  });
  it('T5.2 na when unavailable', () => {
    expect(evaluateZTA_T5_2(createEmptyFacts()).rating).toBe('na');
  });

  it('T5.3 pass with Defender for O365', () => {
    const r = evaluateZTA_T5_3(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T5.3 warn without Defender for O365', () => {
    expect(evaluateZTA_T5_3(createFailingFacts()).rating).toBe('warn');
  });
  it('T5.3 na when unavailable', () => {
    expect(evaluateZTA_T5_3(createEmptyFacts()).rating).toBe('na');
  });

  it('T5.4 pass with >= 5 telemetry sources', () => {
    const r = evaluateZTA_T5_4(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T5.4 warn with 3-4 sources', () => {
    const facts = createEmptyFacts();
    facts.conditionalAccess = { available: true, totalPolicies: 1, enabledCount: 1, reportOnlyCount: 0, disabledCount: 0, policies: [] };
    facts.mfa = { available: true, totalUsers: 10, registeredUsers: 5, percentage: 50 };
    facts.devices = { available: true, totalDevices: 1, compliantDevices: 1, nonCompliantDevices: 0 };
    expect(evaluateZTA_T5_4(facts).rating).toBe('warn');
  });
  it('T5.4 fail with < 3 sources', () => {
    const facts = createEmptyFacts();
    facts.conditionalAccess = { available: true, totalPolicies: 1, enabledCount: 1, reportOnlyCount: 0, disabledCount: 0, policies: [] };
    expect(evaluateZTA_T5_4(facts).rating).toBe('fail');
  });
});

// ======================================================================
// Tenet 6: Dynamic Authentication
// ======================================================================

describe('ZTA Tenet 6: Dynamic Authentication', () => {
  it('T6.1 pass with >= 95% MFA', () => {
    const r = evaluateZTA_T6_1(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T6.1 warn with 80-94%', () => {
    const facts = createPassingFacts();
    facts.mfa.percentage = 85;
    expect(evaluateZTA_T6_1(facts).rating).toBe('warn');
  });
  it('T6.1 fail with < 80%', () => {
    expect(evaluateZTA_T6_1(createFailingFacts()).rating).toBe('fail');
  });
  it('T6.1 fail when unavailable', () => {
    expect(evaluateZTA_T6_1(createEmptyFacts()).rating).toBe('fail');
  });

  it('T6.2 pass with 2-5 global admins', () => {
    const r = evaluateZTA_T6_2(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T6.2 warn with 1 admin', () => {
    expect(evaluateZTA_T6_2(createFailingFacts()).rating).toBe('warn');
  });
  it('T6.2 warn with > 5 admins', () => {
    const facts = createPassingFacts();
    facts.adminRoles.globalAdminCount = 8;
    expect(evaluateZTA_T6_2(facts).rating).toBe('warn');
  });
  it('T6.2 fail when unavailable', () => {
    expect(evaluateZTA_T6_2(createEmptyFacts()).rating).toBe('fail');
  });

  it('T6.3 always warn (advisory)', () => {
    const r = evaluateZTA_T6_3(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('warn');
  });
  it('T6.3 warn even with failing facts', () => {
    expect(evaluateZTA_T6_3(createFailingFacts()).rating).toBe('warn');
  });

  it('T6.4 pass with migration complete', () => {
    const r = evaluateZTA_T6_4(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T6.4 warn with pre-migration', () => {
    expect(evaluateZTA_T6_4(createFailingFacts()).rating).toBe('warn');
  });
  it('T6.4 na when unavailable', () => {
    expect(evaluateZTA_T6_4(createEmptyFacts()).rating).toBe('na');
  });

  it('T6.5 pass with SMS and voice disabled', () => {
    const r = evaluateZTA_T6_5(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T6.5 warn with SMS/voice enabled', () => {
    expect(evaluateZTA_T6_5(createFailingFacts()).rating).toBe('warn');
  });
  it('T6.5 na when unavailable', () => {
    expect(evaluateZTA_T6_5(createEmptyFacts()).rating).toBe('na');
  });

  it('T6.6 pass with eligible PIM assignments', () => {
    const r = evaluateZTA_T6_6(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T6.6 warn without eligible assignments', () => {
    expect(evaluateZTA_T6_6(createFailingFacts()).rating).toBe('warn');
  });
  it('T6.6 na when unavailable', () => {
    expect(evaluateZTA_T6_6(createEmptyFacts()).rating).toBe('na');
  });

  it('T6.7 pass with admin consent enabled', () => {
    const r = evaluateZTA_T6_7(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T6.7 warn with admin consent disabled', () => {
    expect(evaluateZTA_T6_7(createFailingFacts()).rating).toBe('warn');
  });
  it('T6.7 na when unavailable', () => {
    expect(evaluateZTA_T6_7(createEmptyFacts()).rating).toBe('na');
  });
});

// ======================================================================
// Tenet 7: Continuous Improvement
// ======================================================================

describe('ZTA Tenet 7: Continuous Improvement', () => {
  it('T7.1 pass with P2 license', () => {
    const r = evaluateZTA_T7_1(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T7.1 warn without P2', () => {
    expect(evaluateZTA_T7_1(createFailingFacts()).rating).toBe('warn');
  });
  it('T7.1 na when unavailable', () => {
    expect(evaluateZTA_T7_1(createEmptyFacts()).rating).toBe('na');
  });

  it('T7.2 pass with restricted guest invites', () => {
    const r = evaluateZTA_T7_2(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T7.2 warn with open guest invites', () => {
    expect(evaluateZTA_T7_2(createFailingFacts()).rating).toBe('warn');
  });
  it('T7.2 na when unavailable', () => {
    expect(evaluateZTA_T7_2(createEmptyFacts()).rating).toBe('na');
  });

  it('T7.3 pass when users cannot create apps', () => {
    const r = evaluateZTA_T7_3(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T7.3 fail when users can create apps', () => {
    expect(evaluateZTA_T7_3(createFailingFacts()).rating).toBe('fail');
  });
  it('T7.3 na when unavailable', () => {
    expect(evaluateZTA_T7_3(createEmptyFacts()).rating).toBe('na');
  });

  it('T7.4 pass with non-expiring passwords', () => {
    const r = evaluateZTA_T7_4(createPassingFacts());
    assertResult(r);
    expect(r.rating).toBe('pass');
  });
  it('T7.4 pass with null validity', () => {
    const facts = createPassingFacts();
    facts.passwordPolicy.passwordValidityPeriodInDays = null;
    expect(evaluateZTA_T7_4(facts).rating).toBe('pass');
  });
  it('T7.4 pass with max int validity', () => {
    const facts = createPassingFacts();
    facts.passwordPolicy.passwordValidityPeriodInDays = 2147483647;
    expect(evaluateZTA_T7_4(facts).rating).toBe('pass');
  });
  it('T7.4 warn with 90-day expiry', () => {
    expect(evaluateZTA_T7_4(createFailingFacts()).rating).toBe('warn');
  });
  it('T7.4 na when unavailable', () => {
    expect(evaluateZTA_T7_4(createEmptyFacts()).rating).toBe('na');
  });
});

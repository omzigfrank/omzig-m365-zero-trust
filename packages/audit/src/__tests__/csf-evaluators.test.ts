/**
 * Tests for all 19 NIST CSF 2.0 evaluators.
 * Grouped by CSF function: Protect (PR), Detect (DE), Identify (ID),
 * Respond (RS), Govern (GV), Recover (RC).
 */

import { describe, it, expect } from 'vitest';
import type { AuditFacts, EvaluatorResult } from '../types.js';
import { createEmptyFacts } from '../types.js';
import { NIST_CSF_CONTROLS } from '../registry/nist-csf-controls.js';
import { nistCsfEvaluators } from '../evaluators/nist-csf/index.js';

// Protect evaluators
import {
  evaluateCSF_PR_AA1,
  evaluateCSF_PR_AA3,
  evaluateCSF_PR_AA5,
  evaluateCSF_PR_DS1,
  evaluateCSF_PR_DS2,
  evaluateCSF_PR_PS1,
  evaluateCSF_PR_IR1,
} from '../evaluators/nist-csf/protect.js';

// Detect evaluators
import {
  evaluateCSF_DE_CM1,
  evaluateCSF_DE_CM3,
  evaluateCSF_DE_CM6,
  evaluateCSF_DE_AE2,
  evaluateCSF_DE_AE3,
} from '../evaluators/nist-csf/detect.js';

// Identify evaluators
import {
  evaluateCSF_ID_AM1,
  evaluateCSF_ID_AM2,
  evaluateCSF_ID_RA1,
} from '../evaluators/nist-csf/identify.js';

// Respond evaluators
import {
  evaluateCSF_RS_MA1,
  evaluateCSF_RS_AN1,
} from '../evaluators/nist-csf/respond.js';

// Govern evaluator
import { evaluateCSF_GV_OC1 } from '../evaluators/nist-csf/govern.js';

// Recover evaluator
import { evaluateCSF_RC_RP1 } from '../evaluators/nist-csf/recover.js';

// ======================================================================
// Test fixture factories
// ======================================================================

function createPassingFacts(): AuditFacts {
  const facts = createEmptyFacts();
  facts.organization = { available: true, tenantId: 't1', displayName: 'Test', primaryDomain: 'test.com' };
  facts.conditionalAccess = {
    available: true, totalPolicies: 5, enabledCount: 5, reportOnlyCount: 0, disabledCount: 0,
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
        conditions: { clientAppTypes: ['all'], users: { includeUsers: ['All'] } },
        grantControls: { operator: 'OR', builtInControls: ['compliantDevice'] }, sessionControls: null,
      },
    ],
  };
  facts.namedLocations = { available: true, totalLocations: 2, locations: [{ id: 'l1', displayName: 'Office', isTrusted: true }, { id: 'l2', displayName: 'VPN', isTrusted: true }] };
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
  facts.namedLocations = { available: true, totalLocations: 0, locations: [] };
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

describe('CSF Registry completeness', () => {
  it('has exactly 19 controls', () => expect(NIST_CSF_CONTROLS).toHaveLength(19));
  it('has 19 evaluators in map', () => expect(nistCsfEvaluators.size).toBe(19));
  it('all controls have product CSF', () => {
    for (const c of NIST_CSF_CONTROLS) expect(c.product).toBe('CSF');
  });
  it('all 6 CSF functions represented', () => {
    const funcs = new Set(NIST_CSF_CONTROLS.map((c) => c.nistCsf));
    expect(funcs).toEqual(new Set(['PR', 'DE', 'ID', 'RS', 'GV', 'RC']));
  });
  it('every control has a matching evaluator in map', () => {
    for (const c of NIST_CSF_CONTROLS) {
      expect(nistCsfEvaluators.has(c.id)).toBe(true);
    }
  });
  it('control IDs follow NIST.CSF.{function}.{category}-{number}v1 format', () => {
    for (const c of NIST_CSF_CONTROLS) {
      expect(c.id).toMatch(/^NIST\.CSF\.\w+\.\w+-\d+v1$/);
    }
  });
});

// ======================================================================
// Protect (PR) -- 7 evaluators
// ======================================================================

describe('CSF Protect (PR)', () => {
  describe('PR.AA-1 (Access Control)', () => {
    it('passes when CA policies enforce access decisions', () => {
      const r = evaluateCSF_PR_AA1(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('fails when no active CA policies', () => {
      const r = evaluateCSF_PR_AA1(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('fail');
    });
    it('returns na when CA data unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_PR_AA1(facts);
      assertResult(r);
      expect(r.rating).toBe('na');
    });
  });

  describe('PR.AA-3 (Remote Access)', () => {
    it('passes when MFA enforced via CA for all users', () => {
      const r = evaluateCSF_PR_AA3(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('fails when no MFA CA policies', () => {
      const r = evaluateCSF_PR_AA3(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('fail');
    });
    it('returns na when CA data unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_PR_AA3(facts);
      assertResult(r);
      expect(r.rating).toBe('na');
    });
  });

  describe('PR.AA-5 (Least Privilege)', () => {
    it('passes when PIM eligible assignments > 0', () => {
      const r = evaluateCSF_PR_AA5(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warns when no PIM eligible assignments', () => {
      const r = evaluateCSF_PR_AA5(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('returns na when role assignments unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_PR_AA5(facts);
      assertResult(r);
      expect(r.rating).toBe('na');
    });
  });

  describe('PR.DS-1 (Data Protection)', () => {
    it('passes when sensitivity labels deployed', () => {
      const r = evaluateCSF_PR_DS1(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warns when no sensitivity labels', () => {
      const r = evaluateCSF_PR_DS1(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('returns na when labels data unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_PR_DS1(facts);
      assertResult(r);
      expect(r.rating).toBe('na');
    });
  });

  describe('PR.DS-2 (Data in Transit)', () => {
    it('passes when legacy auth blocked', () => {
      const r = evaluateCSF_PR_DS2(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('fails when legacy auth not blocked', () => {
      const r = evaluateCSF_PR_DS2(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('fail');
    });
    it('returns na when CA data unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_PR_DS2(facts);
      assertResult(r);
      expect(r.rating).toBe('na');
    });
  });

  describe('PR.PS-1 (Configuration Management)', () => {
    it('passes when CA strategy over security defaults', () => {
      const r = evaluateCSF_PR_PS1(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warns when security defaults still enabled', () => {
      const r = evaluateCSF_PR_PS1(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('returns na when security defaults data unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_PR_PS1(facts);
      assertResult(r);
      expect(r.rating).toBe('na');
    });
  });

  describe('PR.IR-1 (Technology Infrastructure Resilience)', () => {
    it('passes when >= 5 telemetry sources', () => {
      const r = evaluateCSF_PR_IR1(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warns when < 5 telemetry sources', () => {
      const r = evaluateCSF_PR_IR1(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('returns na when licenses unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_PR_IR1(facts);
      assertResult(r);
      expect(r.rating).toBe('na');
    });
  });
});

// ======================================================================
// Detect (DE) -- 5 evaluators
// ======================================================================

describe('CSF Detect (DE)', () => {
  describe('DE.CM-1 (Continuous Monitoring Networks)', () => {
    it('passes when qualifying SKU with audit logging', () => {
      const r = evaluateCSF_DE_CM1(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('fails when no qualifying SKU', () => {
      const r = evaluateCSF_DE_CM1(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('fail');
    });
    it('returns na when licenses unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_DE_CM1(facts);
      assertResult(r);
      expect(r.rating).toBe('na');
    });
  });

  describe('DE.CM-3 (Continuous Monitoring Personnel)', () => {
    it('passes when MFA coverage >= 95%', () => {
      const r = evaluateCSF_DE_CM3(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('fails when MFA coverage < 80%', () => {
      const r = evaluateCSF_DE_CM3(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('fail');
    });
    it('warns when MFA coverage 80-94%', () => {
      const facts = createPassingFacts();
      facts.mfa = { available: true, totalUsers: 100, registeredUsers: 85, percentage: 85 };
      const r = evaluateCSF_DE_CM3(facts);
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('returns na when MFA data unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_DE_CM3(facts);
      assertResult(r);
      expect(r.rating).toBe('na');
    });
  });

  describe('DE.CM-6 (Monitoring for Unauthorized Activity)', () => {
    it('passes when risk-based CA policies exist', () => {
      const r = evaluateCSF_DE_CM6(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warns when no risk-based CA policies', () => {
      const r = evaluateCSF_DE_CM6(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('returns na when CA data unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_DE_CM6(facts);
      assertResult(r);
      expect(r.rating).toBe('na');
    });
  });

  describe('DE.AE-2 (Adverse Event Analysis)', () => {
    it('passes when P2 licensed for Identity Protection', () => {
      const r = evaluateCSF_DE_AE2(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warns when no P2 license', () => {
      const r = evaluateCSF_DE_AE2(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('returns na when licenses unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_DE_AE2(facts);
      assertResult(r);
      expect(r.rating).toBe('na');
    });
  });

  describe('DE.AE-3 (Correlation)', () => {
    it('passes when >= 5 telemetry sources', () => {
      const r = evaluateCSF_DE_AE3(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('fails when < 3 telemetry sources', () => {
      const r = evaluateCSF_DE_AE3(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('fail');
    });
    it('warns when 3-4 telemetry sources', () => {
      const facts = createPassingFacts();
      // 3 sources: hasQualifyingSku, hasIntune, hasP2
      facts.licenses = { available: true, hasQualifyingSku: true, hasP2: true, hasIntune: true, hasDefenderO365: false, hasDefenderEndpt: false, licenses: [] };
      const r = evaluateCSF_DE_AE3(facts);
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('returns na when licenses unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_DE_AE3(facts);
      assertResult(r);
      expect(r.rating).toBe('na');
    });
  });
});

// ======================================================================
// Identify (ID) -- 3 evaluators
// ======================================================================

describe('CSF Identify (ID)', () => {
  describe('ID.AM-1 (Asset Inventory Hardware)', () => {
    it('passes when device inventory has entries', () => {
      const r = evaluateCSF_ID_AM1(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('fails when device inventory empty', () => {
      const r = evaluateCSF_ID_AM1(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('fail');
    });
    it('returns na when devices data unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_ID_AM1(facts);
      assertResult(r);
      expect(r.rating).toBe('na');
    });
  });

  describe('ID.AM-2 (Asset Inventory Software)', () => {
    it('passes when app registrations tracked', () => {
      const r = evaluateCSF_ID_AM2(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warns when no app registrations', () => {
      const r = evaluateCSF_ID_AM2(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('returns na when app registrations data unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_ID_AM2(facts);
      assertResult(r);
      expect(r.rating).toBe('na');
    });
  });

  describe('ID.RA-1 (Vulnerability Identification)', () => {
    it('passes when P2 licensed for risk detection', () => {
      const r = evaluateCSF_ID_RA1(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warns when no P2 license', () => {
      const r = evaluateCSF_ID_RA1(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('returns na when licenses unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_ID_RA1(facts);
      assertResult(r);
      expect(r.rating).toBe('na');
    });
  });
});

// ======================================================================
// Respond (RS) -- 2 evaluators
// ======================================================================

describe('CSF Respond (RS)', () => {
  describe('RS.MA-1 (Incident Management)', () => {
    it('passes when admin consent workflow enabled', () => {
      const r = evaluateCSF_RS_MA1(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warns when admin consent workflow disabled', () => {
      const r = evaluateCSF_RS_MA1(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('returns na when admin consent data unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_RS_MA1(facts);
      assertResult(r);
      expect(r.rating).toBe('na');
    });
  });

  describe('RS.AN-1 (Notifications)', () => {
    it('passes when P2 supports risky alerts', () => {
      const r = evaluateCSF_RS_AN1(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warns when no P2 for risk alerts', () => {
      const r = evaluateCSF_RS_AN1(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('returns na when licenses unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_RS_AN1(facts);
      assertResult(r);
      expect(r.rating).toBe('na');
    });
  });
});

// ======================================================================
// Govern (GV) -- 1 evaluator
// ======================================================================

describe('CSF Govern (GV)', () => {
  describe('GV.OC-1 (Organizational Context)', () => {
    it('always warns (advisory -- not auditable via Graph)', () => {
      const r = evaluateCSF_GV_OC1(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('warns with failing facts too', () => {
      const r = evaluateCSF_GV_OC1(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('warns even when all data unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_GV_OC1(facts);
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
  });
});

// ======================================================================
// Recover (RC) -- 1 evaluator
// ======================================================================

describe('CSF Recover (RC)', () => {
  describe('RC.RP-1 (Recovery Planning)', () => {
    it('always warns (advisory -- not auditable via Graph)', () => {
      const r = evaluateCSF_RC_RP1(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('warns with failing facts too', () => {
      const r = evaluateCSF_RC_RP1(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('warns even when all data unavailable', () => {
      const facts = createEmptyFacts();
      const r = evaluateCSF_RC_RP1(facts);
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
  });
});

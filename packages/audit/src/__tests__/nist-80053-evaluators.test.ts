/**
 * Tests for all 22 NIST 800-53 evaluators.
 * Grouped by control family (AC, IA, SC, AU, CM, SI, RA).
 *
 * CRITICAL: These evaluators are INDEPENDENT -- NOT derived from CISA mappings.
 * Each has its own pass/fail logic even if checking similar fact areas.
 */

import { describe, it, expect } from 'vitest';
import type { AuditFacts, EvaluatorResult } from '../types.js';
import { createEmptyFacts } from '../types.js';
import { NIST_80053_CONTROLS } from '../registry/nist-80053-controls.js';
import { nist80053Evaluators } from '../evaluators/nist-80053/index.js';
import {
  evaluate80053_AC2,
  evaluate80053_AC3,
  evaluate80053_AC6,
  evaluate80053_AC7,
  evaluate80053_AC11,
  evaluate80053_AC17,
} from '../evaluators/nist-80053/ac-access-control.js';
import {
  evaluate80053_IA2,
  evaluate80053_IA5,
  evaluate80053_IA8,
} from '../evaluators/nist-80053/ia-identification.js';
import {
  evaluate80053_SC7,
  evaluate80053_SC8,
  evaluate80053_SC13,
} from '../evaluators/nist-80053/sc-system-comms.js';
import {
  evaluate80053_AU2,
  evaluate80053_AU6,
  evaluate80053_AU12,
} from '../evaluators/nist-80053/au-audit.js';
import {
  evaluate80053_CM6,
  evaluate80053_CM7,
  evaluate80053_CM8,
} from '../evaluators/nist-80053/cm-configuration.js';
import {
  evaluate80053_SI2,
  evaluate80053_SI3,
  evaluate80053_SI4,
} from '../evaluators/nist-80053/si-system-integrity.js';
import {
  evaluate80053_RA5,
} from '../evaluators/nist-80053/ra-risk-assessment.js';

// ======================================================================
// Test data factories
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
        id: 'p2', displayName: 'MFA All Users', state: 'enabled',
        conditions: { clientAppTypes: ['all'], users: { includeUsers: ['All'] } },
        grantControls: { operator: 'OR', builtInControls: ['mfa'] }, sessionControls: null,
      },
      {
        id: 'p3', displayName: 'Block High Risk Sign-In', state: 'enabled',
        conditions: { clientAppTypes: ['all'], users: { includeUsers: ['All'] }, signInRiskLevels: ['high'] },
        grantControls: { operator: 'OR', builtInControls: ['block'] }, sessionControls: null,
      },
      {
        id: 'p4', displayName: 'Session Controls', state: 'enabled',
        conditions: { clientAppTypes: ['all'], users: { includeUsers: ['All'] } },
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
        sessionControls: { signInFrequency: { isEnabled: true, value: 4, type: 'hours' } },
      },
      {
        id: 'p5', displayName: 'Phishing Resistant', state: 'enabled',
        conditions: { clientAppTypes: ['all'], users: { includeUsers: ['All'] } },
        grantControls: { operator: 'OR', builtInControls: ['mfa'], authenticationStrength: { id: 'phishing-resistant' } },
        sessionControls: null,
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

describe('800-53 Registry completeness', () => {
  it('has exactly 22 controls', () => expect(NIST_80053_CONTROLS).toHaveLength(22));
  it('has 22 evaluators in map', () => expect(nist80053Evaluators.size).toBe(22));
  it('all controls have product 80053', () => {
    for (const c of NIST_80053_CONTROLS) expect(c.product).toBe('80053');
  });
  it('all 7 families represented', () => {
    const families = new Set(NIST_80053_CONTROLS.map((c) => c.nist80053.replace(/-\d+$/, '')));
    expect(families).toEqual(new Set(['AC', 'IA', 'SC', 'AU', 'CM', 'SI', 'RA']));
  });
  it('every evaluator populates settingName', () => {
    const f = createPassingFacts();
    for (const c of NIST_80053_CONTROLS) expect(c.evaluator(f).settingName).toBeTruthy();
  });
  it('control IDs follow NIST.80053.XX-Nv1 format', () => {
    for (const c of NIST_80053_CONTROLS) {
      expect(c.id).toMatch(/^NIST\.80053\.\w+-\d+v1$/);
    }
  });
});

// ======================================================================
// AC - Access Control (6 evaluators)
// ======================================================================

describe('800-53 AC: Access Control', () => {
  // AC-2: Account Management
  describe('AC-2 Account Management', () => {
    it('pass with 2-8 global admins', () => {
      const r = evaluate80053_AC2(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('fail with too few global admins (< 2)', () => {
      const facts = createPassingFacts();
      facts.adminRoles.globalAdminCount = 1;
      expect(evaluate80053_AC2(facts).rating).toBe('fail');
    });
    it('fail with too many global admins (> 8)', () => {
      const facts = createPassingFacts();
      facts.adminRoles.globalAdminCount = 10;
      expect(evaluate80053_AC2(facts).rating).toBe('fail');
    });
    it('na when unavailable', () => {
      const facts = createEmptyFacts();
      expect(evaluate80053_AC2(facts).rating).toBe('na');
    });
  });

  // AC-3: Access Enforcement
  describe('AC-3 Access Enforcement', () => {
    it('pass when CA policies with grant controls exist', () => {
      const r = evaluate80053_AC3(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('fail when no CA policies have grant controls', () => {
      const r = evaluate80053_AC3(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('fail');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_AC3(createEmptyFacts()).rating).toBe('na');
    });
  });

  // AC-6: Least Privilege
  describe('AC-6 Least Privilege', () => {
    it('pass when eligible > active assignments (PIM)', () => {
      const r = evaluate80053_AC6(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warn when active >= eligible (no PIM)', () => {
      const r = evaluate80053_AC6(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_AC6(createEmptyFacts()).rating).toBe('na');
    });
  });

  // AC-7: Unsuccessful Login
  describe('AC-7 Unsuccessful Login', () => {
    it('pass when CA blocks high-risk sign-ins', () => {
      const r = evaluate80053_AC7(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('fail when no high-risk sign-in blocking', () => {
      const r = evaluate80053_AC7(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('fail');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_AC7(createEmptyFacts()).rating).toBe('na');
    });
  });

  // AC-11: Session Lock
  describe('AC-11 Session Lock', () => {
    it('pass when session controls configured', () => {
      const r = evaluate80053_AC11(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warn when no session controls', () => {
      const r = evaluate80053_AC11(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_AC11(createEmptyFacts()).rating).toBe('na');
    });
  });

  // AC-17: Remote Access
  describe('AC-17 Remote Access', () => {
    it('pass when CA enforces MFA for all users', () => {
      const r = evaluate80053_AC17(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('fail when no MFA enforcement', () => {
      const r = evaluate80053_AC17(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('fail');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_AC17(createEmptyFacts()).rating).toBe('na');
    });
  });
});

// ======================================================================
// IA - Identification and Authentication (3 evaluators)
// ======================================================================

describe('800-53 IA: Identification and Authentication', () => {
  // IA-2: Identification
  describe('IA-2 Identification', () => {
    it('pass when MFA >= 95%', () => {
      const r = evaluate80053_IA2(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warn when MFA 80-94%', () => {
      const facts = createPassingFacts();
      facts.mfa.percentage = 85;
      facts.mfa.registeredUsers = 85;
      const r = evaluate80053_IA2(facts);
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('fail when MFA < 80%', () => {
      const r = evaluate80053_IA2(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('fail');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_IA2(createEmptyFacts()).rating).toBe('na');
    });
  });

  // IA-5: Authenticator Management
  describe('IA-5 Authenticator Management', () => {
    it('pass when passwords do not expire (NIST 800-63B)', () => {
      const r = evaluate80053_IA5(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warn when passwords expire', () => {
      const r = evaluate80053_IA5(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_IA5(createEmptyFacts()).rating).toBe('na');
    });
  });

  // IA-8: Non-Org User Identification
  describe('IA-8 Non-Org User Identification', () => {
    it('pass when guest invites restricted', () => {
      const r = evaluate80053_IA8(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warn when guest invites open', () => {
      const r = evaluate80053_IA8(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_IA8(createEmptyFacts()).rating).toBe('na');
    });
  });
});

// ======================================================================
// SC - System and Communications Protection (3 evaluators)
// ======================================================================

describe('800-53 SC: System and Communications Protection', () => {
  // SC-7: Boundary Protection
  describe('SC-7 Boundary Protection', () => {
    it('pass when legacy auth blocked', () => {
      const r = evaluate80053_SC7(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('fail when legacy auth not blocked', () => {
      const r = evaluate80053_SC7(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('fail');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_SC7(createEmptyFacts()).rating).toBe('na');
    });
  });

  // SC-8: Transmission Confidentiality
  describe('SC-8 Transmission Confidentiality', () => {
    it('pass when modern auth enforced', () => {
      const r = evaluate80053_SC8(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warn when not enforced', () => {
      const r = evaluate80053_SC8(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_SC8(createEmptyFacts()).rating).toBe('na');
    });
  });

  // SC-13: Cryptographic Protection
  describe('SC-13 Cryptographic Protection', () => {
    it('pass when auth strength uses phishing-resistant', () => {
      const r = evaluate80053_SC13(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warn when no phishing-resistant auth strength', () => {
      const r = evaluate80053_SC13(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_SC13(createEmptyFacts()).rating).toBe('na');
    });
  });
});

// ======================================================================
// AU - Audit and Accountability (3 evaluators)
// ======================================================================

describe('800-53 AU: Audit and Accountability', () => {
  // AU-2: Event Logging
  describe('AU-2 Event Logging', () => {
    it('pass with qualifying license', () => {
      const r = evaluate80053_AU2(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('fail without qualifying license', () => {
      const r = evaluate80053_AU2(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('fail');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_AU2(createEmptyFacts()).rating).toBe('na');
    });
  });

  // AU-6: Audit Review
  describe('AU-6 Audit Review', () => {
    it('pass with P2 license', () => {
      const r = evaluate80053_AU6(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warn without P2', () => {
      const r = evaluate80053_AU6(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_AU6(createEmptyFacts()).rating).toBe('na');
    });
  });

  // AU-12: Audit Generation
  describe('AU-12 Audit Generation', () => {
    it('pass with >= 5 telemetry sources', () => {
      const r = evaluate80053_AU12(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('fail with < 3 telemetry sources', () => {
      const facts = createEmptyFacts();
      // Only 2 sources available -- below threshold
      facts.organization.available = true;
      facts.licenses.available = true;
      const r = evaluate80053_AU12(facts);
      assertResult(r);
      expect(r.rating).toBe('fail');
    });
    it('warn with 3-4 telemetry sources', () => {
      const facts = createEmptyFacts();
      facts.organization.available = true;
      facts.licenses.available = true;
      facts.mfa.available = true;
      const r = evaluate80053_AU12(facts);
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_AU12(createEmptyFacts()).rating).toBe('na');
    });
  });
});

// ======================================================================
// CM - Configuration Management (3 evaluators)
// ======================================================================

describe('800-53 CM: Configuration Management', () => {
  // CM-6: Configuration Settings
  describe('CM-6 Configuration Settings', () => {
    it('pass with CA strategy (not security defaults)', () => {
      const r = evaluate80053_CM6(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warn with security defaults', () => {
      const r = evaluate80053_CM6(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_CM6(createEmptyFacts()).rating).toBe('na');
    });
  });

  // CM-7: Least Functionality
  describe('CM-7 Least Functionality', () => {
    it('pass when app registration restricted to admins', () => {
      const r = evaluate80053_CM7(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('fail when users can create apps', () => {
      const r = evaluate80053_CM7(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('fail');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_CM7(createEmptyFacts()).rating).toBe('na');
    });
  });

  // CM-8: Information System Component Inventory
  describe('CM-8 Component Inventory', () => {
    it('pass when device and app inventories exist', () => {
      const r = evaluate80053_CM8(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('fail when no inventories', () => {
      const r = evaluate80053_CM8(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('fail');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_CM8(createEmptyFacts()).rating).toBe('na');
    });
  });
});

// ======================================================================
// SI - System and Information Integrity (3 evaluators)
// ======================================================================

describe('800-53 SI: System and Information Integrity', () => {
  // SI-2: Flaw Remediation
  describe('SI-2 Flaw Remediation', () => {
    it('pass with Defender for Endpoint', () => {
      const r = evaluate80053_SI2(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warn without Defender for Endpoint', () => {
      const r = evaluate80053_SI2(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_SI2(createEmptyFacts()).rating).toBe('na');
    });
  });

  // SI-3: Malicious Code Protection
  describe('SI-3 Malicious Code Protection', () => {
    it('pass with Defender for O365', () => {
      const r = evaluate80053_SI3(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warn without Defender for O365', () => {
      const r = evaluate80053_SI3(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_SI3(createEmptyFacts()).rating).toBe('na');
    });
  });

  // SI-4: System Monitoring
  describe('SI-4 System Monitoring', () => {
    it('pass with P2 license', () => {
      const r = evaluate80053_SI4(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warn without P2', () => {
      const r = evaluate80053_SI4(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_SI4(createEmptyFacts()).rating).toBe('na');
    });
  });
});

// ======================================================================
// RA - Risk Assessment (1 evaluator)
// ======================================================================

describe('800-53 RA: Risk Assessment', () => {
  // RA-5: Vulnerability Assessment
  describe('RA-5 Vulnerability Assessment', () => {
    it('pass with P2 (Identity Protection)', () => {
      const r = evaluate80053_RA5(createPassingFacts());
      assertResult(r);
      expect(r.rating).toBe('pass');
    });
    it('warn without P2', () => {
      const r = evaluate80053_RA5(createFailingFacts());
      assertResult(r);
      expect(r.rating).toBe('warn');
    });
    it('na when unavailable', () => {
      expect(evaluate80053_RA5(createEmptyFacts()).rating).toBe('na');
    });
  });
});

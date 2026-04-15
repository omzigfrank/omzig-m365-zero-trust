import { describe, it, expect } from 'vitest';
import { ENTRA_ID_REMEDIATION } from '../entra-id-remediation.js';
import { NIST_ZTA_REMEDIATION } from '../nist-zta-remediation.js';
import { NIST_80053_REMEDIATION } from '../nist-80053-remediation.js';
import { NIST_CSF_REMEDIATION } from '../nist-csf-remediation.js';
import { getRemediationByControlId } from '../index.js';
import type { RemediationEntry, ScopeBundle } from '../types.js';

const ALL_ENTRIES: RemediationEntry[] = [
  ...ENTRA_ID_REMEDIATION,
  ...NIST_ZTA_REMEDIATION,
  ...NIST_80053_REMEDIATION,
  ...NIST_CSF_REMEDIATION,
];

const VALID_BUNDLES: ScopeBundle[] = [
  'conditionalAccess',
  'authMethods',
  'authPolicy',
  'roles',
  'securityDefaults',
];

describe('remediation classification coverage (Phase 7 Plan 01)', () => {
  it('has 101 total remediation entries across 4 registries', () => {
    // Regression guard: if this count changes, update the plan docs.
    expect(ALL_ENTRIES.length).toBe(101);
    expect(ENTRA_ID_REMEDIATION.length).toBe(29);
    expect(NIST_ZTA_REMEDIATION.length).toBe(31);
    expect(NIST_80053_REMEDIATION.length).toBe(22);
    expect(NIST_CSF_REMEDIATION.length).toBe(19);
  });

  it('every entry has classification set to exactly SAFE or RISKY', () => {
    for (const entry of ALL_ENTRIES) {
      expect(
        entry.classification,
        `${entry.controlId} missing classification`,
      ).toBeDefined();
      expect(['SAFE', 'RISKY']).toContain(entry.classification);
    }
  });

  it('every entry has a non-empty classificationRationale string', () => {
    for (const entry of ALL_ENTRIES) {
      expect(
        typeof entry.classificationRationale,
        `${entry.controlId} rationale type`,
      ).toBe('string');
      expect(
        entry.classificationRationale.trim().length,
        `${entry.controlId} rationale empty`,
      ).toBeGreaterThan(0);
    }
  });

  it('every entry has a writeScopes array (may be empty)', () => {
    for (const entry of ALL_ENTRIES) {
      expect(Array.isArray(entry.writeScopes), `${entry.controlId} writeScopes not array`).toBe(
        true,
      );
    }
  });

  it('every entry has a scopeBundle from the 5-bundle enum', () => {
    for (const entry of ALL_ENTRIES) {
      expect(
        VALID_BUNDLES,
        `${entry.controlId} bundle ${entry.scopeBundle} not in valid set`,
      ).toContain(entry.scopeBundle);
    }
  });

  it('MS.AAD.1.1v1 (block legacy auth) is classified SAFE with bundle=conditionalAccess', () => {
    const entry = getRemediationByControlId('MS.AAD.1.1v1');
    expect(entry).toBeDefined();
    expect(entry?.classification).toBe('SAFE');
    expect(entry?.scopeBundle).toBe('conditionalAccess');
    expect(entry?.writeScopes).toContain('Policy.ReadWrite.ConditionalAccess');
  });

  it('MS.AAD.3.1v1 (require phishing-resistant MFA for all users) is classified RISKY', () => {
    const entry = getRemediationByControlId('MS.AAD.3.1v1');
    expect(entry).toBeDefined();
    expect(entry?.classification).toBe('RISKY');
  });

  it('MS.AAD.3.7v1 (require compliant device) is classified RISKY', () => {
    // Highest-blast-radius CA policy per CLAUDE.md lockout warning.
    const entry = getRemediationByControlId('MS.AAD.3.7v1');
    expect(entry).toBeDefined();
    expect(entry?.classification).toBe('RISKY');
  });

  it('MS.AAD.3.5v1 (disable SMS/Voice auth method) is classified SAFE with bundle=authMethods', () => {
    const entry = getRemediationByControlId('MS.AAD.3.5v1');
    expect(entry).toBeDefined();
    expect(entry?.classification).toBe('SAFE');
    expect(entry?.scopeBundle).toBe('authMethods');
    expect(entry?.writeScopes).toContain('Policy.ReadWrite.AuthenticationMethod');
  });

  it('MS.AAD.5.2v1 (disable user consent to apps) is classified RISKY', () => {
    // Research §1.3 PITFALL a: setting permissionGrantPoliciesAssigned=[]
    // breaks existing third-party integrations.
    const entry = getRemediationByControlId('MS.AAD.5.2v1');
    expect(entry).toBeDefined();
    expect(entry?.classification).toBe('RISKY');
  });

  it('MS.AAD.7.x (privileged role changes) are RISKY with bundle=roles', () => {
    // Highest-blast-radius bundle per research §6.
    const privRoleControls = ['MS.AAD.7.1v1', 'MS.AAD.7.2v1', 'MS.AAD.7.5v1', 'MS.AAD.7.7v1', 'MS.AAD.7.9v1'];
    for (const id of privRoleControls) {
      const entry = getRemediationByControlId(id);
      expect(entry, `${id} not found`).toBeDefined();
      expect(entry?.classification, `${id} should be RISKY`).toBe('RISKY');
      expect(entry?.scopeBundle, `${id} should use roles bundle`).toBe('roles');
    }
  });

  it('NIST.ZTA.T2.1v1 (ZTA block legacy auth) mirrors MS.AAD.1.1v1 as SAFE', () => {
    const entry = getRemediationByControlId('NIST.ZTA.T2.1v1');
    expect(entry).toBeDefined();
    expect(entry?.classification).toBe('SAFE');
    expect(entry?.scopeBundle).toBe('conditionalAccess');
  });

  it('NIST.ZTA.T4.2v1 (device compliance) is classified RISKY', () => {
    const entry = getRemediationByControlId('NIST.ZTA.T4.2v1');
    expect(entry).toBeDefined();
    expect(entry?.classification).toBe('RISKY');
  });

  it('NIST.80053.SC-7v1 (boundary protection / legacy auth) is SAFE', () => {
    const entry = getRemediationByControlId('NIST.80053.SC-7v1');
    expect(entry).toBeDefined();
    expect(entry?.classification).toBe('SAFE');
  });

  it('documentation-only advisory controls are classified SAFE', () => {
    // Advisory controls (no Graph executor) cannot break anything.
    const entry = getRemediationByControlId('NIST.CSF.GV.OC-1v1');
    expect(entry).toBeDefined();
    expect(entry?.classification).toBe('SAFE');
    expect(entry?.writeScopes.length).toBe(0);
  });

  it('no duplicate classifications across the 4 registries (no orphan entries)', () => {
    // Every entry from the 4 arrays should be discoverable via getRemediationByControlId
    // with all fields intact (this catches the case where an entry is missing from
    // the index.ts import or has been overwritten by a duplicate controlId).
    for (const entry of ALL_ENTRIES) {
      const looked = getRemediationByControlId(entry.controlId);
      expect(looked, `${entry.controlId} not looked up`).toBeDefined();
      expect(looked?.classification).toBe(entry.classification);
    }
  });
});

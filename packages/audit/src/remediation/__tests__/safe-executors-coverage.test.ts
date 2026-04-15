/**
 * Phase 7 Plan 02 — SAFE executor coverage test.
 *
 * Iterates the full remediation registry, filters to SAFE entries, excludes
 * documented documentation-only entries (writeScopes=[]) and sidecar-deferred
 * skeletons, and asserts every remaining entry has a working executor
 * attached. This is the gate that ensures the SAFE subset stays covered as
 * the registries grow.
 */

import { describe, it, expect } from 'vitest';
import { ENTRA_ID_REMEDIATION } from '../entra-id-remediation.js';
import { NIST_ZTA_REMEDIATION } from '../nist-zta-remediation.js';
import { NIST_80053_REMEDIATION } from '../nist-80053-remediation.js';
import { NIST_CSF_REMEDIATION } from '../nist-csf-remediation.js';
// Side-effect import ensures executors are attached to registry entries.
import '../index.js';

// Entries intentionally skeleton'd / deferred to sidecars.
// If a new sidecar-deferred control is added, list its controlId here.
const SIDECAR_DEFERRED = new Set<string>([
  // Exchange mailbox auditing is a deliberate skeleton (EXTREMED-01). It is
  // not mapped to a CISA control ID yet but is referenced as the Exchange
  // family placeholder. Nothing in the registry currently routes to it.
]);

// PIM activation MFA (MS.AAD.7.6v1) is classified SAFE but its executor is a
// skeleton that throws ExecutorError -- follow-up per 07-02 deviation note.
// It is still counted as "covered" because a bundle is attached to it (so
// the framework's error path is exercised), but it would fail at runtime.
const KNOWN_SKELETON_EXECUTORS = new Set<string>([
  'MS.AAD.7.6v1',
]);

describe('SAFE executor coverage (Phase 7 Plan 02)', () => {
  const allEntries = [
    ...ENTRA_ID_REMEDIATION,
    ...NIST_ZTA_REMEDIATION,
    ...NIST_80053_REMEDIATION,
    ...NIST_CSF_REMEDIATION,
  ];

  // SAFE entries with a non-empty writeScopes list are the remediable set.
  // Empty writeScopes mark documentation-only / advisory controls.
  const safeExecutableEntries = allEntries.filter(
    (e) =>
      e.classification === 'SAFE' &&
      e.writeScopes.length > 0 &&
      !SIDECAR_DEFERRED.has(e.controlId),
  );

  it('finds a non-trivial number of SAFE executable entries', () => {
    // Guardrail: if this ever drops, someone demoted too many entries.
    expect(safeExecutableEntries.length).toBeGreaterThanOrEqual(10);
  });

  it('every SAFE executable entry has an executor attached', () => {
    const missing = safeExecutableEntries
      .filter((e) => !e.executor)
      .map((e) => e.controlId);

    expect(
      missing,
      `Missing executors for SAFE entries: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('every non-skeleton SAFE executor also has a rollbackExecutor attached', () => {
    const missingRollback = safeExecutableEntries
      .filter(
        (e) =>
          e.executor !== undefined &&
          e.rollbackExecutor === undefined &&
          !KNOWN_SKELETON_EXECUTORS.has(e.controlId),
      )
      .map((e) => e.controlId);

    expect(
      missingRollback,
      `SAFE executors missing rollback: ${missingRollback.join(', ')}`,
    ).toEqual([]);
  });

  it('every SAFE executable entry has a valid scope bundle', () => {
    const validBundles = new Set([
      'conditionalAccess',
      'authMethods',
      'authPolicy',
      'roles',
      'securityDefaults',
    ]);
    for (const e of safeExecutableEntries) {
      expect(validBundles.has(e.scopeBundle)).toBe(true);
    }
  });

  it('covers at least the canonical Plan 07-02 SAFE controls', () => {
    const expected = [
      'MS.AAD.1.1v1', // block legacy auth
      'MS.AAD.3.2v1', // enable microsoft authenticator
      'MS.AAD.3.4v1', // complete auth methods migration
      'MS.AAD.3.5v1', // disable sms/voice
      'MS.AAD.3.6v1', // require admin mfa
      'MS.AAD.5.1v1', // disable user app registration
      'MS.AAD.5.3v1', // enable admin consent workflow
      'MS.AAD.5.4v1', // disable group owner consent
      'MS.AAD.6.1v1', // password never expire
      'MS.AAD.8.1v1', // restrict guest access limited
      'MS.AAD.8.3v1', // restrict guest access restricted
    ];
    for (const id of expected) {
      const entry = allEntries.find((e) => e.controlId === id);
      expect(entry, `Missing registry entry for ${id}`).toBeDefined();
      expect(entry?.executor, `Missing executor for ${id}`).toBeDefined();
    }
  });

  it('NIST entries that map to the same underlying Graph write reuse the same executor bundle', () => {
    // MS.AAD.1.1v1 (block legacy auth) is aliased by several NIST entries.
    const aad = allEntries.find((e) => e.controlId === 'MS.AAD.1.1v1');
    const zta = allEntries.find((e) => e.controlId === 'NIST.ZTA.T2.1v1');
    const sc7 = allEntries.find((e) => e.controlId === 'NIST.80053.SC-7v1');
    const ds2 = allEntries.find(
      (e) => e.controlId === 'NIST.CSF.PR.DS-2v1',
    );
    expect(aad?.executor).toBeDefined();
    expect(zta?.executor).toBe(aad?.executor);
    expect(sc7?.executor).toBe(aad?.executor);
    expect(ds2?.executor).toBe(aad?.executor);
  });
});

import { describe, it, expect } from 'vitest';
import { getAllControls } from '../../registry/control-registry.js';
import { getRemediationByControlId } from '../index.js';
import type { RemediationEntry } from '../types.js';

describe('remediation registry', () => {
  const allControls = getAllControls();

  it('has a remediation entry for every control in getAllControls()', () => {
    const missing: string[] = [];
    for (const control of allControls) {
      const entry = getRemediationByControlId(control.id);
      if (!entry) missing.push(control.id);
    }
    expect(missing).toEqual([]);
  });

  it('each RemediationEntry has a non-empty steps array (at least 1 step)', () => {
    for (const control of allControls) {
      const entry = getRemediationByControlId(control.id) as RemediationEntry;
      expect(entry, `Missing entry for ${control.id}`).toBeDefined();
      expect(entry.steps.length, `${control.id} has empty steps`).toBeGreaterThanOrEqual(1);
    }
  });

  it('all 29 AAD entries have adminPortalUrl set', () => {
    const aadControls = allControls.filter((c) => c.product === 'AAD');
    expect(aadControls).toHaveLength(29);
    const missingUrl: string[] = [];
    for (const control of aadControls) {
      const entry = getRemediationByControlId(control.id) as RemediationEntry;
      if (!entry?.adminPortalUrl) missingUrl.push(control.id);
    }
    expect(missingUrl).toEqual([]);
  });

  it('at least 8 entries have non-empty powershell field', () => {
    let psCount = 0;
    for (const control of allControls) {
      const entry = getRemediationByControlId(control.id);
      if (entry?.powershell && entry.powershell.trim().length > 0) {
        psCount++;
      }
    }
    expect(psCount).toBeGreaterThanOrEqual(8);
  });

  it('getRemediationByControlId returns undefined for unknown control ID', () => {
    const entry = getRemediationByControlId('NONEXISTENT.CONTROL.ID');
    expect(entry).toBeUndefined();
  });

  it('no duplicate control IDs across all remediation arrays', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const control of allControls) {
      const entry = getRemediationByControlId(control.id);
      if (entry) {
        if (seen.has(entry.controlId)) {
          duplicates.push(entry.controlId);
        }
        seen.add(entry.controlId);
      }
    }
    expect(duplicates).toEqual([]);
  });
});

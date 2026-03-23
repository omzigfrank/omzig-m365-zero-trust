/**
 * Remediation registry index.
 * Provides lookup of remediation entries by control ID.
 */

import type { RemediationEntry } from './types.js';
import { ENTRA_ID_REMEDIATION } from './entra-id-remediation.js';
import { NIST_ZTA_REMEDIATION } from './nist-zta-remediation.js';
import { NIST_80053_REMEDIATION } from './nist-80053-remediation.js';
import { NIST_CSF_REMEDIATION } from './nist-csf-remediation.js';

export type { RemediationEntry } from './types.js';

const ALL_REMEDIATION = new Map<string, RemediationEntry>();

for (const entry of [
  ...ENTRA_ID_REMEDIATION,
  ...NIST_ZTA_REMEDIATION,
  ...NIST_80053_REMEDIATION,
  ...NIST_CSF_REMEDIATION,
]) {
  ALL_REMEDIATION.set(entry.controlId, entry);
}

/**
 * Look up remediation guidance by control ID.
 * @param id - Control ID (e.g., 'MS.AAD.1.1v1', 'NIST.ZTA.T1.1v1')
 * @returns The remediation entry or undefined if no entry exists for that ID.
 */
export function getRemediationByControlId(id: string): RemediationEntry | undefined {
  return ALL_REMEDIATION.get(id);
}

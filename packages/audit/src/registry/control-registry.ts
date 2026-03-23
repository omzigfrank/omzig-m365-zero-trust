/**
 * Control registry helper functions.
 * Provides lookup by ID, product, and full listing of all control definitions.
 */

import type { ControlDefinition } from '../types.js';
import { ENTRA_ID_CONTROLS } from './entra-id-controls.js';
import { NIST_ZTA_CONTROLS } from './nist-zta-controls.js';
import { NIST_80053_CONTROLS } from './nist-80053-controls.js';
import { NIST_CSF_CONTROLS } from './nist-csf-controls.js';

/** All known controls across all 4 frameworks. */
const ALL_CONTROLS: ControlDefinition[] = [
  ...ENTRA_ID_CONTROLS,
  ...NIST_ZTA_CONTROLS,
  ...NIST_80053_CONTROLS,
  ...NIST_CSF_CONTROLS,
];

/**
 * Get a control definition by its CISA control ID.
 * @param id - e.g., 'MS.AAD.1.1v1'
 * @returns The control definition or undefined if not found.
 */
export function getControlById(id: string): ControlDefinition | undefined {
  return ALL_CONTROLS.find((c) => c.id === id);
}

/**
 * Get all control definitions for a given product.
 * @param product - e.g., 'AAD', 'EXO', 'DEFENDER'
 * @returns Array of controls for that product.
 */
export function getControlsByProduct(product: string): ControlDefinition[] {
  return ALL_CONTROLS.filter((c) => c.product === product);
}

/**
 * Get all registered control definitions.
 */
export function getAllControls(): ControlDefinition[] {
  return ALL_CONTROLS;
}

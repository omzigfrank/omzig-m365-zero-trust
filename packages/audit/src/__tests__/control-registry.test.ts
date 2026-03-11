import { describe, it, expect } from 'vitest';
import { ENTRA_ID_CONTROLS } from '../registry/entra-id-controls.js';
import {
  getControlById,
  getControlsByProduct,
  getAllControls,
} from '../registry/control-registry.js';
import type { ControlDefinition, EvaluatorFn } from '../types.js';

describe('ENTRA_ID_CONTROLS', () => {
  it('has exactly 29 entries', () => {
    expect(ENTRA_ID_CONTROLS).toHaveLength(29);
  });

  it('every control has id matching MS.AAD.*.* pattern', () => {
    for (const control of ENTRA_ID_CONTROLS as ControlDefinition[]) {
      expect(control.id).toMatch(/^MS\.AAD\.\d+\.\d+v\d+$/);
    }
  });

  it('every control has product === AAD', () => {
    for (const control of ENTRA_ID_CONTROLS as ControlDefinition[]) {
      expect(control.product).toBe('AAD');
    }
  });

  it('every control has severity in [Critical, High, Medium, Low]', () => {
    const validSeverities = ['Critical', 'High', 'Medium', 'Low'];
    for (const control of ENTRA_ID_CONTROLS as ControlDefinition[]) {
      expect(validSeverities).toContain(control.severity);
    }
  });

  it('every control has requirementLevel in [SHALL, SHALL NOT, SHOULD, SHOULD NOT, MAY]', () => {
    const validLevels = ['SHALL', 'SHALL NOT', 'SHOULD', 'SHOULD NOT', 'MAY'];
    for (const control of ENTRA_ID_CONTROLS as ControlDefinition[]) {
      expect(validLevels).toContain(control.requirementLevel);
    }
  });

  it('every control has non-empty requiredPermissions array', () => {
    for (const control of ENTRA_ID_CONTROLS as ControlDefinition[]) {
      expect(Array.isArray(control.requiredPermissions)).toBe(true);
      expect((control.requiredPermissions as string[]).length).toBeGreaterThan(0);
    }
  });

  it('every control has nist80053 cross-reference string', () => {
    for (const control of ENTRA_ID_CONTROLS as ControlDefinition[]) {
      expect(typeof control.nist80053).toBe('string');
      expect((control.nist80053 as string).length).toBeGreaterThan(0);
    }
  });

  it('every control has an evaluator function', () => {
    for (const control of ENTRA_ID_CONTROLS as ControlDefinition[]) {
      expect(typeof control.evaluator).toBe('function');
    }
  });

  it('every control has a non-empty description', () => {
    for (const control of ENTRA_ID_CONTROLS as ControlDefinition[]) {
      expect(typeof control.description).toBe('string');
      expect((control.description as string).length).toBeGreaterThan(0);
    }
  });
});

describe('control-registry helpers', () => {
  it('getControlById returns correct control', () => {
    const control = getControlById('MS.AAD.1.1v1') as ControlDefinition;
    expect(control).toBeDefined();
    expect(control.id).toBe('MS.AAD.1.1v1');
    expect(control.product).toBe('AAD');
  });

  it('getControlById returns undefined for unknown ID', () => {
    const control = getControlById('MS.AAD.99.99v1');
    expect(control).toBeUndefined();
  });

  it('getControlsByProduct(AAD) returns all 29', () => {
    const controls = getControlsByProduct('AAD');
    expect(controls).toHaveLength(29);
  });

  it('getControlsByProduct returns empty for unknown product', () => {
    const controls = getControlsByProduct('UNKNOWN');
    expect(controls).toHaveLength(0);
  });

  it('getAllControls returns all 29', () => {
    const controls = getAllControls();
    expect(controls).toHaveLength(29);
  });
});

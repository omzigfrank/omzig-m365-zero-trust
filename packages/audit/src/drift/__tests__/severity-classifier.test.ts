/**
 * Phase 8 Plan 01 -- severity-classifier tests.
 * Verifies all 4 severity levels and highest-severity-wins logic.
 */
import { describe, it, expect } from 'vitest';
import { classifySeverity } from '../severity-classifier.js';
import type { DriftEvent } from '../types.js';

function makeEvent(activityDisplayName: string): DriftEvent {
  return {
    eventId: crypto.randomUUID(),
    activityDisplayName,
    area: 'conditionalAccess',
    actorUpn: 'admin@contoso.com',
    actorAppName: null,
    timestamp: new Date(),
    operationType: 'Update',
  };
}

describe('classifySeverity', () => {
  it('returns Critical for "Delete conditional access policy"', () => {
    const events = [makeEvent('Delete conditional access policy')];
    expect(classifySeverity(events)).toBe('Critical');
  });

  it('returns High for "Add member to role"', () => {
    const events = [makeEvent('Add member to role')];
    expect(classifySeverity(events)).toBe('High');
  });

  it('returns Medium for "Set password policy"', () => {
    const events = [makeEvent('Set password policy')];
    expect(classifySeverity(events)).toBe('Medium');
  });

  it('returns Low for "Add application"', () => {
    const events = [makeEvent('Add application')];
    expect(classifySeverity(events)).toBe('Low');
  });

  it('returns the highest severity when multiple events are present', () => {
    const events = [
      makeEvent('Add application'),          // Low
      makeEvent('Set password policy'),       // Medium
      makeEvent('Delete conditional access policy'), // Critical
    ];
    expect(classifySeverity(events)).toBe('Critical');
  });

  it('returns High for "Authentication Methods Policy Update"', () => {
    const events = [makeEvent('Authentication Methods Policy Update')];
    expect(classifySeverity(events)).toBe('High');
  });

  it('returns Critical for "Update security defaults"', () => {
    const events = [makeEvent('Update security defaults')];
    expect(classifySeverity(events)).toBe('Critical');
  });

  it('returns Medium for "Add eligible member to role"', () => {
    const events = [makeEvent('Add eligible member to role')];
    expect(classifySeverity(events)).toBe('Medium');
  });

  it('returns Low for "Update named location"', () => {
    const events = [makeEvent('Update named location')];
    expect(classifySeverity(events)).toBe('Low');
  });

  it('returns Low for unknown activity types', () => {
    const events = [makeEvent('Unknown activity')];
    expect(classifySeverity(events)).toBe('Low');
  });
});

/**
 * Severity classifier -- Phase 8 Plan 01.
 *
 * Auto-classifies drift severity from the activity types in the
 * audit log events. Returns the highest severity across all events.
 */

import type { DriftEvent, DriftSeverity } from './types.js';

/**
 * Severity lookup table per CONTEXT.md severity table.
 *
 * Critical: CA policy deleted/disabled, security defaults changed
 * High: Role membership changed, auth methods policy updated
 * Medium: Password policy, PIM role assignment changes
 * Low: App registration changes, named location changes, device changes
 */
const SEVERITY_BY_ACTIVITY: Record<string, DriftSeverity> = {
  // Critical
  'Delete conditional access policy': 'Critical',
  'Update security defaults': 'Critical',
  'Update conditional access policy': 'Critical',
  'Add conditional access policy': 'Critical',
  // High
  'Add member to role': 'High',
  'Remove member from role': 'High',
  'Authentication Methods Policy Update': 'High',
  'Update authorization policy': 'High',
  // Medium
  'Set password policy': 'Medium',
  'Add eligible member to role': 'Medium',
  'Remove eligible member from role': 'Medium',
  // Low
  'Add application': 'Low',
  'Update application': 'Low',
  'Delete application': 'Low',
  'Add named location': 'Low',
  'Update named location': 'Low',
  'Delete named location': 'Low',
  'Update device': 'Low',
  'Device no longer compliant': 'Low',
};

const SEVERITY_ORDER: Record<DriftSeverity, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

/**
 * Classify drift severity from the activity types in the events.
 * Returns the highest severity across all events (Critical > High > Medium > Low).
 * Defaults to Low for unknown activity types.
 */
export function classifySeverity(events: DriftEvent[]): DriftSeverity {
  let highest: DriftSeverity = 'Low';
  let highestOrder = 1;

  for (const event of events) {
    const severity = SEVERITY_BY_ACTIVITY[event.activityDisplayName] ?? 'Low';
    const order = SEVERITY_ORDER[severity];
    if (order > highestOrder) {
      highest = severity;
      highestOrder = order;
    }
  }

  return highest;
}

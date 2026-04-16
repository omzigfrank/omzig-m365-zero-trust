/**
 * Diff engine -- Phase 8 Plan 01.
 *
 * Per-area deep comparison between a baseline AuditFacts area snapshot
 * and the current re-collected area facts. For array areas (e.g.,
 * conditionalAccess.policies), performs item-level matching by `id` field
 * to detect added, removed, and modified items. For scalar areas (e.g.,
 * securityDefaults), delegates to Phase 7's computeDrift().
 */

import { computeDrift } from '../remediation/rollback-service.js';
import type { AreaDiffResult } from './types.js';

/**
 * Areas whose facts contain an array property that should be diffed at
 * the item level. Maps area name -> the property key holding the array.
 */
const ARRAY_AREAS: Record<string, string> = {
  conditionalAccess: 'policies',
  namedLocations: 'locations',
};

/**
 * Compare the baseline area facts against the current area facts.
 *
 * For array areas: item-level matching by `id` field with per-item
 * computeDrift for modification detection.
 *
 * For scalar areas: delegates to computeDrift() which excludes volatile
 * fields (modifiedDateTime, createdDateTime, etc.).
 *
 * @returns AreaDiffResult with structured diff and human-readable summary.
 */
export function diffFactArea(
  area: string,
  baselineAreaFacts: unknown,
  currentAreaFacts: unknown,
): AreaDiffResult {
  const arrayKey = ARRAY_AREAS[area];

  if (arrayKey) {
    return diffArrayArea(area, arrayKey, baselineAreaFacts, currentAreaFacts);
  }

  return diffScalarArea(area, baselineAreaFacts, currentAreaFacts);
}

// ---- Array area diffing ----

function diffArrayArea(
  area: string,
  arrayKey: string,
  baselineFacts: unknown,
  currentFacts: unknown,
): AreaDiffResult {
  const baselineObj = (baselineFacts ?? {}) as Record<string, unknown>;
  const currentObj = (currentFacts ?? {}) as Record<string, unknown>;

  const baselineItems = (baselineObj[arrayKey] ?? []) as Array<Record<string, unknown>>;
  const currentItems = (currentObj[arrayKey] ?? []) as Array<Record<string, unknown>>;

  // Build lookup maps by `id`
  const baselineById = new Map<string, Record<string, unknown>>();
  for (const item of baselineItems) {
    const id = String(item.id ?? '');
    if (id) baselineById.set(id, item);
  }

  const currentById = new Map<string, Record<string, unknown>>();
  for (const item of currentItems) {
    const id = String(item.id ?? '');
    if (id) currentById.set(id, item);
  }

  const added: AreaDiffResult['structuredDiff']['added'] = [];
  const removed: AreaDiffResult['structuredDiff']['removed'] = [];
  const modified: AreaDiffResult['structuredDiff']['modified'] = [];

  // Items in current but not baseline -> added
  for (const [id, item] of currentById) {
    if (!baselineById.has(id)) {
      added.push({ id, displayName: String(item.displayName ?? '') });
    }
  }

  // Items in baseline but not current -> removed
  for (const [id, item] of baselineById) {
    if (!currentById.has(id)) {
      removed.push({ id, displayName: String(item.displayName ?? '') });
    }
  }

  // Items in both -> check for modifications
  for (const [id, baselineItem] of baselineById) {
    const currentItem = currentById.get(id);
    if (!currentItem) continue;

    const drift = computeDrift(currentItem, baselineItem);
    if (drift.drifted) {
      modified.push({
        id,
        displayName: String(baselineItem.displayName ?? ''),
        changedFields: drift.changedFields,
      });
    }
  }

  const drifted = added.length + removed.length + modified.length > 0;
  const humanSummary = buildArraySummary(area, added, removed, modified);

  return {
    drifted,
    structuredDiff: { added, removed, modified },
    humanSummary,
  };
}

function buildArraySummary(
  area: string,
  added: AreaDiffResult['structuredDiff']['added'],
  removed: AreaDiffResult['structuredDiff']['removed'],
  modified: AreaDiffResult['structuredDiff']['modified'],
): string {
  const parts: string[] = [];

  if (added.length > 0) {
    const names = added.map((i) => i.displayName || i.id).join(', ');
    parts.push(`${area}: ${added.length} item(s) added (${names})`);
  }

  if (removed.length > 0) {
    const names = removed.map((i) => i.displayName || i.id).join(', ');
    parts.push(`${area}: ${removed.length} item(s) removed (${names})`);
  }

  if (modified.length > 0) {
    const names = modified
      .map((i) => `${i.displayName || i.id} - fields: ${i.changedFields.join(', ')}`)
      .join('; ');
    parts.push(`${area}: ${modified.length} item(s) modified (${names})`);
  }

  return parts.join('; ') || `${area}: no changes detected`;
}

// ---- Scalar area diffing ----

function diffScalarArea(
  area: string,
  baselineFacts: unknown,
  currentFacts: unknown,
): AreaDiffResult {
  const drift = computeDrift(currentFacts, baselineFacts);

  if (!drift.drifted) {
    return {
      drifted: false,
      structuredDiff: { added: [], removed: [], modified: [] },
      humanSummary: `${area}: no changes detected`,
    };
  }

  return {
    drifted: true,
    structuredDiff: {
      added: [],
      removed: [],
      modified: [{
        id: area,
        displayName: area,
        changedFields: drift.changedFields,
      }],
    },
    humanSummary: `${area}: changed fields: ${drift.changedFields.join(', ')}`,
  };
}

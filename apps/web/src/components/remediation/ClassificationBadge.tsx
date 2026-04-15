"use client";

/**
 * ClassificationBadge -- SAFE / RISKY visual pill for remediation entries.
 *
 * SAFE (green): bounded blast radius, deterministic rollback, no lockout
 * risk. One-click remediation is allowed.
 * RISKY (amber): requires the guided wizard flow (Plan 07-03).
 */

import { Shield, AlertTriangle } from 'lucide-react';

interface ClassificationBadgeProps {
  classification: 'SAFE' | 'RISKY';
  size?: 'sm' | 'md';
}

export function ClassificationBadge({
  classification,
  size = 'md',
}: ClassificationBadgeProps) {
  const isSafe = classification === 'SAFE';
  const paddingClass = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const colorClass = isSafe
    ? 'bg-green-100 text-green-800 border border-green-200'
    : 'bg-amber-100 text-amber-900 border border-amber-300';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${paddingClass} ${colorClass}`}
      data-testid={`classification-badge-${classification.toLowerCase()}`}
    >
      {isSafe ? (
        <Shield className={iconSize} />
      ) : (
        <AlertTriangle className={iconSize} />
      )}
      {classification}
    </span>
  );
}

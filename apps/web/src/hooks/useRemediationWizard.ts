"use client";

/**
 * useRemediationWizard hook -- Phase 7 Plan 03.
 *
 * State machine for the RISKY guided wizard:
 *   impact_preview -> report_only -> monitor -> enforce -> completed | failed
 *
 * - advance() moves forward through the linear sequence
 * - goBack() only allows backward navigation between impact_preview <-> report_only
 *   (cannot rewind once a Report-Only policy has been deployed to Graph)
 * - jumpTo() is an escape hatch for tests and the failure state
 */

import { useCallback, useState } from 'react';

export type WizardStep =
  | 'impact_preview'
  | 'report_only'
  | 'monitor'
  | 'enforce'
  | 'completed'
  | 'failed';

const LINEAR_SEQUENCE: WizardStep[] = [
  'impact_preview',
  'report_only',
  'monitor',
  'enforce',
  'completed',
];

export interface UseRemediationWizardResult {
  step: WizardStep;
  jobId: string | null;
  error: string | null;
  advance: () => void;
  goBack: () => void;
  jumpTo: (step: WizardStep) => void;
  setJobId: (id: string) => void;
  setError: (err: string | null) => void;
  reset: () => void;
}

export function useRemediationWizard(
  initialStep: WizardStep = 'impact_preview',
): UseRemediationWizardResult {
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [jobId, setJobIdState] = useState<string | null>(null);
  const [error, setErrorState] = useState<string | null>(null);

  const advance = useCallback(() => {
    setStep((prev) => {
      const idx = LINEAR_SEQUENCE.indexOf(prev);
      if (idx < 0 || idx === LINEAR_SEQUENCE.length - 1) return prev;
      return LINEAR_SEQUENCE[idx + 1];
    });
  }, []);

  const goBack = useCallback(() => {
    setStep((prev) => {
      // Only impact_preview <-> report_only is reversible (before Graph write).
      if (prev === 'report_only') return 'impact_preview';
      return prev;
    });
  }, []);

  const jumpTo = useCallback((next: WizardStep) => {
    setStep(next);
  }, []);

  const setJobId = useCallback((id: string) => {
    setJobIdState(id);
  }, []);

  const setError = useCallback((err: string | null) => {
    setErrorState(err);
    if (err) setStep('failed');
  }, []);

  const reset = useCallback(() => {
    setStep(initialStep);
    setJobIdState(null);
    setErrorState(null);
  }, [initialStep]);

  return {
    step,
    jobId,
    error,
    advance,
    goBack,
    jumpTo,
    setJobId,
    setError,
    reset,
  };
}

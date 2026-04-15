/**
 * Phase 7 Plan 03 -- useRemediationWizard hook tests.
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRemediationWizard } from '@/hooks/useRemediationWizard';

describe('useRemediationWizard', () => {
  it('starts at impact_preview by default', () => {
    const { result } = renderHook(() => useRemediationWizard());
    expect(result.current.step).toBe('impact_preview');
    expect(result.current.jobId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('advance() walks the linear sequence', () => {
    const { result } = renderHook(() => useRemediationWizard());
    act(() => result.current.advance());
    expect(result.current.step).toBe('report_only');
    act(() => result.current.advance());
    expect(result.current.step).toBe('monitor');
    act(() => result.current.advance());
    expect(result.current.step).toBe('enforce');
    act(() => result.current.advance());
    expect(result.current.step).toBe('completed');
    // Cannot advance past completed.
    act(() => result.current.advance());
    expect(result.current.step).toBe('completed');
  });

  it('goBack() only allows impact_preview <-> report_only reversal', () => {
    const { result } = renderHook(() => useRemediationWizard());
    act(() => result.current.advance()); // report_only
    act(() => result.current.goBack());
    expect(result.current.step).toBe('impact_preview');

    act(() => result.current.advance()); // report_only
    act(() => result.current.advance()); // monitor
    act(() => result.current.goBack()); // should be no-op once past report_only
    expect(result.current.step).toBe('monitor');
  });

  it('jumpTo() moves to any step (escape hatch)', () => {
    const { result } = renderHook(() => useRemediationWizard());
    act(() => result.current.jumpTo('completed'));
    expect(result.current.step).toBe('completed');
  });

  it('setError() moves to failed step and stores error', () => {
    const { result } = renderHook(() => useRemediationWizard());
    act(() => result.current.setError('boom'));
    expect(result.current.step).toBe('failed');
    expect(result.current.error).toBe('boom');
  });

  it('setJobId() stores the job id', () => {
    const { result } = renderHook(() => useRemediationWizard());
    act(() => result.current.setJobId('job-123'));
    expect(result.current.jobId).toBe('job-123');
  });

  it('reset() returns to initial state', () => {
    const { result } = renderHook(() => useRemediationWizard());
    act(() => result.current.setJobId('job-123'));
    act(() => result.current.advance());
    act(() => result.current.reset());
    expect(result.current.step).toBe('impact_preview');
    expect(result.current.jobId).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

/**
 * Phase 7 Plan 03 -- RiskyRemediationWizard integration tests.
 *
 * Mocks useImpactPreview, useRemediation, WizardStep{ReportOnly,Monitor,Enforce}
 * so we can verify the wizard state machine transitions end-to-end with
 * user-driven clicks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { AuditFinding } from '@/lib/types';

// Stub useImpactPreview.
const mockPreviewData = {
  affectedUserCount: 5,
  totalUserCount: 100,
  conflictingPolicies: [],
  warnings: [],
  confidence: 'high' as const,
  summary: 'Test impact summary',
};

vi.mock('@/hooks/useImpactPreview', () => ({
  useImpactPreview: vi.fn(() => ({
    data: mockPreviewData,
    loading: false,
    error: null,
  })),
}));

// Stub wizard sub-steps so we can drive transitions via test-id buttons.
vi.mock('@/components/remediation/WizardStepReportOnly', () => ({
  WizardStepReportOnly: (props: any) => (
    <div data-testid="mock-step-report-only">
      <button
        data-testid="mock-deploy-btn"
        onClick={() => props.onDeployed('job-xyz')}
      >
        Mock Deploy
      </button>
      <button data-testid="mock-report-only-cancel" onClick={props.onCancel}>
        Cancel
      </button>
    </div>
  ),
}));

vi.mock('@/components/remediation/WizardStepMonitor', () => ({
  WizardStepMonitor: (props: any) => (
    <div data-testid="mock-step-monitor">
      Job: {props.jobId}
      <button data-testid="mock-ready-btn" onClick={props.onReadyToEnforce}>
        Mock Ready
      </button>
    </div>
  ),
}));

vi.mock('@/components/remediation/WizardStepEnforce', () => ({
  WizardStepEnforce: (props: any) => (
    <div data-testid="mock-step-enforce">
      Job: {props.jobId}
      <button data-testid="mock-complete-btn" onClick={props.onCompleted}>
        Mock Complete
      </button>
      <button
        data-testid="mock-fail-btn"
        onClick={() => props.onFailed('mock failure')}
      >
        Mock Fail
      </button>
    </div>
  ),
}));

import { RiskyRemediationWizard } from '@/components/remediation/RiskyRemediationWizard';

const testFinding = {
  id: 'finding-1',
  auditRunId: 'run-1',
  controlId: 'MS.AAD.3.7v1',
  product: 'AAD',
  description: 'Test',
  requirementLevel: 'SHALL',
  severity: 'High',
  rating: 'fail',
  message: 'test',
} as unknown as AuditFinding;

describe('RiskyRemediationWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('renders nothing when isOpen=false', () => {
    const { container } = render(
      <RiskyRemediationWizard
        finding={testFinding}
        tenantId="t-1"
        bundle="conditionalAccess"
        isOpen={false}
        onClose={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the impact preview step initially', () => {
    render(
      <RiskyRemediationWizard
        finding={testFinding}
        tenantId="t-1"
        bundle="conditionalAccess"
        isOpen={true}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('risky-remediation-wizard')).toBeTruthy();
    expect(screen.getByText('Test impact summary')).toBeTruthy();
  });

  it('advances from impact_preview -> report_only on Next click', () => {
    render(
      <RiskyRemediationWizard
        finding={testFinding}
        tenantId="t-1"
        bundle="conditionalAccess"
        isOpen={true}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('wizard-advance-button'));
    expect(screen.getByTestId('mock-step-report-only')).toBeTruthy();
  });

  it('advances to monitor after Report-Only deploy', () => {
    render(
      <RiskyRemediationWizard
        finding={testFinding}
        tenantId="t-1"
        bundle="conditionalAccess"
        isOpen={true}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('wizard-advance-button'));
    fireEvent.click(screen.getByTestId('mock-deploy-btn'));
    expect(screen.getByTestId('mock-step-monitor')).toBeTruthy();
    expect(screen.getByText(/Job: job-xyz/)).toBeTruthy();
  });

  it('advances to enforce after monitor ready click', () => {
    render(
      <RiskyRemediationWizard
        finding={testFinding}
        tenantId="t-1"
        bundle="conditionalAccess"
        isOpen={true}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('wizard-advance-button'));
    fireEvent.click(screen.getByTestId('mock-deploy-btn'));
    fireEvent.click(screen.getByTestId('mock-ready-btn'));
    expect(screen.getByTestId('mock-step-enforce')).toBeTruthy();
  });

  it('reaches the completed state via enforce success', () => {
    render(
      <RiskyRemediationWizard
        finding={testFinding}
        tenantId="t-1"
        bundle="conditionalAccess"
        isOpen={true}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('wizard-advance-button'));
    fireEvent.click(screen.getByTestId('mock-deploy-btn'));
    fireEvent.click(screen.getByTestId('mock-ready-btn'));
    fireEvent.click(screen.getByTestId('mock-complete-btn'));
    expect(screen.getByTestId('wizard-step-completed')).toBeTruthy();
    expect(screen.getByText('Remediation Complete')).toBeTruthy();
  });

  it('reaches the failed state when enforce reports failure', () => {
    render(
      <RiskyRemediationWizard
        finding={testFinding}
        tenantId="t-1"
        bundle="conditionalAccess"
        isOpen={true}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('wizard-advance-button'));
    fireEvent.click(screen.getByTestId('mock-deploy-btn'));
    fireEvent.click(screen.getByTestId('mock-ready-btn'));
    fireEvent.click(screen.getByTestId('mock-fail-btn'));
    expect(screen.getByTestId('wizard-step-failed')).toBeTruthy();
    expect(screen.getByText(/mock failure/)).toBeTruthy();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <RiskyRemediationWizard
        finding={testFinding}
        tenantId="t-1"
        bundle="conditionalAccess"
        isOpen={true}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('wizard-close-button'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders preview loading state', async () => {
    const mod = await import('@/hooks/useImpactPreview');
    (mod.useImpactPreview as any).mockReturnValueOnce({
      data: null,
      loading: true,
      error: null,
    });
    render(
      <RiskyRemediationWizard
        finding={testFinding}
        tenantId="t-1"
        bundle="conditionalAccess"
        isOpen={true}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('preview-loading')).toBeTruthy();
  });

  it('renders preview error state', async () => {
    const mod = await import('@/hooks/useImpactPreview');
    (mod.useImpactPreview as any).mockReturnValueOnce({
      data: null,
      loading: false,
      error: 'Network error',
    });
    render(
      <RiskyRemediationWizard
        finding={testFinding}
        tenantId="t-1"
        bundle="conditionalAccess"
        isOpen={true}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('preview-error')).toBeTruthy();
    expect(screen.getByText(/Network error/)).toBeTruthy();
  });
});

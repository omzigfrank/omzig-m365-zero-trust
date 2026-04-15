/**
 * Phase 7 Plan 03 -- ImpactPreview component tests.
 *
 * Uses plain vitest + @testing-library/react assertions (no jest-dom matchers).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ImpactPreview } from '@/components/remediation/ImpactPreview';
import type { RemediationImpactPreview } from '@/hooks/useImpactPreview';

afterEach(() => cleanup());

function makePreview(
  overrides: Partial<RemediationImpactPreview> = {},
): RemediationImpactPreview {
  return {
    affectedUserCount: 5,
    totalUserCount: 100,
    conflictingPolicies: [],
    warnings: [],
    confidence: 'high',
    summary: 'Test summary',
    ...overrides,
  };
}

describe('ImpactPreview', () => {
  it('renders the summary header', () => {
    render(<ImpactPreview preview={makePreview({ summary: 'My summary' })} />);
    expect(screen.getByText('My summary')).toBeTruthy();
  });

  it('renders affectedUserCount and totalUserCount', () => {
    render(
      <ImpactPreview
        preview={makePreview({ affectedUserCount: 23, totalUserCount: 456 })}
      />,
    );
    expect(screen.getByTestId('affected-user-count').textContent).toBe('23');
    expect(screen.getByText(/of 456 users/)).toBeTruthy();
  });

  it('shows high confidence badge when confidence=high', () => {
    render(<ImpactPreview preview={makePreview({ confidence: 'high' })} />);
    expect(screen.getByTestId('confidence-badge-high')).toBeTruthy();
    expect(screen.queryByTestId('confidence-badge-estimated')).toBeNull();
  });

  it('shows estimated confidence badge when confidence=estimated', () => {
    render(
      <ImpactPreview preview={makePreview({ confidence: 'estimated' })} />,
    );
    expect(screen.getByTestId('confidence-badge-estimated')).toBeTruthy();
    expect(screen.queryByTestId('confidence-badge-high')).toBeNull();
  });

  it('renders a warnings list when warnings are present', () => {
    render(
      <ImpactPreview
        preview={makePreview({
          warnings: ['Warning one', 'Warning two'],
        })}
      />,
    );
    const warningsList = screen.getByTestId('warnings-list');
    expect(warningsList.textContent).toContain('Warning one');
    expect(warningsList.textContent).toContain('Warning two');
  });

  it('omits the warnings list when there are no warnings', () => {
    render(<ImpactPreview preview={makePreview({ warnings: [] })} />);
    expect(screen.queryByTestId('warnings-list')).toBeNull();
  });

  it('renders conflicting policies as external links', () => {
    render(
      <ImpactPreview
        preview={makePreview({
          conflictingPolicies: [
            { id: 'ca-1', displayName: 'Existing MFA policy' },
          ],
        })}
      />,
    );
    const conflicts = screen.getByTestId('conflicting-policies');
    expect(conflicts.textContent).toContain('Existing MFA policy');
    const link = conflicts.querySelector('a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toContain('ca-1');
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it('omits conflicting policies section when list is empty', () => {
    render(
      <ImpactPreview preview={makePreview({ conflictingPolicies: [] })} />,
    );
    expect(screen.queryByTestId('conflicting-policies')).toBeNull();
  });
});

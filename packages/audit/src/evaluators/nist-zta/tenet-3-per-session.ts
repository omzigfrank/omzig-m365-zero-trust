/**
 * NIST 800-207 Tenet 3: Access to individual resources is granted on a per-session basis.
 * (No Implicit Trust)
 * Ported from NistEvaluatorRegistry.ps1 lines 155-203.
 */
import type { EvaluatorFn } from '../types.js';

/** T3.1 -- CA policies enforce per-session evaluation */
export const evaluateZTA_T3_1: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'fail',
      message: 'Could not verify per-session access controls.',
      settingName: 'Per-Session Evaluation',
      currentValue: 'Unknown',
      expectedValue: '>= 3 active CA policies',
      requiredPermission: 'Policy.Read.All',
    };
  }

  const enabledPolicies = facts.conditionalAccess.enabledCount + facts.conditionalAccess.reportOnlyCount;
  if (enabledPolicies >= 3) {
    return {
      rating: 'pass',
      message: `${enabledPolicies} active CA policies provide per-session access control.`,
      settingName: 'Per-Session Evaluation',
      currentValue: `${enabledPolicies} active policies`,
      expectedValue: '>= 3 active CA policies',
    };
  }
  if (enabledPolicies >= 1) {
    return {
      rating: 'warn',
      message: `Only ${enabledPolicies} CA policy(s) active.`,
      action: 'Deploy additional CA policies for comprehensive per-session evaluation.',
      settingName: 'Per-Session Evaluation',
      currentValue: `${enabledPolicies} active policies`,
      expectedValue: '>= 3 active CA policies',
    };
  }
  return {
    rating: 'fail',
    message: 'No active CA policies for per-session access.',
    action: 'Deploy CA policies to enforce per-session access decisions.',
    settingName: 'Per-Session Evaluation',
    currentValue: '0 active policies',
    expectedValue: '>= 3 active CA policies',
  };
};

/** T3.2 -- Sign-in frequency or persistent browser configured */
export const evaluateZTA_T3_2: EvaluatorFn = (facts) => {
  if (!facts.conditionalAccess.available) {
    return {
      rating: 'na',
      message: 'Could not verify session control configuration.',
      settingName: 'Session Controls',
      currentValue: 'Unknown',
      expectedValue: 'CA session controls configured',
    };
  }

  for (const pol of facts.conditionalAccess.policies) {
    if (pol.state === 'disabled') continue;
    if (pol.sessionControls) {
      const sc = pol.sessionControls as Record<string, unknown>;
      const sif = sc.signInFrequency as Record<string, unknown> | undefined;
      const pb = sc.persistentBrowser as Record<string, unknown> | undefined;
      if (sif?.isEnabled) {
        return {
          rating: 'pass',
          message: 'CA session controls (sign-in frequency or persistent browser) configured.',
          settingName: 'Session Controls',
          currentValue: 'Session controls active',
          expectedValue: 'CA session controls configured',
        };
      }
      if (pb?.isEnabled) {
        return {
          rating: 'pass',
          message: 'CA session controls (sign-in frequency or persistent browser) configured.',
          settingName: 'Session Controls',
          currentValue: 'Session controls active',
          expectedValue: 'CA session controls configured',
        };
      }
    }
  }

  return {
    rating: 'warn',
    message: 'No CA session control policies detected.',
    action: 'Configure sign-in frequency and persistent browser controls in CA policies.',
    settingName: 'Session Controls',
    currentValue: 'No session controls',
    expectedValue: 'CA session controls configured',
  };
};

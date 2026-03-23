/**
 * MS.AAD.4.1v1 — Security logs SHALL be sent to the agency's SIEM.
 * Advisory check: cannot fully validate via Graph API.
 */
import type { EvaluatorFn } from '../types.js';

/** MS.AAD.4.1v1 — Security logs to SIEM. */
export const evaluateAAD_4_1: EvaluatorFn = () => {
  return {
    rating: 'warn',
    message: 'Verify that diagnostic settings are configured to send security logs to a SIEM.',
    action: 'Configure Azure AD diagnostic settings to export sign-in and audit logs to Log Analytics, Sentinel, or a third-party SIEM.',
    settingName: 'Diagnostic Settings',
    currentValue: 'Not verifiable via Graph API',
    expectedValue: 'Configured in Azure Portal',
  };
};

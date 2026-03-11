/**
 * 29 CISA SCuBA Entra ID (AAD) control definitions.
 * Ported from CisaCatalogFetcher.ps1 defaults and CisaEvaluatorRegistry.ps1.
 *
 * Each control has:
 * - id: CISA control ID (e.g., MS.AAD.1.1v1)
 * - product: 'AAD'
 * - description: Plain text description from CISA SCuBA baseline
 * - requirementLevel: SHALL, SHALL NOT, SHOULD, SHOULD NOT, or MAY
 * - severity: Critical, High, Medium, or Low
 * - nist80053: NIST 800-53 cross-reference
 * - evaluator: Placeholder function (real evaluators wired in Plan 03)
 * - requiredPermissions: Graph API scopes needed for this check
 */

import type { ControlDefinition, EvaluatorFn } from '../types.js';

const placeholderEvaluator: EvaluatorFn = () => ({
  rating: 'na',
  message: 'Evaluator not yet implemented',
});

export const ENTRA_ID_CONTROLS: ControlDefinition[] = [
  // =======================================================================
  // MS.AAD.1.x - Legacy Authentication
  // =======================================================================
  {
    id: 'MS.AAD.1.1v1',
    product: 'AAD',
    description: 'Legacy authentication SHALL be blocked.',
    requirementLevel: 'SHALL',
    severity: 'Critical',
    nist80053: 'AC-7',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Policy.Read.All'],
  },

  // =======================================================================
  // MS.AAD.2.x - Risk-Based Policies
  // =======================================================================
  {
    id: 'MS.AAD.2.1v1',
    product: 'AAD',
    description: 'Users detected as high risk SHALL be blocked.',
    requirementLevel: 'SHALL',
    severity: 'Critical',
    nist80053: 'AC-7',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Policy.Read.All', 'IdentityRiskEvent.Read.All'],
  },
  {
    id: 'MS.AAD.2.3v1',
    product: 'AAD',
    description: 'Sign-ins detected as high risk SHALL be blocked.',
    requirementLevel: 'SHALL',
    severity: 'Critical',
    nist80053: 'AC-7',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Policy.Read.All', 'IdentityRiskEvent.Read.All'],
  },

  // =======================================================================
  // MS.AAD.3.x - Multi-Factor Authentication
  // =======================================================================
  {
    id: 'MS.AAD.3.1v1',
    product: 'AAD',
    description: 'Phishing-resistant MFA SHALL be required for all users.',
    requirementLevel: 'SHALL',
    severity: 'Critical',
    nist80053: 'IA-2(1)',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'MS.AAD.3.2v1',
    product: 'AAD',
    description:
      'If phishing-resistant MFA cannot be used, an MFA method from the list SHALL be used.',
    requirementLevel: 'SHOULD',
    severity: 'High',
    nist80053: 'IA-2(1)',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['UserAuthenticationMethod.Read.All', 'AuditLog.Read.All'],
  },
  {
    id: 'MS.AAD.3.3v1',
    product: 'AAD',
    description:
      'If phishing-resistant MFA has not been enforced, an alternative MFA method SHALL be enforced.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    nist80053: 'IA-2(1)',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'MS.AAD.3.4v1',
    product: 'AAD',
    description:
      'The Authentication Methods Manage Migration feature SHALL be set to Migration Complete.',
    requirementLevel: 'SHALL',
    severity: 'Medium',
    nist80053: 'IA-2(1)',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'MS.AAD.3.5v1',
    product: 'AAD',
    description: 'SMS or voice as an MFA option SHALL NOT be used.',
    requirementLevel: 'SHALL NOT',
    severity: 'High',
    nist80053: 'IA-2(1)',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'MS.AAD.3.6v1',
    product: 'AAD',
    description: 'Phishing-resistant MFA SHALL be required for highly privileged roles.',
    requirementLevel: 'SHALL',
    severity: 'Critical',
    nist80053: 'IA-2(1)',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Policy.Read.All', 'RoleManagement.Read.Directory'],
  },
  {
    id: 'MS.AAD.3.7v1',
    product: 'AAD',
    description: 'Managed devices SHOULD be required for authentication.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    nist80053: 'CM-6',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'MS.AAD.3.8v1',
    product: 'AAD',
    description: 'Managed Devices SHOULD be required to register MFA.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    nist80053: 'CM-6',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Policy.Read.All'],
  },

  // =======================================================================
  // MS.AAD.4.x - Logging
  // =======================================================================
  {
    id: 'MS.AAD.4.1v1',
    product: 'AAD',
    description: "Security logs SHALL be sent to the agency's SIEM.",
    requirementLevel: 'SHALL',
    severity: 'High',
    nist80053: 'AU-6',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['AuditLog.Read.All', 'Directory.Read.All'],
  },

  // =======================================================================
  // MS.AAD.5.x - Application Consent & Registration
  // =======================================================================
  {
    id: 'MS.AAD.5.1v1',
    product: 'AAD',
    description: 'Only administrators SHALL be allowed to register applications.',
    requirementLevel: 'SHALL',
    severity: 'High',
    nist80053: 'CM-7',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'MS.AAD.5.2v1',
    product: 'AAD',
    description: 'Only administrators SHALL be allowed to consent to applications.',
    requirementLevel: 'SHALL',
    severity: 'High',
    nist80053: 'CM-7',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'MS.AAD.5.3v1',
    product: 'AAD',
    description: 'An admin consent workflow SHALL be enabled.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    nist80053: 'CM-7',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'MS.AAD.5.4v1',
    product: 'AAD',
    description: 'Group owners SHALL NOT be allowed to consent to applications.',
    requirementLevel: 'SHALL NOT',
    severity: 'Medium',
    nist80053: 'CM-7',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Policy.Read.All'],
  },

  // =======================================================================
  // MS.AAD.6.x - Passwords
  // =======================================================================
  {
    id: 'MS.AAD.6.1v1',
    product: 'AAD',
    description: 'User passwords SHALL NOT expire.',
    requirementLevel: 'SHALL NOT',
    severity: 'Medium',
    nist80053: 'IA-5',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Domain.Read.All'],
  },

  // =======================================================================
  // MS.AAD.7.x - Privileged Roles & PIM
  // =======================================================================
  {
    id: 'MS.AAD.7.1v1',
    product: 'AAD',
    description:
      'A minimum of two users and a maximum of eight users SHALL be provisioned with the Global Administrator role.',
    requirementLevel: 'SHALL',
    severity: 'Critical',
    nist80053: 'AC-6(5)',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Directory.Read.All', 'RoleManagement.Read.Directory'],
  },
  {
    id: 'MS.AAD.7.2v1',
    product: 'AAD',
    description: 'Privileged users SHALL be assigned to Entra ID roles via PIM.',
    requirementLevel: 'SHALL',
    severity: 'High',
    nist80053: 'AC-6(5)',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['RoleManagement.Read.Directory', 'RoleEligibilitySchedule.Read.Directory'],
  },
  {
    id: 'MS.AAD.7.3v1',
    product: 'AAD',
    description: 'Activation of the Global Administrator role SHALL require approval.',
    requirementLevel: 'SHOULD',
    severity: 'High',
    nist80053: 'AC-6(5)',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['RoleManagement.Read.Directory'],
  },
  {
    id: 'MS.AAD.7.4v1',
    product: 'AAD',
    description: 'Eligible and active role assignments SHALL be audited monthly.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    nist80053: 'AC-6(5)',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['RoleManagement.Read.Directory'],
  },
  {
    id: 'MS.AAD.7.5v1',
    product: 'AAD',
    description: 'Permanent active role assignments SHALL NOT be allowed.',
    requirementLevel: 'SHOULD',
    severity: 'High',
    nist80053: 'AC-6(5)',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['RoleManagement.Read.Directory'],
  },
  {
    id: 'MS.AAD.7.6v1',
    product: 'AAD',
    description: 'Highly privileged role assignments SHALL require MFA activation.',
    requirementLevel: 'SHOULD',
    severity: 'High',
    nist80053: 'AC-6(5)',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['RoleManagement.Read.Directory'],
  },
  {
    id: 'MS.AAD.7.7v1',
    product: 'AAD',
    description:
      'Provisioning users to highly privileged roles SHALL NOT occur outside of PIM.',
    requirementLevel: 'SHOULD',
    severity: 'High',
    nist80053: 'AC-6(5)',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['RoleManagement.Read.Directory'],
  },
  {
    id: 'MS.AAD.7.8v1',
    product: 'AAD',
    description: 'Activation of highly privileged roles SHOULD trigger an alert.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    nist80053: 'AC-6(5)',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['RoleManagement.Read.Directory'],
  },
  {
    id: 'MS.AAD.7.9v1',
    product: 'AAD',
    description: 'User activation of the Global Administrator role SHALL require approval.',
    requirementLevel: 'SHOULD',
    severity: 'High',
    nist80053: 'AC-6(5)',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['RoleManagement.Read.Directory'],
  },

  // =======================================================================
  // MS.AAD.8.x - Guest Access
  // =======================================================================
  {
    id: 'MS.AAD.8.1v1',
    product: 'AAD',
    description: 'Guest users SHOULD only be allowed access by specific organization admins.',
    requirementLevel: 'SHOULD',
    severity: 'High',
    nist80053: 'AC-3',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'MS.AAD.8.2v1',
    product: 'AAD',
    description: 'Guest invites SHOULD only be allowed from specific admin roles.',
    requirementLevel: 'SHOULD',
    severity: 'High',
    nist80053: 'AC-3',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'MS.AAD.8.3v1',
    product: 'AAD',
    description: 'Guest user access SHALL be restricted.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    nist80053: 'AC-3',
    evaluator: placeholderEvaluator,
    requiredPermissions: ['Policy.Read.All'],
  },
];

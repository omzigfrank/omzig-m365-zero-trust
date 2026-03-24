/**
 * 22 NIST 800-53 control definitions.
 * Each control maps to a NIST 800-53 control family and a NIST CSF function.
 *
 * INDEPENDENT: These evaluators have their own pass/fail logic.
 * They are NOT derived from CISA SCuBA evaluator results.
 */

import type { ControlDefinition } from '../types.js';
import {
  evaluate80053_AC2, evaluate80053_AC3, evaluate80053_AC6,
  evaluate80053_AC7, evaluate80053_AC11, evaluate80053_AC17,
} from '../evaluators/nist-80053/ac-access-control.js';
import {
  evaluate80053_IA2, evaluate80053_IA5, evaluate80053_IA8,
} from '../evaluators/nist-80053/ia-identification.js';
import {
  evaluate80053_SC7, evaluate80053_SC8, evaluate80053_SC13,
} from '../evaluators/nist-80053/sc-system-comms.js';
import {
  evaluate80053_AU2, evaluate80053_AU6, evaluate80053_AU12,
} from '../evaluators/nist-80053/au-audit.js';
import {
  evaluate80053_CM6, evaluate80053_CM7, evaluate80053_CM8,
} from '../evaluators/nist-80053/cm-configuration.js';
import {
  evaluate80053_SI2, evaluate80053_SI3, evaluate80053_SI4,
} from '../evaluators/nist-80053/si-system-integrity.js';
import {
  evaluate80053_RA5,
} from '../evaluators/nist-80053/ra-risk-assessment.js';

export const NIST_80053_CONTROLS: ControlDefinition[] = [
  // =====================================================================
  // AC - Access Control (6 controls) -- HIGH priority family
  // =====================================================================
  {
    id: 'NIST.80053.AC-2v1',
    product: '80053',
    description: 'Account management SHALL maintain 2-8 Global Administrators.',
    requirementLevel: 'SHALL',
    severity: 'High',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'AC-2',
    nistCsf: 'PR',
    evaluator: evaluate80053_AC2,
    requiredPermissions: ['Directory.Read.All'],
  },
  {
    id: 'NIST.80053.AC-3v1',
    product: '80053',
    description: 'Access enforcement SHALL use Conditional Access policies with grant controls.',
    requirementLevel: 'SHALL',
    severity: 'High',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'AC-3',
    nistCsf: 'PR',
    evaluator: evaluate80053_AC3,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'NIST.80053.AC-6v1',
    product: '80053',
    description: 'Least privilege SHOULD be enforced via Privileged Identity Management.',
    requirementLevel: 'SHOULD',
    severity: 'High',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'AC-6',
    nistCsf: 'PR',
    evaluator: evaluate80053_AC6,
    requiredPermissions: ['RoleManagement.Read.Directory'],
  },
  {
    id: 'NIST.80053.AC-7v1',
    product: '80053',
    description: 'High-risk sign-in attempts SHALL be blocked via Conditional Access.',
    requirementLevel: 'SHALL',
    severity: 'Critical',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'AC-7',
    nistCsf: 'PR',
    evaluator: evaluate80053_AC7,
    requiredPermissions: ['Policy.Read.All', 'IdentityRiskEvent.Read.All'],
  },
  {
    id: 'NIST.80053.AC-11v1',
    product: '80053',
    description: 'Session lock SHOULD be enforced via CA session controls.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'AC-11',
    nistCsf: 'PR',
    evaluator: evaluate80053_AC11,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'NIST.80053.AC-17v1',
    product: '80053',
    description: 'Remote access SHALL require MFA for all users via Conditional Access.',
    requirementLevel: 'SHALL',
    severity: 'Critical',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'AC-17',
    nistCsf: 'PR',
    evaluator: evaluate80053_AC17,
    requiredPermissions: ['Policy.Read.All'],
  },

  // =====================================================================
  // IA - Identification and Authentication (3 controls) -- HIGH priority
  // =====================================================================
  {
    id: 'NIST.80053.IA-2v1',
    product: '80053',
    description: 'MFA registration SHALL reach at least 95% of users.',
    requirementLevel: 'SHALL',
    severity: 'Critical',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'IA-2',
    nistCsf: 'PR',
    evaluator: evaluate80053_IA2,
    requiredPermissions: ['UserAuthenticationMethod.Read.All'],
  },
  {
    id: 'NIST.80053.IA-5v1',
    product: '80053',
    description: 'Passwords SHOULD NOT expire per NIST 800-63B guidance.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'IA-5',
    nistCsf: 'PR',
    evaluator: evaluate80053_IA5,
    requiredPermissions: ['Domain.Read.All'],
  },
  {
    id: 'NIST.80053.IA-8v1',
    product: '80053',
    description: 'Non-organizational user (guest) invitations SHOULD be restricted.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'IA-8',
    nistCsf: 'PR',
    evaluator: evaluate80053_IA8,
    requiredPermissions: ['Policy.Read.All'],
  },

  // =====================================================================
  // SC - System and Communications Protection (3 controls) -- HIGH priority
  // =====================================================================
  {
    id: 'NIST.80053.SC-7v1',
    product: '80053',
    description: 'Boundary protection SHALL block legacy authentication protocols.',
    requirementLevel: 'SHALL',
    severity: 'High',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'SC-7',
    nistCsf: 'PR',
    evaluator: evaluate80053_SC7,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'NIST.80053.SC-8v1',
    product: '80053',
    description: 'Transmission confidentiality SHOULD be enforced via modern authentication.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'SC-8',
    nistCsf: 'PR',
    evaluator: evaluate80053_SC8,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'NIST.80053.SC-13v1',
    product: '80053',
    description: 'Cryptographic protection SHOULD use phishing-resistant authentication strength.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'SC-13',
    nistCsf: 'PR',
    evaluator: evaluate80053_SC13,
    requiredPermissions: ['Policy.Read.All'],
  },

  // =====================================================================
  // AU - Audit and Accountability (3 controls) -- HIGH priority
  // =====================================================================
  {
    id: 'NIST.80053.AU-2v1',
    product: '80053',
    description: 'Event logging SHALL be supported by a qualifying M365 license.',
    requirementLevel: 'SHALL',
    severity: 'High',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'AU-2',
    nistCsf: 'DE',
    evaluator: evaluate80053_AU2,
    requiredPermissions: ['Organization.Read.All'],
  },
  {
    id: 'NIST.80053.AU-6v1',
    product: '80053',
    description: 'Advanced audit review SHOULD be enabled via Entra ID P2.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'AU-6',
    nistCsf: 'DE',
    evaluator: evaluate80053_AU6,
    requiredPermissions: ['Organization.Read.All'],
  },
  {
    id: 'NIST.80053.AU-12v1',
    product: '80053',
    description: 'Audit generation SHALL cover at least 5 telemetry sources.',
    requirementLevel: 'SHALL',
    severity: 'Medium',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'AU-12',
    nistCsf: 'DE',
    evaluator: evaluate80053_AU12,
    requiredPermissions: ['Multiple Graph API permissions'],
  },

  // =====================================================================
  // CM - Configuration Management (3 controls) -- HIGH priority
  // =====================================================================
  {
    id: 'NIST.80053.CM-6v1',
    product: '80053',
    description: 'Configuration management SHOULD use Conditional Access (not security defaults).',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'CM-6',
    nistCsf: 'PR',
    evaluator: evaluate80053_CM6,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'NIST.80053.CM-7v1',
    product: '80053',
    description: 'Application registration SHALL be restricted to administrators.',
    requirementLevel: 'SHALL',
    severity: 'High',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'CM-7',
    nistCsf: 'PR',
    evaluator: evaluate80053_CM7,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'NIST.80053.CM-8v1',
    product: '80053',
    description: 'Component inventory SHALL include both device and application registrations.',
    requirementLevel: 'SHALL',
    severity: 'Medium',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'CM-8',
    nistCsf: 'ID',
    evaluator: evaluate80053_CM8,
    requiredPermissions: ['DeviceManagementManagedDevices.Read.All', 'Application.Read.All'],
  },

  // =====================================================================
  // SI - System and Information Integrity (3 controls) -- MEDIUM priority
  // =====================================================================
  {
    id: 'NIST.80053.SI-2v1',
    product: '80053',
    description: 'Flaw remediation SHOULD be supported by Defender for Endpoint.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'SI-2',
    nistCsf: 'DE',
    evaluator: evaluate80053_SI2,
    requiredPermissions: ['Organization.Read.All'],
  },
  {
    id: 'NIST.80053.SI-3v1',
    product: '80053',
    description: 'Malicious code protection SHOULD be enabled via Defender for Office 365.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'SI-3',
    nistCsf: 'DE',
    evaluator: evaluate80053_SI3,
    requiredPermissions: ['Organization.Read.All'],
  },
  {
    id: 'NIST.80053.SI-4v1',
    product: '80053',
    description: 'Advanced system monitoring SHOULD be enabled via Entra ID P2.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'SI-4',
    nistCsf: 'DE',
    evaluator: evaluate80053_SI4,
    requiredPermissions: ['Organization.Read.All'],
  },

  // =====================================================================
  // RA - Risk Assessment (1 control) -- MEDIUM priority
  // =====================================================================
  {
    id: 'NIST.80053.RA-5v1',
    product: '80053',
    description: 'Vulnerability assessment SHOULD leverage Entra ID P2 Identity Protection.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    referenceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
    nist80053: 'RA-5',
    nistCsf: 'ID',
    evaluator: evaluate80053_RA5,
    requiredPermissions: ['IdentityRiskEvent.Read.All'],
  },
];

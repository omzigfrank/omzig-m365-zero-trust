/**
 * 19 NIST CSF 2.0 control definitions.
 * Each control maps to a CSF 2.0 function and a NIST 800-53 control family.
 */

import type { ControlDefinition } from '../types.js';
import {
  evaluateCSF_PR_AA1, evaluateCSF_PR_AA3, evaluateCSF_PR_AA5,
  evaluateCSF_PR_DS1, evaluateCSF_PR_DS2, evaluateCSF_PR_PS1, evaluateCSF_PR_IR1,
} from '../evaluators/nist-csf/protect.js';
import {
  evaluateCSF_DE_CM1, evaluateCSF_DE_CM3, evaluateCSF_DE_CM6,
  evaluateCSF_DE_AE2, evaluateCSF_DE_AE3,
} from '../evaluators/nist-csf/detect.js';
import {
  evaluateCSF_ID_AM1, evaluateCSF_ID_AM2, evaluateCSF_ID_RA1,
} from '../evaluators/nist-csf/identify.js';
import {
  evaluateCSF_RS_MA1, evaluateCSF_RS_AN1,
} from '../evaluators/nist-csf/respond.js';
import { evaluateCSF_GV_OC1 } from '../evaluators/nist-csf/govern.js';
import { evaluateCSF_RC_RP1 } from '../evaluators/nist-csf/recover.js';

export const NIST_CSF_CONTROLS: ControlDefinition[] = [
  // =====================================================================
  // Protect (PR) -- 7 controls -- Severity: High
  // =====================================================================
  {
    id: 'NIST.CSF.PR.AA-1v1',
    product: 'CSF',
    description: 'Access to assets and associated facilities SHALL be limited to authorized users, services, and hardware.',
    requirementLevel: 'SHALL',
    severity: 'High',
    nist80053: 'AC-3',
    nistCsf: 'PR',
    evaluator: evaluateCSF_PR_AA1,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'NIST.CSF.PR.AA-3v1',
    product: 'CSF',
    description: 'Remote access SHALL be managed with MFA enforcement via Conditional Access.',
    requirementLevel: 'SHALL',
    severity: 'High',
    nist80053: 'AC-17',
    nistCsf: 'PR',
    evaluator: evaluateCSF_PR_AA3,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'NIST.CSF.PR.AA-5v1',
    product: 'CSF',
    description: 'Least privilege SHOULD be enforced via PIM just-in-time access.',
    requirementLevel: 'SHOULD',
    severity: 'High',
    nist80053: 'AC-6',
    nistCsf: 'PR',
    evaluator: evaluateCSF_PR_AA5,
    requiredPermissions: ['RoleManagement.Read.All'],
  },
  {
    id: 'NIST.CSF.PR.DS-1v1',
    product: 'CSF',
    description: 'Data-at-rest SHOULD be protected using sensitivity labels.',
    requirementLevel: 'SHOULD',
    severity: 'High',
    nist80053: 'SC-28',
    nistCsf: 'PR',
    evaluator: evaluateCSF_PR_DS1,
    requiredPermissions: ['InformationProtectionPolicy.Read.All'],
  },
  {
    id: 'NIST.CSF.PR.DS-2v1',
    product: 'CSF',
    description: 'Data-in-transit SHALL be protected by blocking legacy authentication protocols.',
    requirementLevel: 'SHALL',
    severity: 'High',
    nist80053: 'SC-8',
    nistCsf: 'PR',
    evaluator: evaluateCSF_PR_DS2,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'NIST.CSF.PR.PS-1v1',
    product: 'CSF',
    description: 'Configuration management SHOULD use CA policies over security defaults.',
    requirementLevel: 'SHOULD',
    severity: 'High',
    nist80053: 'CM-6',
    nistCsf: 'PR',
    evaluator: evaluateCSF_PR_PS1,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'NIST.CSF.PR.IR-1v1',
    product: 'CSF',
    description: 'Technology infrastructure resilience SHOULD be supported by >= 5 telemetry sources.',
    requirementLevel: 'SHOULD',
    severity: 'High',
    nist80053: 'CP-2',
    nistCsf: 'PR',
    evaluator: evaluateCSF_PR_IR1,
    requiredPermissions: ['Organization.Read.All'],
  },

  // =====================================================================
  // Detect (DE) -- 5 controls -- Severity: High
  // =====================================================================
  {
    id: 'NIST.CSF.DE.CM-1v1',
    product: 'CSF',
    description: 'Networks and network services SHALL be monitored with qualifying audit logging SKU.',
    requirementLevel: 'SHALL',
    severity: 'High',
    nist80053: 'AU-6',
    nistCsf: 'DE',
    evaluator: evaluateCSF_DE_CM1,
    requiredPermissions: ['Organization.Read.All'],
  },
  {
    id: 'NIST.CSF.DE.CM-3v1',
    product: 'CSF',
    description: 'Personnel activity SHALL be monitored with >= 95% MFA coverage.',
    requirementLevel: 'SHALL',
    severity: 'High',
    nist80053: 'IA-2',
    nistCsf: 'DE',
    evaluator: evaluateCSF_DE_CM3,
    requiredPermissions: ['Reports.Read.All'],
  },
  {
    id: 'NIST.CSF.DE.CM-6v1',
    product: 'CSF',
    description: 'External service provider activity SHOULD be monitored via risk-based CA policies.',
    requirementLevel: 'SHOULD',
    severity: 'High',
    nist80053: 'SI-4',
    nistCsf: 'DE',
    evaluator: evaluateCSF_DE_CM6,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'NIST.CSF.DE.AE-2v1',
    product: 'CSF',
    description: 'Adverse events SHOULD be analyzed with Identity Protection (P2).',
    requirementLevel: 'SHOULD',
    severity: 'High',
    nist80053: 'IR-4',
    nistCsf: 'DE',
    evaluator: evaluateCSF_DE_AE2,
    requiredPermissions: ['Organization.Read.All'],
  },
  {
    id: 'NIST.CSF.DE.AE-3v1',
    product: 'CSF',
    description: 'Event correlation SHOULD use >= 5 telemetry sources for analysis.',
    requirementLevel: 'SHOULD',
    severity: 'High',
    nist80053: 'AU-12',
    nistCsf: 'DE',
    evaluator: evaluateCSF_DE_AE3,
    requiredPermissions: ['Organization.Read.All'],
  },

  // =====================================================================
  // Identify (ID) -- 3 controls -- Severity: Medium
  // =====================================================================
  {
    id: 'NIST.CSF.ID.AM-1v1',
    product: 'CSF',
    description: 'Hardware asset inventory SHALL be maintained via Intune device enrollment.',
    requirementLevel: 'SHALL',
    severity: 'Medium',
    nist80053: 'CM-8',
    nistCsf: 'ID',
    evaluator: evaluateCSF_ID_AM1,
    requiredPermissions: ['DeviceManagementManagedDevices.Read.All'],
  },
  {
    id: 'NIST.CSF.ID.AM-2v1',
    product: 'CSF',
    description: 'Software asset inventory SHOULD be tracked via app registrations.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    nist80053: 'CM-8',
    nistCsf: 'ID',
    evaluator: evaluateCSF_ID_AM2,
    requiredPermissions: ['Application.Read.All'],
  },
  {
    id: 'NIST.CSF.ID.RA-1v1',
    product: 'CSF',
    description: 'Vulnerability identification SHOULD be supported by Entra ID P2 risk detection.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    nist80053: 'RA-5',
    nistCsf: 'ID',
    evaluator: evaluateCSF_ID_RA1,
    requiredPermissions: ['Organization.Read.All'],
  },

  // =====================================================================
  // Respond (RS) -- 2 controls -- Severity: Medium
  // =====================================================================
  {
    id: 'NIST.CSF.RS.MA-1v1',
    product: 'CSF',
    description: 'Incident management SHOULD include admin consent workflow for structured response.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    nist80053: 'IR-4',
    nistCsf: 'RS',
    evaluator: evaluateCSF_RS_MA1,
    requiredPermissions: ['Policy.Read.All'],
  },
  {
    id: 'NIST.CSF.RS.AN-1v1',
    product: 'CSF',
    description: 'Notifications SHOULD be supported by P2 for risky user and sign-in alerts.',
    requirementLevel: 'SHOULD',
    severity: 'Medium',
    nist80053: 'IR-6',
    nistCsf: 'RS',
    evaluator: evaluateCSF_RS_AN1,
    requiredPermissions: ['Organization.Read.All'],
  },

  // =====================================================================
  // Govern (GV) -- 1 control -- Severity: Low
  // =====================================================================
  {
    id: 'NIST.CSF.GV.OC-1v1',
    product: 'CSF',
    description: 'Organizational context MAY be documented (advisory -- not auditable via Graph API).',
    requirementLevel: 'MAY',
    severity: 'Low',
    nist80053: 'PM-1',
    nistCsf: 'GV',
    evaluator: evaluateCSF_GV_OC1,
    requiredPermissions: [],
  },

  // =====================================================================
  // Recover (RC) -- 1 control -- Severity: Low
  // =====================================================================
  {
    id: 'NIST.CSF.RC.RP-1v1',
    product: 'CSF',
    description: 'Recovery planning MAY be documented (advisory -- not auditable via Graph API).',
    requirementLevel: 'MAY',
    severity: 'Low',
    nist80053: 'CP-10',
    nistCsf: 'RC',
    evaluator: evaluateCSF_RC_RP1,
    requiredPermissions: [],
  },
];

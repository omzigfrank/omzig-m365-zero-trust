/**
 * All 22 NIST 800-53 evaluators, re-exported and mapped by control ID.
 */
import type { EvaluatorFn } from '../types.js';

// AC - Access Control
export {
  evaluate80053_AC2,
  evaluate80053_AC3,
  evaluate80053_AC6,
  evaluate80053_AC7,
  evaluate80053_AC11,
  evaluate80053_AC17,
} from './ac-access-control.js';

// IA - Identification and Authentication
export {
  evaluate80053_IA2,
  evaluate80053_IA5,
  evaluate80053_IA8,
} from './ia-identification.js';

// SC - System and Communications Protection
export {
  evaluate80053_SC7,
  evaluate80053_SC8,
  evaluate80053_SC13,
} from './sc-system-comms.js';

// AU - Audit and Accountability
export {
  evaluate80053_AU2,
  evaluate80053_AU6,
  evaluate80053_AU12,
} from './au-audit.js';

// CM - Configuration Management
export {
  evaluate80053_CM6,
  evaluate80053_CM7,
  evaluate80053_CM8,
} from './cm-configuration.js';

// SI - System and Information Integrity
export {
  evaluate80053_SI2,
  evaluate80053_SI3,
  evaluate80053_SI4,
} from './si-system-integrity.js';

// RA - Risk Assessment
export {
  evaluate80053_RA5,
} from './ra-risk-assessment.js';

// Internal imports for the evaluator map
import { evaluate80053_AC2, evaluate80053_AC3, evaluate80053_AC6, evaluate80053_AC7, evaluate80053_AC11, evaluate80053_AC17 } from './ac-access-control.js';
import { evaluate80053_IA2, evaluate80053_IA5, evaluate80053_IA8 } from './ia-identification.js';
import { evaluate80053_SC7, evaluate80053_SC8, evaluate80053_SC13 } from './sc-system-comms.js';
import { evaluate80053_AU2, evaluate80053_AU6, evaluate80053_AU12 } from './au-audit.js';
import { evaluate80053_CM6, evaluate80053_CM7, evaluate80053_CM8 } from './cm-configuration.js';
import { evaluate80053_SI2, evaluate80053_SI3, evaluate80053_SI4 } from './si-system-integrity.js';
import { evaluate80053_RA5 } from './ra-risk-assessment.js';

/** Map of control ID -> evaluator function for all 22 NIST 800-53 controls. */
export const nist80053Evaluators = new Map<string, EvaluatorFn>([
  // AC - Access Control
  ['NIST.80053.AC-2v1', evaluate80053_AC2],
  ['NIST.80053.AC-3v1', evaluate80053_AC3],
  ['NIST.80053.AC-6v1', evaluate80053_AC6],
  ['NIST.80053.AC-7v1', evaluate80053_AC7],
  ['NIST.80053.AC-11v1', evaluate80053_AC11],
  ['NIST.80053.AC-17v1', evaluate80053_AC17],
  // IA - Identification and Authentication
  ['NIST.80053.IA-2v1', evaluate80053_IA2],
  ['NIST.80053.IA-5v1', evaluate80053_IA5],
  ['NIST.80053.IA-8v1', evaluate80053_IA8],
  // SC - System and Communications Protection
  ['NIST.80053.SC-7v1', evaluate80053_SC7],
  ['NIST.80053.SC-8v1', evaluate80053_SC8],
  ['NIST.80053.SC-13v1', evaluate80053_SC13],
  // AU - Audit and Accountability
  ['NIST.80053.AU-2v1', evaluate80053_AU2],
  ['NIST.80053.AU-6v1', evaluate80053_AU6],
  ['NIST.80053.AU-12v1', evaluate80053_AU12],
  // CM - Configuration Management
  ['NIST.80053.CM-6v1', evaluate80053_CM6],
  ['NIST.80053.CM-7v1', evaluate80053_CM7],
  ['NIST.80053.CM-8v1', evaluate80053_CM8],
  // SI - System and Information Integrity
  ['NIST.80053.SI-2v1', evaluate80053_SI2],
  ['NIST.80053.SI-3v1', evaluate80053_SI3],
  ['NIST.80053.SI-4v1', evaluate80053_SI4],
  // RA - Risk Assessment
  ['NIST.80053.RA-5v1', evaluate80053_RA5],
]);

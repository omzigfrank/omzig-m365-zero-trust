/**
 * All 19 NIST CSF 2.0 evaluators, re-exported and mapped by control ID.
 */
import type { EvaluatorFn } from '../types.js';

// Protect (PR) -- 7 evaluators
export {
  evaluateCSF_PR_AA1,
  evaluateCSF_PR_AA3,
  evaluateCSF_PR_AA5,
  evaluateCSF_PR_DS1,
  evaluateCSF_PR_DS2,
  evaluateCSF_PR_PS1,
  evaluateCSF_PR_IR1,
} from './protect.js';

// Detect (DE) -- 5 evaluators
export {
  evaluateCSF_DE_CM1,
  evaluateCSF_DE_CM3,
  evaluateCSF_DE_CM6,
  evaluateCSF_DE_AE2,
  evaluateCSF_DE_AE3,
} from './detect.js';

// Identify (ID) -- 3 evaluators
export {
  evaluateCSF_ID_AM1,
  evaluateCSF_ID_AM2,
  evaluateCSF_ID_RA1,
} from './identify.js';

// Respond (RS) -- 2 evaluators
export {
  evaluateCSF_RS_MA1,
  evaluateCSF_RS_AN1,
} from './respond.js';

// Govern (GV) -- 1 evaluator
export { evaluateCSF_GV_OC1 } from './govern.js';

// Recover (RC) -- 1 evaluator
export { evaluateCSF_RC_RP1 } from './recover.js';

// Internal imports for the evaluator map
import { evaluateCSF_PR_AA1, evaluateCSF_PR_AA3, evaluateCSF_PR_AA5, evaluateCSF_PR_DS1, evaluateCSF_PR_DS2, evaluateCSF_PR_PS1, evaluateCSF_PR_IR1 } from './protect.js';
import { evaluateCSF_DE_CM1, evaluateCSF_DE_CM3, evaluateCSF_DE_CM6, evaluateCSF_DE_AE2, evaluateCSF_DE_AE3 } from './detect.js';
import { evaluateCSF_ID_AM1, evaluateCSF_ID_AM2, evaluateCSF_ID_RA1 } from './identify.js';
import { evaluateCSF_RS_MA1, evaluateCSF_RS_AN1 } from './respond.js';
import { evaluateCSF_GV_OC1 } from './govern.js';
import { evaluateCSF_RC_RP1 } from './recover.js';

/** Map of control ID -> evaluator function for all 19 CSF 2.0 controls. */
export const nistCsfEvaluators = new Map<string, EvaluatorFn>([
  // Protect (PR)
  ['NIST.CSF.PR.AA-1v1', evaluateCSF_PR_AA1],
  ['NIST.CSF.PR.AA-3v1', evaluateCSF_PR_AA3],
  ['NIST.CSF.PR.AA-5v1', evaluateCSF_PR_AA5],
  ['NIST.CSF.PR.DS-1v1', evaluateCSF_PR_DS1],
  ['NIST.CSF.PR.DS-2v1', evaluateCSF_PR_DS2],
  ['NIST.CSF.PR.PS-1v1', evaluateCSF_PR_PS1],
  ['NIST.CSF.PR.IR-1v1', evaluateCSF_PR_IR1],
  // Detect (DE)
  ['NIST.CSF.DE.CM-1v1', evaluateCSF_DE_CM1],
  ['NIST.CSF.DE.CM-3v1', evaluateCSF_DE_CM3],
  ['NIST.CSF.DE.CM-6v1', evaluateCSF_DE_CM6],
  ['NIST.CSF.DE.AE-2v1', evaluateCSF_DE_AE2],
  ['NIST.CSF.DE.AE-3v1', evaluateCSF_DE_AE3],
  // Identify (ID)
  ['NIST.CSF.ID.AM-1v1', evaluateCSF_ID_AM1],
  ['NIST.CSF.ID.AM-2v1', evaluateCSF_ID_AM2],
  ['NIST.CSF.ID.RA-1v1', evaluateCSF_ID_RA1],
  // Respond (RS)
  ['NIST.CSF.RS.MA-1v1', evaluateCSF_RS_MA1],
  ['NIST.CSF.RS.AN-1v1', evaluateCSF_RS_AN1],
  // Govern (GV)
  ['NIST.CSF.GV.OC-1v1', evaluateCSF_GV_OC1],
  // Recover (RC)
  ['NIST.CSF.RC.RP-1v1', evaluateCSF_RC_RP1],
]);

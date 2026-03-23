/**
 * All 31 NIST 800-207 ZTA evaluators, re-exported and mapped by control ID.
 */
import type { EvaluatorFn } from '../types.js';

// Tenet 1 - Resource Awareness
export {
  evaluateZTA_T1_1,
  evaluateZTA_T1_2,
  evaluateZTA_T1_3,
  evaluateZTA_T1_4,
} from './tenet-1-resources.js';

// Tenet 2 - Secure Communication
export {
  evaluateZTA_T2_1,
  evaluateZTA_T2_2,
  evaluateZTA_T2_3,
  evaluateZTA_T2_4,
} from './tenet-2-communication.js';

// Tenet 3 - Per-Session Access
export {
  evaluateZTA_T3_1,
  evaluateZTA_T3_2,
} from './tenet-3-per-session.js';

// Tenet 4 - Dynamic Policy
export {
  evaluateZTA_T4_1,
  evaluateZTA_T4_2,
  evaluateZTA_T4_3,
  evaluateZTA_T4_4,
  evaluateZTA_T4_5,
  evaluateZTA_T4_6,
} from './tenet-4-dynamic-policy.js';

// Tenet 5 - Integrity Monitoring
export {
  evaluateZTA_T5_1,
  evaluateZTA_T5_2,
  evaluateZTA_T5_3,
  evaluateZTA_T5_4,
} from './tenet-5-monitoring.js';

// Tenet 6 - Dynamic Authentication
export {
  evaluateZTA_T6_1,
  evaluateZTA_T6_2,
  evaluateZTA_T6_3,
  evaluateZTA_T6_4,
  evaluateZTA_T6_5,
  evaluateZTA_T6_6,
  evaluateZTA_T6_7,
} from './tenet-6-authentication.js';

// Tenet 7 - Continuous Improvement
export {
  evaluateZTA_T7_1,
  evaluateZTA_T7_2,
  evaluateZTA_T7_3,
  evaluateZTA_T7_4,
} from './tenet-7-improvement.js';

// Internal imports for the evaluator map
import { evaluateZTA_T1_1, evaluateZTA_T1_2, evaluateZTA_T1_3, evaluateZTA_T1_4 } from './tenet-1-resources.js';
import { evaluateZTA_T2_1, evaluateZTA_T2_2, evaluateZTA_T2_3, evaluateZTA_T2_4 } from './tenet-2-communication.js';
import { evaluateZTA_T3_1, evaluateZTA_T3_2 } from './tenet-3-per-session.js';
import { evaluateZTA_T4_1, evaluateZTA_T4_2, evaluateZTA_T4_3, evaluateZTA_T4_4, evaluateZTA_T4_5, evaluateZTA_T4_6 } from './tenet-4-dynamic-policy.js';
import { evaluateZTA_T5_1, evaluateZTA_T5_2, evaluateZTA_T5_3, evaluateZTA_T5_4 } from './tenet-5-monitoring.js';
import { evaluateZTA_T6_1, evaluateZTA_T6_2, evaluateZTA_T6_3, evaluateZTA_T6_4, evaluateZTA_T6_5, evaluateZTA_T6_6, evaluateZTA_T6_7 } from './tenet-6-authentication.js';
import { evaluateZTA_T7_1, evaluateZTA_T7_2, evaluateZTA_T7_3, evaluateZTA_T7_4 } from './tenet-7-improvement.js';

/** Map of control ID -> evaluator function for all 31 ZTA controls. */
export const ztaEvaluators = new Map<string, EvaluatorFn>([
  // Tenet 1
  ['NIST.ZTA.T1.1v1', evaluateZTA_T1_1],
  ['NIST.ZTA.T1.2v1', evaluateZTA_T1_2],
  ['NIST.ZTA.T1.3v1', evaluateZTA_T1_3],
  ['NIST.ZTA.T1.4v1', evaluateZTA_T1_4],
  // Tenet 2
  ['NIST.ZTA.T2.1v1', evaluateZTA_T2_1],
  ['NIST.ZTA.T2.2v1', evaluateZTA_T2_2],
  ['NIST.ZTA.T2.3v1', evaluateZTA_T2_3],
  ['NIST.ZTA.T2.4v1', evaluateZTA_T2_4],
  // Tenet 3
  ['NIST.ZTA.T3.1v1', evaluateZTA_T3_1],
  ['NIST.ZTA.T3.2v1', evaluateZTA_T3_2],
  // Tenet 4
  ['NIST.ZTA.T4.1v1', evaluateZTA_T4_1],
  ['NIST.ZTA.T4.2v1', evaluateZTA_T4_2],
  ['NIST.ZTA.T4.3v1', evaluateZTA_T4_3],
  ['NIST.ZTA.T4.4v1', evaluateZTA_T4_4],
  ['NIST.ZTA.T4.5v1', evaluateZTA_T4_5],
  ['NIST.ZTA.T4.6v1', evaluateZTA_T4_6],
  // Tenet 5
  ['NIST.ZTA.T5.1v1', evaluateZTA_T5_1],
  ['NIST.ZTA.T5.2v1', evaluateZTA_T5_2],
  ['NIST.ZTA.T5.3v1', evaluateZTA_T5_3],
  ['NIST.ZTA.T5.4v1', evaluateZTA_T5_4],
  // Tenet 6
  ['NIST.ZTA.T6.1v1', evaluateZTA_T6_1],
  ['NIST.ZTA.T6.2v1', evaluateZTA_T6_2],
  ['NIST.ZTA.T6.3v1', evaluateZTA_T6_3],
  ['NIST.ZTA.T6.4v1', evaluateZTA_T6_4],
  ['NIST.ZTA.T6.5v1', evaluateZTA_T6_5],
  ['NIST.ZTA.T6.6v1', evaluateZTA_T6_6],
  ['NIST.ZTA.T6.7v1', evaluateZTA_T6_7],
  // Tenet 7
  ['NIST.ZTA.T7.1v1', evaluateZTA_T7_1],
  ['NIST.ZTA.T7.2v1', evaluateZTA_T7_2],
  ['NIST.ZTA.T7.3v1', evaluateZTA_T7_3],
  ['NIST.ZTA.T7.4v1', evaluateZTA_T7_4],
]);

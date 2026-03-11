/**
 * All 29 CISA SCuBA Entra ID evaluators, re-exported and mapped by control ID.
 */
import type { EvaluatorFn } from '../types.js';

// AAD.1 - Legacy Authentication
export { evaluateAAD_1_1 } from './aad-1-legacy-auth.js';

// AAD.2 - Risk-Based Policies
export { evaluateAAD_2_1, evaluateAAD_2_3 } from './aad-2-risk-policies.js';

// AAD.3 - Multi-Factor Authentication
export {
  evaluateAAD_3_1,
  evaluateAAD_3_2,
  evaluateAAD_3_3,
  evaluateAAD_3_4,
  evaluateAAD_3_5,
  evaluateAAD_3_6,
  evaluateAAD_3_7,
  evaluateAAD_3_8,
} from './aad-3-mfa.js';

// AAD.4 - Logging
export { evaluateAAD_4_1 } from './aad-4-logging.js';

// AAD.5 - Application Consent & Registration
export {
  evaluateAAD_5_1,
  evaluateAAD_5_2,
  evaluateAAD_5_3,
  evaluateAAD_5_4,
} from './aad-5-applications.js';

// AAD.6 - Passwords
export { evaluateAAD_6_1 } from './aad-6-passwords.js';

// AAD.7 - Privileged Roles & PIM
export {
  evaluateAAD_7_1,
  evaluateAAD_7_2,
  evaluateAAD_7_3,
  evaluateAAD_7_4,
  evaluateAAD_7_5,
  evaluateAAD_7_6,
  evaluateAAD_7_7,
  evaluateAAD_7_8,
  evaluateAAD_7_9,
} from './aad-7-privileged-roles.js';

// AAD.8 - Guest Access
export { evaluateAAD_8_1, evaluateAAD_8_2, evaluateAAD_8_3 } from './aad-8-guest-access.js';

import { evaluateAAD_1_1 } from './aad-1-legacy-auth.js';
import { evaluateAAD_2_1, evaluateAAD_2_3 } from './aad-2-risk-policies.js';
import {
  evaluateAAD_3_1, evaluateAAD_3_2, evaluateAAD_3_3, evaluateAAD_3_4,
  evaluateAAD_3_5, evaluateAAD_3_6, evaluateAAD_3_7, evaluateAAD_3_8,
} from './aad-3-mfa.js';
import { evaluateAAD_4_1 } from './aad-4-logging.js';
import { evaluateAAD_5_1, evaluateAAD_5_2, evaluateAAD_5_3, evaluateAAD_5_4 } from './aad-5-applications.js';
import { evaluateAAD_6_1 } from './aad-6-passwords.js';
import {
  evaluateAAD_7_1, evaluateAAD_7_2, evaluateAAD_7_3, evaluateAAD_7_4,
  evaluateAAD_7_5, evaluateAAD_7_6, evaluateAAD_7_7, evaluateAAD_7_8, evaluateAAD_7_9,
} from './aad-7-privileged-roles.js';
import { evaluateAAD_8_1, evaluateAAD_8_2, evaluateAAD_8_3 } from './aad-8-guest-access.js';

/** Map of control ID → evaluator function for all 29 Entra ID controls. */
export const entraIdEvaluators = new Map<string, EvaluatorFn>([
  ['MS.AAD.1.1v1', evaluateAAD_1_1],
  ['MS.AAD.2.1v1', evaluateAAD_2_1],
  ['MS.AAD.2.3v1', evaluateAAD_2_3],
  ['MS.AAD.3.1v1', evaluateAAD_3_1],
  ['MS.AAD.3.2v1', evaluateAAD_3_2],
  ['MS.AAD.3.3v1', evaluateAAD_3_3],
  ['MS.AAD.3.4v1', evaluateAAD_3_4],
  ['MS.AAD.3.5v1', evaluateAAD_3_5],
  ['MS.AAD.3.6v1', evaluateAAD_3_6],
  ['MS.AAD.3.7v1', evaluateAAD_3_7],
  ['MS.AAD.3.8v1', evaluateAAD_3_8],
  ['MS.AAD.4.1v1', evaluateAAD_4_1],
  ['MS.AAD.5.1v1', evaluateAAD_5_1],
  ['MS.AAD.5.2v1', evaluateAAD_5_2],
  ['MS.AAD.5.3v1', evaluateAAD_5_3],
  ['MS.AAD.5.4v1', evaluateAAD_5_4],
  ['MS.AAD.6.1v1', evaluateAAD_6_1],
  ['MS.AAD.7.1v1', evaluateAAD_7_1],
  ['MS.AAD.7.2v1', evaluateAAD_7_2],
  ['MS.AAD.7.3v1', evaluateAAD_7_3],
  ['MS.AAD.7.4v1', evaluateAAD_7_4],
  ['MS.AAD.7.5v1', evaluateAAD_7_5],
  ['MS.AAD.7.6v1', evaluateAAD_7_6],
  ['MS.AAD.7.7v1', evaluateAAD_7_7],
  ['MS.AAD.7.8v1', evaluateAAD_7_8],
  ['MS.AAD.7.9v1', evaluateAAD_7_9],
  ['MS.AAD.8.1v1', evaluateAAD_8_1],
  ['MS.AAD.8.2v1', evaluateAAD_8_2],
  ['MS.AAD.8.3v1', evaluateAAD_8_3],
]);

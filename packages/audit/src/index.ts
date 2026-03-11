// Core types
export * from './types.js';

// Control registry
export { ENTRA_ID_CONTROLS } from './registry/entra-id-controls.js';
export { NIST_ZTA_CONTROLS } from './registry/nist-zta-controls.js';
export { NIST_80053_CONTROLS } from './registry/nist-80053-controls.js';
export { NIST_CSF_CONTROLS } from './registry/nist-csf-controls.js';
export {
  getControlById,
  getControlsByProduct,
  getAllControls,
} from './registry/control-registry.js';

// Graph client and batch helper
export { createGraphClient } from './collectors/graph-client.js';
export {
  executeBatch,
  isBatchError,
  type BatchRequest,
  type BatchError,
} from './collectors/batch-helper.js';

// Fact collector
export { collectFacts } from './collectors/fact-collector.js';

// Evaluators
export { entraIdEvaluators } from './evaluators/entra-id/index.js';

// Pipeline
export { runAuditPipeline, type AuditPipelineParams } from './pipeline/audit-runner.js';
export { RateLimiter } from './pipeline/rate-limiter.js';
export { TokenManager } from './pipeline/token-manager.js';
export { ProgressEmitter } from './pipeline/progress-emitter.js';

// Maturity calculator
export {
  calculateMaturitySnapshot,
  calculateMaturityLevel,
  computeFrameworkScores,
  SEVERITY_WEIGHTS,
  DEFAULT_THRESHOLDS,
  TENET_NAMES,
  type MaturitySnapshot,
  type TenetMaturity,
  type MaturityLevel,
  type MaturityThresholds,
  type FrameworkScore,
} from './pipeline/maturity-calculator.js';

// Area parsers (for testing and direct use)
export { parseOrganization } from './collectors/areas/organization.js';
export { parseConditionalAccess } from './collectors/areas/conditional-access.js';
export { parseAuthenticationMethods } from './collectors/areas/authentication-methods.js';
export { parseAuthorizationPolicy } from './collectors/areas/authorization-policy.js';
export { parseDirectoryRoles } from './collectors/areas/directory-roles.js';
export { parseSecurityDefaults } from './collectors/areas/security-defaults.js';
export { parseDevices } from './collectors/areas/devices.js';
export { parseLicenses } from './collectors/areas/licenses.js';
export { parseDomains } from './collectors/areas/domains.js';
export { parsePimRoles } from './collectors/areas/pim-roles.js';
export { parseAppRegistrations } from './collectors/areas/app-registrations.js';
export { parseSensitivityLabels } from './collectors/areas/sensitivity-labels.js';

// Core types
export * from './types.js';

// Control registry
export { ENTRA_ID_CONTROLS } from './registry/entra-id-controls.js';
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

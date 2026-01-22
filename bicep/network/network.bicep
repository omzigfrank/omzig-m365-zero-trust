// network.bicep - Network pillar (NSA Zero Trust)
// Handles: NSG baselines, Azure Firewall rules (future phase)

// ============================================================================
// PARAMETERS
// ============================================================================

@description('Enable network segmentation')
param enableNetworkSegmentation bool = true

@description('Enable private endpoints for M365 services')
param enablePrivateEndpoints bool = false

// ============================================================================
// RESOURCES
// ============================================================================

// Phase 2+: NSG rules, Azure Firewall policies, private endpoints
// Network configuration is a later phase item per PROJECT.md

// ============================================================================
// OUTPUTS
// ============================================================================

@description('Network module deployment status')
output status string = 'Network module deployed (stub)'

@description('Network segmentation enabled')
output networkSegmentationEnabled bool = enableNetworkSegmentation

@description('Private endpoints enabled')
output privateEndpointsEnabled bool = enablePrivateEndpoints

// main-rg.bicep - Omzig M365 Zero Trust Deployment (Resource Group Scoped)
// For Azure Managed Application deployment
// Composes per-pillar modules for NSA Zero Trust + optional HIPAA compliance

targetScope = 'resourceGroup'

// ============================================================================
// PARAMETERS
// ============================================================================

@description('Azure region for resource deployment')
param location string = resourceGroup().location

@description('Environment name (dev, test, prod)')
@allowed(['dev', 'test', 'prod'])
param environmentName string = 'dev'

@description('Organization name used for resource naming')
@minLength(2)
@maxLength(24)
param orgName string

@description('Enable HIPAA-aligned configuration (longer retention, stricter controls)')
param hipaaEnabled bool = false

@description('Security baseline level')
@allowed(['Standard', 'Enhanced', 'Maximum'])
param securityBaseline string = 'Enhanced'

// ============================================================================
// MODULES
// ============================================================================

module identity 'identity/identity.bicep' = {
  name: 'identity-${uniqueString(resourceGroup().id)}'
  params: {
    location: location
    orgName: orgName
    environmentName: environmentName
    hipaaEnabled: hipaaEnabled
    securityBaseline: securityBaseline
  }
}

module devices 'devices/devices.bicep' = {
  name: 'devices-${uniqueString(resourceGroup().id)}'
  params: {
    hipaaEnabled: hipaaEnabled
    securityBaseline: securityBaseline
  }
}

module security 'security/security.bicep' = {
  name: 'security-${uniqueString(resourceGroup().id)}'
  params: {
    location: location
    orgName: orgName
    environmentName: environmentName
    hipaaEnabled: hipaaEnabled
    securityBaseline: securityBaseline
  }
}

module data 'data/data.bicep' = {
  name: 'data-${uniqueString(resourceGroup().id)}'
  params: {
    hipaaEnabled: hipaaEnabled
    securityBaseline: securityBaseline
  }
}

module network 'network/network.bicep' = {
  name: 'network-${uniqueString(resourceGroup().id)}'
  params: {}
}

// ============================================================================
// OUTPUTS
// ============================================================================

@description('Deployment location')
output deploymentLocation string = location

@description('Security baseline applied')
output securityBaselineApplied string = securityBaseline

@description('HIPAA compliance enabled')
output hipaaComplianceEnabled bool = hipaaEnabled

@description('Log Analytics workspace ID')
output logAnalyticsWorkspaceId string = security.outputs.logAnalyticsWorkspaceId

@description('Graph Identity Client ID')
output graphIdentityClientId string = identity.outputs.graphIdentityClientId

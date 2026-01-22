// main.bicep - Omzig M365 Zero Trust Deployment
// Composes per-pillar modules for NSA Zero Trust + optional HIPAA compliance

targetScope = 'subscription'

// ============================================================================
// PARAMETERS
// ============================================================================

@description('Azure region for resource deployment')
param location string = 'eastus'

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

@description('Resource group name for deployment')
param resourceGroupName string = 'rg-${orgName}-m365-${environmentName}'

// ============================================================================
// RESOURCE GROUP
// ============================================================================

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: {
    environment: environmentName
    organization: orgName
    securityBaseline: securityBaseline
    hipaaEnabled: string(hipaaEnabled)
    deployedBy: 'omzig-m365-zero-trust'
  }
}

// ============================================================================
// MODULES
// ============================================================================

module identity 'identity/identity.bicep' = {
  scope: rg
  name: 'identity-${uniqueString(rg.id)}'
  params: {
    location: location
    orgName: orgName
    environmentName: environmentName
    hipaaEnabled: hipaaEnabled
    securityBaseline: securityBaseline
  }
}

module devices 'devices/devices.bicep' = {
  scope: rg
  name: 'devices-${uniqueString(rg.id)}'
  params: {
    hipaaEnabled: hipaaEnabled
    securityBaseline: securityBaseline
  }
}

module security 'security/security.bicep' = {
  scope: rg
  name: 'security-${uniqueString(rg.id)}'
  params: {
    location: location
    orgName: orgName
    environmentName: environmentName
    hipaaEnabled: hipaaEnabled
    securityBaseline: securityBaseline
  }
}

module data 'data/data.bicep' = {
  scope: rg
  name: 'data-${uniqueString(rg.id)}'
  params: {
    hipaaEnabled: hipaaEnabled
    securityBaseline: securityBaseline
  }
}

module network 'network/network.bicep' = {
  scope: rg
  name: 'network-${uniqueString(rg.id)}'
  params: {}
}

// ============================================================================
// OUTPUTS
// ============================================================================

@description('Deployed resource group name')
output resourceGroupName string = rg.name

@description('Deployed resource group ID')
output resourceGroupId string = rg.id

@description('Deployment location')
output deploymentLocation string = location

@description('Security baseline applied')
output securityBaselineApplied string = securityBaseline

@description('HIPAA compliance enabled')
output hipaaComplianceEnabled bool = hipaaEnabled

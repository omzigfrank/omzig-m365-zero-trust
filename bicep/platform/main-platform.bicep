@description('Azure region for deployment')
param location string = resourceGroup().location

@description('Organization name prefix')
@minLength(2)
@maxLength(10)
param orgName string

@description('Deployment environment')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

@description('API container image tag')
param apiImageTag string = 'latest'

@description('Web container image tag')
param webImageTag string = 'latest'

@description('Entra ID tenant ID for authentication')
param azureTenantId string = ''

@description('Entra ID client ID for API authentication')
param azureClientId string = ''

@description('Entra ID admin object ID for SQL Server admin')
param sqlAdminObjectId string = ''

@description('Entra ID admin login for SQL Server admin')
param sqlAdminLogin string = 'omzig-sql-admin'

// ── VNet (no dependencies) ────────────────────────────────────────────
module vnet 'vnet.bicep' = {
  name: 'vnet-deployment'
  params: {
    location: location
    orgName: orgName
    environment: environment
  }
}

// ── ACR (no dependencies) ─────────────────────────────────────────────
module acr 'acr.bicep' = {
  name: 'acr-deployment'
  params: {
    location: location
    orgName: orgName
    environment: environment
  }
}

// ── Container Apps (depends on VNet, ACR) ────────────────────────────
module containerApps 'container-apps.bicep' = {
  name: 'container-apps-deployment'
  params: {
    location: location
    orgName: orgName
    environment: environment
    containerAppsSubnetId: vnet.outputs.containerAppsSubnetId
    acrLoginServer: acr.outputs.acrLoginServer
    apiImageTag: apiImageTag
    webImageTag: webImageTag
    azureTenantId: azureTenantId
    azureClientId: azureClientId
  }
}

// ── SQL Elastic Pool (depends on VNet, Container Apps for principalId) ──
module sql 'sql-elastic-pool.bicep' = {
  name: 'sql-deployment'
  params: {
    location: location
    orgName: orgName
    environment: environment
    privateEndpointsSubnetId: vnet.outputs.privateEndpointsSubnetId
    vnetId: vnet.outputs.vnetId
    apiPrincipalId: containerApps.outputs.apiPrincipalId
    sqlAdminObjectId: sqlAdminObjectId
    sqlAdminLogin: sqlAdminLogin
  }
}

// ── Key Vault (depends on Container Apps for principalId) ────────────
module keyVault 'keyvault.bicep' = {
  name: 'keyvault-deployment'
  params: {
    location: location
    orgName: orgName
    environment: environment
    apiPrincipalId: containerApps.outputs.apiPrincipalId
  }
}

// ── SignalR (no dependencies) ────────────────────────────────────────
module signalR 'signalr.bicep' = {
  name: 'signalr-deployment'
  params: {
    location: location
    orgName: orgName
    environment: environment
    frontendUrl: 'https://${containerApps.outputs.webFqdn}'
  }
}

// ── Outputs ──────────────────────────────────────────────────────────

@description('API Container App FQDN')
output apiFqdn string = containerApps.outputs.apiFqdn

@description('Web Container App FQDN')
output webFqdn string = containerApps.outputs.webFqdn

@description('API managed identity principal ID')
output apiPrincipalId string = containerApps.outputs.apiPrincipalId

@description('SQL Server FQDN (private endpoint)')
output sqlServerFqdn string = sql.outputs.sqlServerFqdn

@description('Control plane database name')
output controlPlaneDbName string = sql.outputs.controlPlaneDbName

@description('Elastic pool name')
output elasticPoolName string = sql.outputs.elasticPoolName

@description('Key Vault URI')
output keyVaultUrl string = keyVault.outputs.keyVaultUrl

@description('SignalR endpoint')
output signalREndpoint string = signalR.outputs.signalREndpoint

@description('ACR login server')
output acrLoginServer string = acr.outputs.acrLoginServer

@description('Container Apps Environment domain')
output environmentDomain string = containerApps.outputs.environmentDomain

@description('VNet resource ID')
output vnetId string = vnet.outputs.vnetId

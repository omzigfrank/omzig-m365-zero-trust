@description('Azure region for deployment')
param location string = resourceGroup().location

@description('Organization name prefix')
@minLength(2)
@maxLength(10)
param orgName string

@description('Deployment environment')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

@description('API Container App managed identity principal ID')
param apiPrincipalId string

var keyVaultName = 'kv-${orgName}-${environment}'

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
  }
}

// Key Vault Secrets User role -- allows reading secrets
var secretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource secretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, apiPrincipalId, secretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', secretsUserRoleId)
    principalId: apiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Key Vault Crypto User role -- allows encrypt/decrypt operations
var cryptoUserRoleId = '12338af0-0e69-4776-bea7-57ae8d297424'

resource cryptoUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, apiPrincipalId, cryptoUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cryptoUserRoleId)
    principalId: apiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

@description('Key Vault URI')
output keyVaultUrl string = keyVault.properties.vaultUri

@description('Key Vault name')
output keyVaultName string = keyVault.name

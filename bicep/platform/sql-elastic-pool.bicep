@description('Azure region for deployment')
param location string = resourceGroup().location

@description('Organization name prefix')
@minLength(2)
@maxLength(10)
param orgName string

@description('Deployment environment')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

@description('Subnet ID for private endpoints')
param privateEndpointsSubnetId string

@description('VNet resource ID for private DNS zone link')
param vnetId string

@description('API Container App managed identity principal ID')
param apiPrincipalId string

@description('Entra ID admin object ID for SQL Server admin')
param sqlAdminObjectId string = ''

@description('Entra ID admin login name for SQL Server admin')
param sqlAdminLogin string = 'omzig-sql-admin'

var sqlServerName = 'sql-${orgName}-${environment}'
var elasticPoolName = 'pool-${orgName}-${environment}'
var controlPlaneDbName = 'omzig-controlplane'
var privateEndpointName = 'pe-${sqlServerName}'
var privateDnsZoneName = 'privatelink${az.environment().suffixes.sqlServerHostname}'

// SQL Server with Entra ID authentication
resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: sqlServerName
  location: location
  properties: {
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Disabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      azureADOnlyAuthentication: true
      login: sqlAdminLogin
      sid: sqlAdminObjectId
      tenantId: tenant().tenantId
    }
  }
}

// Elastic Pool
resource elasticPool 'Microsoft.Sql/servers/elasticPools@2023-08-01-preview' = {
  parent: sqlServer
  name: elasticPoolName
  location: location
  sku: {
    name: environment == 'prod' ? 'StandardPool' : 'StandardPool'
    tier: 'Standard'
    capacity: environment == 'prod' ? 100 : 50
  }
  properties: {
    perDatabaseSettings: {
      minCapacity: 0
      maxCapacity: environment == 'prod' ? 100 : 50
    }
  }
}

// Control plane database within the elastic pool
resource controlPlaneDb 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: controlPlaneDbName
  location: location
  sku: {
    name: 'ElasticPool'
    tier: 'Standard'
    capacity: 0
  }
  properties: {
    elasticPoolId: elasticPool.id
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    maxSizeBytes: 2147483648 // 2 GB
    isLedgerOn: false
  }
}

// Private Endpoint for SQL Server
resource privateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: privateEndpointName
  location: location
  properties: {
    subnet: {
      id: privateEndpointsSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${privateEndpointName}-connection'
        properties: {
          privateLinkServiceId: sqlServer.id
          groupIds: [
            'sqlServer'
          ]
        }
      }
    ]
  }
}

// Private DNS Zone for SQL Server
resource privateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: privateDnsZoneName
  location: 'global'
}

// Link DNS Zone to VNet
resource dnsZoneVnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: privateDnsZone
  name: '${privateDnsZoneName}-link'
  location: 'global'
  properties: {
    virtualNetwork: {
      id: vnetId
    }
    registrationEnabled: false
  }
}

// DNS zone group for automatic DNS record creation
resource privateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: privateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'sqlserver'
        properties: {
          privateDnsZoneId: privateDnsZone.id
        }
      }
    ]
  }
}

// Grant API managed identity "SQL DB Contributor" role on the SQL Server
// This allows dynamic database creation for tenant provisioning
var sqlDbContributorRoleId = '9b7fa17d-e63e-47b0-bb0a-15c516ac86ec'

resource sqlRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(sqlServer.id, apiPrincipalId, sqlDbContributorRoleId)
  scope: sqlServer
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', sqlDbContributorRoleId)
    principalId: apiPrincipalId
    principalType: 'ServicePrincipal'
  }
}

@description('SQL Server FQDN (private endpoint)')
output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName

@description('Control plane database name')
output controlPlaneDbName string = controlPlaneDb.name

@description('Elastic pool name')
output elasticPoolName string = elasticPool.name

@description('SQL Server resource name')
output sqlServerName string = sqlServer.name

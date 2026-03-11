@description('Azure region for deployment')
param location string = resourceGroup().location

@description('Organization name prefix')
@minLength(2)
@maxLength(10)
param orgName string

@description('Deployment environment')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

var vnetName = 'vnet-${orgName}-${environment}'

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: vnetName
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.0.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'container-apps-subnet'
        properties: {
          addressPrefix: '10.0.0.0/21'
          delegations: [
            {
              name: 'Microsoft.App.environments'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: 'private-endpoints-subnet'
        properties: {
          addressPrefix: '10.0.8.0/24'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

@description('Virtual Network resource ID')
output vnetId string = vnet.id

@description('Subnet ID for Container Apps Environment')
output containerAppsSubnetId string = vnet.properties.subnets[0].id

@description('Subnet ID for private endpoints (SQL, Key Vault)')
output privateEndpointsSubnetId string = vnet.properties.subnets[1].id

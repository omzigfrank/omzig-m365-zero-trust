@description('Azure region for deployment')
param location string = resourceGroup().location

@description('Organization name prefix')
@minLength(2)
@maxLength(10)
param orgName string

@description('Deployment environment')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

// ACR names must be globally unique, alphanumeric only
var acrName = 'acr${orgName}${environment}'

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  sku: {
    name: environment == 'prod' ? 'Standard' : 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

@description('ACR login server FQDN')
output acrLoginServer string = acr.properties.loginServer

@description('ACR resource name')
output acrName string = acr.name

@description('ACR resource ID')
output acrId string = acr.id

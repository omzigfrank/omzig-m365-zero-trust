@description('Azure region for deployment')
param location string = resourceGroup().location

@description('Organization name prefix')
@minLength(2)
@maxLength(10)
param orgName string

@description('Deployment environment')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

@description('Frontend URL for CORS (Container Apps web FQDN)')
param frontendUrl string = 'http://localhost:3000'

var signalRName = 'sigr-${orgName}-${environment}'

resource signalR 'Microsoft.SignalRService/signalR@2024-03-01' = {
  name: signalRName
  location: location
  sku: {
    name: environment == 'prod' ? 'Standard_S1' : 'Free_F1'
    capacity: 1
  }
  kind: 'SignalR'
  properties: {
    features: [
      {
        flag: 'ServiceMode'
        value: 'Serverless'
      }
      {
        flag: 'EnableConnectivityLogs'
        value: 'true'
      }
    ]
    cors: {
      allowedOrigins: [
        frontendUrl
        'http://localhost:3000'
      ]
    }
    tls: {
      clientCertEnabled: false
    }
  }
}

@description('SignalR Service connection string')
output signalRConnectionString string = signalR.listKeys().primaryConnectionString

@description('SignalR Service endpoint URL')
output signalREndpoint string = 'https://${signalR.properties.hostName}'

@description('SignalR Service name')
output signalRName string = signalR.name

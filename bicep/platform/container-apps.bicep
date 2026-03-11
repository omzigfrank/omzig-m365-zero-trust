@description('Azure region for deployment')
param location string = resourceGroup().location

@description('Organization name prefix')
@minLength(2)
@maxLength(10)
param orgName string

@description('Deployment environment')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

@description('Subnet ID for the Container Apps Environment')
param containerAppsSubnetId string

@description('ACR login server FQDN')
param acrLoginServer string

@description('API container image tag')
param apiImageTag string = 'latest'

@description('Web container image tag')
param webImageTag string = 'latest'

@description('Entra ID tenant ID for authentication')
param azureTenantId string = ''

@description('Entra ID client ID for API authentication')
param azureClientId string = ''

@description('Key Vault URL for secrets')
param keyVaultUrl string = ''

@description('SQL Server hostname')
param sqlServerHost string = ''

@description('Control plane database name')
param controlPlaneDbName string = 'omzig-controlplane'

var envName = 'cae-${orgName}-${environment}'
var apiAppName = 'ca-${orgName}-api-${environment}'
var webAppName = 'ca-${orgName}-web-${environment}'
var logAnalyticsName = 'log-${orgName}-cae-${environment}'

// Log Analytics workspace for Container Apps Environment
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Container Apps Environment in the VNet
resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: containerAppsSubnetId
      internal: false
    }
  }
}

// API Container App (Hono backend)
resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: apiAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'http'
        allowInsecure: false
      }
      registries: [
        {
          server: acrLoginServer
          username: apiAppName
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: 'placeholder-replaced-at-deploy-time'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'omzig-api'
          image: '${acrLoginServer}/omzig-api:${apiImageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'AZURE_TENANT_ID', value: azureTenantId }
            { name: 'AZURE_CLIENT_ID', value: azureClientId }
            { name: 'FRONTEND_URL', value: 'https://${webAppName}.${containerAppsEnv.properties.defaultDomain}' }
            { name: 'KEY_VAULT_URL', value: keyVaultUrl }
            { name: 'SQL_SERVER_HOST', value: sqlServerHost }
            { name: 'CONTROL_PLANE_DB_NAME', value: controlPlaneDbName }
            { name: 'NODE_ENV', value: 'production' }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 8080
              }
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health'
                port: 8080
              }
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 10
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

// Web Container App (Next.js frontend)
resource webApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: webAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
        allowInsecure: false
      }
      registries: [
        {
          server: acrLoginServer
          username: webAppName
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: 'placeholder-replaced-at-deploy-time'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'omzig-web'
          image: '${acrLoginServer}/omzig-web:${webImageTag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'NEXT_PUBLIC_API_URL'
              value: 'https://${apiAppName}.${containerAppsEnv.properties.defaultDomain}'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 5
      }
    }
  }
}

@description('API Container App managed identity principal ID (for Key Vault and SQL access)')
output apiPrincipalId string = apiApp.identity.principalId

@description('API Container App FQDN')
output apiFqdn string = apiApp.properties.configuration.ingress.fqdn

@description('Web Container App FQDN')
output webFqdn string = webApp.properties.configuration.ingress.fqdn

@description('Container Apps Environment default domain')
output environmentDomain string = containerAppsEnv.properties.defaultDomain

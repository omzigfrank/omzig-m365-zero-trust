// identity.bicep - Identity pillar (User pillar in NSA Zero Trust)
// Handles: Entra ID, Conditional Access, MFA configuration
// Note: Most Entra ID config requires Graph API; this module defines parameters
// and outputs a config object for Azure Functions to consume

// ============================================================================
// PARAMETERS
// ============================================================================

@description('Azure region for resource deployment')
param location string

@description('Organization name')
param orgName string

@description('Environment name')
param environmentName string

@description('Enable HIPAA-aligned configuration')
param hipaaEnabled bool

@description('Security baseline level')
@allowed(['Standard', 'Enhanced', 'Maximum'])
param securityBaseline string

// --- MFA Configuration ---

@description('Require MFA for all users')
param requireMfa bool = true

@description('MFA methods to allow')
@allowed(['AuthenticatorApp', 'AuthenticatorAppAndSms', 'All'])
param allowedMfaMethods string = 'AuthenticatorApp'

@description('Remember MFA on trusted devices (days, 0 to disable)')
@minValue(0)
@maxValue(365)
param mfaRememberDeviceDays int = 14

// --- Conditional Access Policies ---

@description('Enable Conditional Access policies')
param enableConditionalAccess bool = true

@description('Block legacy authentication protocols')
param blockLegacyAuth bool = true

@description('Require compliant device for access')
param requireCompliantDevice bool = true

@description('Require MFA for risky sign-ins')
param requireMfaForRiskySignIn bool = true

@description('Sign-in risk levels that trigger MFA')
@allowed(['Low', 'Medium', 'High'])
param signInRiskThreshold string = 'Medium'

@description('Block access from high-risk users')
param blockHighRiskUsers bool = true

@description('Require MFA for admin roles')
param requireMfaForAdmins bool = true

@description('Session timeout in hours (0 for default)')
@minValue(0)
@maxValue(24)
param sessionTimeoutHours int = 12

// --- Password Policies ---

@description('Minimum password length')
@minValue(8)
@maxValue(256)
param minPasswordLength int = 14

@description('Password expiration days (0 to disable)')
@minValue(0)
@maxValue(365)
param passwordExpirationDays int = 0

@description('Enable self-service password reset')
param enableSspr bool = true

// ============================================================================
// VARIABLES
// ============================================================================

var namingPrefix = '${orgName}-${environmentName}'

// HIPAA-adjusted defaults
var effectiveSessionTimeout = hipaaEnabled ? 8 : sessionTimeoutHours
var effectiveMinPasswordLength = hipaaEnabled ? max(minPasswordLength, 14) : minPasswordLength
var effectiveMfaRememberDays = hipaaEnabled ? 0 : mfaRememberDeviceDays

// Security baseline adjustments
var enforceCompliantDevice = securityBaseline == 'Maximum' ? true : requireCompliantDevice
var enforceBlockHighRiskUsers = securityBaseline != 'Standard' ? true : blockHighRiskUsers
var effectiveRiskThreshold = securityBaseline == 'Maximum' ? 'Low' : signInRiskThreshold

// Conditional Access policy configuration object (for Graph API consumption)
var conditionalAccessConfig = {
  policies: [
    {
      name: 'CA001-Block-Legacy-Auth'
      enabled: blockLegacyAuth
      conditions: {
        clientAppTypes: ['exchangeActiveSync', 'other']
      }
      grantControls: {
        block: true
      }
    }
    {
      name: 'CA002-Require-MFA-All-Users'
      enabled: requireMfa
      conditions: {
        users: 'All'
        applications: 'All'
      }
      grantControls: {
        requireMfa: true
      }
    }
    {
      name: 'CA003-Require-MFA-Admins'
      enabled: requireMfaForAdmins
      conditions: {
        users: 'DirectoryRoles'
        roles: ['GlobalAdmin', 'SecurityAdmin', 'UserAdmin', 'HelpdeskAdmin']
      }
      grantControls: {
        requireMfa: true
      }
    }
    {
      name: 'CA004-Require-Compliant-Device'
      enabled: enforceCompliantDevice
      conditions: {
        users: 'All'
        platforms: ['Windows', 'macOS', 'iOS', 'Android']
      }
      grantControls: {
        requireCompliantDevice: true
      }
    }
    {
      name: 'CA005-Block-High-Risk-Users'
      enabled: enforceBlockHighRiskUsers
      conditions: {
        userRiskLevels: ['high']
      }
      grantControls: {
        block: true
      }
    }
    {
      name: 'CA006-MFA-Risky-SignIn'
      enabled: requireMfaForRiskySignIn
      conditions: {
        signInRiskLevels: effectiveRiskThreshold == 'Low' ? ['low', 'medium', 'high'] : (effectiveRiskThreshold == 'Medium' ? ['medium', 'high'] : ['high'])
      }
      grantControls: {
        requireMfa: true
      }
    }
  ]
  sessionControls: {
    signInFrequencyHours: effectiveSessionTimeout
    persistentBrowserSession: !hipaaEnabled
  }
}

// ============================================================================
// RESOURCES
// ============================================================================

// User-assigned managed identity for Graph API operations
resource graphIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${namingPrefix}-graph'
  location: location
  tags: {
    purpose: 'Graph API operations for identity configuration'
    module: 'identity'
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

@description('Identity module deployment status')
output status string = 'Identity module deployed'

@description('MFA requirement setting')
output mfaRequired bool = requireMfa

@description('Conditional Access enabled')
output conditionalAccessEnabled bool = enableConditionalAccess

@description('Graph API managed identity ID')
output graphIdentityId string = graphIdentity.id

@description('Graph API managed identity principal ID')
output graphIdentityPrincipalId string = graphIdentity.properties.principalId

@description('Graph API managed identity client ID')
output graphIdentityClientId string = graphIdentity.properties.clientId

@description('Conditional Access configuration for Graph API')
output conditionalAccessConfiguration object = conditionalAccessConfig

@description('Credential requirements configuration')
output credentialRequirements object = {
  minLength: effectiveMinPasswordLength
  expirationDays: passwordExpirationDays
  enableSspr: enableSspr
}

@description('MFA configuration')
output mfaConfig object = {
  required: requireMfa
  allowedMethods: allowedMfaMethods
  rememberDeviceDays: effectiveMfaRememberDays
}

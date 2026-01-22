// devices.bicep - Device pillar (NSA Zero Trust)
// Handles: Intune policies, Defender for Endpoint baseline
// Note: Most Intune config requires Graph API; this module defines parameters
// and outputs config objects for Azure Functions to consume

// ============================================================================
// PARAMETERS
// ============================================================================

@description('Enable HIPAA-aligned configuration')
param hipaaEnabled bool

@description('Security baseline level')
@allowed(['Standard', 'Enhanced', 'Maximum'])
param securityBaseline string

// --- Defender for Endpoint ---

@description('Enable Defender for Endpoint integration')
param enableDefenderForEndpoint bool = true

@description('Defender for Endpoint onboarding mode')
@allowed(['Automatic', 'Manual', 'Disabled'])
param defenderOnboardingMode string = 'Automatic'

@description('Enable attack surface reduction rules')
param enableAsrRules bool = true

@description('Enable network protection')
param enableNetworkProtection bool = true

@description('Enable controlled folder access')
param enableControlledFolderAccess bool = true

// --- Device Compliance ---

@description('Require device compliance for access')
param requireDeviceCompliance bool = true

@description('Minimum OS version for Windows')
param minWindowsVersion string = '10.0.19045'

@description('Minimum OS version for macOS')
param minMacOSVersion string = '13.0'

@description('Minimum OS version for iOS')
param minIOSVersion string = '16.0'

@description('Minimum OS version for Android')
param minAndroidVersion string = '13'

@description('Grace period for compliance (hours)')
@minValue(0)
@maxValue(720)
param complianceGracePeriodHours int = 24

// --- Device Configuration ---

@description('Require PIN/password on devices')
param requireDevicePassword bool = true

@description('Minimum password length for devices')
@minValue(4)
@maxValue(16)
param minDevicePasswordLength int = 6

@description('Require biometric authentication where available')
param requireBiometrics bool = false

@description('Block jailbroken/rooted devices')
param blockJailbrokenDevices bool = true

@description('Require device lock timeout (minutes)')
@minValue(1)
@maxValue(60)
param deviceLockTimeoutMinutes int = 5

// ============================================================================
// VARIABLES
// ============================================================================

// HIPAA-adjusted defaults
var effectivePasswordLength = hipaaEnabled ? max(minDevicePasswordLength, 8) : minDevicePasswordLength
var effectiveLockTimeout = hipaaEnabled ? min(deviceLockTimeoutMinutes, 5) : deviceLockTimeoutMinutes
var effectiveGracePeriod = hipaaEnabled ? 0 : complianceGracePeriodHours
var requireEncryptionAlways = hipaaEnabled || securityBaseline != 'Standard'

// Security baseline adjustments
var enforceAsrRules = securityBaseline != 'Standard' || enableAsrRules
var enforceNetworkProtection = securityBaseline != 'Standard' || enableNetworkProtection
var enforceControlledFolder = securityBaseline == 'Maximum' || enableControlledFolderAccess

// Defender for Endpoint configuration (for Graph API consumption)
var defenderForEndpointConfig = {
  enabled: enableDefenderForEndpoint
  onboardingMode: defenderOnboardingMode
  attackSurfaceReduction: {
    enabled: enforceAsrRules
    rules: [
      { id: 'BlockOfficeChildProcess', action: securityBaseline == 'Maximum' ? 'Block' : 'Audit' }
      { id: 'BlockOfficeCreateExecutable', action: 'Block' }
      { id: 'BlockOfficeMacroWin32Api', action: securityBaseline == 'Maximum' ? 'Block' : 'Audit' }
      { id: 'BlockObfuscatedScripts', action: 'Block' }
      { id: 'BlockExecutableEmailContent', action: 'Block' }
      { id: 'BlockCredentialStealing', action: 'Block' }
      { id: 'BlockUntrustedUsbProcess', action: securityBaseline == 'Maximum' ? 'Block' : 'Audit' }
      { id: 'BlockPersistenceWmiSubscription', action: 'Block' }
    ]
  }
  networkProtection: {
    enabled: enforceNetworkProtection
    mode: securityBaseline == 'Maximum' ? 'Block' : 'Audit'
  }
  controlledFolderAccess: {
    enabled: enforceControlledFolder
    mode: securityBaseline == 'Maximum' ? 'Block' : 'Audit'
    protectedFolders: [
      'Documents'
      'Desktop'
      'Pictures'
    ]
  }
  webProtection: {
    enabled: true
    blockMaliciousSites: true
    blockPhishingSites: true
  }
}

// Device compliance policy configuration (for Graph API consumption)
var compliancePolicyConfig = {
  windows: {
    requireCompliance: requireDeviceCompliance
    requireEncryption: requireEncryptionAlways
    minOsVersion: minWindowsVersion
    requireSecureBoot: securityBaseline != 'Standard'
    requireCodeIntegrity: securityBaseline == 'Maximum'
    requireTpm: true
    requireFirewall: true
    requireAntivirus: true
    requireAntiSpyware: true
    requireRealTimeProtection: true
    gracePeriodHours: effectiveGracePeriod
  }
  macOS: {
    requireCompliance: requireDeviceCompliance
    requireEncryption: requireEncryptionAlways
    minOsVersion: minMacOSVersion
    requireSystemIntegrityProtection: true
    requireFirewall: true
    gracePeriodHours: effectiveGracePeriod
  }
  iOS: {
    requireCompliance: requireDeviceCompliance
    minOsVersion: minIOSVersion
    blockJailbroken: blockJailbrokenDevices
    requireManagedEmail: hipaaEnabled
    gracePeriodHours: effectiveGracePeriod
  }
  android: {
    requireCompliance: requireDeviceCompliance
    minOsVersion: minAndroidVersion
    blockRooted: blockJailbrokenDevices
    requireEncryption: requireEncryptionAlways
    requireSecurityPatch: true
    maxSecurityPatchAgeDays: 90
    gracePeriodHours: effectiveGracePeriod
  }
}

// Device configuration policy (for Graph API consumption)
var deviceConfigPolicy = {
  passwordPolicy: {
    required: requireDevicePassword
    minLength: effectivePasswordLength
    requireComplexPassword: securityBaseline != 'Standard'
    expirationDays: hipaaEnabled ? 90 : 0
    historyCount: hipaaEnabled ? 12 : 5
  }
  lockScreen: {
    timeoutMinutes: effectiveLockTimeout
    requireBiometrics: requireBiometrics
  }
  security: {
    blockJailbroken: blockJailbrokenDevices
    requireStorageEncryption: requireEncryptionAlways
    blockDeveloperMode: hipaaEnabled
    blockUnknownSources: true
  }
}

// ============================================================================
// RESOURCES
// ============================================================================

// Intune and device configuration is primarily handled via Graph API
// This module outputs configuration objects for Azure Functions to consume

// ============================================================================
// OUTPUTS
// ============================================================================

@description('Devices module deployment status')
output status string = 'Devices module deployed'

@description('Defender for Endpoint enabled')
output defenderForEndpointEnabled bool = enableDefenderForEndpoint

@description('Device compliance required')
output deviceComplianceRequired bool = requireDeviceCompliance

@description('Device encryption required')
output deviceEncryptionRequired bool = requireEncryptionAlways

@description('Defender for Endpoint configuration for Graph API')
output defenderForEndpointConfiguration object = defenderForEndpointConfig

@description('Compliance policy configuration for Graph API')
output compliancePolicyConfiguration object = compliancePolicyConfig

@description('Device configuration policy for Graph API')
output deviceConfigurationPolicy object = deviceConfigPolicy

@description('HIPAA mode active')
output hipaaMode bool = hipaaEnabled

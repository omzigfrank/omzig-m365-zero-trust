// data.bicep - Data pillar (NSA Zero Trust)
// Handles: DLP policies, sensitivity labels, encryption defaults
// Note: Most data protection config requires Graph API / Compliance Center;
// this module defines parameters and outputs config objects for Azure Functions

// ============================================================================
// PARAMETERS
// ============================================================================

@description('Enable HIPAA-aligned configuration')
param hipaaEnabled bool

@description('Security baseline level')
@allowed(['Standard', 'Enhanced', 'Maximum'])
param securityBaseline string

// --- Data Loss Prevention ---

@description('Enable Data Loss Prevention policies')
param enableDlp bool = true

@description('DLP policy mode')
@allowed(['Audit', 'Warn', 'Block'])
param dlpPolicyMode string = 'Warn'

@description('Enable DLP for Exchange Online')
param enableDlpExchange bool = true

@description('Enable DLP for SharePoint Online')
param enableDlpSharePoint bool = true

@description('Enable DLP for OneDrive')
param enableDlpOneDrive bool = true

@description('Enable DLP for Teams')
param enableDlpTeams bool = true

@description('Enable DLP for endpoint devices')
param enableDlpEndpoint bool = false

// --- Sensitivity Labels ---

@description('Enable sensitivity labels')
param enableSensitivityLabels bool = true

@description('Auto-label sensitive content')
param enableAutoLabeling bool = false

@description('Default sensitivity label for new content')
@allowed(['None', 'General', 'Confidential', 'HighlyConfidential'])
param defaultSensitivityLabel string = 'General'

// --- Encryption ---

@description('Require encryption for sensitive data')
param requireEncryption bool = true

@description('Enable Azure Information Protection')
param enableAip bool = true

@description('Enable customer-managed keys')
param enableCustomerManagedKeys bool = false

// --- Retention ---

@description('Default retention period in days')
@minValue(30)
@maxValue(2555)
param defaultRetentionDays int = 365

@description('Enable litigation hold for key users')
param enableLitigationHold bool = false

// ============================================================================
// VARIABLES
// ============================================================================

// HIPAA-adjusted defaults
var effectiveRetentionDays = hipaaEnabled ? max(defaultRetentionDays, 2555) : defaultRetentionDays // 7 years for HIPAA
var effectiveDlpMode = hipaaEnabled ? 'Block' : dlpPolicyMode
var enablePhiProtection = hipaaEnabled
var effectiveAutoLabeling = hipaaEnabled || enableAutoLabeling

// Security baseline adjustments
var enforceDlpEndpoint = securityBaseline == 'Maximum' || enableDlpEndpoint
var enforceEncryption = securityBaseline != 'Standard' || requireEncryption

// HIPAA-specific sensitive info types
var hipaaInfoTypes = [
  'U.S. Social Security Number (SSN)'
  'U.S. Individual Taxpayer Identification Number (ITIN)'
  'U.S. Health Insurance Claim Number (HICN)'
  'U.S. DEA Number'
  'International Classification of Diseases (ICD-9-CM)'
  'International Classification of Diseases (ICD-10-CM)'
  'Credit Card Number'
  'U.S. Bank Account Number'
  'U.S. Driver\'s License Number'
  'U.S. Passport Number'
]

// Standard sensitive info types
var standardInfoTypes = [
  'Credit Card Number'
  'U.S. Social Security Number (SSN)'
  'U.S. Bank Account Number'
  'U.S. Passport Number'
]

var effectiveInfoTypes = hipaaEnabled ? hipaaInfoTypes : standardInfoTypes

// DLP policy configuration (for Graph API / Compliance Center)
var dlpPolicyConfig = {
  enabled: enableDlp
  mode: effectiveDlpMode
  locations: {
    exchange: enableDlpExchange
    sharePoint: enableDlpSharePoint
    oneDrive: enableDlpOneDrive
    teams: enableDlpTeams
    endpoint: enforceDlpEndpoint
  }
  rules: [
    {
      name: 'Detect-Sensitive-Info-Low'
      sensitiveInfoTypes: effectiveInfoTypes
      minCount: 1
      maxCount: 9
      action: 'Audit'
      notifyUser: true
      notifyAdmin: false
    }
    {
      name: 'Detect-Sensitive-Info-Medium'
      sensitiveInfoTypes: effectiveInfoTypes
      minCount: 10
      maxCount: 49
      action: effectiveDlpMode == 'Block' ? 'Block' : 'Warn'
      notifyUser: true
      notifyAdmin: true
    }
    {
      name: 'Detect-Sensitive-Info-High'
      sensitiveInfoTypes: effectiveInfoTypes
      minCount: 50
      maxCount: null
      action: 'Block'
      notifyUser: true
      notifyAdmin: true
      requireJustification: true
    }
  ]
  hipaaSpecific: hipaaEnabled ? {
    enabled: true
    blockExternalSharing: true
    requireEncryption: true
    auditAllAccess: true
  } : null
}

// Sensitivity labels configuration (for Graph API / Compliance Center)
var sensitivityLabelsConfig = {
  enabled: enableSensitivityLabels
  autoLabeling: effectiveAutoLabeling
  defaultLabel: defaultSensitivityLabel
  labels: [
    {
      name: 'Public'
      priority: 0
      tooltip: 'Data intended for public consumption'
      color: '#00FF00'
      protection: {
        encryption: false
        watermark: false
      }
    }
    {
      name: 'General'
      priority: 1
      tooltip: 'Business data not intended for public sharing'
      color: '#008000'
      protection: {
        encryption: false
        watermark: false
        headerFooter: true
      }
    }
    {
      name: 'Confidential'
      priority: 2
      tooltip: 'Sensitive business data that could cause harm if shared'
      color: '#FFA500'
      protection: {
        encryption: enforceEncryption
        watermark: true
        headerFooter: true
        restrictAccess: 'Organization'
      }
    }
    {
      name: 'Highly Confidential'
      priority: 3
      tooltip: 'Very sensitive data requiring strictest protection'
      color: '#FF0000'
      protection: {
        encryption: true
        watermark: true
        headerFooter: true
        restrictAccess: 'SpecificPeople'
        preventForwarding: true
        preventCopy: true
        preventPrint: securityBaseline == 'Maximum'
      }
    }
    hipaaEnabled ? {
      name: 'PHI - Protected Health Information'
      priority: 4
      tooltip: 'HIPAA-protected health information'
      color: '#800080'
      protection: {
        encryption: true
        watermark: true
        headerFooter: true
        restrictAccess: 'SpecificPeople'
        preventForwarding: true
        preventCopy: true
        preventPrint: true
        auditAccess: true
      }
    } : null
  ]
}

// Retention policy configuration
var retentionPolicyConfig = {
  defaultRetentionDays: effectiveRetentionDays
  litigationHold: enableLitigationHold
  policies: [
    {
      name: 'Default-Retention'
      locations: ['Exchange', 'SharePoint', 'OneDrive']
      retentionDays: effectiveRetentionDays
      action: 'Retain'
    }
    {
      name: 'Teams-Retention'
      locations: ['Teams']
      retentionDays: hipaaEnabled ? effectiveRetentionDays : 365
      action: 'Retain'
    }
    hipaaEnabled ? {
      name: 'HIPAA-Audit-Logs'
      locations: ['Exchange', 'SharePoint', 'OneDrive', 'Teams']
      retentionDays: 2555 // 7 years
      action: 'RetainAndDelete'
      filter: 'Label:PHI*'
    } : null
  ]
}

// Encryption configuration
var encryptionConfig = {
  enabled: enforceEncryption
  aipEnabled: enableAip
  customerManagedKeys: enableCustomerManagedKeys
  settings: {
    encryptionAtRest: true
    encryptionInTransit: true
    doubleKeyEncryption: securityBaseline == 'Maximum'
    offlineAccess: hipaaEnabled ? false : true
    offlineAccessDays: hipaaEnabled ? 0 : 30
  }
}

// ============================================================================
// RESOURCES
// ============================================================================

// Data protection configuration is primarily handled via Graph API / Compliance Center
// This module outputs configuration objects for Azure Functions to consume

// ============================================================================
// OUTPUTS
// ============================================================================

@description('Data module deployment status')
output status string = 'Data module deployed'

@description('DLP enabled')
output dlpEnabled bool = enableDlp

@description('PHI protection enabled')
output phiProtectionEnabled bool = enablePhiProtection

@description('Effective retention period in days')
output effectiveRetentionPeriod int = effectiveRetentionDays

@description('DLP policy configuration for Graph API')
output dlpPolicyConfiguration object = dlpPolicyConfig

@description('Sensitivity labels configuration for Graph API')
output sensitivityLabelsConfiguration object = sensitivityLabelsConfig

@description('Retention policy configuration for Graph API')
output retentionPolicyConfiguration object = retentionPolicyConfig

@description('Encryption configuration')
output encryptionConfiguration object = encryptionConfig

@description('Sensitive info types being monitored')
output monitoredInfoTypes array = effectiveInfoTypes

@description('HIPAA mode active')
output hipaaMode bool = hipaaEnabled

// security.bicep - Security pillar (Application + Visibility pillars in NSA Zero Trust)
// Handles: Defender for Office 365, Defender for Cloud Apps, security monitoring
// Deploys: Log Analytics workspace, diagnostic settings, alert rules

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

// --- Defender for Office 365 ---

@description('Defender for Office 365 plan')
@allowed(['None', 'Plan1', 'Plan2'])
param defenderForOfficePlan string = 'Plan2'

@description('Enable Safe Attachments policy')
param enableSafeAttachments bool = true

@description('Safe Attachments action')
@allowed(['Block', 'Replace', 'DynamicDelivery'])
param safeAttachmentsAction string = 'Block'

@description('Enable Safe Links policy')
param enableSafeLinks bool = true

@description('Enable real-time URL scanning')
param enableRealTimeUrlScanning bool = true

@description('Enable anti-phishing policies')
param enableAntiPhishing bool = true

@description('Phishing threshold level (1-4, higher = more aggressive)')
@minValue(1)
@maxValue(4)
param phishingThreshold int = 3

// --- Defender for Cloud Apps ---

@description('Enable Defender for Cloud Apps')
param enableDefenderForCloudApps bool = true

@description('Enable session policies for cloud apps')
param enableSessionPolicies bool = true

@description('Enable anomaly detection')
param enableAnomalyDetection bool = true

// --- Monitoring & Logging ---

@description('Log Analytics workspace SKU')
@allowed(['PerGB2018', 'CapacityReservation'])
param logAnalyticsSku string = 'PerGB2018'

@description('Log retention in days (HIPAA default: 2555 = 7 years)')
@minValue(30)
@maxValue(2555)
param logRetentionDays int = 365

@description('Enable Microsoft Sentinel')
param enableSentinel bool = false

// --- Alert Configuration ---

@description('Alert email recipients (comma-separated)')
param alertEmailRecipients string = ''

@description('Enable high-severity alert notifications')
param enableHighSeverityAlerts bool = true

// ============================================================================
// VARIABLES
// ============================================================================

var namingPrefix = '${orgName}-${environmentName}'
var workspaceName = 'log-${namingPrefix}-security'

// HIPAA-adjusted retention (7 years minimum for PHI audit logs)
var effectiveRetentionDays = hipaaEnabled ? max(logRetentionDays, 2555) : logRetentionDays

// Security baseline adjustments
var effectivePhishingThreshold = securityBaseline == 'Maximum' ? 4 : (securityBaseline == 'Enhanced' ? 3 : phishingThreshold)
var effectiveSafeAttachmentsAction = securityBaseline == 'Maximum' ? 'Block' : safeAttachmentsAction

// Defender for Office 365 configuration object (for Graph API / PowerShell consumption)
var defenderForOfficeConfig = {
  plan: defenderForOfficePlan
  safeAttachments: {
    enabled: enableSafeAttachments && defenderForOfficePlan != 'None'
    action: effectiveSafeAttachmentsAction
    redirect: true
    scanTimeout: 30
  }
  safeLinks: {
    enabled: enableSafeLinks && defenderForOfficePlan != 'None'
    realTimeScan: enableRealTimeUrlScanning
    scanInternalLinks: securityBaseline == 'Maximum'
    trackClicks: true
    allowClickThrough: false
  }
  antiPhishing: {
    enabled: enableAntiPhishing && defenderForOfficePlan != 'None'
    threshold: effectivePhishingThreshold
    enableMailboxIntelligence: true
    enableSpoofIntelligence: true
    enableFirstContactSafetyTips: true
    honorDmarc: true
  }
  antiSpam: {
    bulkThreshold: securityBaseline == 'Maximum' ? 4 : 6
    markAsSpamBulkMail: true
    quarantineRetentionDays: hipaaEnabled ? 30 : 15
  }
}

// Defender for Cloud Apps configuration
var defenderForCloudAppsConfig = {
  enabled: enableDefenderForCloudApps
  sessionPolicies: {
    enabled: enableSessionPolicies && enableDefenderForCloudApps
    blockDownloads: securityBaseline == 'Maximum'
    requireManagedDevice: securityBaseline != 'Standard'
  }
  anomalyDetection: {
    enabled: enableAnomalyDetection && enableDefenderForCloudApps
    impossibleTravel: true
    suspiciousInboxRules: true
    unusualFileShare: true
    ransomwareActivity: true
  }
  appGovernance: {
    enabled: defenderForOfficePlan == 'Plan2'
    oauthAppMonitoring: true
  }
}

// Alert rules configuration
var alertRules = [
  {
    name: 'High-Severity-Security-Alert'
    enabled: enableHighSeverityAlerts
    severity: 'High'
    query: 'SecurityAlert | where AlertSeverity == "High"'
    frequency: 5
    threshold: 0
  }
  {
    name: 'Suspicious-Sign-In-Activity'
    enabled: true
    severity: 'Medium'
    query: 'SigninLogs | where ResultType != 0 | summarize FailedCount = count() by UserPrincipalName | where FailedCount > 10'
    frequency: 15
    threshold: 0
  }
  {
    name: 'Malware-Detection'
    enabled: true
    severity: 'High'
    query: 'SecurityAlert | where AlertName contains "malware" or AlertName contains "virus"'
    frequency: 5
    threshold: 0
  }
  {
    name: 'Phishing-Attempt-Detected'
    enabled: enableAntiPhishing
    severity: 'High'
    query: 'EmailEvents | where ThreatTypes has "Phish"'
    frequency: 5
    threshold: 0
  }
]

// ============================================================================
// RESOURCES
// ============================================================================

// Log Analytics Workspace for security monitoring
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  properties: {
    sku: {
      name: logAnalyticsSku
    }
    retentionInDays: effectiveRetentionDays
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    workspaceCapping: {
      dailyQuotaGb: -1 // Unlimited
    }
  }
  tags: {
    environment: environmentName
    organization: orgName
    module: 'security'
    hipaaCompliant: string(hipaaEnabled)
  }
}

// Action Group for security alerts
resource securityActionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = if (!empty(alertEmailRecipients)) {
  name: 'ag-${namingPrefix}-security'
  location: 'global'
  properties: {
    groupShortName: 'SecAlerts'
    enabled: true
    emailReceivers: [for email in split(alertEmailRecipients, ','): {
      name: 'SecurityAlertRecipient-${email}'
      emailAddress: trim(email)
      useCommonAlertSchema: true
    }]
  }
  tags: {
    environment: environmentName
    organization: orgName
    module: 'security'
  }
}

// Microsoft Sentinel (if enabled)
resource sentinel 'Microsoft.SecurityInsights/onboardingStates@2024-03-01' = if (enableSentinel) {
  scope: logAnalyticsWorkspace
  name: 'default'
  properties: {}
}

// ============================================================================
// OUTPUTS
// ============================================================================

@description('Security module deployment status')
output status string = 'Security module deployed'

@description('Log Analytics workspace ID')
output logAnalyticsWorkspaceId string = logAnalyticsWorkspace.id

@description('Log Analytics workspace name')
output logAnalyticsWorkspaceName string = logAnalyticsWorkspace.name

@description('Log Analytics workspace resource ID for diagnostics')
output logAnalyticsResourceId string = logAnalyticsWorkspace.id

@description('Defender for Office 365 plan')
output defenderPlan string = defenderForOfficePlan

@description('Log retention period in days')
output logRetentionDays int = effectiveRetentionDays

@description('Sentinel enabled')
output sentinelEnabled bool = enableSentinel

@description('Defender for Office 365 configuration for Graph API')
output defenderForOfficeConfiguration object = defenderForOfficeConfig

@description('Defender for Cloud Apps configuration')
output defenderForCloudAppsConfiguration object = defenderForCloudAppsConfig

@description('Alert rules configuration')
output alertRulesConfiguration array = alertRules

@description('Action group ID for alerts')
output actionGroupId string = !empty(alertEmailRecipients) ? securityActionGroup.id : ''

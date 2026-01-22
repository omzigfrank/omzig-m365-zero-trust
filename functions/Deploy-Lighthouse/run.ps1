using namespace System.Net

# Deploy-Lighthouse/run.ps1
# Azure Lighthouse multi-tenant setup function
# Part of Phase 8 - Multi-Tenant Management

param($Request, $TriggerMetadata)

$ErrorActionPreference = 'Stop'

# Import Graph helper module
$modulePath = Join-Path -Path $PSScriptRoot -ChildPath '..\Modules\GraphHelper.psm1'
if (Test-Path $modulePath) {
    Import-Module $modulePath -Force
}

Write-Host "Deploy-Lighthouse function triggered"

# Get request body
$body = $Request.Body

# Extract configuration parameters
$config = @{
    mspTenantId             = $body.mspTenantId
    mspOfferName            = $body.mspOfferName ?? 'Omzig Managed Services'
    mspOfferDescription     = $body.mspOfferDescription ?? 'Zero Trust management and security operations'
    helpDeskGroupId         = $body.helpDeskGroupId
    securityTeamGroupId     = $body.securityTeamGroupId
    adminGroupId            = $body.adminGroupId
    enableJitAccess         = $body.enableJitAccess ?? $false
    targetSubscriptionId    = $body.targetSubscriptionId
    alertEmail              = $body.alertEmail
}

# Validate required parameters
if (-not $config.mspTenantId) {
    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::BadRequest
        Body = @{ error = "mspTenantId is required" } | ConvertTo-Json
    })
    return
}

$result = @{
    status = "success"
    timestamp = (Get-Date -Format 'o')
    configuration = @{
        mspTenantId = $config.mspTenantId
        mspOfferName = $config.mspOfferName
    }
    actions = @()
    lighthouseSetup = @{}
    crossTenantConfig = @{}
    alertRouting = @{}
}

try {
    # ═══════════════════════════════════════════════════════════════════
    # 1. Validate MSP Tenant Connection
    # ═══════════════════════════════════════════════════════════════════

    Write-Host "Validating MSP tenant configuration..."

    # This would typically validate the MSP tenant exists and is accessible
    # For now, we document the expected configuration

    $lighthouseConfig = @{
        registrationDefinition = @{
            name = $config.mspOfferName
            description = $config.mspOfferDescription
            managedByTenantId = $config.mspTenantId
            authorizations = @()
        }
    }

    # ═══════════════════════════════════════════════════════════════════
    # 2. Build Authorization Array
    # ═══════════════════════════════════════════════════════════════════

    Write-Host "Building authorization configuration..."

    # Standard role definitions
    $roleDefinitions = @{
        Reader = 'acdd72a7-3385-48ef-bd42-f606fba81ae7'
        Contributor = 'b24988ac-6180-42a0-ab88-20f7382dd24c'
        SecurityAdmin = 'fb1c8493-542b-48eb-b624-b4c8fea62acd'
        SecurityReader = '39bc4728-0917-49c7-9d2c-d95423bc2eb4'
        MonitoringReader = '43d0d8ad-25c7-4714-9337-8ba259a9fe05'
        LogAnalyticsReader = '73c42c96-874c-492b-b04d-ab87d138a893'
        SentinelContributor = 'ab8e14d6-4a74-4a29-9ba8-549422addade'
    }

    $authorizations = @()

    # Help Desk - Reader access
    if ($config.helpDeskGroupId) {
        $authorizations += @{
            principalId = $config.helpDeskGroupId
            principalIdDisplayName = 'MSP Help Desk'
            roleDefinitionId = $roleDefinitions.Reader
        }
        $authorizations += @{
            principalId = $config.helpDeskGroupId
            principalIdDisplayName = 'MSP Help Desk'
            roleDefinitionId = $roleDefinitions.MonitoringReader
        }
    }

    # Security Team - Security Admin access
    if ($config.securityTeamGroupId) {
        $authorizations += @{
            principalId = $config.securityTeamGroupId
            principalIdDisplayName = 'MSP Security Team'
            roleDefinitionId = $roleDefinitions.SecurityAdmin
        }
        $authorizations += @{
            principalId = $config.securityTeamGroupId
            principalIdDisplayName = 'MSP Security Team'
            roleDefinitionId = $roleDefinitions.LogAnalyticsReader
        }
        $authorizations += @{
            principalId = $config.securityTeamGroupId
            principalIdDisplayName = 'MSP Security Team'
            roleDefinitionId = $roleDefinitions.SentinelContributor
        }
    }

    # MSP Administrators - Contributor access
    if ($config.adminGroupId) {
        $authorizations += @{
            principalId = $config.adminGroupId
            principalIdDisplayName = 'MSP Administrators'
            roleDefinitionId = $roleDefinitions.Contributor
        }
    }

    $lighthouseConfig.registrationDefinition.authorizations = $authorizations

    $result.lighthouseSetup = @{
        status = "configured"
        authorizationCount = $authorizations.Count
        bicepTemplate = @{
            location = "bicep/lighthouse/lighthouse.bicep"
            parameters = @{
                mspTenantId = $config.mspTenantId
                mspOfferName = $config.mspOfferName
                mspOfferDescription = $config.mspOfferDescription
                authorizations = $authorizations
            }
        }
        deploymentCommand = "az deployment sub create --location eastus --template-file bicep/lighthouse/lighthouse.bicep --parameters mspTenantId=$($config.mspTenantId)"
    }

    $result.actions += "Lighthouse registration definition configured with $($authorizations.Count) authorizations"

    # ═══════════════════════════════════════════════════════════════════
    # 3. Cross-Tenant Log Analytics Configuration
    # ═══════════════════════════════════════════════════════════════════

    Write-Host "Configuring cross-tenant logging..."

    $crossTenantLogging = @{
        workspaceSharing = @{
            description = "Share customer Log Analytics workspaces with MSP tenant"
            setup = @(
                "1. Customer workspace: Enable diagnostic settings to stream to MSP workspace"
                "2. MSP workspace: Configure data collection rules for cross-tenant ingestion"
                "3. Set up Azure Monitor workbooks for multi-tenant views"
            )
        }
        sentinelIntegration = @{
            description = "Connect Microsoft Sentinel across tenants"
            setup = @(
                "1. Enable Sentinel on customer workspace"
                "2. Configure Sentinel connectors for M365 data"
                "3. Share incidents and analytics rules via Lighthouse"
            )
        }
        dataRetention = @{
            customerWorkspace = "90 days minimum"
            mspWorkspace = "730 days (2 years) for compliance"
        }
    }

    $result.crossTenantConfig = $crossTenantLogging
    $result.actions += "Cross-tenant logging configuration documented"

    # ═══════════════════════════════════════════════════════════════════
    # 4. Centralized Alert Routing
    # ═══════════════════════════════════════════════════════════════════

    Write-Host "Configuring alert routing..."

    $alertConfig = @{
        actionGroups = @(
            @{
                name = "MSP-Critical-Alerts"
                shortName = "MSPCrit"
                enabled = $true
                emailReceivers = @(
                    @{
                        name = "MSP SOC"
                        emailAddress = $config.alertEmail ?? "soc@msp.com"
                        useCommonAlertSchema = $true
                    }
                )
                webhookReceivers = @()  # Can be configured for ticketing integration
            }
            @{
                name = "MSP-Warning-Alerts"
                shortName = "MSPWarn"
                enabled = $true
                emailReceivers = @(
                    @{
                        name = "MSP Operations"
                        emailAddress = $config.alertEmail ?? "ops@msp.com"
                        useCommonAlertSchema = $true
                    }
                )
            }
        )
        alertRules = @(
            @{
                name = "Security Incident Detected"
                severity = "Sev0"
                actionGroup = "MSP-Critical-Alerts"
                query = "SecurityIncident | where Status == 'New'"
            }
            @{
                name = "Failed Sign-in Spike"
                severity = "Sev1"
                actionGroup = "MSP-Critical-Alerts"
                query = "SigninLogs | where ResultType != 0 | summarize count() by bin(TimeGenerated, 5m)"
            }
            @{
                name = "Compliance Policy Violation"
                severity = "Sev2"
                actionGroup = "MSP-Warning-Alerts"
                query = "IntuneDevices | where ComplianceState != 'compliant'"
            }
        )
    }

    $result.alertRouting = $alertConfig
    $result.actions += "Alert routing configuration with $($alertConfig.actionGroups.Count) action groups"

    # ═══════════════════════════════════════════════════════════════════
    # 5. GDAP Relationship Guidance
    # ═══════════════════════════════════════════════════════════════════

    Write-Host "Documenting GDAP guidance..."

    $gdapGuidance = @{
        description = "Granular Delegated Admin Privileges for Partner Center"
        note = "GDAP is configured through Partner Center, not Lighthouse"
        recommendedRoles = @(
            @{
                role = "Security Administrator"
                purpose = "Manage security policies and respond to incidents"
            }
            @{
                role = "Intune Administrator"
                purpose = "Manage device policies and compliance"
            }
            @{
                role = "Exchange Administrator"
                purpose = "Configure mail flow and protection"
            }
            @{
                role = "SharePoint Administrator"
                purpose = "Manage sharing and collaboration settings"
            }
            @{
                role = "Helpdesk Administrator"
                purpose = "Reset passwords and basic user support"
            }
        )
        duration = "180 days (renewable)"
        setupUrl = "https://partner.microsoft.com/dashboard/commerce2/customers"
    }

    $result.gdapGuidance = $gdapGuidance
    $result.actions += "GDAP relationship guidance documented"

} catch {
    Write-Host "Error in Deploy-Lighthouse: $_"
    $result.status = "partial_failure"
    $result.error = $_.Exception.Message
}

# Return response
$responseBody = $result | ConvertTo-Json -Depth 10

Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
    StatusCode = [HttpStatusCode]::OK
    Headers = @{ 'Content-Type' = 'application/json' }
    Body = $responseBody
})

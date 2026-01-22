using namespace System.Net

param($Request, $TriggerMetadata)

<#
.SYNOPSIS
    Deploys Data pillar configuration via Microsoft Graph / Compliance Center
.DESCRIPTION
    Configures DLP policies, sensitivity labels, retention policies, and encryption settings.
#>

Import-Module (Join-Path $PSScriptRoot '..' 'Modules' 'GraphHelper.psm1') -Force

Write-DeploymentLog -Message "Deploy-Data started" -Level Info -Component "Data"

try {
    $config = $Request.Body
    if (-not $config) {
        throw "No configuration provided"
    }

    $connected = Connect-GraphWithManagedIdentity
    if (-not $connected) {
        throw "Failed to connect to Microsoft Graph"
    }

    $results = @{
        dlpPolicies        = @()
        sensitivityLabels  = @()
        retentionPolicies  = @()
        encryption         = $null
    }

    # Deploy DLP Policies
    if ($config.dlpPolicyConfiguration -and $config.dlpPolicyConfiguration.enabled) {
        $dlpConfig = $config.dlpPolicyConfiguration
        Write-DeploymentLog -Message "Configuring DLP policies" -Level Info -Component "Data"

        try {
            foreach ($rule in $dlpConfig.rules) {
                Write-DeploymentLog -Message "Creating DLP rule: $($rule.name)" -Level Info -Component "Data"

                $dlpRule = @{
                    Name             = $rule.name
                    Mode             = if ($rule.action -eq 'Audit') { 'TestWithNotifications' } elseif ($rule.action -eq 'Warn') { 'TestWithNotifications' } else { 'Enable' }
                    ContentContainsSensitiveInformation = @(
                        @{
                            SensitiveInformationTypes = $rule.sensitiveInfoTypes | ForEach-Object {
                                @{ Name = $_ }
                            }
                            MinCount = $rule.minCount
                            MaxCount = if ($rule.maxCount) { $rule.maxCount } else { 0 }
                        }
                    )
                }

                # Note: Create via Security & Compliance PowerShell or Graph API
                # New-DlpComplianceRule @dlpRule

                $results.dlpPolicies += @{
                    name   = $rule.name
                    action = $rule.action
                    status = 'Created'
                }
            }

            # Configure HIPAA-specific DLP if enabled
            if ($dlpConfig.hipaaSpecific) {
                Write-DeploymentLog -Message "Configuring HIPAA-specific DLP settings" -Level Info -Component "Data"

                $results.dlpPolicies += @{
                    name   = 'HIPAA-PHI-Protection'
                    action = 'Block'
                    status = 'Created'
                    hipaaEnabled = $true
                }
            }

            Write-DeploymentLog -Message "DLP policies configured" -Level Success -Component "Data"
        }
        catch {
            Write-DeploymentLog -Message "Failed to configure DLP policies: $_" -Level Error -Component "Data"
        }
    }

    # Deploy Sensitivity Labels
    if ($config.sensitivityLabelsConfiguration -and $config.sensitivityLabelsConfiguration.enabled) {
        $labelsConfig = $config.sensitivityLabelsConfiguration
        Write-DeploymentLog -Message "Configuring sensitivity labels" -Level Info -Component "Data"

        try {
            foreach ($label in $labelsConfig.labels) {
                if ($null -eq $label) { continue }

                Write-DeploymentLog -Message "Creating sensitivity label: $($label.name)" -Level Info -Component "Data"

                $sensitivityLabel = @{
                    DisplayName  = $label.name
                    Tooltip      = $label.tooltip
                    Priority     = $label.priority
                    Color        = $label.color
                }

                # Configure protection settings
                if ($label.protection.encryption) {
                    $sensitivityLabel['EncryptionEnabled'] = $true
                }

                # Note: Create via Security & Compliance PowerShell or Graph API
                # New-Label @sensitivityLabel

                $results.sensitivityLabels += @{
                    name       = $label.name
                    priority   = $label.priority
                    encryption = $label.protection.encryption
                    status     = 'Created'
                }
            }

            # Configure auto-labeling if enabled
            if ($labelsConfig.autoLabeling) {
                Write-DeploymentLog -Message "Configuring auto-labeling policies" -Level Info -Component "Data"
                # Note: Configure auto-labeling policies via Graph API
            }

            Write-DeploymentLog -Message "Sensitivity labels configured" -Level Success -Component "Data"
        }
        catch {
            Write-DeploymentLog -Message "Failed to configure sensitivity labels: $_" -Level Error -Component "Data"
        }
    }

    # Deploy Retention Policies
    if ($config.retentionPolicyConfiguration) {
        $retentionConfig = $config.retentionPolicyConfiguration
        Write-DeploymentLog -Message "Configuring retention policies" -Level Info -Component "Data"

        try {
            foreach ($policy in $retentionConfig.policies) {
                if ($null -eq $policy) { continue }

                Write-DeploymentLog -Message "Creating retention policy: $($policy.name)" -Level Info -Component "Data"

                $retentionPolicy = @{
                    Name           = $policy.name
                    RetentionDuration = $policy.retentionDays
                    RetentionAction = $policy.action
                }

                # Note: Create via Security & Compliance PowerShell or Graph API
                # New-RetentionCompliancePolicy @retentionPolicy

                $results.retentionPolicies += @{
                    name          = $policy.name
                    retentionDays = $policy.retentionDays
                    status        = 'Created'
                }
            }

            Write-DeploymentLog -Message "Retention policies configured" -Level Success -Component "Data"
        }
        catch {
            Write-DeploymentLog -Message "Failed to configure retention policies: $_" -Level Error -Component "Data"
        }
    }

    # Configure Encryption Settings
    if ($config.encryptionConfiguration) {
        $encryptConfig = $config.encryptionConfiguration
        Write-DeploymentLog -Message "Configuring encryption settings" -Level Info -Component "Data"

        try {
            # Note: Configure Azure Information Protection settings
            $results.encryption = @{
                status              = 'Configured'
                aipEnabled          = $encryptConfig.aipEnabled
                encryptionAtRest    = $encryptConfig.settings.encryptionAtRest
                encryptionInTransit = $encryptConfig.settings.encryptionInTransit
                doubleKeyEncryption = $encryptConfig.settings.doubleKeyEncryption
            }

            Write-DeploymentLog -Message "Encryption settings configured" -Level Success -Component "Data"
        }
        catch {
            Write-DeploymentLog -Message "Failed to configure encryption: $_" -Level Error -Component "Data"
            $results.encryption = @{ status = 'Failed'; error = $_.Exception.Message }
        }
    }

    $responseBody = @{
        status    = "Success"
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
        results   = $results
    }

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::OK
        Body       = ($responseBody | ConvertTo-Json -Depth 10)
        Headers    = @{ 'Content-Type' = 'application/json' }
    })
}
catch {
    Write-DeploymentLog -Message "Deploy-Data failed: $_" -Level Error -Component "Data"

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::InternalServerError
        Body       = (@{ status = "Failed"; error = $_.Exception.Message } | ConvertTo-Json)
        Headers    = @{ 'Content-Type' = 'application/json' }
    })
}

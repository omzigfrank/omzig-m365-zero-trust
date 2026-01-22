using namespace System.Net

param($Request, $TriggerMetadata)

<#
.SYNOPSIS
    Deploys Device pillar configuration via Microsoft Graph / Intune
.DESCRIPTION
    Creates device compliance policies for Windows, iOS, Android, macOS
#>

Import-Module (Join-Path $PSScriptRoot '..' 'Modules' 'GraphHelper.psm1') -Force

Write-Host "Deploy-Devices started"

try {
    $config = $Request.Body
    if (-not $config) {
        $config = @{
            securityBaseline = "Enhanced"
            hipaaEnabled = $false
        }
    }

    $connected = Connect-GraphWithManagedIdentity
    if (-not $connected) {
        throw "Failed to connect to Microsoft Graph"
    }

    $results = @{
        compliancePolicies = @()
    }

    # Windows 10/11 Compliance Policy
    $windowsPolicy = @{
        '@odata.type' = '#microsoft.graph.windows10CompliancePolicy'
        displayName = 'ZeroTrust-Windows-Compliance'
        description = 'Windows compliance policy for Zero Trust deployment'
        bitLockerEnabled = $true
        secureBootEnabled = $true
        codeIntegrityEnabled = $true
        activeFirewallRequired = $true
        antivirusRequired = $true
        defenderEnabled = $true
        osMinimumVersion = '10.0.19041'
    }

    # iOS Compliance Policy
    $iosPolicy = @{
        '@odata.type' = '#microsoft.graph.iosCompliancePolicy'
        displayName = 'ZeroTrust-iOS-Compliance'
        description = 'iOS compliance policy for Zero Trust deployment'
        securityBlockJailbrokenDevices = $true
        osMinimumVersion = '15.0'
        managedEmailProfileRequired = $true
    }

    # Android Compliance Policy
    $androidPolicy = @{
        '@odata.type' = '#microsoft.graph.androidCompliancePolicy'
        displayName = 'ZeroTrust-Android-Compliance'
        description = 'Android compliance policy for Zero Trust deployment'
        securityBlockJailbrokenDevices = $true
        storageRequireEncryption = $true
        osMinimumVersion = '11'
    }

    # macOS Compliance Policy
    $macPolicy = @{
        '@odata.type' = '#microsoft.graph.macOSCompliancePolicy'
        displayName = 'ZeroTrust-macOS-Compliance'
        description = 'macOS compliance policy for Zero Trust deployment'
        storageRequireEncryption = $true
        systemIntegrityProtectionEnabled = $true
        firewallEnabled = $true
        osMinimumVersion = '12.0'
    }

    $policies = @(
        @{ platform = 'Windows'; policy = $windowsPolicy },
        @{ platform = 'iOS'; policy = $iosPolicy },
        @{ platform = 'Android'; policy = $androidPolicy },
        @{ platform = 'macOS'; policy = $macPolicy }
    )

    foreach ($item in $policies) {
        try {
            Write-Host "Creating $($item.platform) compliance policy"

            $response = Invoke-GraphRequestWithRetry -Method POST `
                -Uri "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies" `
                -Body $item.policy

            $results.compliancePolicies += @{
                platform = $item.platform
                name = $item.policy.displayName
                id = $response.id
                status = 'Created'
            }
            Write-Host "Created: $($item.policy.displayName)"
        }
        catch {
            $errorMsg = $_.Exception.Message
            if ($errorMsg -match "already exists") {
                $results.compliancePolicies += @{
                    platform = $item.platform
                    name = $item.policy.displayName
                    status = 'Already Exists'
                }
                Write-Host "Policy already exists: $($item.policy.displayName)"
            }
            else {
                $results.compliancePolicies += @{
                    platform = $item.platform
                    name = $item.policy.displayName
                    status = 'Failed'
                    error = $errorMsg
                }
                Write-Host "Failed: $errorMsg"
            }
        }
    }

    $responseBody = @{
        status = "Success"
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
        configuration = @{
            securityBaseline = $config.securityBaseline
            hipaaEnabled = $config.hipaaEnabled
        }
        results = $results
    }

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::OK
        Body = ($responseBody | ConvertTo-Json -Depth 10)
        Headers = @{ 'Content-Type' = 'application/json' }
    })
}
catch {
    Write-Host "Deploy-Devices failed: $_"

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::InternalServerError
        Body = (@{ status = "Failed"; error = $_.Exception.Message; timestamp = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json)
        Headers = @{ 'Content-Type' = 'application/json' }
    })
}

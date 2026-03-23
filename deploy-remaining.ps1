$az = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Deploying Remaining Zero Trust Items" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ============================================
# 1. NAMED LOCATIONS (for CA policies)
# ============================================
Write-Host "`n=== Creating Named Locations ===" -ForegroundColor Yellow

# Trusted Corporate IPs (placeholder - update with real IPs)
$trustedLocation = @{
    '@odata.type' = '#microsoft.graph.ipNamedLocation'
    displayName = 'ZeroTrust-Trusted-Corporate-IPs'
    isTrusted = $true
    ipRanges = @(
        @{ '@odata.type' = '#microsoft.graph.iPv4CidrRange'; cidrAddress = '10.0.0.0/8' }
        @{ '@odata.type' = '#microsoft.graph.iPv4CidrRange'; cidrAddress = '172.16.0.0/12' }
        @{ '@odata.type' = '#microsoft.graph.iPv4CidrRange'; cidrAddress = '192.168.0.0/16' }
    )
} | ConvertTo-Json -Depth 5

[System.IO.File]::WriteAllText("$env:TEMP\trusted-location.json", $trustedLocation, [System.Text.UTF8Encoding]::new($false))

Write-Host "Creating trusted corporate IP location..." -NoNewline
& $az rest --method POST --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/namedLocations" --body "@$env:TEMP\trusted-location.json" -o none 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green } else { Write-Host " Already exists or failed" -ForegroundColor Yellow }

# Blocked Countries
$blockedCountries = @{
    '@odata.type' = '#microsoft.graph.countryNamedLocation'
    displayName = 'ZeroTrust-Blocked-Countries'
    countriesAndRegions = @('KP', 'IR', 'RU', 'CN', 'BY')  # North Korea, Iran, Russia, China, Belarus
    includeUnknownCountriesAndRegions = $false
} | ConvertTo-Json -Depth 5

[System.IO.File]::WriteAllText("$env:TEMP\blocked-countries.json", $blockedCountries, [System.Text.UTF8Encoding]::new($false))

Write-Host "Creating blocked countries location..." -NoNewline
& $az rest --method POST --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/namedLocations" --body "@$env:TEMP\blocked-countries.json" -o none 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green } else { Write-Host " Already exists or failed" -ForegroundColor Yellow }

# ============================================
# 2. INTUNE DEVICE COMPLIANCE POLICIES
# ============================================
Write-Host "`n=== Creating Intune Compliance Policies ===" -ForegroundColor Yellow

# Windows 10/11 Compliance Policy with correct schema
$windowsPolicy = @{
    '@odata.type' = '#microsoft.graph.windows10CompliancePolicy'
    displayName = 'ZeroTrust-Windows-Compliance'
    description = 'Windows 10/11 compliance policy for Zero Trust'
    passwordRequired = $true
    passwordMinimumLength = 12
    passwordRequiredType = 'deviceDefault'
    requireHealthyDeviceReport = $true
    osMinimumVersion = '10.0.19041'
    osMaximumVersion = $null
    mobileOsMinimumVersion = $null
    mobileOsMaximumVersion = $null
    earlyLaunchAntiMalwareDriverEnabled = $false
    bitLockerEnabled = $true
    secureBootEnabled = $true
    codeIntegrityEnabled = $true
    storageRequireEncryption = $true
    activeFirewallRequired = $true
    defenderEnabled = $true
    defenderVersion = $null
    signatureOutOfDate = $true
    rtpEnabled = $true
    antivirusRequired = $true
    antiSpywareRequired = $true
    deviceThreatProtectionEnabled = $false
    deviceThreatProtectionRequiredSecurityLevel = 'unavailable'
    configurationManagerComplianceRequired = $false
    tpmRequired = $true
    scheduledActionsForRule = @(
        @{
            ruleName = $null
            scheduledActionConfigurations = @(
                @{
                    actionType = 'block'
                    gracePeriodHours = 24
                    notificationTemplateId = ''
                    notificationMessageCCList = @()
                }
            )
        }
    )
} | ConvertTo-Json -Depth 10

[System.IO.File]::WriteAllText("$env:TEMP\windows-compliance.json", $windowsPolicy, [System.Text.UTF8Encoding]::new($false))

Write-Host "Creating Windows compliance policy..." -NoNewline
& $az rest --method POST --url "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies" --body "@$env:TEMP\windows-compliance.json" -o none 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green } else { Write-Host " Failed (check Intune license)" -ForegroundColor Yellow }

# iOS Compliance Policy
$iosPolicy = @{
    '@odata.type' = '#microsoft.graph.iosCompliancePolicy'
    displayName = 'ZeroTrust-iOS-Compliance'
    description = 'iOS compliance policy for Zero Trust'
    passcodeRequired = $true
    passcodeMinimumLength = 6
    passcodeRequiredType = 'deviceDefault'
    passcodeMinutesOfInactivityBeforeLock = 5
    securityBlockJailbrokenDevices = $true
    deviceThreatProtectionEnabled = $false
    deviceThreatProtectionRequiredSecurityLevel = 'unavailable'
    managedEmailProfileRequired = $false
    osMinimumVersion = '15.0'
    scheduledActionsForRule = @(
        @{
            ruleName = $null
            scheduledActionConfigurations = @(
                @{
                    actionType = 'block'
                    gracePeriodHours = 24
                    notificationTemplateId = ''
                    notificationMessageCCList = @()
                }
            )
        }
    )
} | ConvertTo-Json -Depth 10

[System.IO.File]::WriteAllText("$env:TEMP\ios-compliance.json", $iosPolicy, [System.Text.UTF8Encoding]::new($false))

Write-Host "Creating iOS compliance policy..." -NoNewline
& $az rest --method POST --url "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies" --body "@$env:TEMP\ios-compliance.json" -o none 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green } else { Write-Host " Failed (check Intune license)" -ForegroundColor Yellow }

# Android Compliance Policy
$androidPolicy = @{
    '@odata.type' = '#microsoft.graph.androidCompliancePolicy'
    displayName = 'ZeroTrust-Android-Compliance'
    description = 'Android compliance policy for Zero Trust'
    passwordRequired = $true
    passwordMinimumLength = 6
    passwordRequiredType = 'deviceDefault'
    securityBlockJailbrokenDevices = $true
    deviceThreatProtectionEnabled = $false
    deviceThreatProtectionRequiredSecurityLevel = 'unavailable'
    securityPreventInstallAppsFromUnknownSources = $true
    securityDisableUsbDebugging = $true
    minAndroidSecurityPatchLevel = $null
    storageRequireEncryption = $true
    osMinimumVersion = '11'
    scheduledActionsForRule = @(
        @{
            ruleName = $null
            scheduledActionConfigurations = @(
                @{
                    actionType = 'block'
                    gracePeriodHours = 24
                    notificationTemplateId = ''
                    notificationMessageCCList = @()
                }
            )
        }
    )
} | ConvertTo-Json -Depth 10

[System.IO.File]::WriteAllText("$env:TEMP\android-compliance.json", $androidPolicy, [System.Text.UTF8Encoding]::new($false))

Write-Host "Creating Android compliance policy..." -NoNewline
& $az rest --method POST --url "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies" --body "@$env:TEMP\android-compliance.json" -o none 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green } else { Write-Host " Failed (check Intune license)" -ForegroundColor Yellow }

# macOS Compliance Policy
$macPolicy = @{
    '@odata.type' = '#microsoft.graph.macOSCompliancePolicy'
    displayName = 'ZeroTrust-macOS-Compliance'
    description = 'macOS compliance policy for Zero Trust'
    passwordRequired = $true
    passwordMinimumLength = 12
    passwordRequiredType = 'deviceDefault'
    passwordMinutesOfInactivityBeforeLock = 5
    osMinimumVersion = '12.0'
    systemIntegrityProtectionEnabled = $true
    deviceThreatProtectionEnabled = $false
    deviceThreatProtectionRequiredSecurityLevel = 'unavailable'
    storageRequireEncryption = $true
    firewallEnabled = $true
    firewallBlockAllIncoming = $false
    firewallEnableStealthMode = $true
    scheduledActionsForRule = @(
        @{
            ruleName = $null
            scheduledActionConfigurations = @(
                @{
                    actionType = 'block'
                    gracePeriodHours = 24
                    notificationTemplateId = ''
                    notificationMessageCCList = @()
                }
            )
        }
    )
} | ConvertTo-Json -Depth 10

[System.IO.File]::WriteAllText("$env:TEMP\macos-compliance.json", $macPolicy, [System.Text.UTF8Encoding]::new($false))

Write-Host "Creating macOS compliance policy..." -NoNewline
& $az rest --method POST --url "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies" --body "@$env:TEMP\macos-compliance.json" -o none 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green } else { Write-Host " Failed (check Intune license)" -ForegroundColor Yellow }

# ============================================
# 3. LOG ANALYTICS ALERT RULES
# ============================================
Write-Host "`n=== Creating Log Analytics Alert Rules ===" -ForegroundColor Yellow

$resourceGroup = "OMZIG-ZEROTRUST"
$workspaceName = "log-omzig-test-security"

# Get workspace ID
$workspaceId = & $az monitor log-analytics workspace show --resource-group $resourceGroup --workspace-name $workspaceName --query id -o tsv 2>$null

if ($workspaceId) {
    # Alert: Multiple failed sign-ins
    Write-Host "Creating alert: Multiple Failed Sign-ins..." -NoNewline
    & $az monitor scheduled-query create `
        --name "ZeroTrust-Multiple-Failed-Signins" `
        --resource-group $resourceGroup `
        --scopes $workspaceId `
        --condition "count 'SigninLogs | where ResultType != 0 | summarize FailedCount = count() by UserPrincipalName | where FailedCount > 10' > 0" `
        --description "Alert when a user has more than 10 failed sign-ins" `
        --severity 2 `
        --evaluation-frequency 5m `
        --window-size 1h `
        --action-groups "" `
        -o none 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green } else { Write-Host " Failed" -ForegroundColor Yellow }

    # Alert: Sign-in from blocked country
    Write-Host "Creating alert: Sign-in from Blocked Country..." -NoNewline
    & $az monitor scheduled-query create `
        --name "ZeroTrust-Signin-Blocked-Country" `
        --resource-group $resourceGroup `
        --scopes $workspaceId `
        --condition "count 'SigninLogs | where LocationDetails.countryOrRegion in (\"KP\", \"IR\", \"RU\", \"CN\")' > 0" `
        --description "Alert when sign-in attempt from blocked country" `
        --severity 1 `
        --evaluation-frequency 5m `
        --window-size 15m `
        --action-groups "" `
        -o none 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green } else { Write-Host " Failed" -ForegroundColor Yellow }

    # Alert: Risky user detected
    Write-Host "Creating alert: Risky User Detected..." -NoNewline
    & $az monitor scheduled-query create `
        --name "ZeroTrust-Risky-User-Detected" `
        --resource-group $resourceGroup `
        --scopes $workspaceId `
        --condition "count 'AADRiskyUsers | where RiskLevel in (\"high\", \"medium\")' > 0" `
        --description "Alert when high or medium risk user detected" `
        --severity 2 `
        --evaluation-frequency 15m `
        --window-size 1h `
        --action-groups "" `
        -o none 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green } else { Write-Host " Failed" -ForegroundColor Yellow }
} else {
    Write-Host "Log Analytics workspace not found, skipping alert rules" -ForegroundColor Yellow
}

# ============================================
# 4. SENSITIVITY LABELS (via Graph API)
# ============================================
Write-Host "`n=== Creating Sensitivity Labels ===" -ForegroundColor Yellow

# Note: Sensitivity labels require specific permissions and may need Information Protection license
$labels = @(
    @{ name = "Public"; tooltip = "Non-sensitive data for public use"; color = "#00FF00"; order = 0 },
    @{ name = "Internal"; tooltip = "Internal business data"; color = "#FFFF00"; order = 1 },
    @{ name = "Confidential"; tooltip = "Confidential business data"; color = "#FFA500"; order = 2 },
    @{ name = "Highly-Confidential"; tooltip = "Highly sensitive data requiring encryption"; color = "#FF0000"; order = 3 },
    @{ name = "PHI-Protected-Health-Info"; tooltip = "HIPAA protected health information"; color = "#800080"; order = 4 }
)

foreach ($label in $labels) {
    $labelBody = @{
        displayName = $label.name
        description = $label.tooltip
        tooltip = $label.tooltip
        isActive = $true
        color = $label.color
    } | ConvertTo-Json -Depth 5

    [System.IO.File]::WriteAllText("$env:TEMP\label-$($label.name).json", $labelBody, [System.Text.UTF8Encoding]::new($false))

    Write-Host "Creating label: $($label.name)..." -NoNewline
    & $az rest --method POST --url "https://graph.microsoft.com/beta/security/informationProtection/sensitivityLabels" --body "@$env:TEMP\label-$($label.name).json" -o none 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green } else { Write-Host " Requires M365 E5/AIP license" -ForegroundColor Yellow }
}

# ============================================
# 5. AUTHENTICATION METHODS POLICY
# ============================================
Write-Host "`n=== Configuring Authentication Methods ===" -ForegroundColor Yellow

# Enable Microsoft Authenticator
$authApp = @{
    '@odata.type' = '#microsoft.graph.microsoftAuthenticatorAuthenticationMethodConfiguration'
    state = 'enabled'
    includeTargets = @(
        @{
            targetType = 'group'
            id = 'all_users'
        }
    )
} | ConvertTo-Json -Depth 5

Write-Host "Enabling Microsoft Authenticator for all users..." -NoNewline
# This requires specific admin permissions
& $az rest --method PATCH --url "https://graph.microsoft.com/v1.0/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/microsoftAuthenticator" --body '{"state":"enabled"}' -o none 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green } else { Write-Host " May require different permissions" -ForegroundColor Yellow }

# ============================================
# 6. SECURITY GROUPS FOR POLICIES
# ============================================
Write-Host "`n=== Creating Security Groups ===" -ForegroundColor Yellow

$groups = @(
    @{ name = "ZeroTrust-MFA-Excluded"; description = "Users excluded from MFA requirements (emergency accounts)" },
    @{ name = "ZeroTrust-CA-Pilot"; description = "Pilot group for testing Conditional Access policies" },
    @{ name = "ZeroTrust-Device-Compliance-Required"; description = "Users requiring compliant devices" }
)

foreach ($group in $groups) {
    $groupBody = @{
        displayName = $group.name
        description = $group.description
        mailEnabled = $false
        mailNickname = $group.name -replace '-', ''
        securityEnabled = $true
    } | ConvertTo-Json

    [System.IO.File]::WriteAllText("$env:TEMP\group-$($group.name).json", $groupBody, [System.Text.UTF8Encoding]::new($false))

    Write-Host "Creating group: $($group.name)..." -NoNewline
    & $az rest --method POST --url "https://graph.microsoft.com/v1.0/groups" --body "@$env:TEMP\group-$($group.name).json" -o none 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green } else { Write-Host " Already exists or failed" -ForegroundColor Yellow }
}

# ============================================
# 7. ADDITIONAL CA POLICY: BLOCK COUNTRIES
# ============================================
Write-Host "`n=== Creating Additional CA Policy ===" -ForegroundColor Yellow

# Get the blocked countries location ID
$locationId = & $az rest --method GET --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/namedLocations" --query "value[?displayName=='ZeroTrust-Blocked-Countries'].id" -o tsv 2>$null

if ($locationId) {
    $blockCountriesPolicy = @{
        displayName = "CA007-Block-High-Risk-Countries"
        state = "enabled"
        conditions = @{
            users = @{
                includeUsers = @("All")
            }
            applications = @{
                includeApplications = @("All")
            }
            locations = @{
                includeLocations = @($locationId)
            }
        }
        grantControls = @{
            operator = "OR"
            builtInControls = @("block")
        }
    } | ConvertTo-Json -Depth 10

    [System.IO.File]::WriteAllText("$env:TEMP\ca-block-countries.json", $blockCountriesPolicy, [System.Text.UTF8Encoding]::new($false))

    Write-Host "Creating CA007-Block-High-Risk-Countries..." -NoNewline
    & $az rest --method POST --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" --body "@$env:TEMP\ca-block-countries.json" -o none 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green } else { Write-Host " Already exists or failed" -ForegroundColor Yellow }
}

# ============================================
# 8. DIAGNOSTIC SETTINGS FOR ENTRA ID LOGS
# ============================================
Write-Host "`n=== Configuring Diagnostic Settings ===" -ForegroundColor Yellow

if ($workspaceId) {
    Write-Host "Enabling Entra ID audit logs to Log Analytics..." -NoNewline
    # Note: This requires specific permissions on the Entra ID tenant
    & $az monitor diagnostic-settings create `
        --name "ZeroTrust-EntraID-Logs" `
        --resource "/providers/Microsoft.aadiam/diagnosticSettings" `
        --workspace $workspaceId `
        --logs '[{"category":"AuditLogs","enabled":true},{"category":"SignInLogs","enabled":true},{"category":"NonInteractiveUserSignInLogs","enabled":true},{"category":"ServicePrincipalSignInLogs","enabled":true},{"category":"RiskyUsers","enabled":true},{"category":"UserRiskEvents","enabled":true}]' `
        -o none 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green } else { Write-Host " Requires Entra ID P1/P2" -ForegroundColor Yellow }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Deployment Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

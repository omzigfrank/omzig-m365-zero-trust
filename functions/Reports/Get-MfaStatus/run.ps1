using namespace System.Net

# Get-MfaStatus/run.ps1
# Retrieve MFA registration and usage status
# Part of Phase 8 - Reporting Functions

param($Request, $TriggerMetadata)

$ErrorActionPreference = 'Stop'

# Import Graph helper module
$modulePath = Join-Path -Path $PSScriptRoot -ChildPath '..\..\Modules\GraphHelper.psm1'
if (Test-Path $modulePath) {
    Import-Module $modulePath -Force
}

Write-Host "Get-MfaStatus function triggered"

$result = @{
    status = "success"
    timestamp = (Get-Date -Format 'o')
    summary = @{}
    registrationDetails = @()
    methodBreakdown = @{}
    riskIndicators = @()
}

try {
    # Connect to Graph API
    $connected = Connect-GraphWithManagedIdentity
    if (-not $connected) {
        throw "Failed to connect to Graph API"
    }

    # ═══════════════════════════════════════════════════════════════════
    # 1. Get Credential User Registration Details
    # ═══════════════════════════════════════════════════════════════════

    Write-Host "Retrieving MFA registration details..."

    $registrationDetails = Invoke-GraphRequestWithRetry -Method GET -Uri "https://graph.microsoft.com/v1.0/reports/authenticationMethods/userRegistrationDetails?`$top=999"

    $totalUsers = 0
    $mfaRegistered = 0
    $mfaCapable = 0
    $passwordlessCapable = 0
    $ssprRegistered = 0
    $ssprEnabled = 0
    $methodCounts = @{
        microsoftAuthenticatorApp = 0
        phoneAuthentication = 0
        fido2 = 0
        windowsHelloForBusiness = 0
        emailAuthentication = 0
        temporaryAccessPass = 0
        softwareOath = 0
    }

    if ($registrationDetails.value) {
        foreach ($user in $registrationDetails.value) {
            $totalUsers++

            if ($user.isMfaRegistered) { $mfaRegistered++ }
            if ($user.isMfaCapable) { $mfaCapable++ }
            if ($user.isPasswordlessCapable) { $passwordlessCapable++ }
            if ($user.isSsprRegistered) { $ssprRegistered++ }
            if ($user.isSsprEnabled) { $ssprEnabled++ }

            # Count authentication methods
            foreach ($method in $user.methodsRegistered) {
                if ($methodCounts.ContainsKey($method)) {
                    $methodCounts[$method]++
                }
            }

            # Add to detailed list (limit to 100 for response size)
            if ($result.registrationDetails.Count -lt 100) {
                $result.registrationDetails += @{
                    id = $user.id
                    userPrincipalName = $user.userPrincipalName
                    userDisplayName = $user.userDisplayName
                    isMfaRegistered = $user.isMfaRegistered
                    isMfaCapable = $user.isMfaCapable
                    isPasswordlessCapable = $user.isPasswordlessCapable
                    isSsprRegistered = $user.isSsprRegistered
                    methodsRegistered = $user.methodsRegistered
                    defaultMfaMethod = $user.defaultMfaMethod
                }
            }
        }
    }

    # Handle pagination if needed
    while ($registrationDetails.'@odata.nextLink') {
        $registrationDetails = Invoke-GraphRequestWithRetry -Method GET -Uri $registrationDetails.'@odata.nextLink'

        if ($registrationDetails.value) {
            foreach ($user in $registrationDetails.value) {
                $totalUsers++

                if ($user.isMfaRegistered) { $mfaRegistered++ }
                if ($user.isMfaCapable) { $mfaCapable++ }
                if ($user.isPasswordlessCapable) { $passwordlessCapable++ }
                if ($user.isSsprRegistered) { $ssprRegistered++ }
                if ($user.isSsprEnabled) { $ssprEnabled++ }

                foreach ($method in $user.methodsRegistered) {
                    if ($methodCounts.ContainsKey($method)) {
                        $methodCounts[$method]++
                    }
                }
            }
        }
    }

    # ═══════════════════════════════════════════════════════════════════
    # 2. Calculate Summary Statistics
    # ═══════════════════════════════════════════════════════════════════

    $result.summary = @{
        totalUsers = $totalUsers
        mfaRegistered = $mfaRegistered
        mfaRegisteredPercentage = $(if ($totalUsers -gt 0) { [math]::Round(($mfaRegistered / $totalUsers) * 100, 2) } else { 0 })
        mfaCapable = $mfaCapable
        mfaCapablePercentage = $(if ($totalUsers -gt 0) { [math]::Round(($mfaCapable / $totalUsers) * 100, 2) } else { 0 })
        passwordlessCapable = $passwordlessCapable
        passwordlessPercentage = $(if ($totalUsers -gt 0) { [math]::Round(($passwordlessCapable / $totalUsers) * 100, 2) } else { 0 })
        ssprRegistered = $ssprRegistered
        ssprEnabled = $ssprEnabled
        usersWithoutMfa = $totalUsers - $mfaRegistered
    }

    $result.methodBreakdown = $methodCounts

    # ═══════════════════════════════════════════════════════════════════
    # 3. Identify Risk Indicators
    # ═══════════════════════════════════════════════════════════════════

    # Users without MFA is a risk
    if ($result.summary.usersWithoutMfa -gt 0) {
        $result.riskIndicators += @{
            risk = "Users without MFA"
            count = $result.summary.usersWithoutMfa
            severity = $(if ($result.summary.mfaRegisteredPercentage -lt 50) { "High" }
                      elseif ($result.summary.mfaRegisteredPercentage -lt 80) { "Medium" }
                      else { "Low" })
            recommendation = "Enable MFA for all users through Conditional Access"
        }
    }

    # Low passwordless adoption
    if ($result.summary.passwordlessPercentage -lt 20) {
        $result.riskIndicators += @{
            risk = "Low passwordless adoption"
            count = $totalUsers - $passwordlessCapable
            severity = "Low"
            recommendation = "Consider deploying Windows Hello for Business or FIDO2 keys"
        }
    }

    # SMS/Voice is less secure
    if ($methodCounts.phoneAuthentication -gt ($totalUsers * 0.5)) {
        $result.riskIndicators += @{
            risk = "High SMS/Voice MFA usage"
            count = $methodCounts.phoneAuthentication
            severity = "Medium"
            recommendation = "Migrate users from SMS to Microsoft Authenticator app"
        }
    }

    # ═══════════════════════════════════════════════════════════════════
    # 4. Generate Compliance Status
    # ═══════════════════════════════════════════════════════════════════

    $result.complianceStatus = @{
        mfaCompliant = $result.summary.mfaRegisteredPercentage -ge 100
        zeroTrustReady = $result.summary.mfaCapablePercentage -ge 95
        grade = $(switch ($result.summary.mfaRegisteredPercentage) {
            { $_ -ge 100 } { "A" }
            { $_ -ge 90 } { "B" }
            { $_ -ge 75 } { "C" }
            { $_ -ge 50 } { "D" }
            default { "F" }
        })
    }

} catch {
    Write-Host "Error in Get-MfaStatus: $_"
    $result.status = "error"
    $result.error = $_.Exception.Message
}

# Return response
$responseBody = $result | ConvertTo-Json -Depth 10

Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
    StatusCode = $(if ($result.status -eq "success") { [HttpStatusCode]::OK } else { [HttpStatusCode]::InternalServerError })
    Headers = @{ 'Content-Type' = 'application/json' }
    Body = $responseBody
})

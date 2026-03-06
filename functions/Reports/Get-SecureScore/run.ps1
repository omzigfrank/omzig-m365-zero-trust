using namespace System.Net

# Get-SecureScore/run.ps1
# Retrieve Microsoft Secure Score for the tenant
# Part of Phase 8 - Reporting Functions

param($Request, $TriggerMetadata)

$ErrorActionPreference = 'Stop'

# Import Graph helper module
$modulePath = Join-Path -Path $PSScriptRoot -ChildPath '..\..\Modules\GraphHelper.psm1'
if (Test-Path $modulePath) {
    Import-Module $modulePath -Force
}

Write-Host "Get-SecureScore function triggered"

$result = @{
    status = "success"
    timestamp = (Get-Date -Format 'o')
    secureScore = @{}
    controlScores = @()
    recommendations = @()
}

try {
    # Connect to Graph API
    $connected = Connect-GraphWithManagedIdentity
    if (-not $connected) {
        throw "Failed to connect to Graph API"
    }

    # ═══════════════════════════════════════════════════════════════════
    # 1. Get Current Secure Score
    # ═══════════════════════════════════════════════════════════════════

    Write-Host "Retrieving Secure Score..."

    $secureScores = Invoke-GraphRequestWithRetry -Method GET -Uri "https://graph.microsoft.com/v1.0/security/secureScores?`$top=1"

    if ($secureScores.value -and $secureScores.value.Count -gt 0) {
        $currentScore = $secureScores.value[0]

        $result.secureScore = @{
            currentScore = $currentScore.currentScore
            maxScore = $currentScore.maxScore
            percentageScore = [math]::Round(($currentScore.currentScore / $currentScore.maxScore) * 100, 2)
            createdDateTime = $currentScore.createdDateTime
            licensedUserCount = $currentScore.licensedUserCount
            activeUserCount = $currentScore.activeUserCount
            enabledServices = $currentScore.enabledServices
        }

        # Get control scores
        foreach ($controlScore in $currentScore.controlScores) {
            $result.controlScores += @{
                controlName = $controlScore.controlName
                controlCategory = $controlScore.controlCategory
                score = $controlScore.score
                maxScore = $controlScore.scoreInPercentage
                description = $controlScore.description
                implementationStatus = $controlScore.implementationStatus
            }
        }
    }

    # ═══════════════════════════════════════════════════════════════════
    # 2. Get Secure Score Control Profiles (Recommendations)
    # ═══════════════════════════════════════════════════════════════════

    Write-Host "Retrieving improvement recommendations..."

    $controlProfiles = Invoke-GraphRequestWithRetry -Method GET -Uri "https://graph.microsoft.com/v1.0/security/secureScoreControlProfiles?`$top=50"

    if ($controlProfiles.value) {
        foreach ($profile in $controlProfiles.value) {
            # Only include items that can improve score
            if ($profile.maxScore -gt 0) {
                $result.recommendations += @{
                    id = $profile.id
                    title = $profile.title
                    maxScore = $profile.maxScore
                    tier = $profile.tier
                    service = $profile.service
                    actionType = $profile.actionType
                    userImpact = $profile.userImpact
                    implementationCost = $profile.implementationCost
                    threats = $profile.threats
                    remediation = $profile.remediation
                    remediationImpact = $profile.remediationImpact
                }
            }
        }

        # Sort by max score (highest impact first)
        $result.recommendations = $result.recommendations | Sort-Object -Property maxScore -Descending
    }

    # ═══════════════════════════════════════════════════════════════════
    # 3. Calculate Category Breakdown
    # ═══════════════════════════════════════════════════════════════════

    $categories = $result.controlScores | Group-Object -Property controlCategory
    $categoryBreakdown = @()

    foreach ($category in $categories) {
        $categoryScore = ($category.Group | Measure-Object -Property score -Sum).Sum
        $categoryMax = ($category.Group | Measure-Object -Property maxScore -Sum).Sum

        $categoryBreakdown += @{
            category = $category.Name
            score = $categoryScore
            maxScore = $categoryMax
            controlCount = $category.Count
        }
    }

    $result.categoryBreakdown = $categoryBreakdown

    # ═══════════════════════════════════════════════════════════════════
    # 4. Generate Summary
    # ═══════════════════════════════════════════════════════════════════

    $result.summary = @{
        overallGrade = $(switch ($result.secureScore.percentageScore) {
            { $_ -ge 80 } { "A" }
            { $_ -ge 60 } { "B" }
            { $_ -ge 40 } { "C" }
            { $_ -ge 20 } { "D" }
            default { "F" }
        })
        topRecommendations = @($result.recommendations | Select-Object -First 5).title
        totalRecommendations = @($result.recommendations).Count
        quickWins = @($result.recommendations | Where-Object { $_.implementationCost -eq "Low" }).Count
    }

} catch {
    Write-Host "Error in Get-SecureScore: $_"
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

using namespace System.Net

param($Request, $TriggerMetadata)

<#
.SYNOPSIS
    Deploys Microsoft Security Compliance Toolkit baselines via Intune
.DESCRIPTION
    Creates Intune device configuration profiles (Settings Catalog) from
    pre-parsed SCT baseline data. Supports Windows 10/11, Windows Server,
    Microsoft Edge, and Microsoft 365 Apps baselines with NSA Zero Trust
    pillar mapping and HIPAA compliance tagging.

    Endpoint: POST /api/deploy-baselines
    Body: {
        "baselineIds": ["win11-25h2", "edge-v139", "m365apps-2512"],
        "deploymentMode": "audit",          # audit | enforce
        "assignmentTarget": "allDevices",   # allDevices | group | none
        "groupId": "",                      # Entra ID group ID (if target=group)
        "hipaaEnabled": true,
        "profilePrefix": "Omzig-SCT"
    }
#>

Import-Module (Join-Path $PSScriptRoot '..' 'Modules' 'GraphHelper.psm1') -Force
Import-Module (Join-Path $PSScriptRoot '..' 'Modules' 'BaselineHelper.psm1') -Force

Write-Host "Deploy-Baselines started"

try {
    # Parse request
    $config = $Request.Body
    if (-not $config) {
        throw "Request body is required. Provide baselineIds, deploymentMode, etc."
    }

    $baselineIds = $config.baselineIds
    if (-not $baselineIds -or $baselineIds.Count -eq 0) {
        throw "baselineIds is required. Provide one or more baseline IDs (e.g., 'win11-25h2', 'edge-v139')."
    }

    $deploymentMode = if ($config.deploymentMode) { $config.deploymentMode } else { "audit" }
    $assignmentTarget = if ($config.assignmentTarget) { $config.assignmentTarget } else { "none" }
    $groupId = $config.groupId
    $hipaaEnabled = [bool]$config.hipaaEnabled
    $profilePrefix = if ($config.profilePrefix) { $config.profilePrefix } else { "Omzig-SCT" }

    Write-Host "Configuration: mode=$deploymentMode, target=$assignmentTarget, hipaa=$hipaaEnabled, prefix=$profilePrefix"
    Write-Host "Baselines to deploy: $($baselineIds -join ', ')"

    # Connect to Graph
    $connected = Connect-GraphWithManagedIdentity
    if (-not $connected) {
        throw "Failed to connect to Microsoft Graph"
    }

    # Load baseline catalog
    $catalogPath = Join-Path $PSScriptRoot '..' '..' 'baselines' 'catalog.json'
    if (-not (Test-Path $catalogPath)) {
        # Fall back to function app content root
        $catalogPath = Join-Path $env:HOME 'site' 'wwwroot' 'baselines' 'catalog.json'
    }

    $catalog = Get-Content $catalogPath -Raw | ConvertFrom-Json
    Write-Host "Loaded baseline catalog: $($catalog.baselines.PSObject.Properties.Count) baselines, $($catalog.profiles.Count) profiles available"

    $results = @{
        profiles = @()
        assignments = @()
        summary = @{
            requested = $baselineIds.Count
            deployed = 0
            skipped = 0
            failed = 0
            totalSettings = 0
        }
    }

    # Process each requested baseline
    foreach ($baselineId in $baselineIds) {
        Write-Host "`n--- Processing baseline: $baselineId ---"

        # Validate baseline exists
        $baselineInfo = $catalog.baselines.PSObject.Properties[$baselineId]
        if (-not $baselineInfo) {
            Write-Host "WARNING: Baseline '$baselineId' not found in catalog. Skipping."
            $results.summary.skipped++
            continue
        }

        $baselineMeta = $baselineInfo.Value.metadata
        Write-Host "Baseline: $($baselineMeta.name) (OS: $($baselineMeta.os), Version: $($baselineMeta.version))"

        # Find matching profiles
        $matchingProfiles = $catalog.profiles | Where-Object { $_.profileId -like "sct-$baselineId-*" }
        Write-Host "Found $($matchingProfiles.Count) profiles for this baseline"

        foreach ($profileRef in $matchingProfiles) {
            $profilePath = Join-Path $PSScriptRoot '..' '..' 'baselines' 'profiles' "$($profileRef.profileId).json"
            if (-not (Test-Path $profilePath)) {
                $profilePath = Join-Path $env:HOME 'site' 'wwwroot' 'baselines' 'profiles' "$($profileRef.profileId).json"
            }

            if (-not (Test-Path $profilePath)) {
                Write-Host "  WARNING: Profile file not found: $($profileRef.profileId). Skipping."
                $results.summary.skipped++
                continue
            }

            $profileData = Get-Content $profilePath -Raw | ConvertFrom-Json
            Write-Host "  Deploying: $($profileData.displayName) ($($profileData.settingsCount) settings)"

            try {
                # Build the Intune profile based on type
                $profileResult = $null

                if ($profileData.profileType -eq "settingsCatalog") {
                    $profileResult = Deploy-SettingsCatalogProfile `
                        -ProfileData $profileData `
                        -DeploymentMode $deploymentMode `
                        -ProfilePrefix $profilePrefix `
                        -HipaaEnabled $hipaaEnabled
                }
                elseif ($profileData.profileType -eq "endpointSecurity") {
                    $profileResult = Deploy-EndpointSecurityProfile `
                        -ProfileData $profileData `
                        -DeploymentMode $deploymentMode `
                        -ProfilePrefix $profilePrefix
                }

                if ($profileResult -and $profileResult.id) {
                    $results.profiles += @{
                        profileId = $profileRef.profileId
                        intuneId = $profileResult.id
                        displayName = $profileResult.displayName
                        settingsCount = $profileData.settingsCount
                        status = 'Created'
                    }
                    $results.summary.deployed++
                    $results.summary.totalSettings += $profileData.settingsCount

                    # Assign profile if requested
                    if ($assignmentTarget -ne "none") {
                        try {
                            $assignment = Assign-IntuneProfile `
                                -ProfileId $profileResult.id `
                                -ProfileType $profileData.profileType `
                                -Target $assignmentTarget `
                                -GroupId $groupId

                            $results.assignments += @{
                                profileId = $profileResult.id
                                target = $assignmentTarget
                                status = 'Assigned'
                            }
                            Write-Host "    Assigned to: $assignmentTarget"
                        }
                        catch {
                            Write-Host "    Assignment failed: $($_.Exception.Message)"
                            $results.assignments += @{
                                profileId = $profileResult.id
                                target = $assignmentTarget
                                status = 'AssignmentFailed'
                                error = $_.Exception.Message
                            }
                        }
                    }
                }
                else {
                    $results.profiles += @{
                        profileId = $profileRef.profileId
                        status = 'Failed'
                        error = 'No profile ID returned'
                    }
                    $results.summary.failed++
                }
            }
            catch {
                $errorMsg = $_.Exception.Message
                if ($errorMsg -match "already exists") {
                    $results.profiles += @{
                        profileId = $profileRef.profileId
                        displayName = "$profilePrefix - $($profileData.displayName)"
                        status = 'AlreadyExists'
                    }
                    $results.summary.skipped++
                    Write-Host "    Already exists, skipping"
                }
                else {
                    $results.profiles += @{
                        profileId = $profileRef.profileId
                        status = 'Failed'
                        error = $errorMsg
                    }
                    $results.summary.failed++
                    Write-Host "    FAILED: $errorMsg"
                }
            }
        }
    }

    # Build response
    $responseBody = @{
        status = "Success"
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
        configuration = @{
            baselineIds = $baselineIds
            deploymentMode = $deploymentMode
            assignmentTarget = $assignmentTarget
            hipaaEnabled = $hipaaEnabled
        }
        results = $results
    }

    Write-Host "`n=== Deployment Complete ==="
    Write-Host "  Deployed: $($results.summary.deployed) profiles"
    Write-Host "  Skipped: $($results.summary.skipped)"
    Write-Host "  Failed: $($results.summary.failed)"
    Write-Host "  Total Settings: $($results.summary.totalSettings)"

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::OK
        Body = ($responseBody | ConvertTo-Json -Depth 15)
        Headers = @{ 'Content-Type' = 'application/json' }
    })
}
catch {
    Write-Host "Deploy-Baselines failed: $_"

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::InternalServerError
        Body = (@{
            status = "Failed"
            error = $_.Exception.Message
            timestamp = (Get-Date).ToUniversalTime().ToString('o')
        } | ConvertTo-Json)
        Headers = @{ 'Content-Type' = 'application/json' }
    })
}

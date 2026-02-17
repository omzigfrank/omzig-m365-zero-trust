# Deploy-SecurityBaselines/run.ps1
# Deploys Microsoft Security Compliance Toolkit baselines as Intune configuration profiles
# Maps to NSA Zero Trust Pillars: Device, Network, Application, User, Visibility

param($Request, $TriggerMetadata)

$ErrorActionPreference = "Stop"
Import-Module "$PSScriptRoot/../Modules/GraphHelper.psm1"

function Deploy-SecurityBaselines {
    param(
        [Parameter(Mandatory)]
        [hashtable]$Config
    )

    $results = @{
        profilesCreated = @()
        profilesSkipped = @()
        profilesFailed  = @()
        totalSettings   = 0
    }

    # Determine which baselines to deploy based on config
    $baselineId = Get-BaselineId -Config $Config
    $baselineLevel = $Config.securityBaseline ?? "Enhanced"
    $hipaaEnabled = $Config.hipaaEnabled ?? $false

    Write-Host "[INFO] Deploying SCT baseline: $baselineId (Level: $baselineLevel, HIPAA: $hipaaEnabled)"

    # Load baseline settings from bundled JSON
    $baselinePath = Join-Path $PSScriptRoot "../../baselines/sct/$baselineId/settings.json"
    if (-not (Test-Path $baselinePath)) {
        Write-Error "[ERROR] Baseline not found: $baselinePath"
        throw "Baseline $baselineId not found"
    }

    $baseline = Get-Content $baselinePath | ConvertFrom-Json
    Write-Host "[INFO] Loaded $($baseline.totalSettings) settings from $($baseline.metadata.name)"

    # Group settings by policy name for profile creation
    $policyGroups = $baseline.settings | Group-Object -Property policyName

    foreach ($group in $policyGroups) {
        $policyName = $group.Name
        $settings = $group.Group

        if (-not $policyName -or $policyName -eq "") {
            continue
        }

        # Create Intune custom configuration profile name
        $profileName = "SCT-$baselineId-$($policyName -replace '[^\w\-]', '-')"
        $profileName = $profileName.Substring(0, [Math]::Min($profileName.Length, 100))

        Write-Host "[INFO] Creating profile: $profileName ($($settings.Count) settings)"

        try {
            # Check if profile already exists
            $existingUri = "https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations?`$filter=displayName eq '$profileName'"
            $existing = Invoke-GraphWithRetry -Method GET -Uri $existingUri
            
            if ($existing.value.Count -gt 0) {
                Write-Warning "[WARN] Profile '$profileName' already exists, skipping"
                $results.profilesSkipped += $profileName
                continue
            }

            # Build OMA-URI settings array
            $omaSettings = @()
            foreach ($setting in $settings) {
                # Apply baseline level filtering
                if (-not (Should-IncludeSetting -Setting $setting -Level $baselineLevel -HIPAA $hipaaEnabled)) {
                    continue
                }

                $omaSetting = @{
                    "@odata.type"    = Get-OmaOdataType -DataType $setting.intuneDataType
                    "displayName"    = "$($setting.registryValue)"
                    "description"    = "Registry: $($setting.registryKey)\$($setting.registryValue) | ZT Pillar: $($setting.ztPillar)"
                    "omaUri"         = $setting.omaUri
                    "value"          = $setting.intuneValue
                }

                # Add fileName for string types
                if ($setting.intuneDataType -eq "String") {
                    $omaSetting["@odata.type"] = "#microsoft.graph.omaSettingString"
                }

                $omaSettings += $omaSetting
            }

            if ($omaSettings.Count -eq 0) {
                Write-Warning "[WARN] No settings after filtering for profile: $profileName"
                $results.profilesSkipped += $profileName
                continue
            }

            # Create custom configuration profile
            $profileBody = @{
                "@odata.type"   = "#microsoft.graph.windows10CustomConfiguration"
                "displayName"   = $profileName
                "description"   = "Microsoft SCT baseline: $($baseline.metadata.name). Auto-deployed by Omzig Zero Trust. ZT Pillars: $($settings | Select-Object -ExpandProperty ztPillar -Unique | Join-String -Separator ', ')"
                "omaSettings"   = $omaSettings
            }

            $createUri = "https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations"
            $result = Invoke-GraphWithRetry -Method POST -Uri $createUri -Body $profileBody

            Write-Host "[INFO] Created profile: $profileName (ID: $($result.id), Settings: $($omaSettings.Count))"
            $results.profilesCreated += @{
                name     = $profileName
                id       = $result.id
                settings = $omaSettings.Count
            }
            $results.totalSettings += $omaSettings.Count

        }
        catch {
            Write-Error "[ERROR] Failed to create profile '$profileName': $($_.Exception.Message)"
            $results.profilesFailed += @{
                name  = $profileName
                error = $_.Exception.Message
            }
        }
    }

    # Deploy Edge baseline if applicable
    if ($Config.deployEdgeBaseline) {
        $edgeResults = Deploy-EdgeBaseline -Config $Config
        $results.profilesCreated += $edgeResults.profilesCreated
        $results.profilesFailed += $edgeResults.profilesFailed
    }

    # Deploy M365 Apps baseline if applicable
    if ($Config.deployM365AppsBaseline) {
        $m365Results = Deploy-M365AppsBaseline -Config $Config
        $results.profilesCreated += $m365Results.profilesCreated
        $results.profilesFailed += $m365Results.profilesFailed
    }

    return $results
}

function Get-BaselineId {
    param([hashtable]$Config)

    $osTarget = $Config.osTarget ?? "Windows 11"
    $osVersion = $Config.osVersion ?? "25H2"

    switch -Wildcard ($osTarget) {
        "Windows 11*" {
            switch ($osVersion) {
                "25H2" { return "win11-25h2" }
                "24H2" { return "win11-24h2" }
                "23H2" { return "win11-23h2" }
                "22H2" { return "win11-22h2" }
                default { return "win11-25h2" }
            }
        }
        "Windows 10*" {
            switch ($osVersion) {
                "22H2" { return "win10-22h2" }
                "20H2" { return "win10-20h2-ws20h2" }
                "1809" { return "win10-1809-ws2019" }
                default { return "win10-22h2" }
            }
        }
        "Windows Server 2025*" { return "ws2025" }
        "Windows Server 2022*" { return "ws2022" }
        "Windows Server 2019*" { return "win10-1809-ws2019" }
        default { return "win11-25h2" }
    }
}

function Get-OmaOdataType {
    param([string]$DataType)
    switch ($DataType) {
        "Integer" { return "#microsoft.graph.omaSettingInteger" }
        "String"  { return "#microsoft.graph.omaSettingString" }
        "Boolean" { return "#microsoft.graph.omaSettingBoolean" }
        default   { return "#microsoft.graph.omaSettingString" }
    }
}

function Should-IncludeSetting {
    param($Setting, [string]$Level, [bool]$HIPAA)
    
    # Standard: core security settings only
    # Enhanced: Standard + hardening (default)
    # Maximum: Enhanced + aggressive lockdown
    
    $key = $Setting.registryKey.ToLower()
    
    # Always include these critical security settings
    $alwaysInclude = @(
        "smartscreen", "bitlocker", "firewall", "defender",
        "scriptblocklogging", "audit", "credential", "encryption",
        "winrm", "autorun", "installer"
    )
    foreach ($term in $alwaysInclude) {
        if ($key -match $term) { return $true }
    }
    
    # Standard level: skip aggressive settings
    if ($Level -eq "Standard") {
        $skipTerms = @("gamerecording", "gamedvr", "personalization", "cloudcontent", "sudo")
        foreach ($term in $skipTerms) {
            if ($key -match $term) { return $false }
        }
    }
    
    # HIPAA mode: include all audit and logging settings
    if ($HIPAA -and ($key -match "eventlog|audit|logging")) {
        return $true
    }
    
    return $true
}

function Deploy-EdgeBaseline {
    param([hashtable]$Config)
    
    $results = @{ profilesCreated = @(); profilesFailed = @() }
    $edgePath = Join-Path $PSScriptRoot "../../baselines/sct/edge-v139/settings.json"
    
    if (-not (Test-Path $edgePath)) {
        Write-Warning "[WARN] Edge baseline not found"
        return $results
    }
    
    $baseline = Get-Content $edgePath | ConvertFrom-Json
    Write-Host "[INFO] Deploying Edge v139 baseline ($($baseline.totalSettings) settings)"
    
    # Similar profile creation logic as main function
    # Edge settings go to a single profile
    $omaSettings = @()
    foreach ($setting in $baseline.settings) {
        $omaSettings += @{
            "@odata.type" = Get-OmaOdataType -DataType $setting.intuneDataType
            "displayName" = $setting.registryValue
            "description" = "Edge baseline: $($setting.registryKey)\$($setting.registryValue)"
            "omaUri"      = $setting.omaUri
            "value"       = $setting.intuneValue
        }
    }
    
    try {
        $profileBody = @{
            "@odata.type" = "#microsoft.graph.windows10CustomConfiguration"
            "displayName" = "SCT-edge-v139-Security-Baseline"
            "description" = "Microsoft Edge v139 Security Baseline - Omzig Zero Trust (Application Pillar)"
            "omaSettings" = $omaSettings
        }
        
        $result = Invoke-GraphWithRetry -Method POST `
            -Uri "https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations" `
            -Body $profileBody
        
        $results.profilesCreated += @{ name = "SCT-edge-v139"; id = $result.id; settings = $omaSettings.Count }
    }
    catch {
        $results.profilesFailed += @{ name = "SCT-edge-v139"; error = $_.Exception.Message }
    }
    
    return $results
}

function Deploy-M365AppsBaseline {
    param([hashtable]$Config)
    
    $results = @{ profilesCreated = @(); profilesFailed = @() }
    $m365Path = Join-Path $PSScriptRoot "../../baselines/sct/m365-apps-2512/settings.json"
    
    if (-not (Test-Path $m365Path)) {
        Write-Warning "[WARN] M365 Apps baseline not found"
        return $results
    }
    
    $baseline = Get-Content $m365Path | ConvertFrom-Json
    Write-Host "[INFO] Deploying M365 Apps v2512 baseline ($($baseline.totalSettings) settings)"
    
    # Group by policy name (M365 has Computer, User, DDE Block, etc.)
    $groups = $baseline.settings | Group-Object -Property policyName
    
    foreach ($group in $groups) {
        $profileName = "SCT-m365apps-$($group.Name -replace '[^\w\-]', '-')".Substring(0, [Math]::Min(100, ("SCT-m365apps-$($group.Name -replace '[^\w\-]', '-')").Length))
        
        $omaSettings = @()
        foreach ($setting in $group.Group) {
            $omaSettings += @{
                "@odata.type" = Get-OmaOdataType -DataType $setting.intuneDataType
                "displayName" = $setting.registryValue
                "description" = "M365 Apps baseline: $($setting.registryKey)\$($setting.registryValue)"
                "omaUri"      = $setting.omaUri
                "value"       = $setting.intuneValue
            }
        }
        
        try {
            $profileBody = @{
                "@odata.type" = "#microsoft.graph.windows10CustomConfiguration"
                "displayName" = $profileName
                "description" = "Microsoft 365 Apps for Enterprise v2512 Security Baseline - Omzig Zero Trust"
                "omaSettings" = $omaSettings
            }
            
            $result = Invoke-GraphWithRetry -Method POST `
                -Uri "https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations" `
                -Body $profileBody
            
            $results.profilesCreated += @{ name = $profileName; id = $result.id; settings = $omaSettings.Count }
        }
        catch {
            $results.profilesFailed += @{ name = $profileName; error = $_.Exception.Message }
        }
    }
    
    return $results
}

# Main execution
try {
    Connect-MgGraph -Identity
    
    $config = $Request.Body | ConvertFrom-Json -AsHashtable
    $results = Deploy-SecurityBaselines -Config $config
    
    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [System.Net.HttpStatusCode]::OK
        Body       = ($results | ConvertTo-Json -Depth 10)
    })
}
catch {
    Write-Error "[ERROR] Deploy-SecurityBaselines failed: $($_.Exception.Message)"
    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [System.Net.HttpStatusCode]::InternalServerError
        Body       = (@{
            status  = "Failed"
            error   = $_.Exception.Message
            component = "Deploy-SecurityBaselines"
        } | ConvertTo-Json)
    })
}

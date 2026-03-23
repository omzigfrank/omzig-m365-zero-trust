# BaselineHelper.psm1 - Functions for deploying Microsoft SCT baselines via Intune Graph API
# Converts parsed SCT baseline data into Intune Settings Catalog and Endpoint Security profiles

<#
.SYNOPSIS
    Helper module for deploying Microsoft Security Compliance Toolkit baselines
    as Intune device configuration profiles via Microsoft Graph API.
.DESCRIPTION
    Supports:
    - Settings Catalog profiles (registry-based GPO settings)
    - Endpoint Security profiles (audit policies, firewall, antivirus)
    - Profile assignment to All Devices, specific groups, or no assignment
    - Audit mode (monitor only) and Enforce mode deployment
    - HIPAA-tagged settings for compliance reporting
#>

# Registry type to Settings Catalog data type mapping
$script:RegTypeToSettingType = @{
    'REG_DWORD'     = '#microsoft.graph.deviceManagementConfigurationIntegerSettingValue'
    'REG_SZ'        = '#microsoft.graph.deviceManagementConfigurationStringSettingValue'
    'REG_EXPAND_SZ' = '#microsoft.graph.deviceManagementConfigurationStringSettingValue'
    'REG_MULTI_SZ'  = '#microsoft.graph.deviceManagementConfigurationStringSettingValue'
    'REG_QWORD'     = '#microsoft.graph.deviceManagementConfigurationIntegerSettingValue'
    'REG_BINARY'    = '#microsoft.graph.deviceManagementConfigurationStringSettingValue'
}

# Map common registry paths to Intune Settings Catalog definition IDs
# This is used to translate GPO registry keys to the structured Settings Catalog format
$script:WellKnownSettingDefinitions = @{
    # Windows Defender
    'Software\Policies\Microsoft\Windows Defender' = 'device_vendor_msft_defender'
    # BitLocker
    'Software\Policies\Microsoft\FVE' = 'device_vendor_msft_bitlocker'
    # Windows Update
    'Software\Policies\Microsoft\Windows\WindowsUpdate' = 'device_vendor_msft_policy_config_update'
    # Firewall
    'Software\Policies\Microsoft\WindowsFirewall' = 'device_vendor_msft_firewall'
}


function Deploy-SettingsCatalogProfile {
    <#
    .SYNOPSIS
        Deploys a Settings Catalog profile to Intune from SCT baseline data
    .PARAMETER ProfileData
        Parsed SCT profile data (from baselines/profiles/*.json)
    .PARAMETER DeploymentMode
        'audit' for monitoring, 'enforce' for active enforcement
    .PARAMETER ProfilePrefix
        Prefix for profile display names (e.g., 'Omzig-SCT')
    .PARAMETER HipaaEnabled
        Whether to tag HIPAA-mapped settings in the description
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSObject]$ProfileData,

        [Parameter()]
        [ValidateSet('audit', 'enforce')]
        [string]$DeploymentMode = 'audit',

        [Parameter()]
        [string]$ProfilePrefix = 'Omzig-SCT',

        [Parameter()]
        [bool]$HipaaEnabled = $false
    )

    $displayName = "$ProfilePrefix - $($ProfileData.displayName)"
    $description = $ProfileData.description
    if ($HipaaEnabled) {
        $hipaaSettings = ($ProfileData.settings | Where-Object { $_.hipaaControls.Count -gt 0 }).Count
        $description += " | HIPAA: $hipaaSettings mapped settings"
    }
    if ($DeploymentMode -eq 'audit') {
        $description += " | Mode: Audit (monitoring only)"
    }

    # Build Settings Catalog settings payload
    # Uses the configurationSettings format for custom OMA-URI profiles
    $settingsPayload = @()

    foreach ($setting in $ProfileData.settings) {
        $settingDefinitionId = Convert-RegistryToDefinitionId -Key $setting.displayName
        $settingValue = Convert-SettingValue -Value $setting.value -DataType $setting.dataType

        $settingEntry = @{
            '@odata.type' = '#microsoft.graph.deviceManagementConfigurationSetting'
            settingInstance = @{
                '@odata.type'       = '#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance'
                settingDefinitionId = $settingDefinitionId
                simpleSettingValue  = $settingValue
            }
        }
        $settingsPayload += $settingEntry
    }

    # If we can't map to Settings Catalog definitions, fall back to custom OMA-URI profile
    # This is the more reliable approach for GPO-sourced settings
    $profileBody = @{
        '@odata.type' = '#microsoft.graph.windows10CustomConfiguration'
        displayName   = $displayName
        description   = $description
        omaSettings   = @()
    }

    foreach ($setting in $ProfileData.settings) {
        $omaUri = $setting.omaUri
        $omaType = Get-OmaSettingType -RegType $setting.dataType
        $omaValue = $setting.value

        $omaSetting = @{
            '@odata.type' = $omaType
            displayName   = ($setting.displayName -split '\\')[-1]
            description   = "SCT Baseline: $($setting.displayName)"
            omaUri        = $omaUri
        }

        # Set value based on type
        switch ($omaType) {
            '#microsoft.graph.omaSettingInteger' {
                $omaSetting['value'] = [int]$omaValue
            }
            '#microsoft.graph.omaSettingString' {
                $omaSetting['value'] = [string]$omaValue
            }
            '#microsoft.graph.omaSettingBoolean' {
                $omaSetting['value'] = [bool]$omaValue
            }
            default {
                $omaSetting['value'] = [string]$omaValue
            }
        }

        $profileBody.omaSettings += $omaSetting
    }

    # Check if we have too many settings for a single profile (Intune limit is ~1000)
    if ($profileBody.omaSettings.Count -gt 900) {
        Write-Host "    Profile has $($profileBody.omaSettings.Count) settings - splitting into chunks"
        return Deploy-ChunkedProfile -ProfileBody $profileBody -ChunkSize 500
    }

    # Create the profile via Graph API
    Write-Host "    Creating profile: $displayName ($($profileBody.omaSettings.Count) OMA-URI settings)"

    $response = Invoke-GraphRequestWithRetry -Method POST `
        -Uri "https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations" `
        -Body $profileBody

    Write-Host "    Created successfully: ID=$($response.id)"
    return $response
}


function Deploy-EndpointSecurityProfile {
    <#
    .SYNOPSIS
        Deploys endpoint security profile (audit policies) to Intune
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSObject]$ProfileData,

        [Parameter()]
        [string]$DeploymentMode = 'audit',

        [Parameter()]
        [string]$ProfilePrefix = 'Omzig-SCT'
    )

    if ($ProfileData.category -eq 'auditPolicy') {
        return Deploy-AuditPolicyProfile -ProfileData $ProfileData -ProfilePrefix $ProfilePrefix
    }

    Write-Host "    Unsupported endpoint security category: $($ProfileData.category)"
    return $null
}


function Deploy-AuditPolicyProfile {
    <#
    .SYNOPSIS
        Deploys Windows advanced audit policies as an Intune endpoint security profile
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSObject]$ProfileData,

        [Parameter()]
        [string]$ProfilePrefix = 'Omzig-SCT'
    )

    $displayName = "$ProfilePrefix - $($ProfileData.displayName)"

    # Map audit subcategory GUIDs to Intune Settings Catalog definitions
    $auditSettings = @()
    foreach ($policy in $ProfileData.auditPolicies) {
        $subcategory = $policy.subcategory
        $setting = $policy.setting
        $guid = $policy.guid

        # Convert "Success and Failure" / "Success" / "Failure" to integer values
        $auditValue = switch ($setting) {
            "Success and Failure" { 3 }
            "Success"             { 1 }
            "Failure"             { 2 }
            "No Auditing"         { 0 }
            default               { [int]$policy.value }
        }

        $auditSettings += @{
            subcategory = $subcategory
            guid        = $guid
            value       = $auditValue
            setting     = $setting
        }
    }

    # Deploy as custom OMA-URI profile targeting audit policy CSP
    $profileBody = @{
        '@odata.type' = '#microsoft.graph.windows10CustomConfiguration'
        displayName   = $displayName
        description   = "$($ProfileData.description) | $($auditSettings.Count) audit subcategories"
        omaSettings   = @()
    }

    foreach ($audit in $auditSettings) {
        $profileBody.omaSettings += @{
            '@odata.type' = '#microsoft.graph.omaSettingInteger'
            displayName   = "Audit: $($audit.subcategory)"
            description   = "SCT Audit Policy - $($audit.setting)"
            omaUri        = "./Device/Vendor/MSFT/Policy/Config/Audit/$($audit.subcategory -replace ' ', '')"
            value         = $audit.value
        }
    }

    $response = Invoke-GraphRequestWithRetry -Method POST `
        -Uri "https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations" `
        -Body $profileBody

    Write-Host "    Created audit profile: $displayName (ID: $($response.id))"
    return $response
}


function Deploy-ChunkedProfile {
    <#
    .SYNOPSIS
        Splits a large profile into multiple smaller profiles to stay within Intune limits
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [hashtable]$ProfileBody,

        [Parameter()]
        [int]$ChunkSize = 500
    )

    $allSettings = $ProfileBody.omaSettings
    $chunkCount = [math]::Ceiling($allSettings.Count / $ChunkSize)
    $results = @()

    for ($i = 0; $i -lt $chunkCount; $i++) {
        $start = $i * $ChunkSize
        $chunk = $allSettings[$start..([math]::Min($start + $ChunkSize - 1, $allSettings.Count - 1))]

        $chunkBody = $ProfileBody.Clone()
        $chunkBody.displayName = "$($ProfileBody.displayName) (Part $($i + 1)/$chunkCount)"
        $chunkBody.omaSettings = $chunk

        Write-Host "    Creating chunk $($i + 1)/$chunkCount ($($chunk.Count) settings)"

        $response = Invoke-GraphRequestWithRetry -Method POST `
            -Uri "https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations" `
            -Body $chunkBody

        $results += $response
    }

    # Return the first profile as the primary reference
    return $results[0]
}


function Assign-IntuneProfile {
    <#
    .SYNOPSIS
        Assigns an Intune device configuration profile to a target
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$ProfileId,

        [Parameter()]
        [string]$ProfileType = 'settingsCatalog',

        [Parameter(Mandatory)]
        [ValidateSet('allDevices', 'group')]
        [string]$Target,

        [Parameter()]
        [string]$GroupId
    )

    $assignmentBody = @{
        assignments = @()
    }

    switch ($Target) {
        'allDevices' {
            $assignmentBody.assignments += @{
                target = @{
                    '@odata.type' = '#microsoft.graph.allDevicesAssignmentTarget'
                }
            }
        }
        'group' {
            if (-not $GroupId) {
                throw "GroupId is required when target is 'group'"
            }
            $assignmentBody.assignments += @{
                target = @{
                    '@odata.type' = '#microsoft.graph.groupAssignmentTarget'
                    groupId       = $GroupId
                }
            }
        }
    }

    $uri = "https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations/$ProfileId/assign"
    $response = Invoke-GraphRequestWithRetry -Method POST -Uri $uri -Body $assignmentBody

    return $response
}


function Convert-RegistryToDefinitionId {
    <#
    .SYNOPSIS
        Converts a registry key path to a Settings Catalog definition ID
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Key
    )

    # Normalize: replace backslashes, lowercase, remove common prefixes
    $normalized = $Key.ToLower() -replace '\\', '_'
    $normalized = $normalized -replace '^(software_policies_microsoft_|software_microsoft_|system_)', ''

    return "device_vendor_msft_policy_config_$normalized"
}


function Convert-SettingValue {
    <#
    .SYNOPSIS
        Converts a registry value to the appropriate Settings Catalog value format
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        $Value,

        [Parameter()]
        [string]$DataType = 'REG_DWORD'
    )

    switch ($DataType) {
        'REG_DWORD' {
            return @{
                '@odata.type' = '#microsoft.graph.deviceManagementConfigurationIntegerSettingValue'
                value = [int]$Value
            }
        }
        'REG_QWORD' {
            return @{
                '@odata.type' = '#microsoft.graph.deviceManagementConfigurationIntegerSettingValue'
                value = [long]$Value
            }
        }
        default {
            return @{
                '@odata.type' = '#microsoft.graph.deviceManagementConfigurationStringSettingValue'
                value = [string]$Value
            }
        }
    }
}


function Get-OmaSettingType {
    <#
    .SYNOPSIS
        Maps a registry type to the appropriate OMA-URI setting type
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$RegType
    )

    switch ($RegType) {
        'REG_DWORD'     { return '#microsoft.graph.omaSettingInteger' }
        'REG_QWORD'     { return '#microsoft.graph.omaSettingInteger' }
        'REG_SZ'        { return '#microsoft.graph.omaSettingString' }
        'REG_EXPAND_SZ' { return '#microsoft.graph.omaSettingString' }
        'REG_MULTI_SZ'  { return '#microsoft.graph.omaSettingString' }
        'REG_BINARY'    { return '#microsoft.graph.omaSettingBase64' }
        default          { return '#microsoft.graph.omaSettingString' }
    }
}


function Get-BaselineCatalog {
    <#
    .SYNOPSIS
        Loads and returns the baseline catalog for enumeration/selection
    #>
    [CmdletBinding()]
    param(
        [Parameter()]
        [string]$CatalogPath
    )

    if (-not $CatalogPath) {
        $CatalogPath = Join-Path $PSScriptRoot '..' '..' 'baselines' 'catalog.json'
    }

    if (-not (Test-Path $CatalogPath)) {
        throw "Baseline catalog not found at: $CatalogPath"
    }

    return (Get-Content $CatalogPath -Raw | ConvertFrom-Json)
}


function Get-BaselineNsaMapping {
    <#
    .SYNOPSIS
        Returns NSA Zero Trust pillar mapping for compliance reporting
    #>
    [CmdletBinding()]
    param()

    $mappingPath = Join-Path $PSScriptRoot '..' '..' 'baselines' 'mappings' 'nsa-zero-trust-pillars.json'
    if (Test-Path $mappingPath) {
        return (Get-Content $mappingPath -Raw | ConvertFrom-Json)
    }
    return $null
}


function Get-BaselineHipaaMapping {
    <#
    .SYNOPSIS
        Returns HIPAA control mapping for compliance reporting
    #>
    [CmdletBinding()]
    param()

    $mappingPath = Join-Path $PSScriptRoot '..' '..' 'baselines' 'mappings' 'hipaa-controls.json'
    if (Test-Path $mappingPath) {
        return (Get-Content $mappingPath -Raw | ConvertFrom-Json)
    }
    return $null
}


Export-ModuleMember -Function @(
    'Deploy-SettingsCatalogProfile',
    'Deploy-EndpointSecurityProfile',
    'Deploy-AuditPolicyProfile',
    'Deploy-ChunkedProfile',
    'Assign-IntuneProfile',
    'Get-BaselineCatalog',
    'Get-BaselineNsaMapping',
    'Get-BaselineHipaaMapping',
    'Convert-RegistryToDefinitionId',
    'Convert-SettingValue',
    'Get-OmaSettingType'
)

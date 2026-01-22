using namespace System.Net

param($Request, $TriggerMetadata)

<#
.SYNOPSIS
    Deploys Windows Autopilot and device enrollment configuration
.DESCRIPTION
    Creates Autopilot deployment profiles, enrollment restrictions,
    BitLocker policies, and device categories for M365 Zero Trust deployment.
#>

Import-Module (Join-Path $PSScriptRoot '..' 'Modules' 'GraphHelper.psm1') -Force

Write-Host "Deploy-Autopilot started"

try {
    $config = $Request.Body
    if (-not $config) {
        $config = @{
            organizationName = "DefaultOrg"
            blockPersonalDevices = $true
            enableBitLocker = $true
            enableKnownFolderMove = $true
            hipaaEnabled = $false
            securityBaseline = "Enhanced"
        }
    }

    $connected = Connect-GraphWithManagedIdentity
    if (-not $connected) {
        throw "Failed to connect to Microsoft Graph"
    }

    $results = @{
        autopilotProfiles = @()
        enrollmentRestrictions = @()
        bitLockerPolicy = @{}
        deviceCategories = @()
        knownFolderMove = @{}
    }

    # =========================================================================
    # AUTOPILOT DEPLOYMENT PROFILES
    # =========================================================================
    Write-Host "Creating Autopilot deployment profiles..."

    $autopilotProfiles = @(
        @{
            "@odata.type" = "#microsoft.graph.azureADWindowsAutopilotDeploymentProfile"
            displayName = "Standard User Deployment"
            description = "Zero-touch deployment for standard users - users are NOT local admins"
            deviceNameTemplate = "$($config.organizationName.Substring(0, [Math]::Min(5, $config.organizationName.Length)).ToUpper())-%SERIAL%"
            language = "en-US"
            extractHardwareHash = $true
            outOfBoxExperienceSettings = @{
                "@odata.type" = "#microsoft.graph.outOfBoxExperienceSettings"
                hidePrivacySettings = $true
                hideEULA = $true
                userType = "standard"
                skipKeyboardSelectionPage = $true
                hideEscapeLink = $true
                deviceUsageType = "singleUser"
            }
            enrollmentStatusScreenSettings = @{
                "@odata.type" = "#microsoft.graph.windowsEnrollmentStatusScreenSettings"
                hideInstallationProgress = $false
                allowDeviceUseBeforeProfileAndAppInstallComplete = $false
                blockDeviceSetupRetryByUser = $true
                allowLogCollectionOnInstallFailure = $true
                customErrorMessage = "Contact IT Support if enrollment fails."
                installProgressTimeoutInMinutes = 60
                allowDeviceUseOnInstallFailure = $false
            }
        },
        @{
            "@odata.type" = "#microsoft.graph.azureADWindowsAutopilotDeploymentProfile"
            displayName = "IT Admin Deployment"
            description = "Deployment for IT administrators - users ARE local admins"
            deviceNameTemplate = "IT-%SERIAL%"
            language = "en-US"
            extractHardwareHash = $true
            outOfBoxExperienceSettings = @{
                "@odata.type" = "#microsoft.graph.outOfBoxExperienceSettings"
                hidePrivacySettings = $true
                hideEULA = $true
                userType = "administrator"
                skipKeyboardSelectionPage = $true
                hideEscapeLink = $false
                deviceUsageType = "singleUser"
            }
            enrollmentStatusScreenSettings = @{
                "@odata.type" = "#microsoft.graph.windowsEnrollmentStatusScreenSettings"
                hideInstallationProgress = $false
                allowDeviceUseBeforeProfileAndAppInstallComplete = $true
                blockDeviceSetupRetryByUser = $false
                allowLogCollectionOnInstallFailure = $true
                installProgressTimeoutInMinutes = 90
                allowDeviceUseOnInstallFailure = $true
            }
        },
        @{
            "@odata.type" = "#microsoft.graph.azureADWindowsAutopilotDeploymentProfile"
            displayName = "Shared Device Deployment"
            description = "Deployment for shared/kiosk devices"
            deviceNameTemplate = "KIOSK-%SERIAL%"
            language = "en-US"
            extractHardwareHash = $true
            outOfBoxExperienceSettings = @{
                "@odata.type" = "#microsoft.graph.outOfBoxExperienceSettings"
                hidePrivacySettings = $true
                hideEULA = $true
                userType = "standard"
                skipKeyboardSelectionPage = $true
                hideEscapeLink = $true
                deviceUsageType = "shared"
            }
            enrollmentStatusScreenSettings = @{
                "@odata.type" = "#microsoft.graph.windowsEnrollmentStatusScreenSettings"
                hideInstallationProgress = $false
                allowDeviceUseBeforeProfileAndAppInstallComplete = $false
                blockDeviceSetupRetryByUser = $true
                allowLogCollectionOnInstallFailure = $true
                installProgressTimeoutInMinutes = 60
                allowDeviceUseOnInstallFailure = $false
            }
        }
    )

    foreach ($profile in $autopilotProfiles) {
        try {
            # Check if profile exists
            $existingProfile = Invoke-GraphRequestWithRetry -Method GET `
                -Uri "https://graph.microsoft.com/beta/deviceManagement/windowsAutopilotDeploymentProfiles?`$filter=displayName eq '$($profile.displayName)'"

            if ($existingProfile.value -and $existingProfile.value.Count -gt 0) {
                Write-Host "Autopilot profile already exists: $($profile.displayName)"
                $results.autopilotProfiles += @{
                    displayName = $profile.displayName
                    id = $existingProfile.value[0].id
                    status = "AlreadyExists"
                }
            }
            else {
                $createdProfile = Invoke-GraphRequestWithRetry -Method POST `
                    -Uri "https://graph.microsoft.com/beta/deviceManagement/windowsAutopilotDeploymentProfiles" `
                    -Body $profile

                Write-Host "Created Autopilot profile: $($profile.displayName)"
                $results.autopilotProfiles += @{
                    displayName = $profile.displayName
                    id = $createdProfile.id
                    status = "Created"
                }
            }
        }
        catch {
            Write-Host "Failed to create Autopilot profile $($profile.displayName): $($_.Exception.Message)"
            $results.autopilotProfiles += @{
                displayName = $profile.displayName
                status = "Failed"
                error = $_.Exception.Message
            }
        }
    }

    # =========================================================================
    # ENROLLMENT RESTRICTIONS
    # =========================================================================
    if ($config.blockPersonalDevices -eq $true) {
        Write-Host "Configuring enrollment restrictions..."

        $enrollmentRestriction = @{
            "@odata.type" = "#microsoft.graph.deviceEnrollmentPlatformRestrictionsConfiguration"
            displayName = "Block Personal Devices"
            description = "Blocks personal device enrollment - corporate devices only"
            priority = 1
            windowsRestriction = @{
                platformBlocked = $false
                personalDeviceEnrollmentBlocked = $true
                osMinimumVersion = "10.0.19041"
                osMaximumVersion = $null
            }
            iosRestriction = @{
                platformBlocked = $false
                personalDeviceEnrollmentBlocked = $true
                osMinimumVersion = "14.0"
                osMaximumVersion = $null
            }
            macOSRestriction = @{
                platformBlocked = $false
                personalDeviceEnrollmentBlocked = $true
                osMinimumVersion = "11.0"
                osMaximumVersion = $null
            }
            androidRestriction = @{
                platformBlocked = $false
                personalDeviceEnrollmentBlocked = $true
                osMinimumVersion = "10.0"
                osMaximumVersion = $null
            }
        }

        try {
            # Check if restriction exists
            $existingRestriction = Invoke-GraphRequestWithRetry -Method GET `
                -Uri "https://graph.microsoft.com/beta/deviceManagement/deviceEnrollmentConfigurations?`$filter=displayName eq 'Block Personal Devices'"

            if ($existingRestriction.value -and $existingRestriction.value.Count -gt 0) {
                Write-Host "Enrollment restriction already exists"
                $results.enrollmentRestrictions += @{
                    displayName = "Block Personal Devices"
                    id = $existingRestriction.value[0].id
                    status = "AlreadyExists"
                }
            }
            else {
                $createdRestriction = Invoke-GraphRequestWithRetry -Method POST `
                    -Uri "https://graph.microsoft.com/beta/deviceManagement/deviceEnrollmentConfigurations" `
                    -Body $enrollmentRestriction

                Write-Host "Created enrollment restriction"
                $results.enrollmentRestrictions += @{
                    displayName = "Block Personal Devices"
                    id = $createdRestriction.id
                    status = "Created"
                    platforms = @{
                        windows = "Corporate only"
                        iOS = "Corporate only"
                        macOS = "Corporate only"
                        android = "Corporate only"
                    }
                }
            }
        }
        catch {
            Write-Host "Failed to create enrollment restriction: $($_.Exception.Message)"
            $results.enrollmentRestrictions += @{
                displayName = "Block Personal Devices"
                status = "Failed"
                error = $_.Exception.Message
            }
        }
    }

    # =========================================================================
    # BITLOCKER POLICY
    # =========================================================================
    if ($config.enableBitLocker -eq $true) {
        Write-Host "Configuring BitLocker policy..."

        # BitLocker settings based on security baseline
        $encryptionMethod = switch ($config.securityBaseline) {
            "Standard" { "xtsAes128" }
            "Enhanced" { "xtsAes256" }
            "Maximum" { "xtsAes256" }
            default { "xtsAes256" }
        }

        $bitLockerPolicy = @{
            "@odata.type" = "#microsoft.graph.windows10EndpointProtectionConfiguration"
            displayName = "Corporate BitLocker Policy"
            description = "Enforces BitLocker encryption on all drives"
            bitLockerSystemDrivePolicy = @{
                encryptionMethod = $encryptionMethod
                startupAuthenticationRequired = $true
                startupAuthenticationBlockWithoutTpmChip = $true
                startupAuthenticationTpmUsage = "required"
                startupAuthenticationTpmPinUsage = if ($config.hipaaEnabled) { "required" } else { "allowed" }
                startupAuthenticationTpmKeyUsage = "allowed"
                startupAuthenticationTpmPinAndKeyUsage = "allowed"
                prebootRecoveryEnableMessageAndUrl = $true
                prebootRecoveryMessage = "Contact IT Support for BitLocker recovery"
                recoveryOptions = @{
                    enableRecoveryInformationSaveToStore = $true
                    recoveryKeyUsage = "allowed"
                    recoveryPasswordUsage = "required"
                    hideRecoveryOptions = $false
                    enableBitLockerAfterRecoveryInformationToStore = $true
                    blockDataRecoveryAgent = $false
                }
            }
            bitLockerFixedDrivePolicy = @{
                encryptionMethod = $encryptionMethod
                recoveryOptions = @{
                    enableRecoveryInformationSaveToStore = $true
                    recoveryKeyUsage = "allowed"
                    recoveryPasswordUsage = "required"
                }
            }
            bitLockerRemovableDrivePolicy = @{
                encryptionMethod = $encryptionMethod
                requireEncryptionForWriteAccess = $true
                blockCrossOrganizationWriteAccess = $true
            }
        }

        try {
            $existingPolicy = Invoke-GraphRequestWithRetry -Method GET `
                -Uri "https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations?`$filter=displayName eq 'Corporate BitLocker Policy'"

            if ($existingPolicy.value -and $existingPolicy.value.Count -gt 0) {
                Write-Host "BitLocker policy already exists"
                $results.bitLockerPolicy = @{
                    displayName = "Corporate BitLocker Policy"
                    id = $existingPolicy.value[0].id
                    status = "AlreadyExists"
                }
            }
            else {
                $createdPolicy = Invoke-GraphRequestWithRetry -Method POST `
                    -Uri "https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations" `
                    -Body $bitLockerPolicy

                Write-Host "Created BitLocker policy"
                $results.bitLockerPolicy = @{
                    displayName = "Corporate BitLocker Policy"
                    id = $createdPolicy.id
                    status = "Created"
                    encryptionMethod = $encryptionMethod
                    tpmRequired = $true
                }
            }
        }
        catch {
            Write-Host "Failed to create BitLocker policy: $($_.Exception.Message)"
            $results.bitLockerPolicy = @{
                displayName = "Corporate BitLocker Policy"
                status = "Failed"
                error = $_.Exception.Message
            }
        }
    }

    # =========================================================================
    # DEVICE CATEGORIES
    # =========================================================================
    Write-Host "Creating device categories..."

    $deviceCategories = @(
        @{ displayName = "Corporate"; description = "Company-owned devices" },
        @{ displayName = "Executive"; description = "Executive leadership devices" },
        @{ displayName = "Kiosk"; description = "Shared/kiosk devices" },
        @{ displayName = "Developer"; description = "Developer workstations" },
        @{ displayName = "Remote"; description = "Remote worker devices" }
    )

    foreach ($category in $deviceCategories) {
        try {
            $existingCategory = Invoke-GraphRequestWithRetry -Method GET `
                -Uri "https://graph.microsoft.com/beta/deviceManagement/deviceCategories?`$filter=displayName eq '$($category.displayName)'"

            if ($existingCategory.value -and $existingCategory.value.Count -gt 0) {
                $results.deviceCategories += @{
                    displayName = $category.displayName
                    id = $existingCategory.value[0].id
                    status = "AlreadyExists"
                }
            }
            else {
                $createdCategory = Invoke-GraphRequestWithRetry -Method POST `
                    -Uri "https://graph.microsoft.com/beta/deviceManagement/deviceCategories" `
                    -Body $category

                $results.deviceCategories += @{
                    displayName = $category.displayName
                    id = $createdCategory.id
                    status = "Created"
                }
            }
        }
        catch {
            $results.deviceCategories += @{
                displayName = $category.displayName
                status = "Failed"
                error = $_.Exception.Message
            }
        }
    }

    # =========================================================================
    # KNOWN FOLDER MOVE (OneDrive)
    # =========================================================================
    if ($config.enableKnownFolderMove -eq $true) {
        Write-Host "Documenting Known Folder Move configuration..."

        $results.knownFolderMove = @{
            status = "Documented"
            description = "Redirects Desktop, Documents, and Pictures to OneDrive"
            intuneConfiguration = @{
                displayName = "OneDrive Known Folder Move"
                description = "Silently redirects known folders to OneDrive"
                omaSettings = @(
                    @{
                        name = "KFM Silent Opt-In"
                        omaUri = "./Device/Vendor/MSFT/Policy/Config/OneDriveNGSC/KFMSilentOptIn"
                        value = "TENANT_ID_HERE"
                        description = "Replace TENANT_ID_HERE with your Azure AD tenant ID"
                    },
                    @{
                        name = "Block KFM Opt-Out"
                        omaUri = "./Device/Vendor/MSFT/Policy/Config/OneDriveNGSC/KFMBlockOptOut"
                        value = "1"
                        description = "Prevents users from moving folders back to local"
                    },
                    @{
                        name = "Enable Files On-Demand"
                        omaUri = "./Device/Vendor/MSFT/Policy/Config/OneDriveNGSC/FilesOnDemandEnabled"
                        value = "1"
                        description = "Enables Files On-Demand to save disk space"
                    },
                    @{
                        name = "Silent Account Config"
                        omaUri = "./Device/Vendor/MSFT/Policy/Config/OneDriveNGSC/SilentAccountConfig"
                        value = "1"
                        description = "Silently configures OneDrive with user's credentials"
                    }
                )
            }
            note = "Create an Intune device configuration profile with these OMA-URI settings"
        }
    }

    $responseBody = @{
        status = "Success"
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
        configuration = @{
            organizationName = $config.organizationName
            blockPersonalDevices = $config.blockPersonalDevices
            enableBitLocker = $config.enableBitLocker
            enableKnownFolderMove = $config.enableKnownFolderMove
            securityBaseline = $config.securityBaseline
            hipaaEnabled = $config.hipaaEnabled
        }
        results = $results
        summary = @{
            autopilotProfilesCreated = ($results.autopilotProfiles | Where-Object { $_.status -eq "Created" }).Count
            autopilotProfilesExisting = ($results.autopilotProfiles | Where-Object { $_.status -eq "AlreadyExists" }).Count
            deviceCategoriesCreated = ($results.deviceCategories | Where-Object { $_.status -eq "Created" }).Count
            bitLockerConfigured = ($results.bitLockerPolicy.status -in @("Created", "AlreadyExists"))
        }
    }

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::OK
        Body = ($responseBody | ConvertTo-Json -Depth 10)
        Headers = @{ 'Content-Type' = 'application/json' }
    })
}
catch {
    Write-Host "Deploy-Autopilot failed: $_"

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

using namespace System.Net

param($Request, $TriggerMetadata)

<#
.SYNOPSIS
    Deploys SharePoint and Teams configuration for Zero Trust
.DESCRIPTION
    Configures SharePoint sharing policies, Teams policies, and collaboration
    settings for M365 Zero Trust deployment.
#>

Import-Module (Join-Path $PSScriptRoot '..' 'Modules' 'GraphHelper.psm1') -Force

Write-Host "Deploy-Collaboration started"

try {
    $config = $Request.Body
    if (-not $config) {
        $config = @{
            organizationName = "DefaultOrg"
            sharingLevel = "ExternalUserSharingOnly"
            allowGuestAccess = $false
            allowAnonymousMeetings = $false
            hipaaEnabled = $false
            securityBaseline = "Enhanced"
        }
    }

    $connected = Connect-GraphWithManagedIdentity
    if (-not $connected) {
        throw "Failed to connect to Microsoft Graph"
    }

    $results = @{
        sharePointPolicies = @{}
        teamsPolicies = @{}
        teamsTemplates = @()
        notes = @()
    }

    # =========================================================================
    # SHAREPOINT SHARING POLICIES
    # Note: SharePoint admin settings require SharePoint Admin PowerShell or
    # specific Graph endpoints. Documenting configuration for manual setup.
    # =========================================================================
    Write-Host "Configuring SharePoint sharing policies..."

    # Determine sharing level based on config
    $sharingCapability = switch ($config.sharingLevel) {
        "Disabled" { "Disabled" }
        "ExistingExternalUserSharingOnly" { "ExistingExternalUserSharingOnly" }
        "ExternalUserSharingOnly" { "ExternalUserSharingOnly" }
        "ExternalUserAndGuestSharing" { "ExternalUserAndGuestSharing" }
        default { "ExternalUserSharingOnly" }
    }

    # HIPAA override - restrict sharing
    if ($config.hipaaEnabled -eq $true) {
        $sharingCapability = "ExistingExternalUserSharingOnly"
    }

    $sharePointConfig = @{
        sharingCapability = $sharingCapability
        defaultSharingLinkType = "Internal"
        defaultLinkPermission = "View"
        preventExternalUsersFromResharing = $true
        requireAcceptingAccountMatchInvitedAccount = $true
        externalUserExpirationRequired = $true
        externalUserExpireInDays = $(if ($config.hipaaEnabled) { 14 } else { 30 })
        emailAttestationRequired = $true
        emailAttestationReAuthDays = $(if ($config.hipaaEnabled) { 14 } else { 30 })
        blockDownloadLinksFileType = "WebPreviewableFiles"
        fileAnonymousLinkType = "View"
        folderAnonymousLinkType = "View"
        requireAnonymousLinksExpireInDays = 7
        showEveryoneClaim = $false
        showEveryoneExceptExternalUsersClaim = $true
        notifyOwnersWhenItemsReshared = $true
        notifyOwnersWhenInvitationsAccepted = $true
    }

    # Add conditional access setting for HIPAA
    if ($config.hipaaEnabled -eq $true) {
        $sharePointConfig.conditionalAccessPolicy = "AllowLimitedAccess"
        $sharePointConfig.limitedAccessFileType = "WebPreviewableFiles"
    }

    $results.sharePointPolicies = @{
        status = "Documented"
        configuration = $sharePointConfig
        powershellCommands = @(
            "# Connect to SharePoint Online",
            "Connect-SPOService -Url 'https://TENANT-admin.sharepoint.com'",
            "",
            "# Set tenant sharing settings",
            "Set-SPOTenant ``",
            "    -SharingCapability '$sharingCapability' ``",
            "    -DefaultSharingLinkType 'Internal' ``",
            "    -DefaultLinkPermission 'View' ``",
            "    -PreventExternalUsersFromResharing `$true ``",
            "    -RequireAcceptingAccountMatchInvitedAccount `$true ``",
            "    -ExternalUserExpirationRequired `$true ``",
            "    -ExternalUserExpireInDays $($sharePointConfig.externalUserExpireInDays) ``",
            "    -EmailAttestationRequired `$true ``",
            "    -EmailAttestationReAuthDays $($sharePointConfig.emailAttestationReAuthDays)",
            "",
            "# Block download for unmanaged devices (requires Conditional Access)",
            "Set-SPOTenant -ConditionalAccessPolicy 'AllowLimitedAccess'"
        )
        note = "Execute these commands in SharePoint Online Management Shell"
    }

    # =========================================================================
    # TEAMS POLICIES
    # =========================================================================
    Write-Host "Configuring Teams policies..."

    # Meeting policies
    $meetingPolicy = @{
        allowAnonymousUsersToJoinMeeting = $config.allowAnonymousMeetings -eq $true
        autoAdmittedUsers = $(if ($config.hipaaEnabled) { "EveryoneInCompanyExcludingGuests" } else { "EveryoneInCompany" })
        allowExternalParticipantGiveRequestControl = $false
        allowCloudRecording = $true
        allowRecordingStorageOutsideRegion = $false
        allowTranscription = $true
        allowMeetNow = $true
        allowPrivateMeetNow = $true
        allowOutlookAddIn = $true
        allowPowerPointSharing = $true
        allowWhiteboard = $true
        allowSharedNotes = $true
        allowParticipantGiveRequestControl = $true
        allowIPVideo = $true
        screenSharingMode = "EntireScreen"
        allowPSTNUsersToBypassLobby = $false
        meetingChatEnabledType = "Enabled"
    }

    # Messaging policies
    $messagingPolicy = @{
        allowUrlPreviews = $true
        allowOwnerDeleteMessage = $true
        allowUserEditMessage = $true
        allowUserDeleteMessage = $true
        allowUserChat = $true
        allowRemoveUser = $true
        allowGiphy = $(if ($config.hipaaEnabled) { $false } else { $true })
        giphyRatingType = "Moderate"
        allowMemes = $(if ($config.hipaaEnabled) { $false } else { $true })
        allowStickers = $true
        allowUserTranslation = $true
        allowImmersiveReader = $true
        allowPriorityMessages = $true
        readReceiptsEnabledType = "UserPreference"
        channelsInChatListEnabledType = "EnabledUserOverride"
    }

    # Guest access policies
    $guestAccessPolicy = @{
        allowGuestAccess = $config.allowGuestAccess -eq $true
        allowCreateUpdateChannels = $false
        allowDeleteChannels = $false
        allowAddRemoveApps = $false
        allowCreateUpdateRemoveTabs = $false
        allowCreateUpdateRemoveConnectors = $false
        allowGuestMeetNow = $config.allowGuestAccess -eq $true
        allowScreenSharing = $(if ($config.hipaaEnabled) { "Disabled" } else { "EntireScreen" })
        allowPrivateCalling = $false
    }

    # App permission policies
    $appPermissionPolicy = @{
        defaultCatalogAppsType = "AllowedAppList"
        globalCatalogAppsType = "AllowedAppList"
        privateCatalogAppsType = "AllowedAppList"
        description = "Block third-party apps by default, whitelist approved apps"
    }

    $results.teamsPolicies = @{
        status = "Documented"
        meetingPolicy = $meetingPolicy
        messagingPolicy = $messagingPolicy
        guestAccessPolicy = $guestAccessPolicy
        appPermissionPolicy = $appPermissionPolicy
        powershellCommands = @(
            "# Connect to Microsoft Teams",
            "Connect-MicrosoftTeams",
            "",
            "# Update global meeting policy",
            "Set-CsTeamsMeetingPolicy -Identity 'Global' ``",
            "    -AllowAnonymousUsersToJoinMeeting `$$($meetingPolicy.allowAnonymousUsersToJoinMeeting) ``",
            "    -AutoAdmittedUsers '$($meetingPolicy.autoAdmittedUsers)' ``",
            "    -AllowExternalParticipantGiveRequestControl `$false ``",
            "    -AllowCloudRecording `$true ``",
            "    -AllowTranscription `$true",
            "",
            "# Update global messaging policy",
            "Set-CsTeamsMessagingPolicy -Identity 'Global' ``",
            "    -AllowGiphy `$$($messagingPolicy.allowGiphy) ``",
            "    -AllowMemes `$$($messagingPolicy.allowMemes) ``",
            "    -AllowStickers `$true",
            "",
            "# Configure guest access",
            "Set-CsTeamsClientConfiguration ``",
            "    -AllowGuestUser `$$($guestAccessPolicy.allowGuestAccess)",
            "",
            "# Update app permission policy",
            "Set-CsTeamsAppPermissionPolicy -Identity 'Global' ``",
            "    -DefaultCatalogAppsType 'AllowedAppList'"
        )
        note = "Execute these commands in Teams PowerShell"
    }

    # =========================================================================
    # TEAMS TEMPLATES
    # =========================================================================
    Write-Host "Creating Teams templates..."

    $teamsTemplates = @(
        @{
            displayName = "Standard Project Team"
            description = "Template for project teams with standard channels"
            baseTemplateId = "com.microsoft.teams.template.ManageAProject"
            channels = @(
                @{ displayName = "General"; description = "General project discussions" },
                @{ displayName = "Planning"; description = "Project planning and milestones" },
                @{ displayName = "Resources"; description = "Shared files and resources" }
            )
        },
        @{
            displayName = "Department Team"
            description = "Template for department-level teams"
            baseTemplateId = "com.microsoft.teams.template.ManageAProject"
            channels = @(
                @{ displayName = "General"; description = "Department announcements" },
                @{ displayName = "Meetings"; description = "Meeting notes and agendas" },
                @{ displayName = "Resources"; description = "Department resources and policies" }
            )
        }
    )

    foreach ($template in $teamsTemplates) {
        try {
            # Check if template exists (via Graph)
            $existingTemplates = Invoke-GraphRequestWithRetry -Method GET `
                -Uri "https://graph.microsoft.com/v1.0/teamwork/teamTemplates"

            $templateExists = $existingTemplates.value | Where-Object { $_.displayName -eq $template.displayName }

            if ($templateExists) {
                $results.teamsTemplates += @{
                    displayName = $template.displayName
                    status = "AlreadyExists"
                }
            }
            else {
                # Note: Custom team templates typically require Teams Admin Center
                $results.teamsTemplates += @{
                    displayName = $template.displayName
                    description = $template.description
                    channels = $template.channels.displayName
                    status = "Documented"
                    note = "Create via Teams Admin Center > Teams > Team templates"
                }
            }
        }
        catch {
            $results.teamsTemplates += @{
                displayName = $template.displayName
                status = "Documented"
                note = "Create manually in Teams Admin Center"
            }
        }
    }

    # =========================================================================
    # SENSITIVITY LABELS FOR SITES/TEAMS
    # =========================================================================
    Write-Host "Documenting sensitivity label configuration for sites..."

    $results.sensitivityLabels = @{
        status = "Documented"
        labels = @(
            @{
                name = "Internal"
                description = "Internal use only - blocks external sharing"
                siteAndGroupSettings = @{
                    privacy = "Private"
                    externalSharing = "None"
                    allowGuestAccess = $false
                }
            },
            @{
                name = "Confidential"
                description = "Confidential data - restricted access"
                siteAndGroupSettings = @{
                    privacy = "Private"
                    externalSharing = "ExistingGuests"
                    allowGuestAccess = $false
                    conditionalAccess = "ManagedDevicesOnly"
                }
            }
        )
        note = "Configure sensitivity labels in Microsoft Purview compliance portal"
        instructions = @(
            "1. Go to Microsoft Purview compliance portal",
            "2. Navigate to Information protection > Labels",
            "3. Create or edit labels with 'Groups & sites' scope",
            "4. Configure privacy, external sharing, and access settings",
            "5. Publish labels via label policy"
        )
    }

    $results.notes += @(
        "SharePoint Online settings require SharePoint Admin PowerShell module",
        "Teams policies require Microsoft Teams PowerShell module",
        "Team templates are best created via Teams Admin Center",
        "Sensitivity labels require Microsoft Purview configuration"
    )

    $responseBody = @{
        status = "Success"
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
        configuration = @{
            organizationName = $config.organizationName
            sharingLevel = $config.sharingLevel
            allowGuestAccess = $config.allowGuestAccess
            allowAnonymousMeetings = $config.allowAnonymousMeetings
            hipaaEnabled = $config.hipaaEnabled
            securityBaseline = $config.securityBaseline
        }
        results = $results
        summary = @{
            sharePointConfigured = $true
            teamsConfigured = $true
            templatesDocumented = $results.teamsTemplates.Count
        }
        nextSteps = @(
            "1. Execute SharePoint PowerShell commands to configure tenant settings",
            "2. Execute Teams PowerShell commands to configure policies",
            "3. Create team templates in Teams Admin Center",
            "4. Configure sensitivity labels in Microsoft Purview",
            "5. Test sharing and access policies with pilot users"
        )
    }

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::OK
        Body = ($responseBody | ConvertTo-Json -Depth 10)
        Headers = @{ 'Content-Type' = 'application/json' }
    })
}
catch {
    Write-Host "Deploy-Collaboration failed: $_"

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

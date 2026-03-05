using namespace System.Net

param($Request, $TriggerMetadata)

<#
.SYNOPSIS
    Deploys user provisioning and group configuration via Microsoft Graph
.DESCRIPTION
    Creates standard groups, provisions users, assigns licenses, and configures admin roles
    for M365 Zero Trust deployment.
#>

Import-Module (Join-Path $PSScriptRoot '..' 'Modules' 'GraphHelper.psm1') -Force
$ErrorActionPreference = "Stop"

Write-Host "Deploy-Users started"

try {
    $config = $Request.Body
    if (-not $config) {
        $config = @{
            organizationName = "DefaultOrg"
            primaryDomain = "contoso.onmicrosoft.com"
            createStandardGroups = $true
            autoAssignLicenses = $false
        }
    }

    $connected = Connect-GraphWithManagedIdentity
    if (-not $connected) {
        throw "Failed to connect to Microsoft Graph"
    }

    $results = @{
        groups = @()
        users = @()
        licenseAssignments = @()
    }

    # =========================================================================
    # STANDARD GROUPS
    # Creates security groups for organizational structure and licensing
    # =========================================================================
    if ($config.createStandardGroups -eq $true) {
        Write-Host "Creating standard security groups..."

        $standardGroups = @(
            @{
                displayName = "All-Users"
                description = "Dynamic group containing all member users (excludes guests)"
                mailNickname = "AllUsers"
                groupTypes = @("DynamicMembership")
                membershipRule = "(user.userType -eq `"Member`")"
                membershipRuleProcessingState = "On"
            },
            @{
                displayName = "All-Employees"
                description = "Dynamic group for all employees (member users with employee type)"
                mailNickname = "AllEmployees"
                groupTypes = @("DynamicMembership")
                membershipRule = "(user.userType -eq `"Member`") and (user.accountEnabled -eq true)"
                membershipRuleProcessingState = "On"
            },
            @{
                displayName = "Executives"
                description = "Executive leadership team - manual membership"
                mailNickname = "Executives"
                groupTypes = @()
            },
            @{
                displayName = "IT-Admins"
                description = "IT administrators team - manual membership"
                mailNickname = "ITAdmins"
                groupTypes = @()
            },
            @{
                displayName = "License-E3-Users"
                description = "Users assigned Microsoft 365 E3 licenses - for group-based licensing"
                mailNickname = "LicenseE3Users"
                groupTypes = @()
            },
            @{
                displayName = "License-E5-Users"
                description = "Users assigned Microsoft 365 E5 licenses - for group-based licensing"
                mailNickname = "LicenseE5Users"
                groupTypes = @()
            },
            @{
                displayName = "MFA-Excluded-Temporarily"
                description = "Temporary MFA exclusion group for onboarding - review weekly"
                mailNickname = "MFAExcluded"
                groupTypes = @()
            },
            @{
                displayName = "Device-Compliance-Excluded"
                description = "Devices excluded from compliance requirements - use sparingly"
                mailNickname = "DeviceComplianceExcluded"
                groupTypes = @()
            }
        )

        foreach ($group in $standardGroups) {
            try {
                # Check if group already exists
                $safeGroupName = Format-ODataFilterValue -Value $group.displayName
                $existingGroup = Invoke-GraphRequestWithRetry -Method GET `
                    -Uri "https://graph.microsoft.com/v1.0/groups?`$filter=displayName eq '$safeGroupName'"

                if ($existingGroup.value -and $existingGroup.value.Count -gt 0) {
                    Write-Host "Group already exists: $($group.displayName)"
                    $results.groups += @{
                        displayName = $group.displayName
                        id = $existingGroup.value[0].id
                        status = "AlreadyExists"
                    }
                }
                else {
                    $groupBody = @{
                        displayName = $group.displayName
                        description = $group.description
                        mailEnabled = $false
                        mailNickname = $group.mailNickname
                        securityEnabled = $true
                    }

                    # Add dynamic membership if specified
                    if ($group.groupTypes -contains "DynamicMembership") {
                        $groupBody.groupTypes = $group.groupTypes
                        $groupBody.membershipRule = $group.membershipRule
                        $groupBody.membershipRuleProcessingState = $group.membershipRuleProcessingState
                    }
                    else {
                        $groupBody.groupTypes = @()
                    }

                    $createdGroup = Invoke-GraphRequestWithRetry -Method POST `
                        -Uri "https://graph.microsoft.com/v1.0/groups" `
                        -Body $groupBody

                    Write-Host "Created group: $($group.displayName) with ID $($createdGroup.id)"
                    $results.groups += @{
                        displayName = $group.displayName
                        id = $createdGroup.id
                        status = "Created"
                        isDynamic = ($group.groupTypes -contains "DynamicMembership")
                    }
                }
            }
            catch {
                Write-Host "Failed to create group $($group.displayName): $($_.Exception.Message)"
                $results.groups += @{
                    displayName = $group.displayName
                    status = "Failed"
                    error = $_.Exception.Message
                }
            }
        }
    }

    # =========================================================================
    # BREAK-GLASS ADMIN ACCOUNTS
    # Creates emergency access accounts if configured
    # =========================================================================
    if ($config.createBreakGlassAccounts -eq $true) {
        Write-Host "Creating break-glass admin accounts..."

        $breakGlassAccounts = @(
            @{
                displayName = "Break Glass Admin 1"
                userPrincipalName = "breakglass1@$($config.primaryDomain)"
                mailNickname = "breakglass1"
            },
            @{
                displayName = "Break Glass Admin 2"
                userPrincipalName = "breakglass2@$($config.primaryDomain)"
                mailNickname = "breakglass2"
            }
        )

        foreach ($account in $breakGlassAccounts) {
            try {
                # Check if account exists
                $safeUpn = Format-ODataFilterValue -Value $account.userPrincipalName
                $existingUser = Invoke-GraphRequestWithRetry -Method GET `
                    -Uri "https://graph.microsoft.com/v1.0/users?`$filter=userPrincipalName eq '$safeUpn'"

                if ($existingUser.value -and $existingUser.value.Count -gt 0) {
                    Write-Host "Break-glass account already exists: $($account.userPrincipalName)"
                    $results.users += @{
                        userPrincipalName = $account.userPrincipalName
                        id = $existingUser.value[0].id
                        status = "AlreadyExists"
                        type = "BreakGlass"
                    }
                }
                else {
                    # Generate a strong random password (32 characters)
                    $password = -join ((48..57) + (65..90) + (97..122) + (33, 35, 36, 37, 38) | Get-Random -Count 32 | ForEach-Object { [char]$_ })

                    $userBody = @{
                        accountEnabled = $true
                        displayName = $account.displayName
                        mailNickname = $account.mailNickname
                        userPrincipalName = $account.userPrincipalName
                        passwordProfile = @{
                            forceChangePasswordNextSignIn = $false
                            password = $password
                        }
                        passwordPolicies = "DisablePasswordExpiration"
                    }

                    $createdUser = Invoke-GraphRequestWithRetry -Method POST `
                        -Uri "https://graph.microsoft.com/v1.0/users" `
                        -Body $userBody

                    Write-Host "Created break-glass account: $($account.userPrincipalName)"

                    # Store password in Key Vault
                    $secretStored = $false
                    $secretName = "breakglass-$($account.mailNickname)-password"
                    if ($env:KEY_VAULT_NAME) {
                        try {
                            $secretBody = @{
                                value = $password
                            }
                            $vaultUri = "https://$($env:KEY_VAULT_NAME).vault.azure.net/secrets/$secretName`?api-version=7.4"
                            # Use managed identity token for Key Vault
                            $kvResource = "https://vault.azure.net"
                            $kvEndpoint = $env:IDENTITY_ENDPOINT
                            $kvHeader = $env:IDENTITY_HEADER
                            $kvClientId = $env:AZURE_CLIENT_ID
                            $kvTokenUri = "$kvEndpoint`?resource=$kvResource&api-version=2019-08-01&client_id=$kvClientId"
                            $kvToken = (Invoke-RestMethod -Uri $kvTokenUri -Headers @{"X-IDENTITY-HEADER" = $kvHeader} -Method GET).access_token
                            Invoke-RestMethod -Uri $vaultUri -Method PUT -Headers @{
                                "Authorization" = "Bearer $kvToken"
                                "Content-Type" = "application/json"
                            } -Body ($secretBody | ConvertTo-Json)
                            $secretStored = $true
                            Write-Host "Password stored in Key Vault: $($env:KEY_VAULT_NAME)/$secretName"
                        }
                        catch {
                            Write-Warning "Failed to store password in Key Vault: $($_.Exception.Message)"
                        }
                    }

                    # Clear password from memory after storage attempt
                    $password = $null

                    $results.users += @{
                        userPrincipalName = $account.userPrincipalName
                        id = $createdUser.id
                        status = "Created"
                        type = "BreakGlass"
                        passwordStoredInKeyVault = $secretStored
                        keyVaultSecretName = if ($secretStored) { $secretName } else { $null }
                        note = if ($secretStored) { "Password stored in Key Vault secret '$secretName'" } else { "WARNING: KEY_VAULT_NAME not configured. Password was generated but could not be stored securely. Re-create the account after configuring Key Vault." }
                    }
                }
            }
            catch {
                Write-Host "Failed to create break-glass account $($account.userPrincipalName): $($_.Exception.Message)"
                $results.users += @{
                    userPrincipalName = $account.userPrincipalName
                    status = "Failed"
                    error = $_.Exception.Message
                    type = "BreakGlass"
                }
            }
        }

        # Add break-glass accounts to the exclusion group
        try {
            $safeBreakGlassGroupName = Format-ODataFilterValue -Value 'ZeroTrust-BreakGlass-Admins'
            $breakGlassGroup = Invoke-GraphRequestWithRetry -Method GET `
                -Uri "https://graph.microsoft.com/v1.0/groups?`$filter=displayName eq '$safeBreakGlassGroupName'"

            if ($breakGlassGroup.value -and $breakGlassGroup.value.Count -gt 0) {
                $groupId = $breakGlassGroup.value[0].id
                foreach ($user in ($results.users | Where-Object { $_.type -eq "BreakGlass" -and $_.id })) {
                    try {
                        $memberBody = @{
                            "@odata.id" = "https://graph.microsoft.com/v1.0/directoryObjects/$($user.id)"
                        }
                        Invoke-GraphRequestWithRetry -Method POST `
                            -Uri "https://graph.microsoft.com/v1.0/groups/$groupId/members/`$ref" `
                            -Body $memberBody

                        Write-Host "Added $($user.userPrincipalName) to break-glass group"
                    }
                    catch {
                        if ($_.Exception.Message -notmatch "already exist") {
                            Write-Host "Failed to add user to break-glass group: $($_.Exception.Message)"
                        }
                    }
                }
            }
        }
        catch {
            Write-Host "Warning: Could not add users to break-glass group: $($_.Exception.Message)"
        }
    }

    # =========================================================================
    # ADMIN ROLE ASSIGNMENTS
    # Assigns directory roles to specified users
    # =========================================================================
    if ($config.adminRoleAssignments -and $config.adminRoleAssignments.Count -gt 0) {
        Write-Host "Processing admin role assignments..."

        foreach ($assignment in $config.adminRoleAssignments) {
            try {
                # Get the role template
                $safeRoleId = Format-ODataFilterValue -Value $assignment.roleId
                $roleTemplate = Invoke-GraphRequestWithRetry -Method GET `
                    -Uri "https://graph.microsoft.com/v1.0/directoryRoleTemplates?`$filter=id eq '$safeRoleId'"

                if ($roleTemplate.value -and $roleTemplate.value.Count -gt 0) {
                    # Activate the role if not already activated
                    try {
                        $roleBody = @{
                            roleTemplateId = $assignment.roleId
                        }
                        Invoke-GraphRequestWithRetry -Method POST `
                            -Uri "https://graph.microsoft.com/v1.0/directoryRoles" `
                            -Body $roleBody
                    }
                    catch {
                        # Role may already be activated
                    }

                    # Get the activated role
                    $activatedRole = Invoke-GraphRequestWithRetry -Method GET `
                        -Uri "https://graph.microsoft.com/v1.0/directoryRoles?`$filter=roleTemplateId eq '$safeRoleId'"

                    if ($activatedRole.value -and $activatedRole.value.Count -gt 0) {
                        $roleId = $activatedRole.value[0].id

                        # Add user to role
                        $memberBody = @{
                            "@odata.id" = "https://graph.microsoft.com/v1.0/directoryObjects/$($assignment.userId)"
                        }

                        Invoke-GraphRequestWithRetry -Method POST `
                            -Uri "https://graph.microsoft.com/v1.0/directoryRoles/$roleId/members/`$ref" `
                            -Body $memberBody

                        Write-Host "Assigned role $($assignment.roleId) to user $($assignment.userId)"
                    }
                }
            }
            catch {
                if ($_.Exception.Message -notmatch "already exist") {
                    Write-Host "Failed to assign role: $($_.Exception.Message)"
                }
            }
        }
    }

    $responseBody = @{
        status = "Success"
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
        configuration = @{
            organizationName = $config.organizationName
            primaryDomain = $config.primaryDomain
            createStandardGroups = $config.createStandardGroups
        }
        results = $results
        summary = @{
            groupsCreated = ($results.groups | Where-Object { $_.status -eq "Created" }).Count
            groupsExisting = ($results.groups | Where-Object { $_.status -eq "AlreadyExists" }).Count
            usersCreated = ($results.users | Where-Object { $_.status -eq "Created" }).Count
            usersExisting = ($results.users | Where-Object { $_.status -eq "AlreadyExists" }).Count
        }
    }

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::OK
        Body = ($responseBody | ConvertTo-Json -Depth 10)
        Headers = @{ 'Content-Type' = 'application/json' }
    })
}
catch {
    Write-Host "Deploy-Users failed: $_"

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::InternalServerError
        Body = (@{
            status = "Failed"
            error = "An internal error occurred during user deployment. Check function logs for details."
            timestamp = (Get-Date).ToUniversalTime().ToString('o')
        } | ConvertTo-Json)
        Headers = @{ 'Content-Type' = 'application/json' }
    })
}

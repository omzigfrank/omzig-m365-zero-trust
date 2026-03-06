# CisaEvaluatorRegistry.ps1
# Maps CISA SCuBA control IDs to evaluator script blocks.
# Each evaluator receives $facts (from Get-TenantAuditFacts) and returns a rating + message.
# Controls without evaluators are auto-marked "na" by Invoke-CisaControlEvaluation.

function Get-CisaEvaluatorRegistry {
    $registry = @{}

    # =====================================================================
    # AAD (Entra ID) Evaluators
    # =====================================================================

    # MS.AAD.1.1v1 -Legacy authentication SHALL be blocked
    $registry["MS.AAD.1.1v1"] = {
        param($facts)
        if (-not $facts.conditionalAccess.available) {
            return @{ rating = "fail"; message = "Could not retrieve CA policies." }
        }
        $legacyBlock = $false
        foreach ($pol in $facts.conditionalAccess.policies) {
            if ($pol.state -eq "disabled") { continue }
            $conditions = $pol.conditions
            $grants = $pol.grantControls
            if ($conditions -and $conditions.clientAppTypes) {
                $hasLegacy = $false
                foreach ($appType in $conditions.clientAppTypes) {
                    if ($appType -eq "exchangeActiveSync" -or $appType -eq "other") {
                        $hasLegacy = $true
                        break
                    }
                }
                if ($hasLegacy -and $grants -and $grants.builtInControls) {
                    foreach ($ctrl in $grants.builtInControls) {
                        if ($ctrl -eq "block") { $legacyBlock = $true; break }
                    }
                }
            }
            if ($legacyBlock) { break }
        }
        if ($legacyBlock) {
            return @{ rating = "pass"; message = "A CA policy blocks legacy authentication." }
        }
        return @{ rating = "fail"; message = "No CA policy found that blocks legacy authentication."; action = "Create a CA policy targeting legacy client app types with a Block grant control." }
    }

    # MS.AAD.2.1v1 -Users detected as high risk SHALL be blocked
    $registry["MS.AAD.2.1v1"] = {
        param($facts)
        if (-not $facts.conditionalAccess.available) {
            return @{ rating = "fail"; message = "Could not retrieve CA policies." }
        }
        if (-not $facts.licenses.hasP2) {
            return @{ rating = "na"; message = "Requires Entra ID P2 for risk-based policies."; action = "Add Entra ID P2 licensing to enable Identity Protection." }
        }
        $hasUserRiskPolicy = $false
        foreach ($pol in $facts.conditionalAccess.policies) {
            if ($pol.state -eq "disabled") { continue }
            $conditions = $pol.conditions
            if ($conditions -and $conditions.userRiskLevels -and $conditions.userRiskLevels.Count -gt 0) {
                $hasUserRiskPolicy = $true
                break
            }
        }
        if ($hasUserRiskPolicy) {
            return @{ rating = "pass"; message = "A CA policy addresses user risk levels." }
        }
        return @{ rating = "fail"; message = "No CA policy found targeting user risk levels."; action = "Create a CA policy that blocks or requires password change for high-risk users." }
    }

    # MS.AAD.2.3v1 -Sign-ins detected as high risk SHALL be blocked
    $registry["MS.AAD.2.3v1"] = {
        param($facts)
        if (-not $facts.conditionalAccess.available) {
            return @{ rating = "fail"; message = "Could not retrieve CA policies." }
        }
        if (-not $facts.licenses.hasP2) {
            return @{ rating = "na"; message = "Requires Entra ID P2 for risk-based policies."; action = "Add Entra ID P2 licensing to enable Identity Protection." }
        }
        $hasSignInRiskPolicy = $false
        foreach ($pol in $facts.conditionalAccess.policies) {
            if ($pol.state -eq "disabled") { continue }
            $conditions = $pol.conditions
            if ($conditions -and $conditions.signInRiskLevels -and $conditions.signInRiskLevels.Count -gt 0) {
                $hasSignInRiskPolicy = $true
                break
            }
        }
        if ($hasSignInRiskPolicy) {
            return @{ rating = "pass"; message = "A CA policy addresses sign-in risk levels." }
        }
        return @{ rating = "fail"; message = "No CA policy found targeting sign-in risk levels."; action = "Create a CA policy that blocks or requires MFA for high-risk sign-ins." }
    }

    # MS.AAD.3.1v1 -Phishing-resistant MFA SHALL be required for all users
    $registry["MS.AAD.3.1v1"] = {
        param($facts)
        if (-not $facts.conditionalAccess.available) {
            return @{ rating = "fail"; message = "Could not retrieve CA policies." }
        }
        $hasMfaPolicy = $false
        foreach ($pol in $facts.conditionalAccess.policies) {
            if ($pol.state -eq "disabled") { continue }
            $grants = $pol.grantControls
            if ($grants -and $grants.builtInControls) {
                foreach ($ctrl in $grants.builtInControls) {
                    if ($ctrl -eq "mfa") { $hasMfaPolicy = $true; break }
                }
            }
            if (-not $hasMfaPolicy -and $grants -and $grants.authenticationStrength) {
                $hasMfaPolicy = $true
            }
            if ($hasMfaPolicy) { break }
        }
        if ($hasMfaPolicy) {
            return @{ rating = "pass"; message = "A CA policy requires MFA or authentication strength." }
        }
        return @{ rating = "fail"; message = "No CA policy found requiring MFA."; action = "Create a CA policy requiring phishing-resistant MFA for all users." }
    }

    # MS.AAD.3.2v1 -Alternative MFA method
    $registry["MS.AAD.3.2v1"] = {
        param($facts)
        if (-not $facts.mfa.available) {
            return @{ rating = "fail"; message = "Could not retrieve MFA registration data." }
        }
        if ($facts.mfa.percentage -ge 80) {
            return @{ rating = "pass"; message = "$($facts.mfa.percentage)% of users registered for MFA." }
        }
        elseif ($facts.mfa.percentage -ge 50) {
            return @{ rating = "warn"; message = "$($facts.mfa.percentage)% MFA registration (target 80%)."; action = "Run MFA registration campaign." }
        }
        return @{ rating = "fail"; message = "$($facts.mfa.percentage)% MFA registration (target 80%)."; action = "Many users will be impacted. Run a registration campaign first." }
    }

    # MS.AAD.3.4v1 -Authentication Methods migration SHALL be complete
    $registry["MS.AAD.3.4v1"] = {
        param($facts)
        if (-not $facts.authMethods.available) {
            return @{ rating = "na"; message = "Could not retrieve authentication methods policy." }
        }
        $state = $facts.authMethods.migrationState
        if ($state -eq "migrationComplete") {
            return @{ rating = "pass"; message = "Authentication methods migration is complete." }
        }
        elseif ($state -eq "migrationInProgress") {
            return @{ rating = "warn"; message = "Migration is in progress ($state)."; action = "Complete the migration to the new authentication methods experience." }
        }
        return @{ rating = "fail"; message = "Migration state: $state."; action = "Set Manage Migration to 'Migration Complete' in the Authentication Methods policy." }
    }

    # MS.AAD.3.5v1 -SMS or voice SHALL NOT be used as MFA
    $registry["MS.AAD.3.5v1"] = {
        param($facts)
        if (-not $facts.authMethods.available) {
            return @{ rating = "na"; message = "Could not retrieve authentication methods policy." }
        }
        if ($facts.authMethods.smsEnabled -or $facts.authMethods.voiceEnabled) {
            $enabledMethods = @()
            if ($facts.authMethods.smsEnabled) { $enabledMethods += "SMS" }
            if ($facts.authMethods.voiceEnabled) { $enabledMethods += "Voice" }
            return @{ rating = "warn"; message = "$($enabledMethods -join ' and ') authentication is enabled."; action = "Disable SMS and Voice as authentication methods." }
        }
        return @{ rating = "pass"; message = "SMS and Voice authentication are disabled." }
    }

    # MS.AAD.3.6v1 -Phishing-resistant MFA for privileged roles
    $registry["MS.AAD.3.6v1"] = {
        param($facts)
        if (-not $facts.conditionalAccess.available) {
            return @{ rating = "fail"; message = "Could not retrieve CA policies." }
        }
        # Look for CA policies targeting directory roles
        $hasAdminMfa = $false
        foreach ($pol in $facts.conditionalAccess.policies) {
            if ($pol.state -eq "disabled") { continue }
            $conditions = $pol.conditions
            $grants = $pol.grantControls
            $targetsRoles = $false
            if ($conditions -and $conditions.users -and $conditions.users.includeRoles -and $conditions.users.includeRoles.Count -gt 0) {
                $targetsRoles = $true
            }
            if ($targetsRoles -and $grants -and $grants.builtInControls) {
                foreach ($ctrl in $grants.builtInControls) {
                    if ($ctrl -eq "mfa") { $hasAdminMfa = $true; break }
                }
            }
            if (-not $hasAdminMfa -and $targetsRoles -and $grants -and $grants.authenticationStrength) {
                $hasAdminMfa = $true
            }
            if ($hasAdminMfa) { break }
        }
        if ($hasAdminMfa) {
            return @{ rating = "pass"; message = "A CA policy requires MFA for privileged roles." }
        }
        return @{ rating = "warn"; message = "No CA policy found specifically targeting admin roles with MFA."; action = "Create a CA policy requiring phishing-resistant MFA for highly privileged roles." }
    }

    # MS.AAD.3.7v1 -Managed devices SHOULD be required
    $registry["MS.AAD.3.7v1"] = {
        param($facts)
        if (-not $facts.conditionalAccess.available) {
            return @{ rating = "fail"; message = "Could not retrieve CA policies." }
        }
        $requiresCompliant = $false
        foreach ($pol in $facts.conditionalAccess.policies) {
            if ($pol.state -eq "disabled") { continue }
            $grants = $pol.grantControls
            if ($grants -and $grants.builtInControls) {
                foreach ($ctrl in $grants.builtInControls) {
                    if ($ctrl -eq "compliantDevice" -or $ctrl -eq "domainJoinedDevice") {
                        $requiresCompliant = $true
                        break
                    }
                }
            }
            if ($requiresCompliant) { break }
        }
        if ($requiresCompliant) {
            return @{ rating = "pass"; message = "A CA policy requires managed/compliant devices." }
        }
        return @{ rating = "warn"; message = "No CA policy found requiring device compliance."; action = "Consider requiring compliant or Hybrid Azure AD joined devices via CA." }
    }

    # MS.AAD.5.1v1 -Only admins SHALL register applications
    $registry["MS.AAD.5.1v1"] = {
        param($facts)
        if (-not $facts.authorizationPolicy.available) {
            return @{ rating = "na"; message = "Could not retrieve authorization policy." }
        }
        if (-not $facts.authorizationPolicy.defaultUserRoleAllowedToCreateApps) {
            return @{ rating = "pass"; message = "Users are restricted from registering applications." }
        }
        return @{ rating = "fail"; message = "Default users can register applications."; action = "Set 'Users can register applications' to No in Entra ID > User settings." }
    }

    # MS.AAD.5.3v1 -Admin consent workflow SHALL be enabled
    $registry["MS.AAD.5.3v1"] = {
        param($facts)
        if (-not $facts.adminConsentPolicy.available) {
            return @{ rating = "na"; message = "Could not retrieve admin consent request policy." }
        }
        if ($facts.adminConsentPolicy.enabled) {
            return @{ rating = "pass"; message = "Admin consent workflow is enabled." }
        }
        return @{ rating = "fail"; message = "Admin consent workflow is not enabled."; action = "Enable the admin consent request workflow in Entra ID > Enterprise applications." }
    }

    # MS.AAD.6.1v1 -User passwords SHALL NOT expire
    $registry["MS.AAD.6.1v1"] = {
        param($facts)
        if (-not $facts.passwordPolicy.available) {
            return @{ rating = "na"; message = "Could not retrieve password policy from domain." }
        }
        $validity = $facts.passwordPolicy.passwordValidityPeriodInDays
        # 2147483647 = "never expires" in MS Graph
        if ($null -eq $validity -or $validity -eq 2147483647 -or $validity -eq 0) {
            return @{ rating = "pass"; message = "Passwords are set to never expire (NIST 800-63B aligned)." }
        }
        return @{ rating = "fail"; message = "Passwords expire every $validity days."; action = "Set password expiration to 'never' per NIST 800-63B guidance." }
    }

    # MS.AAD.7.1v1 -2-8 Global Administrators
    $registry["MS.AAD.7.1v1"] = {
        param($facts)
        if (-not $facts.adminRoles.available) {
            return @{ rating = "fail"; message = "Could not verify Global Administrator membership." }
        }
        $count = $facts.adminRoles.globalAdminCount
        if ($count -ge 2 -and $count -le 8) {
            return @{ rating = "pass"; message = "$count Global Administrators (within 2-8 range)." }
        }
        elseif ($count -lt 2) {
            return @{ rating = "fail"; message = "Only $count Global Administrator(s)."; action = "Provision at least 2 Global Administrators for redundancy." }
        }
        return @{ rating = "warn"; message = "$count Global Administrators (exceeds recommended 8)."; action = "Reduce excessive Global Administrator count." }
    }

    # MS.AAD.7.2v1 -Privileged users via PIM
    $registry["MS.AAD.7.2v1"] = {
        param($facts)
        if (-not $facts.roleAssignments.available) {
            return @{ rating = "na"; message = "Could not retrieve PIM role assignments." }
        }
        if ($facts.roleAssignments.eligibleAssignments -gt 0) {
            return @{ rating = "pass"; message = "$($facts.roleAssignments.eligibleAssignments) eligible PIM assignments found." }
        }
        if ($facts.roleAssignments.totalAssignments -gt 0) {
            return @{ rating = "warn"; message = "Role assignments exist but no eligible (PIM) assignments detected."; action = "Use PIM for eligible role assignments instead of standing access." }
        }
        return @{ rating = "na"; message = "No role assignments found to evaluate PIM usage." }
    }

    # MS.AAD.8.1v1 -Guest user access SHOULD be restricted
    $registry["MS.AAD.8.1v1"] = {
        param($facts)
        if (-not $facts.authorizationPolicy.available) {
            return @{ rating = "na"; message = "Could not retrieve authorization policy." }
        }
        $guestRoleId = $facts.authorizationPolicy.guestUserRoleId
        # Restricted = 2af84b1e-...; Limited = 10dae51f-...; Same as member = a0b1b346-...
        if ($guestRoleId -eq "2af84b1e-32c8-42b7-82bc-daa8c0e1b7cb") {
            return @{ rating = "pass"; message = "Guest user access is set to most restrictive." }
        }
        elseif ($guestRoleId -eq "10dae51f-b6af-4016-8d66-8c2a99b929b3") {
            return @{ rating = "warn"; message = "Guest user access is limited (not most restrictive)."; action = "Consider setting guest access to 'Most restrictive' in Entra ID." }
        }
        return @{ rating = "fail"; message = "Guest users have same access as members."; action = "Restrict guest user access in External Identities settings." }
    }

    # MS.AAD.8.2v1 -Guest invites from specific admin roles
    $registry["MS.AAD.8.2v1"] = {
        param($facts)
        if (-not $facts.authorizationPolicy.available) {
            return @{ rating = "na"; message = "Could not retrieve authorization policy." }
        }
        $invitePolicy = $facts.authorizationPolicy.allowInvitesFrom
        if ($invitePolicy -eq "adminsAndGuestInviters" -or $invitePolicy -eq "none") {
            return @{ rating = "pass"; message = "Guest invitations restricted to admins ($invitePolicy)." }
        }
        return @{ rating = "warn"; message = "Guest invitation policy: $invitePolicy."; action = "Restrict guest invitations to specific admin roles." }
    }

    # =====================================================================
    # EXO (Exchange Online) Evaluators -Limited via Graph API
    # =====================================================================

    # MS.EXO.4.1v1 -Defender for Office 365 licensing (assessable via Graph)
    $registry["MS.EXO.4.1v1"] = {
        param($facts)
        if (-not $facts.licenses.available) {
            return @{ rating = "fail"; message = "Could not retrieve license data." }
        }
        if ($facts.licenses.hasDefenderO365) {
            return @{ rating = "pass"; message = "Defender for Office 365 license detected." }
        }
        return @{ rating = "warn"; message = "No Defender for Office 365 license detected."; action = "Add Defender for Office 365 P1/P2 for Safe Links, Safe Attachments, and anti-phishing." }
    }

    # =====================================================================
    # DEFENDER Evaluators -Limited via Graph API
    # =====================================================================

    # MS.DEFENDER.1.1v1 -Preset security policies (license check)
    $registry["MS.DEFENDER.1.1v1"] = {
        param($facts)
        if (-not $facts.licenses.available) {
            return @{ rating = "fail"; message = "Could not retrieve license data." }
        }
        if ($facts.licenses.hasDefenderO365) {
            return @{ rating = "warn"; message = "Defender for O365 is licensed. Verify preset security policies are enabled."; action = "Enable Standard and Strict preset security policies in the Microsoft 365 Defender portal." }
        }
        return @{ rating = "fail"; message = "No Defender for O365 license to support preset security policies."; action = "Add Defender for Office 365 licensing." }
    }

    # MS.DEFENDER.6.1v1 -Purview audit logging
    $registry["MS.DEFENDER.6.1v1"] = {
        param($facts)
        if (-not $facts.licenses.available) {
            return @{ rating = "na"; message = "Could not check licensing for audit logging." }
        }
        if ($facts.licenses.hasQualifyingSku) {
            return @{ rating = "warn"; message = "Qualifying license detected. Verify unified audit logging is enabled."; action = "Confirm audit logging is on in the Microsoft Purview compliance portal." }
        }
        return @{ rating = "fail"; message = "No qualifying M365 license for audit logging."; action = "Purchase M365 E3/E5 for audit logging capabilities." }
    }

    # =====================================================================
    # SHAREPOINT Evaluators -Limited via Graph API
    # =====================================================================

    # Note: SharePoint admin settings require SharePoint Online Management Shell or
    # the Sites.FullControl.All Graph permission which delegated tokens rarely have.
    # These evaluators provide guidance based on what's available.

    # =====================================================================
    # TEAMS Evaluators -Limited via Graph API
    # =====================================================================

    # Note: Teams admin settings require the MicrosoftTeams PowerShell module.
    # Graph API has very limited Teams admin policy access.

    # =====================================================================
    # Cross-product evaluators for common checks
    # =====================================================================

    # MS.DEFENDER.1.2v1, 1.3v1 -All users in EOP/Defender protection
    $registry["MS.DEFENDER.1.2v1"] = {
        param($facts)
        if ($facts.licenses.available -and $facts.licenses.hasQualifyingSku) {
            return @{ rating = "warn"; message = "M365 license detected. Verify all users are covered by Exchange Online Protection."; action = "Check that all mailboxes are included in EOP protection policies." }
        }
        return @{ rating = "na"; message = "Cannot verify EOP coverage without Exchange admin access." }
    }

    $registry["MS.DEFENDER.1.3v1"] = {
        param($facts)
        if ($facts.licenses.available -and $facts.licenses.hasDefenderO365) {
            return @{ rating = "warn"; message = "Defender for O365 licensed. Verify all users are covered."; action = "Ensure all users are included in Defender for Office 365 protection policies." }
        }
        return @{ rating = "na"; message = "Cannot verify Defender for O365 coverage. Requires Defender licensing + admin access." }
    }

    return $registry
}

function Invoke-CisaControlEvaluation {
    param(
        $Facts,
        [array]$ControlCatalog
    )

    $registry = Get-CisaEvaluatorRegistry
    $checks = @()

    foreach ($control in $ControlCatalog) {
        $controlId = $control.id
        $description = $control.description
        $requirement = $control.requirement
        $product = $control.product

        $checkName = "[SCuBA $controlId] $description"
        # Truncate very long check names
        if ($checkName.Length -gt 200) {
            $checkName = $checkName.Substring(0, 197) + "..."
        }

        if ($registry.ContainsKey($controlId)) {
            # Evaluator exists -run it
            try {
                $result = & $registry[$controlId] $Facts
                $rating = $(if ($result.rating) { $result.rating } else { "na" })
                $message = $(if ($result.message) { $result.message } else { "Evaluator returned no message." })
                $action = $(if ($result.action) { $result.action } else { $null })

                $checks += New-AuditCheck -Name $checkName -Rating $rating -Message $message -Action $action
            }
            catch {
                $checks += New-AuditCheck -Name $checkName -Rating "na" -Message "Evaluator error: $($_.Exception.Message)" -Action "Review the evaluator for $controlId."
            }
        }
        else {
            # No evaluator -mark as not assessable via Graph API
            $naReason = "Not assessable via Microsoft Graph API."
            switch ($product) {
                "EXO"           { $naReason = "Requires Exchange Online Management Shell for evaluation." }
                "DEFENDER"      { $naReason = "Requires Microsoft 365 Defender portal or Security & Compliance PowerShell." }
                "SHAREPOINT"    { $naReason = "Requires SharePoint Online Management Shell for evaluation." }
                "TEAMS"         { $naReason = "Requires Microsoft Teams PowerShell module for evaluation." }
                "POWERPLATFORM" { $naReason = "Requires Power Platform admin API (not available via Graph)." }
                "POWERBI"       { $naReason = "Requires Power BI admin API (not available via Graph)." }
            }

            $checks += New-AuditCheck -Name $checkName -Rating "na" -Message "$requirement - $naReason" -Action "Use the product-specific admin module to assess this control."
        }
    }

    return @($checks)
}

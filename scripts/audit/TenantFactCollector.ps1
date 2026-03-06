# TenantFactCollector.ps1
# Expanded tenant fact collection for comprehensive CISA SCuBA + NIST ZTA auditing.
# Extends the original Get-TenantAuditFacts with additional Graph API queries.

function Get-TenantAuditFacts {
    param(
        [string]$DelegatedToken  # Optional: Bearer token from web audit flow
    )

    # If a delegated token was passed (web flow), set it for GraphHelper to use
    if ($DelegatedToken) {
        $script:DelegatedBearerToken = $DelegatedToken
    }

    $skuNames = @{
        'ENTERPRISEPACK'        = 'Microsoft 365 E3'
        'ENTERPRISEPREMIUM'     = 'Microsoft 365 E5'
        'SPE_E3'                = 'Microsoft 365 E3'
        'SPE_E5'                = 'Microsoft 365 E5'
        'O365_BUSINESS_PREMIUM' = 'Microsoft 365 Business Standard'
        'SPB'                   = 'Microsoft 365 Business Premium'
        'EMS'                   = 'Enterprise Mobility + Security E3'
        'EMSPREMIUM'            = 'Enterprise Mobility + Security E5'
        'AAD_PREMIUM'           = 'Entra ID P1'
        'AAD_PREMIUM_P2'        = 'Entra ID P2'
        'ATP_ENTERPRISE'        = 'Defender for Office 365 P1'
        'THREAT_INTELLIGENCE'   = 'Defender for Office 365 P2'
        'WIN_DEF_ATP'           = 'Defender for Endpoint P1'
        'INTUNE_A'              = 'Microsoft Intune'
    }

    $qualifyingSkus = @('ENTERPRISEPACK', 'ENTERPRISEPREMIUM', 'SPE_E3', 'SPE_E5', 'SPB', 'EMSPREMIUM')

    $facts = [ordered]@{
        organization      = [ordered]@{
            available     = $false
            tenantId      = $null
            displayName   = $null
            primaryDomain = $null
            error         = $null
        }
        conditionalAccess = [ordered]@{
            available          = $false
            totalPolicies      = 0
            enabledCount       = 0
            reportOnlyCount    = 0
            disabledCount      = 0
            policies           = @()
            error              = $null
        }
        namedLocations    = [ordered]@{
            available      = $false
            totalLocations = 0
            locations      = @()
            error          = $null
        }
        mfa               = [ordered]@{
            available       = $false
            totalUsers      = 0
            registeredUsers = 0
            percentage      = 0
            error           = $null
        }
        breakGlass        = [ordered]@{
            available   = $false
            groupExists = $false
            memberCount = 0
            error       = $null
        }
        adminRoles        = [ordered]@{
            available        = $false
            globalAdminCount = 0
            error            = $null
        }
        devices           = [ordered]@{
            available           = $false
            totalDevices        = 0
            compliantDevices    = 0
            nonCompliantDevices = 0
            error               = $null
        }
        licenses          = [ordered]@{
            available        = $false
            hasQualifyingSku = $false
            hasP2            = $false
            hasIntune        = $false
            hasDefenderO365  = $false
            hasDefenderEndpt = $false
            licenses         = @()
            error            = $null
        }
        securityDefaults  = [ordered]@{
            available = $false
            enabled   = $false
            error     = $null
        }
        domains           = [ordered]@{
            available          = $false
            totalDomains       = 0
            customDomainCount  = 0
            hasOnlyOnmicrosoft = $true
            error              = $null
        }
        # --- New sections for expanded coverage ---
        authMethods       = [ordered]@{
            available       = $false
            migrationState  = $null
            smsEnabled      = $false
            voiceEnabled    = $false
            microsoftAuthEnabled = $false
            fido2Enabled    = $false
            error           = $null
        }
        authorizationPolicy = [ordered]@{
            available                            = $false
            defaultUserRoleAllowedToCreateApps   = $true
            allowInvitesFrom                     = $null
            guestUserRoleId                      = $null
            error                                = $null
        }
        adminConsentPolicy = [ordered]@{
            available = $false
            enabled   = $false
            error     = $null
        }
        passwordPolicy    = [ordered]@{
            available                      = $false
            passwordValidityPeriodInDays   = $null
            passwordNotificationWindowInDays = $null
            error                          = $null
        }
        roleAssignments   = [ordered]@{
            available             = $false
            totalAssignments      = 0
            eligibleAssignments   = 0
            activeAssignments     = 0
            error                 = $null
        }
        appRegistrations  = [ordered]@{
            available  = $false
            totalApps  = 0
            error      = $null
        }
        sensitivityLabels = [ordered]@{
            available   = $false
            totalLabels = 0
            error       = $null
        }
    }

    # --- Section: Organization ---
    try {
        $org = Invoke-GraphRest -Uri "https://graph.microsoft.com/v1.0/organization?%24select=id,displayName,verifiedDomains"
        if (-not $org.value -or $org.value.Count -eq 0) {
            throw "Organization query returned no results."
        }
        $defaultDomains = @($org.value[0].verifiedDomains | Where-Object { $_.isDefault })
        $facts.organization.available = $true
        $facts.organization.tenantId = $org.value[0].id
        $facts.organization.displayName = $org.value[0].displayName
        $facts.organization.primaryDomain = $(if ($defaultDomains.Count -gt 0) { $defaultDomains[0].name } else { $null })
    }
    catch {
        $facts.organization.error = $_.Exception.Message
    }

    # --- Section: Conditional Access ---
    try {
        $policies = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies?%24select=id,displayName,state,conditions,grantControls,sessionControls&%24top=100"
        $facts.conditionalAccess.available = $true
        $facts.conditionalAccess.policies = @($policies)
        $facts.conditionalAccess.totalPolicies = $facts.conditionalAccess.policies.Count
        foreach ($pol in $facts.conditionalAccess.policies) {
            switch ($pol.state) {
                "enabled"              { $facts.conditionalAccess.enabledCount++ }
                "enabledForReportingButNotEnforced" { $facts.conditionalAccess.reportOnlyCount++ }
                "disabled"             { $facts.conditionalAccess.disabledCount++ }
            }
        }
    }
    catch {
        $facts.conditionalAccess.error = $_.Exception.Message
    }

    # --- Section: Named Locations ---
    try {
        $namedLocations = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/namedLocations?%24select=id,displayName,isTrusted&%24top=100"
        $facts.namedLocations.available = $true
        $facts.namedLocations.locations = @($namedLocations)
        $facts.namedLocations.totalLocations = $facts.namedLocations.locations.Count
    }
    catch {
        $facts.namedLocations.error = $_.Exception.Message
    }

    # --- Section: MFA Registration ---
    try {
        $mfaRows = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/reports/authenticationMethods/userRegistrationDetails?%24top=100"
        foreach ($row in $mfaRows) {
            $facts.mfa.totalUsers++
            if ($row.isMfaRegistered) {
                $facts.mfa.registeredUsers++
            }
        }
        $facts.mfa.available = $true
        if ($facts.mfa.totalUsers -gt 0) {
            $facts.mfa.percentage = [math]::Round(($facts.mfa.registeredUsers / $facts.mfa.totalUsers) * 100, 1)
        }
    }
    catch {
        $facts.mfa.error = $_.Exception.Message
    }

    # --- Section: Break Glass ---
    try {
        $bgGroup = Invoke-GraphRest -Uri "https://graph.microsoft.com/v1.0/groups?%24filter=displayName%20eq%20'ZeroTrust-BreakGlass-Admins'&%24select=id"
        $facts.breakGlass.available = $true
        if ($bgGroup.value -and $bgGroup.value.Count -gt 0) {
            $facts.breakGlass.groupExists = $true
            $members = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/groups/$($bgGroup.value[0].id)/members?%24select=id&%24top=100"
            $facts.breakGlass.memberCount = @($members).Count
        }
    }
    catch {
        $facts.breakGlass.error = $_.Exception.Message
    }

    # --- Section: Admin Roles ---
    try {
        $roles = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/directoryRoles?%24select=id,displayName&%24top=100"
        $facts.adminRoles.available = $true
        $gaRole = @($roles | Where-Object { $_.displayName -eq 'Global Administrator' })
        if ($gaRole.Count -gt 0) {
            $gaMembers = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/directoryRoles/$($gaRole[0].id)/members?%24select=id&%24top=100"
            $facts.adminRoles.globalAdminCount = @($gaMembers).Count
        }
    }
    catch {
        $facts.adminRoles.error = $_.Exception.Message
    }

    # --- Section: Devices ---
    try {
        $devices = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?%24select=id,complianceState&%24top=999"
        $facts.devices.available = $true
        foreach ($device in $devices) {
            $facts.devices.totalDevices++
            if ($device.complianceState -eq 'compliant') {
                $facts.devices.compliantDevices++
            }
            elseif ($device.complianceState -eq 'noncompliant') {
                $facts.devices.nonCompliantDevices++
            }
        }
    }
    catch {
        $facts.devices.error = $_.Exception.Message
    }

    # --- Section: Licenses ---
    try {
        $skus = Invoke-GraphRest -Uri "https://graph.microsoft.com/v1.0/subscribedSkus"
        $facts.licenses.available = $true
        if ($skus.value) {
            foreach ($sku in $skus.value) {
                $friendlyName = $(if ($skuNames.Contains($sku.skuPartNumber)) { $skuNames[$sku.skuPartNumber] } else { $sku.skuPartNumber })
                $facts.licenses.licenses += @([ordered]@{
                    skuPartNumber = $sku.skuPartNumber
                    friendlyName  = $friendlyName
                    total         = $sku.prepaidUnits.enabled
                    consumed      = $sku.consumedUnits
                    available     = ($sku.prepaidUnits.enabled - $sku.consumedUnits)
                })

                if ($sku.skuPartNumber -in $qualifyingSkus) {
                    $facts.licenses.hasQualifyingSku = $true
                }
                if ($sku.skuPartNumber -eq 'AAD_PREMIUM_P2' -or $sku.skuPartNumber -in @('ENTERPRISEPREMIUM', 'SPE_E5', 'EMSPREMIUM')) {
                    $facts.licenses.hasP2 = $true
                }
                if ($sku.skuPartNumber -eq 'INTUNE_A' -or $sku.skuPartNumber -in $qualifyingSkus) {
                    $facts.licenses.hasIntune = $true
                }
                if ($sku.skuPartNumber -in @('ATP_ENTERPRISE', 'THREAT_INTELLIGENCE', 'ENTERPRISEPREMIUM', 'SPE_E5')) {
                    $facts.licenses.hasDefenderO365 = $true
                }
                if ($sku.skuPartNumber -in @('WIN_DEF_ATP', 'ENTERPRISEPREMIUM', 'SPE_E5')) {
                    $facts.licenses.hasDefenderEndpt = $true
                }
            }
        }
    }
    catch {
        $facts.licenses.error = $_.Exception.Message
    }

    # --- Section: Security Defaults ---
    try {
        $secDefaults = Invoke-GraphRest -Uri "https://graph.microsoft.com/v1.0/policies/identitySecurityDefaultsEnforcementPolicy"
        $facts.securityDefaults.available = $true
        $facts.securityDefaults.enabled = [bool]$secDefaults.isEnabled
    }
    catch {
        $facts.securityDefaults.error = $_.Exception.Message
    }

    # --- Section: Domains ---
    try {
        $allDomains = Invoke-GraphRest -Uri "https://graph.microsoft.com/v1.0/domains?%24select=id,isDefault,isVerified,passwordValidityPeriodInDays,passwordNotificationWindowInDays"
        $facts.domains.available = $true
        if ($allDomains.value) {
            $facts.domains.totalDomains = @($allDomains.value).Count
            $customDomains = @($allDomains.value | Where-Object { $_.id -notmatch '\.onmicrosoft\.com$' })
            $facts.domains.customDomainCount = $customDomains.Count
            $facts.domains.hasOnlyOnmicrosoft = ($customDomains.Count -eq 0)

            # Extract password policy from the default domain
            $defaultDomainObj = @($allDomains.value | Where-Object { $_.isDefault })
            if ($defaultDomainObj.Count -gt 0 -and $null -ne $defaultDomainObj[0].passwordValidityPeriodInDays) {
                $facts.passwordPolicy.available = $true
                $facts.passwordPolicy.passwordValidityPeriodInDays = $defaultDomainObj[0].passwordValidityPeriodInDays
                $facts.passwordPolicy.passwordNotificationWindowInDays = $defaultDomainObj[0].passwordNotificationWindowInDays
            }
        }
    }
    catch {
        $facts.domains.error = $_.Exception.Message
    }

    # --- Section: Authentication Methods Policy (MS.AAD.3.*) ---
    try {
        $authMethodsPolicy = Invoke-GraphRest -Uri "https://graph.microsoft.com/v1.0/policies/authenticationMethodsPolicy"
        $facts.authMethods.available = $true

        if ($authMethodsPolicy.policyMigrationState) {
            $facts.authMethods.migrationState = $authMethodsPolicy.policyMigrationState
        }

        if ($authMethodsPolicy.authenticationMethodConfigurations) {
            foreach ($method in $authMethodsPolicy.authenticationMethodConfigurations) {
                $methodId = $method.id
                $isEnabled = ($method.state -eq "enabled")
                switch ($methodId) {
                    "Sms"                    { $facts.authMethods.smsEnabled = $isEnabled }
                    "Voice"                  { $facts.authMethods.voiceEnabled = $isEnabled }
                    "MicrosoftAuthenticator" { $facts.authMethods.microsoftAuthEnabled = $isEnabled }
                    "Fido2"                  { $facts.authMethods.fido2Enabled = $isEnabled }
                }
            }
        }
    }
    catch {
        $facts.authMethods.error = $_.Exception.Message
    }

    # --- Section: Authorization Policy (MS.AAD.5.*, MS.AAD.8.*) ---
    try {
        $authzPolicy = Invoke-GraphRest -Uri "https://graph.microsoft.com/v1.0/policies/authorizationPolicy"
        $facts.authorizationPolicy.available = $true

        if ($null -ne $authzPolicy.defaultUserRolePermissions) {
            $facts.authorizationPolicy.defaultUserRoleAllowedToCreateApps = [bool]$authzPolicy.defaultUserRolePermissions.allowedToCreateApps
        }

        if ($authzPolicy.allowInvitesFrom) {
            $facts.authorizationPolicy.allowInvitesFrom = $authzPolicy.allowInvitesFrom
        }

        if ($authzPolicy.guestUserRoleId) {
            $facts.authorizationPolicy.guestUserRoleId = $authzPolicy.guestUserRoleId
        }
    }
    catch {
        $facts.authorizationPolicy.error = $_.Exception.Message
    }

    # --- Section: Admin Consent Request Policy (MS.AAD.5.3) ---
    try {
        $consentPolicy = Invoke-GraphRest -Uri "https://graph.microsoft.com/v1.0/policies/adminConsentRequestPolicy"
        $facts.adminConsentPolicy.available = $true
        $facts.adminConsentPolicy.enabled = [bool]$consentPolicy.isEnabled
    }
    catch {
        $facts.adminConsentPolicy.error = $_.Exception.Message
    }

    # --- Section: Password Policy (MS.AAD.6.1) ---
    # Already populated from domains section above; fill from dedicated call if missing
    if (-not $facts.passwordPolicy.available) {
        try {
            $defaultDomain = $null
            if ($facts.domains.available -and $facts.organization.primaryDomain) {
                $domainUri = "https://graph.microsoft.com/v1.0/domains/$($facts.organization.primaryDomain)"
                $defaultDomain = Invoke-GraphRest -Uri $domainUri
            }
            if ($defaultDomain -and $null -ne $defaultDomain.passwordValidityPeriodInDays) {
                $facts.passwordPolicy.available = $true
                $facts.passwordPolicy.passwordValidityPeriodInDays = $defaultDomain.passwordValidityPeriodInDays
                $facts.passwordPolicy.passwordNotificationWindowInDays = $defaultDomain.passwordNotificationWindowInDays
            }
        }
        catch {
            $facts.passwordPolicy.error = $_.Exception.Message
        }
    }

    # --- Section: PIM Role Assignments (MS.AAD.7.*) ---
    try {
        $roleAssignments = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignmentScheduleInstances?%24top=200&%24select=id,assignmentType"
        $facts.roleAssignments.available = $true
        $facts.roleAssignments.totalAssignments = @($roleAssignments).Count
        foreach ($ra in $roleAssignments) {
            if ($ra.assignmentType -eq "Activated" -or $ra.assignmentType -eq "Assigned") {
                $facts.roleAssignments.activeAssignments++
            }
        }
        # Eligible assignments
        try {
            $eligibleAssignments = Invoke-GraphCollection -Uri "https://graph.microsoft.com/v1.0/roleManagement/directory/roleEligibilityScheduleInstances?%24top=200&%24select=id"
            $facts.roleAssignments.eligibleAssignments = @($eligibleAssignments).Count
        }
        catch {
            # PIM eligibility may require P2; non-fatal
        }
    }
    catch {
        $facts.roleAssignments.error = $_.Exception.Message
    }

    # --- Section: App Registrations (MS.AAD.5.*) ---
    try {
        $apps = Invoke-GraphRest -Uri "https://graph.microsoft.com/v1.0/applications?%24top=1&%24count=true&%24select=id" -ErrorAction Stop
        $facts.appRegistrations.available = $true
        if ($null -ne $apps.'@odata.count') {
            $facts.appRegistrations.totalApps = $apps.'@odata.count'
        }
        elseif ($apps.value) {
            # Count is not always available; just note that apps exist
            $facts.appRegistrations.totalApps = @($apps.value).Count
        }
    }
    catch {
        $facts.appRegistrations.error = $_.Exception.Message
    }

    # --- Section: Sensitivity Labels ---
    try {
        $labels = Invoke-GraphRest -Uri "https://graph.microsoft.com/beta/security/informationProtection/sensitivityLabels?%24top=100&%24select=id,name"
        $facts.sensitivityLabels.available = $true
        if ($labels.value) {
            $facts.sensitivityLabels.totalLabels = @($labels.value).Count
        }
    }
    catch {
        $facts.sensitivityLabels.error = $_.Exception.Message
    }

    return $facts
}

using namespace System.Net

<#
.SYNOPSIS
    Pre-deployment audit for M365 Zero Trust deployment
.DESCRIPTION
    Performs 10 readiness checks against the client tenant before deploying
    Zero Trust policies. Returns a structured report with pass/warn/fail/blocker
    ratings and actionable next steps.
#>

param($Request, $TriggerMetadata)

$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot '..' 'Modules' 'GraphHelper.psm1') -Force

Write-Host "Pre-Deploy-Audit started"

try {
    $config = $Request.Body
    if (-not $config) { $config = @{} }

    $connected = Connect-GraphWithManagedIdentity
    if (-not $connected) {
        throw "Failed to connect to Microsoft Graph"
    }

    $checks = @()

    # Required permissions for full Zero Trust deployment
    $requiredPermissionNames = @(
        "Policy.ReadWrite.ConditionalAccess",
        "Policy.Read.All",
        "DeviceManagementConfiguration.ReadWrite.All",
        "DeviceManagementManagedDevices.ReadWrite.All",
        "DeviceManagementServiceConfig.ReadWrite.All",
        "SecurityEvents.ReadWrite.All",
        "User.ReadWrite.All",
        "Group.ReadWrite.All",
        "Directory.ReadWrite.All",
        "Mail.ReadWrite",
        "MailboxSettings.ReadWrite",
        "Sites.FullControl.All",
        "Team.Create",
        "TeamsAppInstallation.ReadWriteForTeam.All",
        "Reports.Read.All",
        "AuditLog.Read.All",
        "InformationProtectionPolicy.Read.All"
    )

    # Core 5 permissions required for basic deployment
    $corePermissions = @(
        "Policy.ReadWrite.ConditionalAccess",
        "Policy.Read.All",
        "DeviceManagementConfiguration.ReadWrite.All",
        "DeviceManagementManagedDevices.ReadWrite.All",
        "SecurityEvents.ReadWrite.All"
    )

    # SKU friendly names
    $skuNames = @{
        'ENTERPRISEPACK'       = 'Microsoft 365 E3'
        'ENTERPRISEPREMIUM'    = 'Microsoft 365 E5'
        'SPE_E3'               = 'Microsoft 365 E3'
        'SPE_E5'               = 'Microsoft 365 E5'
        'O365_BUSINESS_PREMIUM' = 'Microsoft 365 Business Standard'
        'SPB'                  = 'Microsoft 365 Business Premium'
        'EMS'                  = 'Enterprise Mobility + Security E3'
        'EMSPREMIUM'           = 'Enterprise Mobility + Security E5'
        'AAD_PREMIUM'          = 'Entra ID P1'
        'AAD_PREMIUM_P2'       = 'Entra ID P2'
        'ATP_ENTERPRISE'       = 'Defender for Office 365 P1'
        'THREAT_INTELLIGENCE'  = 'Defender for Office 365 P2'
        'WIN_DEF_ATP'          = 'Defender for Endpoint P1'
        'INTUNE_A'             = 'Microsoft Intune'
    }

    # M365 SKUs that include Intune + CA (required for Zero Trust)
    $qualifyingSkus = @('ENTERPRISEPACK', 'ENTERPRISEPREMIUM', 'SPE_E3', 'SPE_E5', 'SPB', 'EMSPREMIUM')

    # =========================================================================
    # CHECK 1: Organization Info & Tenant Basics
    # =========================================================================
    try {
        Write-Host "[CHECK 1/10] Organization Info..."
        $org = Invoke-GraphRequestWithRetry -Method GET `
            -Uri "https://graph.microsoft.com/v1.0/organization?`$select=id,displayName,verifiedDomains"

        if (-not $org.value -or $org.value.Count -eq 0) {
            throw "Organization query returned no results"
        }
        $orgInfo = $org.value[0]
        $tenantId = $orgInfo.id
        $tenantName = $orgInfo.displayName
        $defaultDomains = @($orgInfo.verifiedDomains | Where-Object { $_.isDefault })
        $primaryDomain = if ($defaultDomains.Count -gt 0) { $defaultDomains[0].name } else { $null }

        $checks += @{
            check       = "organization"
            displayName = "Organization Info"
            rating      = "pass"
            message     = "Tenant accessible: $tenantName ($primaryDomain)"
            details     = @{
                tenantId    = $tenantId
                displayName = $tenantName
                primaryDomain = $primaryDomain
                verifiedDomains = ($orgInfo.verifiedDomains | ForEach-Object { $_.name })
            }
            action      = $null
        }
    }
    catch {
        $checks += @{
            check       = "organization"
            displayName = "Organization Info"
            rating      = "blocker"
            message     = "Cannot access tenant: $($_.Exception.Message)"
            details     = @{}
            action      = "Verify managed identity has permissions and is correctly configured"
        }
    }

    # =========================================================================
    # CHECK 2: Graph API Permissions
    # =========================================================================
    try {
        Write-Host "[CHECK 2/10] Graph API Permissions..."

        # Get Microsoft Graph service principal
        $graphSp = Invoke-GraphRequestWithRetry -Method GET `
            -Uri "https://graph.microsoft.com/v1.0/servicePrincipals?`$filter=appId eq '00000003-0000-0000-c000-000000000000'&`$select=id,appRoles"
        if (-not $graphSp.value -or $graphSp.value.Count -eq 0) {
            throw "Microsoft Graph service principal not found in tenant"
        }
        $graphSpId = $graphSp.value[0].id
        $allAppRoles = $graphSp.value[0].appRoles

        # Build permission name to GUID map
        $permissionMap = @{}
        foreach ($permName in $requiredPermissionNames) {
            $matched = @($allAppRoles | Where-Object { $_.value -eq $permName -and $_.allowedMemberTypes -contains "Application" })
            if ($matched.Count -gt 0) {
                $permissionMap[$permName] = $matched[0].id
            }
        }

        # Get current managed identity's service principal
        $clientId = $env:AZURE_CLIENT_ID
        if (-not $clientId) {
            throw "AZURE_CLIENT_ID environment variable not set"
        }
        $safeClientId = Format-ODataFilterValue -Value $clientId
        $mySp = Invoke-GraphRequestWithRetry -Method GET `
            -Uri "https://graph.microsoft.com/v1.0/servicePrincipals?`$filter=appId eq '$safeClientId'&`$select=id"
        if (-not $mySp.value -or $mySp.value.Count -eq 0) {
            throw "Managed identity service principal not found for appId '$clientId'"
        }
        $mySpId = $mySp.value[0].id

        # Get granted permissions
        $grants = Invoke-GraphRequestWithRetry -Method GET `
            -Uri "https://graph.microsoft.com/v1.0/servicePrincipals/$mySpId/appRoleAssignments?`$select=appRoleId"
        $grantedRoleIds = @()
        if ($grants.value) {
            $grantedRoleIds = @($grants.value | ForEach-Object { $_.appRoleId })
        }

        # Check each permission
        $grantedPerms = @()
        $missingPerms = @()
        $missingCore = @()
        foreach ($permName in $requiredPermissionNames) {
            $roleId = $permissionMap[$permName]
            if ($roleId -and $roleId -in $grantedRoleIds) {
                $grantedPerms += $permName
            }
            else {
                $missingPerms += $permName
                if ($permName -in $corePermissions) {
                    $missingCore += $permName
                }
            }
        }

        $permRating = "pass"
        $permMessage = "All $($requiredPermissionNames.Count) required permissions are granted"
        $permAction = $null

        if ($missingCore.Count -gt 0) {
            $permRating = "blocker"
            $permMessage = "$($missingCore.Count) core permissions missing (deployment will fail)"
            $permAction = "Run setup-tenant.ps1 to grant all permissions"
        }
        elseif ($missingPerms.Count -gt 0) {
            $permRating = "fail"
            $permMessage = "$($missingPerms.Count) permissions missing (some features will not work)"
            $permAction = "Run setup-tenant.ps1 to grant all permissions"
        }

        $checks += @{
            check       = "permissions"
            displayName = "Graph API Permissions"
            rating      = $permRating
            message     = $permMessage
            details     = @{
                granted = $grantedPerms
                missing = $missingPerms
                missingCore = $missingCore
                totalRequired = $requiredPermissionNames.Count
                totalGranted = $grantedPerms.Count
            }
            action      = $permAction
        }
    }
    catch {
        $checks += @{
            check       = "permissions"
            displayName = "Graph API Permissions"
            rating      = "fail"
            message     = "Could not verify permissions: $($_.Exception.Message)"
            details     = @{}
            action      = "Check managed identity configuration"
        }
    }

    # =========================================================================
    # CHECK 3: Existing Conditional Access Policies
    # =========================================================================
    try {
        Write-Host "[CHECK 3/10] Conditional Access Policies..."
        $caPolicies = Invoke-GraphRequestWithRetry -Method GET `
            -Uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies?`$select=id,displayName,state"

        $existingPolicies = @()
        $omzigPolicies = @()
        if ($caPolicies.value) {
            $existingPolicies = @($caPolicies.value)
            $omzigPolicies = @($caPolicies.value | Where-Object { $_.displayName -match '^CA\d{3}-' })
        }

        $caRating = "pass"
        $caMessage = "No existing CA policies found (clean slate)"
        $caAction = $null

        if ($omzigPolicies.Count -gt 0) {
            $caRating = "warn"
            $caMessage = "$($omzigPolicies.Count) existing Omzig CA policies detected - redeploy may create duplicates"
            $caAction = "Review existing policies in Entra admin center before deploying"
        }
        elseif ($existingPolicies.Count -gt 0) {
            $caRating = "pass"
            $caMessage = "$($existingPolicies.Count) existing CA policies found (non-Omzig)"
        }

        $checks += @{
            check       = "conditional-access"
            displayName = "Conditional Access Policies"
            rating      = $caRating
            message     = $caMessage
            details     = @{
                totalPolicies = $existingPolicies.Count
                omzigPolicies = $omzigPolicies.Count
                policies = ($existingPolicies | ForEach-Object {
                    @{ displayName = $_.displayName; state = $_.state; id = $_.id }
                })
            }
            action      = $caAction
        }
    }
    catch {
        $checks += @{
            check       = "conditional-access"
            displayName = "Conditional Access Policies"
            rating      = "fail"
            message     = "Could not retrieve CA policies: $($_.Exception.Message)"
            details     = @{}
            action      = "Verify Policy.Read.All permission is granted"
        }
    }

    # =========================================================================
    # CHECK 4: MFA Registration Rate
    # =========================================================================
    try {
        Write-Host "[CHECK 4/10] MFA Registration Rate..."
        $mfaData = Invoke-GraphRequestWithRetry -Method GET `
            -Uri "https://graph.microsoft.com/v1.0/reports/authenticationMethods/userRegistrationDetails?`$top=100"

        $totalUsers = 0
        $mfaRegistered = 0

        if ($mfaData.value) {
            foreach ($user in $mfaData.value) {
                $totalUsers++
                if ($user.isMfaRegistered) { $mfaRegistered++ }
            }
        }

        # Handle pagination
        while ($mfaData.'@odata.nextLink') {
            $mfaData = Invoke-GraphRequestWithRetry -Method GET -Uri $mfaData.'@odata.nextLink'
            if ($mfaData.value) {
                foreach ($user in $mfaData.value) {
                    $totalUsers++
                    if ($user.isMfaRegistered) { $mfaRegistered++ }
                }
            }
        }

        $mfaPct = if ($totalUsers -gt 0) { [math]::Round(($mfaRegistered / $totalUsers) * 100, 1) } else { 0 }

        $mfaRating = "pass"
        $mfaAction = $null
        if ($mfaPct -ge 80) {
            $mfaMessage = "$mfaPct% of $totalUsers users have MFA registered"
        }
        elseif ($mfaPct -ge 50) {
            $mfaRating = "warn"
            $mfaMessage = "$mfaPct% of $totalUsers users have MFA registered (target: 80%)"
            $mfaAction = "Run MFA registration campaign before enabling CA002/CA003"
        }
        else {
            $mfaRating = "fail"
            $mfaMessage = "$mfaPct% of $totalUsers users have MFA registered (target: 80%)"
            $mfaAction = "Many users will be impacted when MFA policies are enforced. Run a registration campaign first."
        }

        $checks += @{
            check       = "mfa-registration"
            displayName = "MFA Registration Rate"
            rating      = $mfaRating
            message     = $mfaMessage
            details     = @{
                totalUsers    = $totalUsers
                mfaRegistered = $mfaRegistered
                percentage    = $mfaPct
            }
            action      = $mfaAction
        }
    }
    catch {
        $checks += @{
            check       = "mfa-registration"
            displayName = "MFA Registration Rate"
            rating      = "fail"
            message     = "Could not retrieve MFA data: $($_.Exception.Message)"
            details     = @{}
            action      = "Verify Reports.Read.All permission is granted"
        }
    }

    # =========================================================================
    # CHECK 5: Licensed SKUs
    # =========================================================================
    try {
        Write-Host "[CHECK 5/10] Licensed SKUs..."
        $skus = Invoke-GraphRequestWithRetry -Method GET `
            -Uri "https://graph.microsoft.com/v1.0/subscribedSkus"

        $licenseList = @()
        $hasQualifyingSku = $false
        $hasP2 = $false
        $hasIntune = $false

        if ($skus.value) {
            foreach ($sku in $skus.value) {
                $friendlyName = $skuNames[$sku.skuPartNumber] ?? $sku.skuPartNumber
                $total = $sku.prepaidUnits.enabled
                $consumed = $sku.consumedUnits
                $available = $total - $consumed

                $licenseList += @{
                    skuPartNumber = $sku.skuPartNumber
                    friendlyName  = $friendlyName
                    total         = $total
                    consumed      = $consumed
                    available     = $available
                }

                if ($sku.skuPartNumber -in $qualifyingSkus) { $hasQualifyingSku = $true }
                if ($sku.skuPartNumber -eq 'AAD_PREMIUM_P2' -or $sku.skuPartNumber -in @('ENTERPRISEPREMIUM', 'SPE_E5', 'EMSPREMIUM')) { $hasP2 = $true }
                if ($sku.skuPartNumber -eq 'INTUNE_A' -or $sku.skuPartNumber -in $qualifyingSkus) { $hasIntune = $true }
            }
        }

        $licRating = "pass"
        $licMessage = ""
        $licAction = $null

        if (-not $hasQualifyingSku) {
            $licRating = "blocker"
            $licMessage = "No qualifying M365 license found (E3/E5/Business Premium required)"
            $licAction = "Purchase Microsoft 365 E3, E5, or Business Premium before deploying"
        }
        elseif (-not $hasP2) {
            $licRating = "warn"
            $licMessage = "Qualifying M365 license found but no Entra ID P2 (risk-based CA policies CA005/CA006 will not work)"
            $licAction = "Consider adding Entra ID P2 or upgrading to M365 E5 for risk-based policies"
        }
        else {
            $licMessage = "Qualifying M365 license with Entra ID P2 detected"
        }

        $checks += @{
            check       = "licensed-skus"
            displayName = "Licensed SKUs"
            rating      = $licRating
            message     = $licMessage
            details     = @{
                hasQualifyingSku = $hasQualifyingSku
                hasEntraIdP2     = $hasP2
                hasIntune        = $hasIntune
                licenses         = $licenseList
            }
            action      = $licAction
        }
    }
    catch {
        $checks += @{
            check       = "licensed-skus"
            displayName = "Licensed SKUs"
            rating      = "fail"
            message     = "Could not retrieve license data: $($_.Exception.Message)"
            details     = @{}
            action      = "Verify Organization.Read.All or Directory.Read.All permission is granted"
        }
    }

    # =========================================================================
    # CHECK 6: Enrolled Devices
    # =========================================================================
    try {
        Write-Host "[CHECK 6/10] Enrolled Devices..."
        $devices = Invoke-GraphRequestWithRetry -Method GET `
            -Uri "https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?`$select=id,complianceState&`$top=999"

        $totalDevices = 0
        $compliantDevices = 0
        $nonCompliant = 0

        if ($devices.value) {
            foreach ($device in $devices.value) {
                $totalDevices++
                if ($device.complianceState -eq 'compliant') { $compliantDevices++ }
                elseif ($device.complianceState -eq 'noncompliant') { $nonCompliant++ }
            }
        }

        # Handle pagination
        while ($devices.'@odata.nextLink') {
            $devices = Invoke-GraphRequestWithRetry -Method GET -Uri $devices.'@odata.nextLink'
            if ($devices.value) {
                foreach ($device in $devices.value) {
                    $totalDevices++
                    if ($device.complianceState -eq 'compliant') { $compliantDevices++ }
                    elseif ($device.complianceState -eq 'noncompliant') { $nonCompliant++ }
                }
            }
        }

        $devRating = "pass"
        $devAction = $null

        if ($totalDevices -eq 0) {
            $devRating = "warn"
            $devMessage = "No devices enrolled in Intune - CA004 (Require Compliant Device) must NOT be enabled"
            $devAction = "Enroll devices in Intune before enabling device compliance policies"
        }
        elseif ($compliantDevices -eq 0) {
            $devRating = "warn"
            $devMessage = "$totalDevices devices enrolled but 0 compliant - CA004 will lock out all users"
            $devAction = "Resolve device compliance issues before enabling CA004"
        }
        else {
            $devMessage = "$totalDevices devices enrolled, $compliantDevices compliant, $nonCompliant non-compliant"
        }

        $checks += @{
            check       = "enrolled-devices"
            displayName = "Enrolled Devices"
            rating      = $devRating
            message     = $devMessage
            details     = @{
                totalDevices     = $totalDevices
                compliantDevices = $compliantDevices
                nonCompliant     = $nonCompliant
            }
            action      = $devAction
        }
    }
    catch {
        $checks += @{
            check       = "enrolled-devices"
            displayName = "Enrolled Devices"
            rating      = "fail"
            message     = "Could not retrieve device data: $($_.Exception.Message)"
            details     = @{}
            action      = "Verify DeviceManagementManagedDevices.Read.All permission is granted"
        }
    }

    # =========================================================================
    # CHECK 7: Existing Intune Compliance Policies
    # =========================================================================
    try {
        Write-Host "[CHECK 7/10] Intune Compliance Policies..."
        $compPolicies = Invoke-GraphRequestWithRetry -Method GET `
            -Uri "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies?`$select=id,displayName"

        $existingComp = @()
        $omzigComp = @()
        if ($compPolicies.value) {
            $existingComp = @($compPolicies.value)
            $omzigComp = @($compPolicies.value | Where-Object { $_.displayName -match 'ZeroTrust-' })
        }

        $compRating = "pass"
        $compAction = $null
        if ($omzigComp.Count -gt 0) {
            $compRating = "warn"
            $compMessage = "$($omzigComp.Count) existing ZeroTrust compliance policies found - redeploy may create duplicates"
            $compAction = "Review existing policies in Intune admin center before deploying"
        }
        else {
            $compMessage = "$($existingComp.Count) existing compliance policies (none from Omzig)"
        }

        $checks += @{
            check       = "intune-policies"
            displayName = "Intune Compliance Policies"
            rating      = $compRating
            message     = $compMessage
            details     = @{
                totalPolicies = $existingComp.Count
                omzigPolicies = $omzigComp.Count
                policies = ($existingComp | ForEach-Object {
                    @{ displayName = $_.displayName; id = $_.id }
                })
            }
            action      = $compAction
        }
    }
    catch {
        $checks += @{
            check       = "intune-policies"
            displayName = "Intune Compliance Policies"
            rating      = "fail"
            message     = "Could not retrieve Intune policies: $($_.Exception.Message)"
            details     = @{}
            action      = "Verify DeviceManagementConfiguration.Read.All permission is granted"
        }
    }

    # =========================================================================
    # CHECK 8: Break-Glass Accounts
    # =========================================================================
    try {
        Write-Host "[CHECK 8/10] Break-Glass Accounts..."
        $safeGroupName = Format-ODataFilterValue -Value 'ZeroTrust-BreakGlass-Admins'
        $bgGroup = Invoke-GraphRequestWithRetry -Method GET `
            -Uri "https://graph.microsoft.com/v1.0/groups?`$filter=displayName eq '$safeGroupName'&`$select=id,displayName"

        if ($bgGroup.value -and $bgGroup.value.Count -gt 0) {
            $groupId = $bgGroup.value[0].id
            $members = Invoke-GraphRequestWithRetry -Method GET `
                -Uri "https://graph.microsoft.com/v1.0/groups/$groupId/members?`$select=id,displayName&`$top=10"

            $memberCount = if ($members.value) { $members.value.Count } else { 0 }

            if ($memberCount -gt 0) {
                $bgRating = "pass"
                $bgMessage = "Break-glass group exists with $memberCount member(s)"
                $bgAction = $null
            }
            else {
                $bgRating = "warn"
                $bgMessage = "Break-glass group exists but has no members"
                $bgAction = "Add at least 1 emergency access account to ZeroTrust-BreakGlass-Admins"
            }

            $checks += @{
                check       = "break-glass"
                displayName = "Break-Glass Accounts"
                rating      = $bgRating
                message     = $bgMessage
                details     = @{ groupId = $groupId; memberCount = $memberCount }
                action      = $bgAction
            }
        }
        else {
            $checks += @{
                check       = "break-glass"
                displayName = "Break-Glass Accounts"
                rating      = "pass"
                message     = "Break-glass group will be created during Deploy-Identity"
                details     = @{ groupExists = $false }
                action      = $null
            }
        }
    }
    catch {
        $checks += @{
            check       = "break-glass"
            displayName = "Break-Glass Accounts"
            rating      = "fail"
            message     = "Could not check break-glass group: $($_.Exception.Message)"
            details     = @{}
            action      = "Verify Group.Read.All permission is granted"
        }
    }

    # =========================================================================
    # CHECK 9: Admin Role Assignments
    # =========================================================================
    try {
        Write-Host "[CHECK 9/10] Admin Role Assignments..."
        $roles = Invoke-GraphRequestWithRetry -Method GET `
            -Uri "https://graph.microsoft.com/v1.0/directoryRoles?`$select=id,displayName"

        $gaCount = 0
        $gaMembers = @()

        if ($roles.value) {
            $gaRole = @($roles.value | Where-Object { $_.displayName -eq 'Global Administrator' })
            if ($gaRole.Count -gt 0) {
                $gaRoleId = $gaRole[0].id
                $gaRoleMembers = Invoke-GraphRequestWithRetry -Method GET `
                    -Uri "https://graph.microsoft.com/v1.0/directoryRoles/$gaRoleId/members?`$select=id,displayName,userPrincipalName&`$top=100"

                if ($gaRoleMembers.value) {
                    $gaCount = $gaRoleMembers.value.Count
                    $gaMembers = $gaRoleMembers.value | ForEach-Object {
                        @{ displayName = $_.displayName; userPrincipalName = $_.userPrincipalName }
                    }
                }
            }
        }

        $roleRating = "pass"
        $roleAction = $null

        if ($gaCount -eq 0) {
            $roleRating = "warn"
            $roleMessage = "Could not enumerate Global Administrators"
            $roleAction = "Verify Directory.Read.All permission"
        }
        elseif ($gaCount -eq 1) {
            $roleRating = "warn"
            $roleMessage = "Only 1 Global Administrator found (single point of failure)"
            $roleAction = "Add at least 1 more Global Administrator for redundancy"
        }
        elseif ($gaCount -gt 5) {
            $roleRating = "warn"
            $roleMessage = "$gaCount Global Administrators found (excessive - security risk)"
            $roleAction = "Review and reduce Global Admin count to 2-4"
        }
        else {
            $roleMessage = "$gaCount Global Administrators found"
        }

        $checks += @{
            check       = "admin-roles"
            displayName = "Admin Role Assignments"
            rating      = $roleRating
            message     = $roleMessage
            details     = @{
                globalAdminCount = $gaCount
                globalAdmins     = $gaMembers
            }
            action      = $roleAction
        }
    }
    catch {
        $checks += @{
            check       = "admin-roles"
            displayName = "Admin Role Assignments"
            rating      = "fail"
            message     = "Could not retrieve admin roles: $($_.Exception.Message)"
            details     = @{}
            action      = "Verify Directory.Read.All permission is granted"
        }
    }

    # =========================================================================
    # CHECK 10: Domain Verification
    # =========================================================================
    try {
        Write-Host "[CHECK 10/10] Domain Verification..."
        $domains = Invoke-GraphRequestWithRetry -Method GET `
            -Uri "https://graph.microsoft.com/v1.0/domains?`$select=id,isVerified,isDefault,authenticationType"

        $domainList = @()
        $hasCustomDomain = $false
        $hasFederated = $false

        if ($domains.value) {
            foreach ($domain in $domains.value) {
                $domainList += @{
                    name               = $domain.id
                    isVerified         = $domain.isVerified
                    isDefault          = $domain.isDefault
                    authenticationType = $domain.authenticationType
                }
                if ($domain.isVerified -and $domain.id -notmatch '\.onmicrosoft\.com$') {
                    $hasCustomDomain = $true
                }
                if ($domain.authenticationType -eq 'Federated') {
                    $hasFederated = $true
                }
            }
        }

        $domRating = "pass"
        $domAction = $null

        if (-not $hasCustomDomain) {
            $domRating = "warn"
            $domMessage = "No custom domain configured (only .onmicrosoft.com)"
            $domAction = "Consider adding a custom domain before deploying"
        }
        elseif ($hasFederated) {
            $domRating = "warn"
            $domMessage = "Federated domain detected - CA policies may interact differently with federated auth"
            $domAction = "Review CA policy impact on federated authentication"
        }
        else {
            $domMessage = "$($domainList.Count) domain(s) verified"
        }

        $checks += @{
            check       = "domains"
            displayName = "Domain Verification"
            rating      = $domRating
            message     = $domMessage
            details     = @{ domains = $domainList }
            action      = $domAction
        }
    }
    catch {
        $checks += @{
            check       = "domains"
            displayName = "Domain Verification"
            rating      = "fail"
            message     = "Could not retrieve domain data: $($_.Exception.Message)"
            details     = @{}
            action      = "Verify Domain.Read.All permission is granted"
        }
    }

    # =========================================================================
    # CALCULATE OVERALL READINESS
    # =========================================================================
    $passCount    = @($checks | Where-Object { $_.rating -eq "pass" }).Count
    $warnCount    = @($checks | Where-Object { $_.rating -eq "warn" }).Count
    $failCount    = @($checks | Where-Object { $_.rating -eq "fail" }).Count
    $blockerCount = @($checks | Where-Object { $_.rating -eq "blocker" }).Count

    $overallReadiness = if ($blockerCount -gt 0) { "blocked" }
        elseif ($failCount -gt 0) { "not-ready" }
        elseif ($warnCount -gt 0) { "caution" }
        else { "ready" }

    $nextSteps = @()
    if ($overallReadiness -eq "ready") {
        $nextSteps += "All checks passed. You may proceed with deployment."
        $nextSteps += "Run: POST /api/orchestrate to begin Zero Trust deployment"
    }
    elseif ($overallReadiness -eq "caution") {
        $nextSteps += "Review WARN items above before proceeding."
        $nextSteps += "Deployment can proceed but some items need attention."
    }
    elseif ($overallReadiness -eq "not-ready") {
        $nextSteps += "Fix FAIL items before deploying."
        $nextSteps += "Run setup-tenant.ps1 to resolve permission issues."
    }
    else {
        $nextSteps += "BLOCKER items must be resolved before deployment can proceed."
        $nextSteps += "Run setup-tenant.ps1 to grant required permissions."
    }

    # =========================================================================
    # BUILD RESPONSE
    # =========================================================================
    $responseBody = @{
        status           = "Success"
        timestamp        = (Get-Date).ToUniversalTime().ToString('o')
        tenantInfo       = @{
            tenantId      = if ($tenantId) { $tenantId } else { "unknown" }
            displayName   = if ($tenantName) { $tenantName } else { "unknown" }
            primaryDomain = if ($primaryDomain) { $primaryDomain } else { "unknown" }
        }
        overallReadiness = $overallReadiness
        summary          = @{
            total   = $checks.Count
            pass    = $passCount
            warn    = $warnCount
            fail    = $failCount
            blocker = $blockerCount
        }
        checks           = $checks
        nextSteps        = $nextSteps
    }

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::OK
        Body       = ($responseBody | ConvertTo-Json -Depth 10)
        Headers    = @{ 'Content-Type' = 'application/json' }
    })
}
catch {
    Write-Host "Pre-Deploy-Audit failed: $_"

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::InternalServerError
        Body       = (@{
            status    = "Failed"
            error     = "Pre-Deploy-Audit failed. Check function logs for details."
            timestamp = (Get-Date).ToUniversalTime().ToString('o')
        } | ConvertTo-Json)
        Headers    = @{ 'Content-Type' = 'application/json' }
    })
}

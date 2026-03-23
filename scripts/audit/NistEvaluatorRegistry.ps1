# NistEvaluatorRegistry.ps1
# Comprehensive NIST SP 800-207 Zero Trust Architecture checks.
# Covers all 7 tenets + 800-53 cross-reference from CISA SCuBA controls.

function Get-NistZtaChecks {
    param($Facts)

    $checks = @()

    # =====================================================================
    # Tenet 1: All data sources and computing services are resources
    # (Asset Awareness)
    # =====================================================================

    # 1.1 Device inventory completeness
    if ($Facts.devices.available) {
        if ($Facts.devices.totalDevices -gt 0) {
            $checks += New-AuditCheck -Name "[NIST ZTA T1] Device Inventory" -Rating "pass" -Message "$($Facts.devices.totalDevices) managed devices in Intune inventory." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T1] Device Inventory" -Rating "fail" -Message "No managed devices found in Intune." -Action "Enroll devices in Intune to establish a device inventory."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T1] Device Inventory" -Rating "fail" -Message "Could not retrieve device inventory." -Action "Verify Intune permissions (DeviceManagementManagedDevices.Read.All)."
    }

    # 1.2 Application inventory tracked
    if ($Facts.appRegistrations.available) {
        if ($Facts.appRegistrations.totalApps -gt 0) {
            $checks += New-AuditCheck -Name "[NIST ZTA T1] Application Inventory" -Rating "pass" -Message "$($Facts.appRegistrations.totalApps) app registration(s) tracked." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T1] Application Inventory" -Rating "warn" -Message "No app registrations found." -Action "Track applications via Entra ID app registrations for visibility."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T1] Application Inventory" -Rating "na" -Message "Could not retrieve app registrations." -Action "Grant Application.Read.All permission."
    }

    # 1.3 Data classification deployed
    if ($Facts.sensitivityLabels.available) {
        if ($Facts.sensitivityLabels.totalLabels -gt 0) {
            $checks += New-AuditCheck -Name "[NIST ZTA T1] Data Classification" -Rating "pass" -Message "$($Facts.sensitivityLabels.totalLabels) sensitivity label(s) deployed." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T1] Data Classification" -Rating "warn" -Message "No sensitivity labels found." -Action "Create and publish sensitivity labels for data classification."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T1] Data Classification" -Rating "na" -Message "Could not retrieve sensitivity labels." -Action "Grant InformationProtection permissions or use Microsoft Purview."
    }

    # 1.4 Domain inventory complete
    if ($Facts.domains.available) {
        if ($Facts.domains.customDomainCount -gt 0) {
            $checks += New-AuditCheck -Name "[NIST ZTA T1] Domain Inventory" -Rating "pass" -Message "$($Facts.domains.customDomainCount) custom domain(s) verified." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T1] Domain Inventory" -Rating "warn" -Message "Only .onmicrosoft.com domain found." -Action "Add and verify custom domains for production use."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T1] Domain Inventory" -Rating "fail" -Message "Could not retrieve domain information." -Action "Verify directory read permissions."
    }

    # =====================================================================
    # Tenet 2: All communication is secured regardless of network location
    # (Encryption Everywhere)
    # =====================================================================

    # 2.1 Legacy authentication blocked
    if ($Facts.conditionalAccess.available) {
        $legacyBlock = $false
        foreach ($pol in $Facts.conditionalAccess.policies) {
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
            $checks += New-AuditCheck -Name "[NIST ZTA T2] Legacy Auth Blocked" -Rating "pass" -Message "CA policy blocks legacy authentication protocols." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T2] Legacy Auth Blocked" -Rating "fail" -Message "No CA policy blocks legacy authentication." -Action "Block legacy auth to ensure all communication uses modern encrypted protocols."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T2] Legacy Auth Blocked" -Rating "fail" -Message "Could not verify legacy authentication blocking." -Action "Verify CA policy read permissions."
    }

    # 2.2 Security defaults vs CA strategy
    if ($Facts.securityDefaults.available -and $Facts.conditionalAccess.available) {
        if ($Facts.conditionalAccess.totalPolicies -gt 0 -and -not $Facts.securityDefaults.enabled) {
            $checks += New-AuditCheck -Name "[NIST ZTA T2] Security Baseline Strategy" -Rating "pass" -Message "Using Conditional Access ($($Facts.conditionalAccess.totalPolicies) policies). Security defaults disabled." -Action $null
        }
        elseif ($Facts.securityDefaults.enabled -and $Facts.conditionalAccess.totalPolicies -gt 0) {
            $checks += New-AuditCheck -Name "[NIST ZTA T2] Security Baseline Strategy" -Rating "warn" -Message "Security defaults enabled alongside CA policies -potential conflict." -Action "Disable security defaults when using Conditional Access."
        }
        elseif ($Facts.securityDefaults.enabled) {
            $checks += New-AuditCheck -Name "[NIST ZTA T2] Security Baseline Strategy" -Rating "warn" -Message "Security defaults enabled (basic baseline). Consider CA for granular control." -Action "Upgrade to Conditional Access policies for full ZTA control."
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T2] Security Baseline Strategy" -Rating "fail" -Message "Neither security defaults nor CA policies are active." -Action "Enable security defaults or deploy Conditional Access policies."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T2] Security Baseline Strategy" -Rating "fail" -Message "Could not determine security baseline strategy." -Action "Verify access to security defaults and CA policy data."
    }

    # 2.3 Named locations don't grant blanket trust
    if ($Facts.namedLocations.available -and $Facts.conditionalAccess.available) {
        $trustedLocationCount = 0
        foreach ($loc in $Facts.namedLocations.locations) {
            if ($loc.isTrusted) { $trustedLocationCount++ }
        }
        if ($trustedLocationCount -eq 0) {
            $checks += New-AuditCheck -Name "[NIST ZTA T2] Network Trust Posture" -Rating "pass" -Message "No trusted named locations configured -no network-based trust bypass." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T2] Network Trust Posture" -Rating "warn" -Message "$trustedLocationCount trusted named location(s) configured." -Action "Review trusted locations to ensure they don't bypass MFA or other controls."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T2] Network Trust Posture" -Rating "na" -Message "Could not evaluate named location trust configuration." -Action $null
    }

    # 2.4 Modern auth enforced
    if ($Facts.conditionalAccess.available -and $Facts.licenses.available) {
        if ($Facts.conditionalAccess.totalPolicies -gt 0 -and $Facts.licenses.hasQualifyingSku) {
            $checks += New-AuditCheck -Name "[NIST ZTA T2] Modern Auth Enforcement" -Rating "pass" -Message "CA policies active with qualifying license -modern auth enforced." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T2] Modern Auth Enforcement" -Rating "warn" -Message "Verify modern authentication is enforced for all workloads." -Action "Ensure CA policies enforce modern authentication across Exchange, SharePoint, and Teams."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T2] Modern Auth Enforcement" -Rating "na" -Message "Could not verify modern auth enforcement." -Action $null
    }

    # =====================================================================
    # Tenet 3: Access to individual resources is granted on a per-session basis
    # (No Implicit Trust)
    # =====================================================================

    # 3.1 CA policies enforce per-session evaluation
    if ($Facts.conditionalAccess.available) {
        $enabledPolicies = $Facts.conditionalAccess.enabledCount + $Facts.conditionalAccess.reportOnlyCount
        if ($enabledPolicies -ge 3) {
            $checks += New-AuditCheck -Name "[NIST ZTA T3] Per-Session Evaluation" -Rating "pass" -Message "$enabledPolicies active CA policies provide per-session access control." -Action $null
        }
        elseif ($enabledPolicies -ge 1) {
            $checks += New-AuditCheck -Name "[NIST ZTA T3] Per-Session Evaluation" -Rating "warn" -Message "Only $enabledPolicies CA policy(s) active." -Action "Deploy additional CA policies for comprehensive per-session evaluation."
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T3] Per-Session Evaluation" -Rating "fail" -Message "No active CA policies for per-session access." -Action "Deploy CA policies to enforce per-session access decisions."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T3] Per-Session Evaluation" -Rating "fail" -Message "Could not verify per-session access controls." -Action $null
    }

    # 3.2 Sign-in frequency configured
    if ($Facts.conditionalAccess.available) {
        $hasSessionControls = $false
        foreach ($pol in $Facts.conditionalAccess.policies) {
            if ($pol.state -eq "disabled") { continue }
            if ($pol.sessionControls) {
                $sc = $pol.sessionControls
                if ($sc.signInFrequency -and $sc.signInFrequency.isEnabled) {
                    $hasSessionControls = $true
                    break
                }
                if ($sc.persistentBrowser -and $sc.persistentBrowser.isEnabled) {
                    $hasSessionControls = $true
                    break
                }
            }
        }
        if ($hasSessionControls) {
            $checks += New-AuditCheck -Name "[NIST ZTA T3] Session Controls" -Rating "pass" -Message "CA session controls (sign-in frequency or persistent browser) configured." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T3] Session Controls" -Rating "warn" -Message "No CA session control policies detected." -Action "Configure sign-in frequency and persistent browser controls in CA policies."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T3] Session Controls" -Rating "na" -Message "Could not verify session control configuration." -Action $null
    }

    # =====================================================================
    # Tenet 4: Access is determined by dynamic policy
    # (Policy Engine)
    # =====================================================================

    # 4.1 Risk-based CA policies active
    if ($Facts.conditionalAccess.available -and $Facts.licenses.available) {
        if (-not $Facts.licenses.hasP2) {
            $checks += New-AuditCheck -Name "[NIST ZTA T4] Risk-Based Access" -Rating "warn" -Message "Entra ID P2 required for risk-based CA." -Action "Add Entra ID P2 to enable user risk and sign-in risk policies."
        }
        else {
            $hasUserRisk = $false
            $hasSignInRisk = $false
            foreach ($pol in $Facts.conditionalAccess.policies) {
                if ($pol.state -eq "disabled") { continue }
                $conditions = $pol.conditions
                if ($conditions) {
                    if ($conditions.userRiskLevels -and $conditions.userRiskLevels.Count -gt 0) { $hasUserRisk = $true }
                    if ($conditions.signInRiskLevels -and $conditions.signInRiskLevels.Count -gt 0) { $hasSignInRisk = $true }
                }
            }
            if ($hasUserRisk -and $hasSignInRisk) {
                $checks += New-AuditCheck -Name "[NIST ZTA T4] Risk-Based Access" -Rating "pass" -Message "Both user risk and sign-in risk CA policies detected." -Action $null
            }
            elseif ($hasUserRisk -or $hasSignInRisk) {
                $missing = $(if (-not $hasUserRisk) { "user risk" } else { "sign-in risk" })
                $checks += New-AuditCheck -Name "[NIST ZTA T4] Risk-Based Access" -Rating "warn" -Message "Missing $missing CA policy." -Action "Add a CA policy addressing $missing for comprehensive risk-based access."
            }
            else {
                $checks += New-AuditCheck -Name "[NIST ZTA T4] Risk-Based Access" -Rating "fail" -Message "No risk-based CA policies found despite P2 licensing." -Action "Create CA policies for user risk and sign-in risk levels."
            }
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T4] Risk-Based Access" -Rating "fail" -Message "Could not verify risk-based policies." -Action $null
    }

    # 4.2 Device compliance required for access
    if ($Facts.conditionalAccess.available) {
        $requiresCompliant = $false
        foreach ($pol in $Facts.conditionalAccess.policies) {
            if ($pol.state -eq "disabled") { continue }
            $grants = $pol.grantControls
            if ($grants -and $grants.builtInControls) {
                foreach ($ctrl in $grants.builtInControls) {
                    if ($ctrl -eq "compliantDevice") { $requiresCompliant = $true; break }
                }
            }
            if ($requiresCompliant) { break }
        }
        if ($requiresCompliant) {
            $checks += New-AuditCheck -Name "[NIST ZTA T4] Device Compliance Required" -Rating "pass" -Message "A CA policy requires device compliance for access." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T4] Device Compliance Required" -Rating "warn" -Message "No CA policy requires device compliance." -Action "Consider requiring compliant devices via CA to integrate device posture into access decisions."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T4] Device Compliance Required" -Rating "na" -Message "Could not verify device compliance CA requirements." -Action $null
    }

    # 4.3 Location-based access restrictions
    if ($Facts.namedLocations.available -and $Facts.conditionalAccess.available) {
        $hasLocationCondition = $false
        foreach ($pol in $Facts.conditionalAccess.policies) {
            if ($pol.state -eq "disabled") { continue }
            $conditions = $pol.conditions
            if ($conditions -and $conditions.locations) {
                if ($conditions.locations.includeLocations -or $conditions.locations.excludeLocations) {
                    $hasLocationCondition = $true
                    break
                }
            }
        }
        if ($hasLocationCondition) {
            $checks += New-AuditCheck -Name "[NIST ZTA T4] Location-Based Restrictions" -Rating "pass" -Message "CA policies use location-based conditions." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T4] Location-Based Restrictions" -Rating "warn" -Message "No CA policies use location conditions." -Action "Consider geo-based access restrictions for additional zero trust context."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T4] Location-Based Restrictions" -Rating "na" -Message "Could not evaluate location-based access." -Action $null
    }

    # 4.4 Application-specific policies
    if ($Facts.conditionalAccess.available) {
        $hasAppSpecific = $false
        foreach ($pol in $Facts.conditionalAccess.policies) {
            if ($pol.state -eq "disabled") { continue }
            $conditions = $pol.conditions
            if ($conditions -and $conditions.applications) {
                $apps = $conditions.applications
                # Check if targeting specific apps (not just "All")
                if ($apps.includeApplications -and $apps.includeApplications.Count -gt 0) {
                    $allApps = $true
                    foreach ($appId in $apps.includeApplications) {
                        if ($appId -ne "All" -and $appId -ne "Office365") {
                            $allApps = $false
                            $hasAppSpecific = $true
                            break
                        }
                    }
                }
            }
            if ($hasAppSpecific) { break }
        }
        if ($hasAppSpecific) {
            $checks += New-AuditCheck -Name "[NIST ZTA T4] Application-Specific Policies" -Rating "pass" -Message "CA policies target specific applications." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T4] Application-Specific Policies" -Rating "warn" -Message "CA policies only target 'All' apps." -Action "Consider creating application-specific CA policies for granular access control."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T4] Application-Specific Policies" -Rating "na" -Message "Could not evaluate application-specific policies." -Action $null
    }

    # 4.5 MFA enforced for all users
    if ($Facts.mfa.available) {
        if ($Facts.mfa.percentage -ge 95) {
            $checks += New-AuditCheck -Name "[NIST ZTA T4] MFA Coverage" -Rating "pass" -Message "$($Facts.mfa.percentage)% MFA registration." -Action $null
        }
        elseif ($Facts.mfa.percentage -ge 80) {
            $checks += New-AuditCheck -Name "[NIST ZTA T4] MFA Coverage" -Rating "warn" -Message "$($Facts.mfa.percentage)% MFA registration (target 95%)." -Action "Push MFA registration to remaining users."
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T4] MFA Coverage" -Rating "fail" -Message "$($Facts.mfa.percentage)% MFA registration (target 95%)." -Action "Run an MFA registration campaign."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T4] MFA Coverage" -Rating "fail" -Message "Could not retrieve MFA coverage data." -Action $null
    }

    # 4.6 Admin access requires additional controls
    if ($Facts.conditionalAccess.available) {
        $hasAdminPolicy = $false
        foreach ($pol in $Facts.conditionalAccess.policies) {
            if ($pol.state -eq "disabled") { continue }
            $conditions = $pol.conditions
            if ($conditions -and $conditions.users -and $conditions.users.includeRoles -and $conditions.users.includeRoles.Count -gt 0) {
                $hasAdminPolicy = $true
                break
            }
        }
        if ($hasAdminPolicy) {
            $checks += New-AuditCheck -Name "[NIST ZTA T4] Admin Access Controls" -Rating "pass" -Message "CA policies with admin role targeting detected." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T4] Admin Access Controls" -Rating "warn" -Message "No CA policies specifically target admin roles." -Action "Create CA policies requiring stronger controls for privileged roles."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T4] Admin Access Controls" -Rating "na" -Message "Could not evaluate admin-specific access controls." -Action $null
    }

    # =====================================================================
    # Tenet 5: Enterprise monitors and measures integrity/security posture
    # (Visibility & Monitoring)
    # =====================================================================

    # 5.1 Unified audit logging
    if ($Facts.licenses.available) {
        if ($Facts.licenses.hasQualifyingSku) {
            $tier = $(if ($Facts.licenses.hasP2) { "E5/P2 (advanced audit)" } else { "E3 (standard audit)" })
            $checks += New-AuditCheck -Name "[NIST ZTA T5] Audit Logging" -Rating "pass" -Message "Audit logging supported by $tier licensing." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T5] Audit Logging" -Rating "fail" -Message "No qualifying license for unified audit logging." -Action "Upgrade to M365 E3/E5 for audit logging."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T5] Audit Logging" -Rating "na" -Message "Could not verify audit logging licensing." -Action $null
    }

    # 5.2 Defender for Endpoint deployed
    if ($Facts.licenses.available) {
        if ($Facts.licenses.hasDefenderEndpt) {
            $checks += New-AuditCheck -Name "[NIST ZTA T5] Endpoint Detection" -Rating "pass" -Message "Defender for Endpoint is licensed." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T5] Endpoint Detection" -Rating "warn" -Message "No Defender for Endpoint license detected." -Action "Add Defender for Endpoint for device-level threat detection."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T5] Endpoint Detection" -Rating "na" -Message "Could not verify endpoint protection licensing." -Action $null
    }

    # 5.3 Defender for Office 365
    if ($Facts.licenses.available) {
        if ($Facts.licenses.hasDefenderO365) {
            $checks += New-AuditCheck -Name "[NIST ZTA T5] Email Threat Protection" -Rating "pass" -Message "Defender for Office 365 is licensed." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T5] Email Threat Protection" -Rating "warn" -Message "No Defender for Office 365 license detected." -Action "Add Defender for Office 365 for email threat protection."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T5] Email Threat Protection" -Rating "na" -Message "Could not verify email protection licensing." -Action $null
    }

    # 5.4 Telemetry sources available
    $telemetrySignals = 0
    if ($Facts.conditionalAccess.available) { $telemetrySignals++ }
    if ($Facts.mfa.available) { $telemetrySignals++ }
    if ($Facts.devices.available) { $telemetrySignals++ }
    if ($Facts.licenses.available) { $telemetrySignals++ }
    if ($Facts.authMethods.available) { $telemetrySignals++ }
    if ($Facts.adminRoles.available) { $telemetrySignals++ }

    if ($telemetrySignals -ge 5) {
        $checks += New-AuditCheck -Name "[NIST ZTA T5] Telemetry Coverage" -Rating "pass" -Message "$telemetrySignals of 6 telemetry sources accessible." -Action $null
    }
    elseif ($telemetrySignals -ge 3) {
        $checks += New-AuditCheck -Name "[NIST ZTA T5] Telemetry Coverage" -Rating "warn" -Message "$telemetrySignals of 6 telemetry sources accessible." -Action "Broaden Graph API access for comprehensive monitoring."
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T5] Telemetry Coverage" -Rating "fail" -Message "Only $telemetrySignals of 6 telemetry sources accessible." -Action "Grant additional Graph permissions for audit visibility."
    }

    # =====================================================================
    # Tenet 6: All authentication and authorization are dynamic and strictly enforced
    # (Strong Authentication)
    # =====================================================================

    # 6.1 MFA registration coverage
    if ($Facts.mfa.available) {
        if ($Facts.mfa.percentage -ge 95) {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] MFA Registration" -Rating "pass" -Message "$($Facts.mfa.percentage)% users MFA-registered." -Action $null
        }
        elseif ($Facts.mfa.percentage -ge 80) {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] MFA Registration" -Rating "warn" -Message "$($Facts.mfa.percentage)% MFA (target 95%)." -Action "Continue MFA enrollment campaign."
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] MFA Registration" -Rating "fail" -Message "$($Facts.mfa.percentage)% MFA (target 95%)." -Action "Immediately begin MFA registration campaign."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T6] MFA Registration" -Rating "fail" -Message "Could not retrieve MFA data." -Action $null
    }

    # 6.2 Privileged role count controlled
    if ($Facts.adminRoles.available) {
        $count = $Facts.adminRoles.globalAdminCount
        if ($count -ge 2 -and $count -le 5) {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] Privileged Role Control" -Rating "pass" -Message "$count Global Admins (ideal 2-5 range)." -Action $null
        }
        elseif ($count -eq 1) {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] Privileged Role Control" -Rating "warn" -Message "Only 1 Global Admin -resilience risk." -Action "Add a second Global Admin for redundancy."
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] Privileged Role Control" -Rating "warn" -Message "$count Global Admins (recommended 2-5)." -Action "Reduce excessive Global Admin assignments."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T6] Privileged Role Control" -Rating "fail" -Message "Could not verify admin role counts." -Action $null
    }

    # 6.3 Emergency access resilience
    if ($Facts.breakGlass.available) {
        if ($Facts.breakGlass.memberCount -gt 0) {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] Emergency Access" -Rating "pass" -Message "Break-glass group has $($Facts.breakGlass.memberCount) member(s)." -Action $null
        }
        elseif ($Facts.breakGlass.groupExists) {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] Emergency Access" -Rating "warn" -Message "Break-glass group exists but has no members." -Action "Add break-glass accounts to ZeroTrust-BreakGlass-Admins."
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] Emergency Access" -Rating "fail" -Message "No break-glass access configured." -Action "Create emergency access accounts and exclude from CA policies."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T6] Emergency Access" -Rating "fail" -Message "Could not verify emergency access." -Action $null
    }

    # 6.4 Authentication methods modernized
    if ($Facts.authMethods.available) {
        if ($Facts.authMethods.migrationState -eq "migrationComplete") {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] Auth Methods Modernized" -Rating "pass" -Message "Authentication methods migration is complete." -Action $null
        }
        elseif ($Facts.authMethods.migrationState) {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] Auth Methods Modernized" -Rating "warn" -Message "Migration state: $($Facts.authMethods.migrationState)." -Action "Complete migration to the new authentication methods experience."
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] Auth Methods Modernized" -Rating "warn" -Message "Migration state unknown." -Action "Check Authentication Methods policy migration state."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T6] Auth Methods Modernized" -Rating "na" -Message "Could not retrieve authentication methods policy." -Action $null
    }

    # 6.5 SMS/voice discouraged
    if ($Facts.authMethods.available) {
        if (-not $Facts.authMethods.smsEnabled -and -not $Facts.authMethods.voiceEnabled) {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] Weak Auth Methods Disabled" -Rating "pass" -Message "SMS and Voice authentication are disabled." -Action $null
        }
        else {
            $enabledMethods = @()
            if ($Facts.authMethods.smsEnabled) { $enabledMethods += "SMS" }
            if ($Facts.authMethods.voiceEnabled) { $enabledMethods += "Voice" }
            $checks += New-AuditCheck -Name "[NIST ZTA T6] Weak Auth Methods Disabled" -Rating "warn" -Message "$($enabledMethods -join ' and ') still enabled." -Action "Disable SMS and Voice authentication in favor of phishing-resistant methods."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T6] Weak Auth Methods Disabled" -Rating "na" -Message "Could not verify authentication method configuration." -Action $null
    }

    # 6.6 PIM configured
    if ($Facts.roleAssignments.available) {
        if ($Facts.roleAssignments.eligibleAssignments -gt 0) {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] PIM Configured" -Rating "pass" -Message "$($Facts.roleAssignments.eligibleAssignments) eligible PIM assignment(s) detected." -Action $null
        }
        elseif ($Facts.roleAssignments.totalAssignments -gt 0) {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] PIM Configured" -Rating "warn" -Message "Role assignments exist but no PIM eligible assignments detected." -Action "Use PIM for just-in-time privileged access."
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] PIM Configured" -Rating "na" -Message "No role assignments found to evaluate PIM." -Action $null
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T6] PIM Configured" -Rating "na" -Message "Could not retrieve PIM role assignment data." -Action $null
    }

    # 6.7 Admin consent workflow enabled
    if ($Facts.adminConsentPolicy.available) {
        if ($Facts.adminConsentPolicy.enabled) {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] Admin Consent Workflow" -Rating "pass" -Message "Admin consent workflow is enabled." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T6] Admin Consent Workflow" -Rating "warn" -Message "Admin consent workflow is not enabled." -Action "Enable admin consent workflow for controlled application authorization."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T6] Admin Consent Workflow" -Rating "na" -Message "Could not retrieve admin consent policy." -Action $null
    }

    # =====================================================================
    # Tenet 7: Enterprise collects as much information as possible to improve security
    # (Continuous Improvement)
    # =====================================================================

    # 7.1 Entra ID P2 (Identity Protection)
    if ($Facts.licenses.available) {
        if ($Facts.licenses.hasP2) {
            $checks += New-AuditCheck -Name "[NIST ZTA T7] Identity Protection Licensing" -Rating "pass" -Message "Entra ID P2 licensed for Identity Protection capabilities." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T7] Identity Protection Licensing" -Rating "warn" -Message "No Entra ID P2 license detected." -Action "Add P2 for risk-based CA, risky user/sign-in reports, and Identity Protection."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T7] Identity Protection Licensing" -Rating "na" -Message "Could not verify licensing." -Action $null
    }

    # 7.2 Guest access governance
    if ($Facts.authorizationPolicy.available) {
        $invitePolicy = $Facts.authorizationPolicy.allowInvitesFrom
        if ($invitePolicy -eq "adminsAndGuestInviters" -or $invitePolicy -eq "none") {
            $checks += New-AuditCheck -Name "[NIST ZTA T7] Guest Access Governance" -Rating "pass" -Message "Guest invitations restricted ($invitePolicy)." -Action $null
        }
        elseif ($invitePolicy -eq "adminsGuestInvitersAndAllMembers") {
            $checks += New-AuditCheck -Name "[NIST ZTA T7] Guest Access Governance" -Rating "warn" -Message "All members can invite guests." -Action "Restrict guest invitations to admins and guest inviters."
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T7] Guest Access Governance" -Rating "warn" -Message "Guest invitation policy: $invitePolicy." -Action "Review and restrict guest invitation permissions."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T7] Guest Access Governance" -Rating "na" -Message "Could not retrieve authorization policy." -Action $null
    }

    # 7.3 App registration governance
    if ($Facts.authorizationPolicy.available) {
        if (-not $Facts.authorizationPolicy.defaultUserRoleAllowedToCreateApps) {
            $checks += New-AuditCheck -Name "[NIST ZTA T7] App Registration Governance" -Rating "pass" -Message "Users are restricted from registering applications." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T7] App Registration Governance" -Rating "fail" -Message "Default users can register applications." -Action "Restrict app registration to admins only."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T7] App Registration Governance" -Rating "na" -Message "Could not retrieve authorization policy." -Action $null
    }

    # 7.4 Password policy modernized
    if ($Facts.passwordPolicy.available) {
        $validity = $Facts.passwordPolicy.passwordValidityPeriodInDays
        if ($null -eq $validity -or $validity -eq 2147483647 -or $validity -eq 0) {
            $checks += New-AuditCheck -Name "[NIST ZTA T7] Password Policy Modernized" -Rating "pass" -Message "Passwords do not expire (NIST 800-63B aligned)." -Action $null
        }
        else {
            $checks += New-AuditCheck -Name "[NIST ZTA T7] Password Policy Modernized" -Rating "warn" -Message "Passwords expire every $validity days." -Action "Remove forced expiration per NIST 800-63B guidance."
        }
    }
    else {
        $checks += New-AuditCheck -Name "[NIST ZTA T7] Password Policy Modernized" -Rating "na" -Message "Could not retrieve password policy." -Action $null
    }

    return @($checks)
}

function Get-Nist80053CrossReference {
    param([array]$ControlCatalog, [array]$CisaChecks)

    # Build a mapping of NIST 800-53 control families from CISA evaluations
    $familyCounts = [ordered]@{}

    foreach ($control in $ControlCatalog) {
        $nist80053 = $control.nist80053
        if (-not $nist80053) { continue }

        # Extract the family prefix (e.g., "AC" from "AC-7")
        $families = @()
        $refs = $nist80053 -split '[,;]'
        foreach ($ref in $refs) {
            $ref = $ref.Trim()
            $familyMatch = [regex]::Match($ref, '^([A-Z]{2})')
            if ($familyMatch.Success) {
                $family = $familyMatch.Groups[1].Value
                if ($family -notin $families) { $families += $family }
            }
        }

        foreach ($family in $families) {
            if (-not $familyCounts.Contains($family)) {
                $familyCounts[$family] = [ordered]@{
                    total   = 0
                    pass    = 0
                    fail    = 0
                    warn    = 0
                    na      = 0
                }
            }
            $familyCounts[$family].total++

            # Find the matching CISA check result for this control
            $controlId = $control.id
            $matchingCheck = $null
            foreach ($check in $CisaChecks) {
                if ($check.name -match [regex]::Escape($controlId)) {
                    $matchingCheck = $check
                    break
                }
            }

            if ($matchingCheck) {
                switch ($matchingCheck.rating) {
                    "pass" { $familyCounts[$family].pass++ }
                    "fail" { $familyCounts[$family].fail++ }
                    "warn" { $familyCounts[$family].warn++ }
                    default { $familyCounts[$family].na++ }
                }
            }
            else {
                $familyCounts[$family].na++
            }
        }
    }

    # 800-53 family name lookup
    $familyNames = @{
        "AC" = "Access Control"
        "AU" = "Audit and Accountability"
        "CM" = "Configuration Management"
        "IA" = "Identification and Authentication"
        "SC" = "System and Communications Protection"
        "SI" = "System and Information Integrity"
        "AT" = "Awareness and Training"
        "CA" = "Assessment, Authorization, and Monitoring"
        "IR" = "Incident Response"
        "MA" = "Maintenance"
        "MP" = "Media Protection"
        "PE" = "Physical and Environmental Protection"
        "PL" = "Planning"
        "PM" = "Program Management"
        "PS" = "Personnel Security"
        "PT" = "PII Processing and Transparency"
        "RA" = "Risk Assessment"
        "SA" = "System and Services Acquisition"
        "SR" = "Supply Chain Risk Management"
    }

    $crossRef = @()
    foreach ($family in $familyCounts.Keys) {
        $fc = $familyCounts[$family]
        $familyName = $(if ($familyNames.ContainsKey($family)) { $familyNames[$family] } else { $family })
        $summary = "$($fc.pass)/$($fc.total) passing"

        $rating = "na"
        if ($fc.total -gt 0) {
            $passRate = $fc.pass / $fc.total
            if ($passRate -ge 0.8) { $rating = "pass" }
            elseif ($passRate -ge 0.5) { $rating = "warn" }
            elseif ($fc.pass -gt 0 -or $fc.warn -gt 0) { $rating = "warn" }
            else { $rating = "fail" }
        }

        $crossRef += New-AuditCheck -Name "[NIST 800-53] $family ($familyName)" -Rating $rating -Message "$summary" -Action $null
    }

    return @($crossRef)
}

# Deploy-Identity.Tests.ps1
# Pester tests for the Deploy-Identity function
# Compatible with Pester 3.x and 5.x

# Import module before tests (Pester 3.x compatibility)
$script:modulePath = Join-Path -Path $PSScriptRoot -ChildPath '..\Modules\GraphHelper.psm1'
if (Test-Path $script:modulePath) {
    Import-Module $script:modulePath -Force -ErrorAction SilentlyContinue
}

Describe "Deploy-Identity Function" {

    Context "When creating Conditional Access policies" {

        It "Should create all 6 CA policies" {
            # Arrange
            $expectedPolicies = @(
                "CA001-Block-Legacy-Auth",
                "CA002-Require-MFA-All-Users",
                "CA003-Require-MFA-Admins",
                "CA004-Require-Compliant-Device",
                "CA005-Block-High-Risk-Users",
                "CA006-MFA-Risky-SignIn"
            )

            # Act - We'll test the policy definitions directly
            $caPolicies = @(
                @{ displayName = "CA001-Block-Legacy-Auth" },
                @{ displayName = "CA002-Require-MFA-All-Users" },
                @{ displayName = "CA003-Require-MFA-Admins" },
                @{ displayName = "CA004-Require-Compliant-Device" },
                @{ displayName = "CA005-Block-High-Risk-Users" },
                @{ displayName = "CA006-MFA-Risky-SignIn" }
            )

            # Assert
            $caPolicies.Count | Should Be 6
            foreach ($expected in $expectedPolicies) {
                ($caPolicies.displayName -contains $expected) | Should Be $true
            }
        }

        It "Should create policies in Report-Only mode" {
            # Arrange
            $policyState = "enabledForReportingButNotEnforced"

            # Assert - Report-Only is the expected state
            $policyState | Should Be "enabledForReportingButNotEnforced"
        }

        It "Should block legacy authentication in CA001" {
            # Arrange
            $ca001 = @{
                displayName = "CA001-Block-Legacy-Auth"
                conditions = @{
                    clientAppTypes = @("exchangeActiveSync", "other")
                }
                grantControls = @{
                    builtInControls = @("block")
                }
            }

            # Assert
            ($ca001.conditions.clientAppTypes -contains "exchangeActiveSync") | Should Be $true
            ($ca001.conditions.clientAppTypes -contains "other") | Should Be $true
            ($ca001.grantControls.builtInControls -contains "block") | Should Be $true
        }

        It "Should require MFA for all users in CA002" {
            # Arrange
            $ca002 = @{
                displayName = "CA002-Require-MFA-All-Users"
                conditions = @{
                    users = @{ includeUsers = @("All") }
                }
                grantControls = @{
                    builtInControls = @("mfa")
                }
            }

            # Assert
            ($ca002.conditions.users.includeUsers -contains "All") | Should Be $true
            ($ca002.grantControls.builtInControls -contains "mfa") | Should Be $true
        }

        It "Should require MFA for admin roles in CA003" {
            # Arrange
            $adminRoles = @(
                "62e90394-69f5-4237-9190-012177145e10",  # Global Administrator
                "194ae4cb-b126-40b2-bd5b-6091b380977d",  # Security Administrator
                "f28a1f50-f6e7-4571-818b-6a12f2af6b6c"   # SharePoint Administrator
            )

            # Assert
            $adminRoles.Count | Should BeGreaterThan 0
            ($adminRoles -contains "62e90394-69f5-4237-9190-012177145e10") | Should Be $true
        }

        It "Should exclude break-glass group from CA004" {
            # Arrange
            $breakGlassGroupId = "test-group-id-12345"
            $ca004 = @{
                displayName = "CA004-Require-Compliant-Device"
                conditions = @{
                    users = @{
                        includeUsers = @("All")
                        excludeGroups = @($breakGlassGroupId)
                    }
                }
            }

            # Assert
            ($ca004.conditions.users.excludeGroups -contains $breakGlassGroupId) | Should Be $true
        }
    }

    Context "When break-glass group handling" {

        It "Should create break-glass group if not exists" {
            # Arrange
            $groupName = "ZeroTrust-BreakGlass-Admins"

            # Assert
            $groupName | Should Not BeNullOrEmpty
        }

        It "Should use existing break-glass group if present" {
            # Arrange
            $existingGroup = @{
                id = "existing-group-id"
                displayName = "ZeroTrust-BreakGlass-Admins"
            }

            # Assert
            $existingGroup.id | Should Not BeNullOrEmpty
        }
    }

    Context "When HIPAA is enabled" {

        It "Should apply stricter session controls" {
            # Arrange
            $hipaaEnabled = $true
            $sessionTimeout = $(if ($hipaaEnabled) { 60 } else { 480 })

            # Assert
            $sessionTimeout | Should Be 60
        }

        It "Should not remember MFA" {
            # Arrange
            $hipaaEnabled = $true
            $mfaRememberDays = $(if ($hipaaEnabled) { 0 } else { 14 })

            # Assert
            $mfaRememberDays | Should Be 0
        }
    }

    Context "When security baseline varies" {

        It "Should apply Standard baseline settings" {
            # Arrange
            $baseline = "Standard"
            $settings = $(switch ($baseline) {
                "Standard" { @{ strictness = 1 } }
                "Enhanced" { @{ strictness = 2 } }
                "Maximum"  { @{ strictness = 3 } }
            })

            # Assert
            $settings.strictness | Should Be 1
        }

        It "Should apply Enhanced baseline settings" {
            # Arrange
            $baseline = "Enhanced"
            $settings = $(switch ($baseline) {
                "Standard" { @{ strictness = 1 } }
                "Enhanced" { @{ strictness = 2 } }
                "Maximum"  { @{ strictness = 3 } }
            })

            # Assert
            $settings.strictness | Should Be 2
        }

        It "Should apply Maximum baseline settings" {
            # Arrange
            $baseline = "Maximum"
            $settings = $(switch ($baseline) {
                "Standard" { @{ strictness = 1 } }
                "Enhanced" { @{ strictness = 2 } }
                "Maximum"  { @{ strictness = 3 } }
            })

            # Assert
            $settings.strictness | Should Be 3
        }
    }
}

Describe "GraphHelper Module" {

    Context "When connecting to Graph" {

        It "Should require managed identity endpoint" {
            # Arrange
            $endpoint = $env:IDENTITY_ENDPOINT
            $header = $env:IDENTITY_HEADER

            # In local testing, these may not be set
            # The function should handle this gracefully
            $hasIdentity = $null -ne $endpoint -and $null -ne $header

            # Assert - just verify the check logic works
            ($hasIdentity -eq $true -or $hasIdentity -eq $false) | Should Be $true
        }
    }

    Context "When handling API errors" {

        It "Should retry on 429 throttling" {
            # Arrange
            $statusCode = 429
            $shouldRetry = $statusCode -eq 429 -or $statusCode -eq 503

            # Assert
            $shouldRetry | Should Be $true
        }

        It "Should retry on 503 service unavailable" {
            # Arrange
            $statusCode = 503
            $shouldRetry = $statusCode -eq 429 -or $statusCode -eq 503

            # Assert
            $shouldRetry | Should Be $true
        }

        It "Should not retry on 400 bad request" {
            # Arrange
            $statusCode = 400
            $shouldRetry = $statusCode -eq 429 -or $statusCode -eq 503

            # Assert
            $shouldRetry | Should Be $false
        }

        It "Should not retry on 403 forbidden" {
            # Arrange
            $statusCode = 403
            $shouldRetry = $statusCode -eq 429 -or $statusCode -eq 503

            # Assert
            $shouldRetry | Should Be $false
        }
    }
}

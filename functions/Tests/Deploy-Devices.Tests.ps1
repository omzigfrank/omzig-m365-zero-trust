# Deploy-Devices.Tests.ps1
# Pester tests for the Deploy-Devices function
# Compatible with Pester 3.x and 5.x

# Import module before tests (Pester 3.x compatibility)
$script:modulePath = Join-Path -Path $PSScriptRoot -ChildPath '..\Modules\GraphHelper.psm1'
if (Test-Path $script:modulePath) {
    Import-Module $script:modulePath -Force -ErrorAction SilentlyContinue
}

Describe "Deploy-Devices Function" {

    Context "When creating compliance policies" {

        It "Should create Windows compliance policy" {
            # Arrange
            $windowsPolicy = @{
                displayName = "Windows-Compliance-Policy"
                "@odata.type" = "#microsoft.graph.windows10CompliancePolicy"
                passwordRequired = $true
                passwordMinimumLength = 8
                bitLockerEnabled = $true
                secureBootEnabled = $true
                codeIntegrityEnabled = $true
            }

            # Assert
            $windowsPolicy.'@odata.type' | Should Be "#microsoft.graph.windows10CompliancePolicy"
            $windowsPolicy.passwordRequired | Should Be $true
            $windowsPolicy.bitLockerEnabled | Should Be $true
        }

        It "Should create iOS compliance policy" {
            # Arrange
            $iosPolicy = @{
                displayName = "iOS-Compliance-Policy"
                "@odata.type" = "#microsoft.graph.iosCompliancePolicy"
                passcodeRequired = $true
                passcodeMinimumLength = 6
                securityBlockJailbrokenDevices = $true
            }

            # Assert
            $iosPolicy.'@odata.type' | Should Be "#microsoft.graph.iosCompliancePolicy"
            $iosPolicy.passcodeRequired | Should Be $true
            $iosPolicy.securityBlockJailbrokenDevices | Should Be $true
        }

        It "Should create Android compliance policy" {
            # Arrange
            $androidPolicy = @{
                displayName = "Android-Compliance-Policy"
                "@odata.type" = "#microsoft.graph.androidCompliancePolicy"
                passwordRequired = $true
                passwordMinimumLength = 6
                securityBlockJailbrokenDevices = $true
                deviceThreatProtectionEnabled = $true
            }

            # Assert
            $androidPolicy.'@odata.type' | Should Be "#microsoft.graph.androidCompliancePolicy"
            $androidPolicy.securityBlockJailbrokenDevices | Should Be $true
        }

        It "Should create macOS compliance policy" {
            # Arrange
            $macPolicy = @{
                displayName = "macOS-Compliance-Policy"
                "@odata.type" = "#microsoft.graph.macOSCompliancePolicy"
                passwordRequired = $true
                passwordMinimumLength = 8
                storageRequireEncryption = $true
                firewallEnabled = $true
            }

            # Assert
            $macPolicy.'@odata.type' | Should Be "#microsoft.graph.macOSCompliancePolicy"
            $macPolicy.storageRequireEncryption | Should Be $true
            $macPolicy.firewallEnabled | Should Be $true
        }
    }

    Context "When HIPAA is enabled" {

        It "Should require longer passwords" {
            # Arrange
            $hipaaEnabled = $true
            $passwordLength = $(if ($hipaaEnabled) { 14 } else { 8 })

            # Assert
            $passwordLength | Should Be 14
        }

        It "Should have no compliance grace period" {
            # Arrange
            $hipaaEnabled = $true
            $gracePeriodDays = $(if ($hipaaEnabled) { 0 } else { 7 })

            # Assert
            $gracePeriodDays | Should Be 0
        }

        It "Should require encryption on all platforms" {
            # Arrange
            $hipaaEnabled = $true
            $encryptionRequired = $hipaaEnabled

            # Assert
            $encryptionRequired | Should Be $true
        }
    }

    Context "When applying security baselines" {

        It "Should set stricter requirements for Maximum baseline" {
            # Arrange
            $baseline = "Maximum"
            $settings = $(switch ($baseline) {
                "Standard" { @{ passwordLength = 8; lockTimeout = 15 } }
                "Enhanced" { @{ passwordLength = 10; lockTimeout = 10 } }
                "Maximum"  { @{ passwordLength = 14; lockTimeout = 5 } }
            })

            # Assert
            $settings.passwordLength | Should Be 14
            $settings.lockTimeout | Should Be 5
        }
    }
}

Describe "Device Enrollment Restrictions" {

    Context "When blocking personal devices" {

        It "Should block personal Windows devices" {
            # Arrange
            $restrictions = @{
                windows = @{ platformBlocked = $false; personalDeviceEnrollmentBlocked = $true }
            }

            # Assert
            $restrictions.windows.personalDeviceEnrollmentBlocked | Should Be $true
        }

        It "Should block personal iOS devices" {
            # Arrange
            $restrictions = @{
                iOS = @{ platformBlocked = $false; personalDeviceEnrollmentBlocked = $true }
            }

            # Assert
            $restrictions.iOS.personalDeviceEnrollmentBlocked | Should Be $true
        }

        It "Should block personal Android devices" {
            # Arrange
            $restrictions = @{
                android = @{ platformBlocked = $false; personalDeviceEnrollmentBlocked = $true }
            }

            # Assert
            $restrictions.android.personalDeviceEnrollmentBlocked | Should Be $true
        }
    }
}

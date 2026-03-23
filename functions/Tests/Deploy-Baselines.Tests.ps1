Describe 'Deploy-Baselines' {

    BeforeAll {
        # Load module
        $modulePath = Join-Path $PSScriptRoot '..\Modules\BaselineHelper.psm1'
        if (Test-Path $modulePath) {
            Import-Module $modulePath -Force
        }

        # Load catalog
        $catalogPath = Join-Path $PSScriptRoot '..\..\baselines\catalog.json'
        if (Test-Path $catalogPath) {
            $script:catalog = Get-Content $catalogPath -Raw | ConvertFrom-Json
        }
    }

    Context 'Baseline Catalog' {

        It 'Catalog file exists and is valid JSON' {
            $catalogPath = Join-Path $PSScriptRoot '..\..\baselines\catalog.json'
            Test-Path $catalogPath | Should -BeTrue
            { Get-Content $catalogPath -Raw | ConvertFrom-Json } | Should -Not -Throw
        }

        It 'Contains expected number of baselines' {
            $script:catalog.baselines.PSObject.Properties.Count | Should -BeGreaterOrEqual 10
        }

        It 'Contains all current baselines' {
            $currentBaselines = @('win11-25h2', 'win10-22h2', 'server-2025', 'edge-v139', 'm365apps-2512')
            foreach ($bl in $currentBaselines) {
                $script:catalog.baselines.PSObject.Properties[$bl] | Should -Not -BeNullOrEmpty -Because "Baseline $bl should exist"
            }
        }

        It 'Each baseline has required metadata fields' {
            foreach ($prop in $script:catalog.baselines.PSObject.Properties) {
                $meta = $prop.Value.metadata
                $meta.id | Should -Not -BeNullOrEmpty
                $meta.name | Should -Not -BeNullOrEmpty
                $meta.os | Should -Not -BeNullOrEmpty
                $meta.version | Should -Not -BeNullOrEmpty
                $meta.category | Should -Not -BeNullOrEmpty
            }
        }

        It 'Has profiles with positive settings counts' {
            $script:catalog.profiles.Count | Should -BeGreaterOrEqual 50
            foreach ($profile in $script:catalog.profiles) {
                $profile.profileId | Should -Not -BeNullOrEmpty
                $profile.settingsCount | Should -BeGreaterOrEqual 1
            }
        }
    }

    Context 'Baseline Profiles' {

        It 'All referenced profiles have matching JSON files' {
            $profileDir = Join-Path $PSScriptRoot '..\..\baselines\profiles'
            foreach ($profile in $script:catalog.profiles) {
                $profilePath = Join-Path $profileDir "$($profile.profileId).json"
                Test-Path $profilePath | Should -BeTrue -Because "Profile $($profile.profileId) should have a JSON file"
            }
        }

        It 'Profile JSON files are valid and contain settings' {
            $profileDir = Join-Path $PSScriptRoot '..\..\baselines\profiles'
            $sampleProfiles = $script:catalog.profiles | Select-Object -First 10
            foreach ($profileRef in $sampleProfiles) {
                $profilePath = Join-Path $profileDir "$($profileRef.profileId).json"
                $profile = Get-Content $profilePath -Raw | ConvertFrom-Json
                $profile.displayName | Should -Not -BeNullOrEmpty
                $profile.profileType | Should -Not -BeNullOrEmpty
                if ($profile.profileType -eq 'settingsCatalog') {
                    $profile.settings.Count | Should -BeGreaterOrEqual 1
                }
                elseif ($profile.profileType -eq 'endpointSecurity') {
                    $profile.auditPolicies.Count | Should -BeGreaterOrEqual 1
                }
            }
        }

        It 'Windows 11 25H2 has expected profile types' {
            $win11Profiles = $script:catalog.profiles | Where-Object { $_.profileId -like 'sct-win11-25h2-*' }
            $types = $win11Profiles.profileId | ForEach-Object { ($_ -split '-')[-1] }
            $types | Should -Contain 'computer'
            $types | Should -Contain 'defender'
            $types | Should -Contain 'bitlocker'
            $types | Should -Contain 'audit'
        }

        It 'Server 2025 has DC and Member Server profiles' {
            $serverProfiles = $script:catalog.profiles | Where-Object { $_.profileId -like 'sct-server-2025-*' }
            $types = $serverProfiles.profileId | ForEach-Object { ($_ -split '-')[-1] }
            $types | Should -Contain 'serverDC'
            $types | Should -Contain 'serverMember'
        }
    }

    Context 'NSA Zero Trust Mapping' {

        It 'NSA mapping file exists and covers all 7 pillars' {
            $nsaPath = Join-Path $PSScriptRoot '..\..\baselines\mappings\nsa-zero-trust-pillars.json'
            Test-Path $nsaPath | Should -BeTrue

            $nsa = Get-Content $nsaPath -Raw | ConvertFrom-Json
            $pillars = $nsa.PSObject.Properties.Name
            $pillars | Should -Contain 'User'
            $pillars | Should -Contain 'Device'
            $pillars | Should -Contain 'Network'
            $pillars | Should -Contain 'Application'
            $pillars | Should -Contain 'Data'
            $pillars | Should -Contain 'Visibility'
            $pillars | Should -Contain 'Automation'
        }

        It 'Each pillar has settings mapped' {
            $nsaPath = Join-Path $PSScriptRoot '..\..\baselines\mappings\nsa-zero-trust-pillars.json'
            $nsa = Get-Content $nsaPath -Raw | ConvertFrom-Json
            foreach ($prop in $nsa.PSObject.Properties) {
                $prop.Value.settingCount | Should -BeGreaterOrEqual 1 -Because "Pillar $($prop.Name) should have mapped settings"
            }
        }
    }

    Context 'HIPAA Compliance Mapping' {

        It 'HIPAA mapping file exists and covers required controls' {
            $hipaaPath = Join-Path $PSScriptRoot '..\..\baselines\mappings\hipaa-controls.json'
            Test-Path $hipaaPath | Should -BeTrue

            $hipaa = Get-Content $hipaaPath -Raw | ConvertFrom-Json
            $controls = $hipaa.PSObject.Properties.Name
            $controls | Should -Contain '164.312(a)(1)'     # Access Control
            $controls | Should -Contain '164.312(a)(2)(iv)' # Encryption
            $controls | Should -Contain '164.312(b)'        # Audit Controls
            $controls | Should -Contain '164.312(c)(1)'     # Integrity
            $controls | Should -Contain '164.312(d)'        # Authentication
            $controls | Should -Contain '164.312(e)(1)'     # Transmission Security
        }
    }

    Context 'Registry Setting Quality' {

        It 'Settings have valid OMA-URI paths' {
            $profileDir = Join-Path $PSScriptRoot '..\..\baselines\profiles'
            $profile = Get-Content (Join-Path $profileDir 'sct-win11-25h2-defender.json') -Raw | ConvertFrom-Json
            foreach ($setting in $profile.settings) {
                $setting.omaUri | Should -Match '^\./Device/|^\./User/'
                $setting.dataType | Should -Match '^REG_'
            }
        }

        It 'Settings have valid data types' {
            $profileDir = Join-Path $PSScriptRoot '..\..\baselines\profiles'
            $profile = Get-Content (Join-Path $profileDir 'sct-win11-25h2-computer.json') -Raw | ConvertFrom-Json
            $validTypes = @('REG_DWORD', 'REG_SZ', 'REG_EXPAND_SZ', 'REG_MULTI_SZ', 'REG_QWORD', 'REG_BINARY')
            foreach ($setting in $profile.settings) {
                $setting.dataType | Should -BeIn $validTypes
            }
        }
    }

    Context 'BaselineHelper Module Functions' {

        It 'Get-OmaSettingType returns correct types' {
            Get-OmaSettingType -RegType 'REG_DWORD' | Should -Be '#microsoft.graph.omaSettingInteger'
            Get-OmaSettingType -RegType 'REG_SZ' | Should -Be '#microsoft.graph.omaSettingString'
            Get-OmaSettingType -RegType 'REG_BINARY' | Should -Be '#microsoft.graph.omaSettingBase64'
        }

        It 'Convert-RegistryToDefinitionId normalizes paths' {
            $result = Convert-RegistryToDefinitionId -Key 'Software\Policies\Microsoft\Windows Defender\PUAProtection'
            $result | Should -Match 'device_vendor_msft_policy_config_'
            $result | Should -Not -Match '\\'
        }

        It 'Convert-SettingValue handles DWORD correctly' {
            $result = Convert-SettingValue -Value 1 -DataType 'REG_DWORD'
            $result.'@odata.type' | Should -Match 'IntegerSettingValue'
            $result.value | Should -Be 1
        }
    }
}

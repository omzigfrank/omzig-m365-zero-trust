# ExchangeHelper.psm1 - Shared module for Exchange Online operations
# Uses Exchange Online PowerShell module with certificate-based authentication

$script:ExoConnected = $false

function Connect-ExchangeWithCertificate {
    <#
    .SYNOPSIS
        Connects to Exchange Online using certificate-based authentication
    .DESCRIPTION
        Uses an Azure AD app registration with certificate for unattended Exchange Online access
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$AppId,

        [Parameter(Mandatory)]
        [string]$CertificateThumbprint,

        [Parameter(Mandatory)]
        [string]$Organization
    )

    try {
        # Check if ExchangeOnlineManagement module is available
        if (-not (Get-Module -ListAvailable -Name ExchangeOnlineManagement)) {
            throw "ExchangeOnlineManagement module is not installed. Run: Install-Module ExchangeOnlineManagement"
        }

        Import-Module ExchangeOnlineManagement -ErrorAction Stop

        Connect-ExchangeOnline `
            -AppId $AppId `
            -CertificateThumbprint $CertificateThumbprint `
            -Organization $Organization `
            -ShowBanner:$false `
            -ErrorAction Stop

        $script:ExoConnected = $true
        Write-Host "Connected to Exchange Online successfully"
        return $true
    }
    catch {
        Write-Error "Failed to connect to Exchange Online: $_"
        $script:ExoConnected = $false
        return $false
    }
}

function Connect-ExchangeWithManagedIdentity {
    <#
    .SYNOPSIS
        Connects to Exchange Online using managed identity (requires proper configuration)
    .DESCRIPTION
        Uses Azure managed identity for Exchange Online access.
        Note: This requires Exchange.ManageAsApp permission and Exchange Administrator role.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Organization
    )

    try {
        if (-not (Get-Module -ListAvailable -Name ExchangeOnlineManagement)) {
            throw "ExchangeOnlineManagement module is not installed"
        }

        Import-Module ExchangeOnlineManagement -ErrorAction Stop

        # Use managed identity
        Connect-ExchangeOnline `
            -ManagedIdentity `
            -Organization $Organization `
            -ShowBanner:$false `
            -ErrorAction Stop

        $script:ExoConnected = $true
        Write-Host "Connected to Exchange Online via managed identity"
        return $true
    }
    catch {
        Write-Error "Failed to connect to Exchange Online: $_"
        $script:ExoConnected = $false
        return $false
    }
}

function New-StandardMailFlowRule {
    <#
    .SYNOPSIS
        Creates standard mail flow (transport) rules for security
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [Parameter(Mandatory)]
        [int]$Priority,

        [string]$Description,

        [hashtable]$Conditions,

        [hashtable]$Actions
    )

    if (-not $script:ExoConnected) {
        throw "Not connected to Exchange Online. Call Connect-ExchangeWithCertificate first."
    }

    try {
        # Check if rule already exists
        $existingRule = Get-TransportRule -Identity $Name -ErrorAction SilentlyContinue

        if ($existingRule) {
            Write-Host "Mail flow rule already exists: $Name"
            return @{
                Name = $Name
                Status = "AlreadyExists"
                Id = $existingRule.Guid
            }
        }

        # Create the rule based on conditions and actions
        $ruleParams = @{
            Name = $Name
            Priority = $Priority
            Comments = $Description
            Enabled = $true
        }

        # Add conditions
        if ($Conditions.FromScope) {
            $ruleParams['FromScope'] = $Conditions.FromScope
        }
        if ($Conditions.MessageTypeMatches) {
            $ruleParams['MessageTypeMatches'] = $Conditions.MessageTypeMatches
        }
        if ($Conditions.AttachmentExtensionMatchesWords) {
            $ruleParams['AttachmentExtensionMatchesWords'] = $Conditions.AttachmentExtensionMatchesWords
        }
        if ($Conditions.SubjectOrBodyContainsWords) {
            $ruleParams['SubjectOrBodyContainsWords'] = $Conditions.SubjectOrBodyContainsWords
        }

        # Add actions
        if ($Actions.RejectMessageReasonText) {
            $ruleParams['RejectMessageReasonText'] = $Actions.RejectMessageReasonText
        }
        if ($Actions.PrependSubject) {
            $ruleParams['PrependSubject'] = $Actions.PrependSubject
        }
        if ($Actions.ApplyHtmlDisclaimerLocation) {
            $ruleParams['ApplyHtmlDisclaimerLocation'] = $Actions.ApplyHtmlDisclaimerLocation
            $ruleParams['ApplyHtmlDisclaimerText'] = $Actions.ApplyHtmlDisclaimerText
            $ruleParams['ApplyHtmlDisclaimerFallbackAction'] = 'Wrap'
        }
        if ($Actions.ApplyOME -eq $true) {
            $ruleParams['ApplyRightsProtectionTemplate'] = 'Encrypt'
        }

        $newRule = New-TransportRule @ruleParams -ErrorAction Stop

        Write-Host "Created mail flow rule: $Name"
        return @{
            Name = $Name
            Status = "Created"
            Id = $newRule.Guid
        }
    }
    catch {
        Write-Error "Failed to create mail flow rule $Name : $_"
        return @{
            Name = $Name
            Status = "Failed"
            Error = $_.Exception.Message
        }
    }
}

function New-SharedMailbox {
    <#
    .SYNOPSIS
        Creates a shared mailbox
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [Parameter(Mandatory)]
        [string]$PrimarySmtpAddress,

        [string]$DisplayName,

        [string[]]$FullAccessUsers,

        [string[]]$SendAsUsers
    )

    if (-not $script:ExoConnected) {
        throw "Not connected to Exchange Online. Call Connect-ExchangeWithCertificate first."
    }

    try {
        # Check if mailbox exists
        $existingMailbox = Get-Mailbox -Identity $PrimarySmtpAddress -ErrorAction SilentlyContinue

        if ($existingMailbox) {
            Write-Host "Shared mailbox already exists: $PrimarySmtpAddress"
            return @{
                Name = $Name
                Email = $PrimarySmtpAddress
                Status = "AlreadyExists"
            }
        }

        # Create shared mailbox
        $mailboxParams = @{
            Name = $Name
            PrimarySmtpAddress = $PrimarySmtpAddress
            Shared = $true
        }

        if ($DisplayName) {
            $mailboxParams['DisplayName'] = $DisplayName
        }

        $newMailbox = New-Mailbox @mailboxParams -ErrorAction Stop

        # Grant Full Access permissions
        if ($FullAccessUsers -and $FullAccessUsers.Count -gt 0) {
            foreach ($user in $FullAccessUsers) {
                try {
                    Add-MailboxPermission -Identity $PrimarySmtpAddress -User $user -AccessRights FullAccess -AutoMapping $true -ErrorAction Stop
                    Write-Host "Granted FullAccess to $user on $PrimarySmtpAddress"
                }
                catch {
                    Write-Warning "Failed to grant FullAccess to $user : $_"
                }
            }
        }

        # Grant Send As permissions
        if ($SendAsUsers -and $SendAsUsers.Count -gt 0) {
            foreach ($user in $SendAsUsers) {
                try {
                    Add-RecipientPermission -Identity $PrimarySmtpAddress -Trustee $user -AccessRights SendAs -Confirm:$false -ErrorAction Stop
                    Write-Host "Granted SendAs to $user on $PrimarySmtpAddress"
                }
                catch {
                    Write-Warning "Failed to grant SendAs to $user : $_"
                }
            }
        }

        Write-Host "Created shared mailbox: $PrimarySmtpAddress"
        return @{
            Name = $Name
            Email = $PrimarySmtpAddress
            Status = "Created"
            ExchangeGuid = $newMailbox.ExchangeGuid
        }
    }
    catch {
        Write-Error "Failed to create shared mailbox $PrimarySmtpAddress : $_"
        return @{
            Name = $Name
            Email = $PrimarySmtpAddress
            Status = "Failed"
            Error = $_.Exception.Message
        }
    }
}

function Enable-DkimSigning {
    <#
    .SYNOPSIS
        Enables DKIM signing for a domain
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Domain
    )

    if (-not $script:ExoConnected) {
        throw "Not connected to Exchange Online. Call Connect-ExchangeWithCertificate first."
    }

    try {
        # Check DKIM signing config
        $dkimConfig = Get-DkimSigningConfig -Identity $Domain -ErrorAction SilentlyContinue

        if (-not $dkimConfig) {
            # Create DKIM signing config
            New-DkimSigningConfig -DomainName $Domain -Enabled $true -ErrorAction Stop
            Write-Host "Created and enabled DKIM signing for $Domain"
        }
        elseif (-not $dkimConfig.Enabled) {
            # Enable existing config
            Set-DkimSigningConfig -Identity $Domain -Enabled $true -ErrorAction Stop
            Write-Host "Enabled DKIM signing for $Domain"
        }
        else {
            Write-Host "DKIM signing already enabled for $Domain"
        }

        # Get CNAME records for DNS
        $dkimConfig = Get-DkimSigningConfig -Identity $Domain
        return @{
            Domain = $Domain
            Status = "Enabled"
            Selector1CNAME = $dkimConfig.Selector1CNAME
            Selector2CNAME = $dkimConfig.Selector2CNAME
            DnsRecordsRequired = @(
                "selector1._domainkey.$Domain CNAME $($dkimConfig.Selector1CNAME)",
                "selector2._domainkey.$Domain CNAME $($dkimConfig.Selector2CNAME)"
            )
        }
    }
    catch {
        Write-Error "Failed to configure DKIM for $Domain : $_"
        return @{
            Domain = $Domain
            Status = "Failed"
            Error = $_.Exception.Message
        }
    }
}

function Get-DmarcRecommendation {
    <#
    .SYNOPSIS
        Returns DMARC record recommendation for a domain
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Domain,

        [ValidateSet('none', 'quarantine', 'reject')]
        [string]$Policy = 'quarantine',

        [string]$ReportEmail
    )

    $dmarcRecord = "v=DMARC1; p=$Policy"

    if ($ReportEmail) {
        $dmarcRecord += "; rua=mailto:$ReportEmail"
    }
    else {
        $dmarcRecord += "; rua=mailto:dmarc@$Domain"
    }

    # Add additional recommended settings
    $dmarcRecord += "; pct=100"  # Apply to 100% of messages

    return @{
        Domain = $Domain
        DnsRecord = @{
            Type = "TXT"
            Name = "_dmarc.$Domain"
            Value = $dmarcRecord
        }
        Recommendation = "Add this TXT record to your DNS provider"
    }
}

function Disconnect-ExchangeSession {
    <#
    .SYNOPSIS
        Disconnects from Exchange Online
    #>
    [CmdletBinding()]
    param()

    try {
        Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue
        $script:ExoConnected = $false
        Write-Host "Disconnected from Exchange Online"
    }
    catch {
        Write-Warning "Error disconnecting from Exchange Online: $_"
    }
}

Export-ModuleMember -Function @(
    'Connect-ExchangeWithCertificate'
    'Connect-ExchangeWithManagedIdentity'
    'New-StandardMailFlowRule'
    'New-SharedMailbox'
    'Enable-DkimSigning'
    'Get-DmarcRecommendation'
    'Disconnect-ExchangeSession'
)

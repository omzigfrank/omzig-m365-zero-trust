using namespace System.Net

param($Request, $TriggerMetadata)

<#
.SYNOPSIS
    Deploys Exchange Online configuration for Zero Trust
.DESCRIPTION
    Configures mail flow rules, shared mailboxes, DKIM, and DMARC settings
    for M365 Zero Trust deployment.

.NOTES
    This function uses Graph API for some operations and documents
    Exchange PowerShell requirements for others.
#>

Import-Module (Join-Path $PSScriptRoot '..' 'Modules' 'GraphHelper.psm1') -Force

Write-Host "Deploy-Exchange started"

try {
    $config = $Request.Body
    if (-not $config) {
        $config = @{
            primaryDomain = "contoso.onmicrosoft.com"
            enableMailFlowRules = $true
            createSharedMailboxes = $true
            enableDkim = $true
            hipaaEnabled = $false
        }
    }

    $connected = Connect-GraphWithManagedIdentity
    if (-not $connected) {
        throw "Failed to connect to Microsoft Graph"
    }

    $results = @{
        mailFlowRules = @()
        sharedMailboxes = @()
        dkim = @{}
        dmarc = @{}
        notes = @()
    }

    # =========================================================================
    # MAIL FLOW RULES (Transport Rules)
    # Note: These configurations are documented for Exchange PowerShell
    # Graph API has limited support for transport rules
    # =========================================================================
    if ($config.enableMailFlowRules -eq $true) {
        Write-Host "Documenting mail flow rules configuration..."

        $mailFlowRules = @(
            @{
                name = "Block External Auto-Forward"
                priority = 0
                description = "Prevents data exfiltration via auto-forwarding to external recipients"
                conditions = @{
                    messageTypeMatches = "AutoForward"
                }
                exceptions = @{
                    senderInRecipientList = "ExternalForwardingAllowed"
                }
                actions = @{
                    rejectMessageReasonText = "External auto-forwarding is disabled by policy"
                }
                exchangePowerShell = @"
New-TransportRule -Name 'Block External Auto-Forward' ``
    -Priority 0 ``
    -MessageTypeMatches 'AutoForward' ``
    -FromScope 'InOrganization' ``
    -SentToScope 'NotInOrganization' ``
    -RejectMessageReasonText 'External auto-forwarding is disabled by policy' ``
    -Enabled `$true
"@
            },
            @{
                name = "External Email Warning Banner"
                priority = 1
                description = "Adds [EXTERNAL] tag and warning banner to external emails"
                conditions = @{
                    fromScope = "NotInOrganization"
                }
                actions = @{
                    prependSubject = "[EXTERNAL] "
                    applyHtmlDisclaimerLocation = "Prepend"
                    applyHtmlDisclaimerText = "<div style='background:#FFEB9C;border:1px solid #9C6500;padding:10px;margin:0 0 10px 0;'>This email originated from outside your organization. Exercise caution with links and attachments.</div>"
                }
                exchangePowerShell = @"
New-TransportRule -Name 'External Email Warning Banner' ``
    -Priority 1 ``
    -FromScope 'NotInOrganization' ``
    -PrependSubject '[EXTERNAL] ' ``
    -ApplyHtmlDisclaimerLocation 'Prepend' ``
    -ApplyHtmlDisclaimerText '<div style="background:#FFEB9C;border:1px solid #9C6500;padding:10px;">This email originated from outside your organization. Exercise caution with links and attachments.</div>' ``
    -ApplyHtmlDisclaimerFallbackAction 'Wrap' ``
    -Enabled `$true
"@
            },
            @{
                name = "Block Executable Attachments"
                priority = 2
                description = "Blocks dangerous executable file attachments"
                conditions = @{
                    attachmentExtensionMatchesWords = @("exe", "bat", "cmd", "ps1", "vbs", "js", "jar", "scr", "msi", "dll", "com", "pif", "application", "gadget", "msc", "hta", "cpl", "msp", "chm", "reg", "ws", "wsf", "wsc", "wsh", "lnk")
                }
                actions = @{
                    rejectMessageReasonText = "Executable attachments are blocked by security policy. Please use a secure file sharing service."
                }
                exchangePowerShell = @"
New-TransportRule -Name 'Block Executable Attachments' ``
    -Priority 2 ``
    -AttachmentExtensionMatchesWords @('exe','bat','cmd','ps1','vbs','js','jar','scr','msi','dll','com','pif','application','gadget','msc','hta','cpl','msp','chm','reg','ws','wsf','wsc','wsh','lnk') ``
    -RejectMessageReasonText 'Executable attachments are blocked by security policy.' ``
    -Enabled `$true
"@
            },
            @{
                name = "Encrypt Sensitive Keywords"
                priority = 3
                description = "Auto-encrypts emails containing sensitive keywords"
                conditions = @{
                    subjectOrBodyContainsWords = @("confidential", "sensitive", "private", "encrypt", "restricted", "internal only")
                }
                actions = @{
                    applyOME = $true
                }
                exchangePowerShell = @"
New-TransportRule -Name 'Encrypt Sensitive Keywords' ``
    -Priority 3 ``
    -SubjectOrBodyContainsWords @('confidential','sensitive','private','encrypt','restricted','internal only') ``
    -ApplyRightsProtectionTemplate 'Encrypt' ``
    -Enabled `$true
"@
            }
        )

        # Add HIPAA-specific rules if enabled
        if ($config.hipaaEnabled -eq $true) {
            $mailFlowRules += @{
                name = "HIPAA - PHI Detection Warning"
                priority = 4
                description = "Warns senders when PHI patterns are detected in outbound email"
                conditions = @{
                    subjectOrBodyContainsWords = @("patient", "diagnosis", "treatment", "medical record", "health information", "PHI", "prescription")
                }
                actions = @{
                    notifySender = "RejectUnlessSilentOverride"
                    rejectMessageReasonText = "This message may contain Protected Health Information (PHI). Please verify you are sending to an authorized recipient."
                }
                exchangePowerShell = @"

New-TransportRule -Name 'HIPAA - PHI Detection Warning' ``
    -Priority 4 ``
    -SubjectOrBodyContainsWords @('patient','diagnosis','treatment','medical record','health information','PHI','prescription') ``
    -SentToScope 'NotInOrganization' ``
    -NotifySender 'RejectUnlessSilentOverride' ``
    -RejectMessageReasonText 'This message may contain PHI. Verify authorized recipient.' ``
    -Enabled `$true
"@
            }
        }

        foreach ($rule in $mailFlowRules) {
            $results.mailFlowRules += @{
                name = $rule.name
                priority = $rule.priority
                description = $rule.description
                status = "Documented"
                note = "Requires Exchange Online PowerShell to create"
                exchangePowerShell = $rule.exchangePowerShell
            }
        }

        $results.notes += "Mail flow rules require Exchange Online PowerShell. See exchangePowerShell property for each rule."
    }

    # =========================================================================
    # SHARED MAILBOXES
    # Documented for Exchange PowerShell or admin center creation
    # =========================================================================
    if ($config.createSharedMailboxes -eq $true -and $config.primaryDomain) {
        Write-Host "Documenting shared mailbox configuration..."

        $domain = $config.primaryDomain -replace '\.onmicrosoft\.com$', '.com'
        if ($config.primaryDomain -match '\.onmicrosoft\.com$') {
            $domain = $config.primaryDomain
        }

        $sharedMailboxes = @(
            @{
                name = "Company Info"
                alias = "info"
                email = "info@$domain"
                description = "External inquiries and general information"
            },
            @{
                name = "Support"
                alias = "support"
                email = "support@$domain"
                description = "Help desk and customer support"
            },
            @{
                name = "Sales"
                alias = "sales"
                email = "sales@$domain"
                description = "Sales team inquiries"
            },
            @{
                name = "Human Resources"
                alias = "hr"
                email = "hr@$domain"
                description = "HR department communications"
            },
            @{
                name = "Billing"
                alias = "billing"
                email = "billing@$domain"
                description = "Accounts receivable and billing inquiries"
            }
        )

        foreach ($mailbox in $sharedMailboxes) {
            $results.sharedMailboxes += @{
                name = $mailbox.name
                email = $mailbox.email
                description = $mailbox.description
                status = "Documented"
                note = "Create via Exchange admin center or PowerShell"
                exchangePowerShell = "New-Mailbox -Name '$($mailbox.name)' -Alias '$($mailbox.alias)' -Shared -PrimarySmtpAddress '$($mailbox.email)'"
            }
        }
    }

    # =========================================================================
    # DKIM CONFIGURATION
    # =========================================================================
    if ($config.enableDkim -eq $true -and $config.primaryDomain) {
        Write-Host "Documenting DKIM configuration..."

        $results.dkim = @{
            domain = $config.primaryDomain
            status = "Documented"
            instructions = @(
                "1. In Exchange admin center, go to Mail flow > Rules > DKIM",
                "2. Select your domain and click 'Enable'",
                "3. Add the CNAME records to your DNS provider",
                "4. Wait for DNS propagation (up to 48 hours)",
                "5. Verify DKIM is working with email header analysis"
            )
            dnsRecords = @(
                @{
                    type = "CNAME"
                    name = "selector1._domainkey.$($config.primaryDomain)"
                    value = "selector1-$($config.primaryDomain -replace '\.', '-')._domainkey.YOURTENANT.onmicrosoft.com"
                },
                @{
                    type = "CNAME"
                    name = "selector2._domainkey.$($config.primaryDomain)"
                    value = "selector2-$($config.primaryDomain -replace '\.', '-')._domainkey.YOURTENANT.onmicrosoft.com"
                }
            )
            exchangePowerShell = @"
# Enable DKIM signing for domain
New-DkimSigningConfig -DomainName '$($config.primaryDomain)' -Enabled `$true

# Or enable for existing config
Set-DkimSigningConfig -Identity '$($config.primaryDomain)' -Enabled `$true

# Get CNAME records to add to DNS
Get-DkimSigningConfig -Identity '$($config.primaryDomain)' | Format-List Selector1CNAME, Selector2CNAME
"@
        }
    }

    # =========================================================================
    # DMARC RECOMMENDATION
    # =========================================================================
    if ($config.primaryDomain) {
        Write-Host "Generating DMARC recommendation..."

        $dmarcPolicy = $(if ($config.hipaaEnabled) { "reject" } else { "quarantine" })
        $adminEmail = $(if ($config.adminEmail) { $config.adminEmail } else { "dmarc@$($config.primaryDomain)" })

        $results.dmarc = @{
            domain = $config.primaryDomain
            status = "Recommendation"
            dnsRecord = @{
                type = "TXT"
                name = "_dmarc.$($config.primaryDomain)"
                value = "v=DMARC1; p=$dmarcPolicy; rua=mailto:$adminEmail; pct=100; adkim=s; aspf=s"
            }
            instructions = @(
                "1. Start with p=none to monitor without blocking",
                "2. Review DMARC reports for 2-4 weeks",
                "3. Move to p=quarantine once confident",
                "4. Finally move to p=reject for full protection"
            )
            policyExplanation = @{
                none = "Monitor only - no action on failures"
                quarantine = "Send failing emails to spam/junk"
                reject = "Reject failing emails completely"
            }
        }
    }

    # =========================================================================
    # ANTI-SPAM AND ANTI-PHISHING RECOMMENDATIONS
    # =========================================================================
    $results.securityRecommendations = @{
        antiSpam = @{
            bulkComplaintLevel = 6
            markAsSpamBulkMail = $true
            quarantineRetentionPeriod = 30
            note = "Configure via Security & Compliance Center > Threat Management > Policy"
        }
        antiPhishing = @{
            enableMailboxIntelligence = $true
            enableSpoofIntelligence = $true
            phishThresholdLevel = $(if ($config.hipaaEnabled) { 3 } else { 2 })
            note = "Configure via Defender for Office 365 policies"
        }
        safeAttachments = @{
            action = "DynamicDelivery"
            redirectEnabled = $true
            note = "Requires Defender for Office 365 Plan 1 or higher"
        }
        safeLinks = @{
            scanUrls = $true
            enableForEmail = $true
            enableForTeams = $true
            trackClicks = $true
            note = "Requires Defender for Office 365 Plan 1 or higher"
        }
    }

    $responseBody = @{
        status = "Success"
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
        configuration = @{
            primaryDomain = $config.primaryDomain
            enableMailFlowRules = $config.enableMailFlowRules
            createSharedMailboxes = $config.createSharedMailboxes
            enableDkim = $config.enableDkim
            hipaaEnabled = $config.hipaaEnabled
        }
        results = $results
        summary = @{
            mailFlowRulesDocumented = $results.mailFlowRules.Count
            sharedMailboxesDocumented = $results.sharedMailboxes.Count
            dkimConfigured = ($null -ne $results.dkim.domain)
            dmarcRecommended = ($null -ne $results.dmarc.domain)
        }
        nextSteps = @(
            "1. Run Exchange PowerShell commands to create mail flow rules",
            "2. Create shared mailboxes via Exchange admin center",
            "3. Configure DKIM and add CNAME records to DNS",
            "4. Add DMARC TXT record to DNS",
            "5. Configure anti-spam/anti-phishing in Defender portal"
        )
    }

    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::OK
        Body = ($responseBody | ConvertTo-Json -Depth 10)
        Headers = @{ 'Content-Type' = 'application/json' }
    })
}
catch {
    Write-Host "Deploy-Exchange failed: $_"

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

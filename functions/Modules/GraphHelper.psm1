# GraphHelper.psm1 - Shared module for Microsoft Graph API operations

function Connect-GraphWithManagedIdentity {
    <#
    .SYNOPSIS
        Connects to Microsoft Graph using managed identity
    #>
    [CmdletBinding()]
    param(
        [string[]]$Scopes = @(
            'https://graph.microsoft.com/.default'
        )
    )

    try {
        # Get access token using managed identity
        $tokenResponse = Get-AzAccessToken -ResourceUrl 'https://graph.microsoft.com'
        $secureToken = ConvertTo-SecureString $tokenResponse.Token -AsPlainText -Force

        Connect-MgGraph -AccessToken $secureToken -NoWelcome
        Write-Host "Connected to Microsoft Graph successfully"
        return $true
    }
    catch {
        Write-Error "Failed to connect to Microsoft Graph: $_"
        return $false
    }
}

function Invoke-GraphRequestWithRetry {
    <#
    .SYNOPSIS
        Invokes a Graph API request with retry logic for throttling
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Method,

        [Parameter(Mandatory)]
        [string]$Uri,

        [object]$Body,

        [int]$MaxRetries = 3,

        [int]$RetryDelaySeconds = 5
    )

    $attempt = 0
    $success = $false

    while (-not $success -and $attempt -lt $MaxRetries) {
        $attempt++
        try {
            $params = @{
                Method = $Method
                Uri    = $Uri
            }

            if ($Body) {
                $params['Body'] = ($Body | ConvertTo-Json -Depth 10)
                $params['ContentType'] = 'application/json'
            }

            $response = Invoke-MgGraphRequest @params
            $success = $true
            return $response
        }
        catch {
            $statusCode = $_.Exception.Response.StatusCode.value__

            if ($statusCode -eq 429 -or $statusCode -eq 503) {
                # Throttled or service unavailable - retry
                $retryAfter = $_.Exception.Response.Headers['Retry-After']
                $delay = if ($retryAfter) { [int]$retryAfter } else { $RetryDelaySeconds * $attempt }

                Write-Warning "Request throttled. Waiting $delay seconds before retry $attempt of $MaxRetries"
                Start-Sleep -Seconds $delay
            }
            else {
                Write-Error "Graph API request failed: $_"
                throw
            }
        }
    }

    if (-not $success) {
        throw "Max retries ($MaxRetries) exceeded for Graph API request"
    }
}

function Write-DeploymentLog {
    <#
    .SYNOPSIS
        Writes a structured deployment log entry
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Message,

        [ValidateSet('Info', 'Warning', 'Error', 'Success')]
        [string]$Level = 'Info',

        [string]$Component,

        [hashtable]$Properties
    )

    $logEntry = @{
        Timestamp = (Get-Date).ToUniversalTime().ToString('o')
        Level     = $Level
        Message   = $Message
        Component = $Component
    }

    if ($Properties) {
        $logEntry['Properties'] = $Properties
    }

    $jsonLog = $logEntry | ConvertTo-Json -Compress

    switch ($Level) {
        'Error'   { Write-Error $jsonLog }
        'Warning' { Write-Warning $jsonLog }
        default   { Write-Host $jsonLog }
    }
}

function Test-GraphPermissions {
    <#
    .SYNOPSIS
        Tests if the current identity has required Graph permissions
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string[]]$RequiredPermissions
    )

    try {
        $context = Get-MgContext
        if (-not $context) {
            Write-Error "Not connected to Microsoft Graph"
            return $false
        }

        $missingPermissions = @()
        foreach ($permission in $RequiredPermissions) {
            if ($permission -notin $context.Scopes) {
                $missingPermissions += $permission
            }
        }

        if ($missingPermissions.Count -gt 0) {
            Write-Warning "Missing permissions: $($missingPermissions -join ', ')"
            return $false
        }

        return $true
    }
    catch {
        Write-Error "Failed to check permissions: $_"
        return $false
    }
}

Export-ModuleMember -Function @(
    'Connect-GraphWithManagedIdentity'
    'Invoke-GraphRequestWithRetry'
    'Write-DeploymentLog'
    'Test-GraphPermissions'
)

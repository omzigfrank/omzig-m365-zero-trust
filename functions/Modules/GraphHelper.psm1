# GraphHelper.psm1 - Shared module for Microsoft Graph API operations
# Uses direct REST API calls to avoid slow managed dependency loading

$script:GraphToken = $null

function Connect-GraphWithManagedIdentity {
    <#
    .SYNOPSIS
        Gets an access token for Microsoft Graph using managed identity
    #>
    [CmdletBinding()]
    param()

    try {
        # Get access token using managed identity endpoint
        $resource = "https://graph.microsoft.com"
        $endpoint = $env:IDENTITY_ENDPOINT
        $header = $env:IDENTITY_HEADER

        if (-not $endpoint -or -not $header) {
            throw "Managed identity endpoint not available. Ensure the function app has a managed identity assigned."
        }

        # User-assigned managed identity client ID (set in Function App settings or local.settings.json)
        $clientId = $env:AZURE_CLIENT_ID
        if (-not $clientId) {
            throw "AZURE_CLIENT_ID environment variable not set. Configure it in Function App settings."
        }

        $tokenUri = "$endpoint`?resource=$resource&api-version=2019-08-01&client_id=$clientId"
        $headers = @{ "X-IDENTITY-HEADER" = $header }

        $response = Invoke-RestMethod -Uri $tokenUri -Headers $headers -Method GET
        $script:GraphToken = $response.access_token

        Write-Host "Connected to Microsoft Graph successfully via managed identity (client_id: $clientId)"
        return $true
    }
    catch {
        Write-Error "Failed to get Graph token: $_"
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

    if (-not $script:GraphToken) {
        throw "Not connected to Graph. Call Connect-GraphWithManagedIdentity first."
    }

    $headers = @{
        "Authorization" = "Bearer $script:GraphToken"
        "Content-Type"  = "application/json"
    }

    $attempt = 0
    $success = $false

    while (-not $success -and $attempt -lt $MaxRetries) {
        $attempt++
        try {
            $params = @{
                Method  = $Method
                Uri     = $Uri
                Headers = $headers
            }

            if ($Body) {
                $params['Body'] = ($Body | ConvertTo-Json -Depth 10)
            }

            $response = Invoke-RestMethod @params
            $success = $true
            return $response
        }
        catch {
            $statusCode = $null
            if ($_.Exception.Response) {
                $statusCode = [int]$_.Exception.Response.StatusCode
            }

            if ($statusCode -eq 429 -or $statusCode -eq 503) {
                $delay = $RetryDelaySeconds * $attempt
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
        Tests if the current identity has required Graph permissions by making a test call
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string[]]$RequiredPermissions
    )

    try {
        if (-not $script:GraphToken) {
            Write-Error "Not connected to Microsoft Graph"
            return $false
        }

        # Test by calling the /me endpoint (requires basic permissions)
        $headers = @{
            "Authorization" = "Bearer $script:GraphToken"
        }

        $response = Invoke-RestMethod -Uri "https://graph.microsoft.com/v1.0/organization" -Headers $headers -Method GET -ErrorAction Stop
        Write-Host "Graph API connection verified. Organization: $($response.value[0].displayName)"
        return $true
    }
    catch {
        Write-Error "Failed to verify Graph permissions: $_"
        return $false
    }
}

Export-ModuleMember -Function @(
    'Connect-GraphWithManagedIdentity'
    'Invoke-GraphRequestWithRetry'
    'Write-DeploymentLog'
    'Test-GraphPermissions'
)

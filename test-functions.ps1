$ErrorActionPreference = 'Continue'
$baseUrl = "https://func-omzig-zerotrust.azurewebsites.net/api"

# Get function key from Azure CLI (requires az login)
$az = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
$keyJson = & $az functionapp keys list --name func-omzig-zerotrust --resource-group OMZIG-ZEROTRUST -o json 2>$null | ConvertFrom-Json
$key = $keyJson.functionKeys.default

if (-not $key) {
    Write-Host "ERROR: Could not retrieve function key. Run 'az login' first." -ForegroundColor Red
    exit 1
}

$body = @{
    securityBaseline = "Enhanced"
    hipaaEnabled = $true
} | ConvertTo-Json

$headers = @{
    "x-functions-key" = $key
    "Content-Type" = "application/json"
}

Write-Host "=== Calling Orchestrator ===" -ForegroundColor Cyan
try {
    $result = Invoke-RestMethod -Uri "$baseUrl/orchestrate" -Headers $headers -Method POST -Body $body -TimeoutSec 120
    $result | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Deploying Identity (Conditional Access Policies) ===" -ForegroundColor Cyan
try {
    $result = Invoke-RestMethod -Uri "$baseUrl/deploy/identity" -Headers $headers -Method POST -Body $body -TimeoutSec 300
    $result | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Deploying Devices (Intune Policies) ===" -ForegroundColor Cyan
try {
    $result = Invoke-RestMethod -Uri "$baseUrl/deploy/devices" -Headers $headers -Method POST -Body $body -TimeoutSec 300
    $result | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Deploying Security (Defender for Office 365) ===" -ForegroundColor Cyan
try {
    $result = Invoke-RestMethod -Uri "$baseUrl/deploy/security" -Headers $headers -Method POST -Body $body -TimeoutSec 300
    $result | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Deploying Data (DLP and Sensitivity Labels) ===" -ForegroundColor Cyan
try {
    $result = Invoke-RestMethod -Uri "$baseUrl/deploy/data" -Headers $headers -Method POST -Body $body -TimeoutSec 300
    $result | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Deployment Complete ===" -ForegroundColor Green

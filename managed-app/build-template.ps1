# build-template.ps1
# Script to build mainTemplate.json from Bicep and package the managed application

param(
    [Parameter()]
    [string]$OutputPath = ".",

    [Parameter()]
    [switch]$CreateZip
)

$ErrorActionPreference = 'Stop'

Write-Host "Building Omzig M365 Zero Trust Managed Application..." -ForegroundColor Cyan

# Paths
$rootPath = Split-Path -Parent $PSScriptRoot
$bicepPath = Join-Path $rootPath "bicep" "main.bicep"
$uiPath = Join-Path $rootPath "ui" "createUiDefinition.json"
$mainTemplatePath = Join-Path $OutputPath "mainTemplate.json"

# Check prerequisites
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Error "Azure CLI is not installed. Please install it from https://aka.ms/installazurecli"
    exit 1
}

# Check if Bicep is installed
$bicepVersion = az bicep version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing Bicep CLI..." -ForegroundColor Yellow
    az bicep install
}

# Validate Bicep file
Write-Host "Validating Bicep template..." -ForegroundColor Yellow
az bicep build --file $bicepPath --stdout | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Bicep validation failed"
    exit 1
}
Write-Host "Bicep validation passed" -ForegroundColor Green

# Build mainTemplate.json
Write-Host "Building mainTemplate.json..." -ForegroundColor Yellow
az bicep build --file $bicepPath --outfile $mainTemplatePath
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to build mainTemplate.json"
    exit 1
}
Write-Host "mainTemplate.json created at: $mainTemplatePath" -ForegroundColor Green

# Copy createUiDefinition.json
Write-Host "Copying createUiDefinition.json..." -ForegroundColor Yellow
Copy-Item -Path $uiPath -Destination $OutputPath -Force
Write-Host "createUiDefinition.json copied" -ForegroundColor Green

# Create ZIP package if requested
if ($CreateZip) {
    $zipPath = Join-Path $OutputPath "omzig-m365-zerotrust.zip"

    Write-Host "Creating managed app package..." -ForegroundColor Yellow

    # Get files to include
    $filesToZip = @(
        (Join-Path $OutputPath "mainTemplate.json"),
        (Join-Path $OutputPath "createUiDefinition.json")
    )

    # Create zip
    Compress-Archive -Path $filesToZip -DestinationPath $zipPath -Force

    Write-Host "Managed app package created at: $zipPath" -ForegroundColor Green
}

Write-Host "`nBuild completed successfully!" -ForegroundColor Cyan
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Review mainTemplate.json for any manual adjustments"
Write-Host "2. Test the createUiDefinition.json using the Azure Portal sandbox:"
Write-Host "   https://portal.azure.com/?feature.customPortal=false#blade/Microsoft_Azure_CreateUIDef/SandboxBlade"
Write-Host "3. Upload the ZIP package to create a Managed Application definition"

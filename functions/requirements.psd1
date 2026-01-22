# This file enables modules to be automatically managed by the Functions service.
# See https://aka.ms/functionsmanageddependency for additional information.
@{
    # Microsoft Graph PowerShell SDK
    'Microsoft.Graph.Authentication' = '2.*'
    'Microsoft.Graph.Identity.SignIns' = '2.*'
    'Microsoft.Graph.Identity.DirectoryManagement' = '2.*'
    'Microsoft.Graph.DeviceManagement' = '2.*'
    'Microsoft.Graph.Security' = '2.*'

    # Azure modules
    'Az.Accounts' = '2.*'
    'Az.Resources' = '6.*'
    'Az.KeyVault' = '5.*'
}

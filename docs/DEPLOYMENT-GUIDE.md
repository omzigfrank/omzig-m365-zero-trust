# Deployment Guide

Step-by-step guide for deploying the Omzig M365 Zero Trust solution.

---

## Prerequisites

### Azure Requirements
- Azure subscription with Contributor access
- Permission to create resource groups
- Azure CLI installed (for local builds)

### Microsoft 365 Requirements
- Global Administrator or Security Administrator role
- Appropriate M365 licenses (E3/E5 or Business Premium)
- Defender for Office 365 licenses (if using protection features)
- Entra ID P1/P2 (for Conditional Access)

### Permissions for Graph API
The managed identity requires these Graph API permissions:

| Permission | Type | Purpose |
|------------|------|---------|
| Policy.ReadWrite.ConditionalAccess | Application | Create CA policies |
| Policy.Read.All | Application | Read existing policies |
| DeviceManagementConfiguration.ReadWrite.All | Application | Intune policies |
| DeviceManagementManagedDevices.ReadWrite.All | Application | Device management |
| SecurityEvents.ReadWrite.All | Application | Security configuration |

---

## Deployment Options

### Option 1: Azure Marketplace (Recommended)

1. Navigate to Azure Marketplace
2. Search for "Omzig M365 Zero Trust"
3. Click **Create**
4. Follow the wizard:
   - **Basics**: Select subscription, resource group, region
   - **Organization**: Enter org details, admin email
   - **Licensing**: Select your M365/Defender licenses
   - **Security Baseline**: Choose Standard/Enhanced/Maximum
   - **Compliance**: Enable HIPAA if needed
   - **Review**: Confirm and create

### Option 2: Direct Bicep Deployment

```bash
# Clone the repository
git clone https://github.com/omzig/omzig-m365-zero-trust.git
cd omzig-m365-zero-trust

# Login to Azure
az login

# Set subscription
az account set --subscription "YOUR_SUBSCRIPTION_ID"

# Deploy
az deployment sub create \
  --location eastus \
  --template-file bicep/main.bicep \
  --parameters orgName=contoso \
               environmentName=prod \
               hipaaEnabled=true \
               securityBaseline=Enhanced
```

### Option 3: Build and Deploy Managed App

```powershell
# Build the package
./managed-app/build-template.ps1 -CreateZip

# Upload to storage account
az storage blob upload \
  --account-name yourstorageaccount \
  --container-name packages \
  --name omzig-m365-zerotrust.zip \
  --file ./managed-app/omzig-m365-zerotrust.zip

# Create managed app definition
az managedapp definition create \
  --name OmzigM365ZeroTrust \
  --location eastus \
  --resource-group rg-managed-apps \
  --lock-level ReadOnly \
  --display-name "Omzig M365 Zero Trust" \
  --package-file-uri "https://yourstorageaccount.blob.core.windows.net/packages/omzig-m365-zerotrust.zip"
```

---

## Post-Deployment Steps

### 1. Grant Graph API Permissions

After deployment, grant admin consent for the managed identity:

```bash
# Get the managed identity principal ID
PRINCIPAL_ID=$(az identity show \
  --name id-contoso-prod-graph \
  --resource-group rg-contoso-m365-prod \
  --query principalId -o tsv)

# Grant permissions (requires Global Admin)
# Use Azure Portal: Entra ID > Enterprise applications > [managed identity] > Permissions
```

### 2. Activate Conditional Access Policies

Policies are deployed in **Report-Only** mode by default:

1. Go to **Entra admin center** > **Protection** > **Conditional Access**
2. Review each policy in Report-Only mode
3. Check the "What If" tool for impact analysis
4. Enable policies one at a time:
   - Start with `CA001-Block-Legacy-Auth`
   - Then `CA003-Require-MFA-Admins`
   - Continue with remaining policies

### 3. Assign Compliance Policies

1. Go to **Intune admin center** > **Devices** > **Compliance policies**
2. For each policy, click **Assignments**
3. Assign to appropriate user/device groups
4. Set appropriate grace periods for initial rollout

### 4. Publish Sensitivity Labels

1. Go to **Microsoft Purview compliance portal**
2. Navigate to **Information protection** > **Labels**
3. Review auto-created labels
4. Click **Publish labels** to make them available to users

### 5. Configure Alert Notifications

1. Go to **Azure Portal** > **Monitor** > **Alerts**
2. Find the created action group
3. Add additional notification channels if needed

---

## Validation

### Verify Bicep Deployment

```bash
# Check deployment status
az deployment sub show \
  --name main \
  --query properties.provisioningState

# List deployed resources
az resource list \
  --resource-group rg-contoso-m365-prod \
  --output table
```

### Verify Graph API Configuration

Call the orchestrator function to verify configuration was applied:

```bash
curl -X POST "https://func-contoso-m365-prod.azurewebsites.net/api/orchestrate" \
  -H "Content-Type: application/json" \
  -H "x-functions-key: YOUR_FUNCTION_KEY" \
  -d '{"verify": true}'
```

### Test Conditional Access

1. Use the **What If** tool in Entra ID
2. Simulate sign-in scenarios:
   - User with MFA
   - User without compliant device
   - Legacy authentication attempt
   - Sign-in from risky location

---

## Rollback

If issues occur:

### Disable Conditional Access Policies
```bash
# Using Graph API
PATCH https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies/{id}
{
  "state": "disabled"
}
```

### Delete Resource Group
```bash
az group delete --name rg-contoso-m365-prod --yes
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "Insufficient privileges" | Grant admin consent for Graph API permissions |
| CA policy not applying | Check policy is not in Report-Only mode |
| DLP not detecting | Ensure DLP is enabled for correct locations |
| Functions timing out | Check managed identity permissions |

### Logs

- **Deployment logs**: Azure Portal > Resource Group > Deployments
- **Function logs**: Azure Portal > Function App > Logs
- **Security logs**: Log Analytics workspace > Logs

---

## Support

For issues with this solution:
1. Check the [GitHub Issues](https://github.com/omzig/omzig-m365-zero-trust/issues)
2. Review deployment logs
3. Contact Omzig support

# Azure Marketplace Publishing Guide

Complete guide to publishing the Omzig M365 Zero Trust solution on Azure Marketplace for monetization.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Phase 1: Partner Center Setup](#phase-1-partner-center-setup)
4. [Phase 2: Prepare the Managed Application](#phase-2-prepare-the-managed-application)
5. [Phase 3: Create the Marketplace Offer](#phase-3-create-the-marketplace-offer)
6. [Phase 4: Configure Pricing](#phase-4-configure-pricing)
7. [Phase 5: Submit for Certification](#phase-5-submit-for-certification)
8. [Phase 6: Go Live](#phase-6-go-live)
9. [Post-Publishing](#post-publishing)

---

## Overview

### What is Azure Marketplace?

Azure Marketplace is Microsoft's online store for buying and selling cloud solutions certified to run on Azure. Publishing your solution allows you to:

- Reach millions of Azure customers
- Leverage Microsoft's sales channels
- Automate deployment and billing
- Build credibility with Microsoft certification

### Monetization Options

| Model | Description | Best For |
|-------|-------------|----------|
| **Transact (SaaS)** | Microsoft handles billing, you get paid monthly | Recurring revenue |
| **BYOL (Bring Your Own License)** | Customer purchases license separately | Existing licensing model |
| **Free** | No charge, lead generation | Market penetration |
| **Free Trial** | Limited time free, then paid | Customer acquisition |

### Recommended: Azure Managed Application

For this solution, we recommend publishing as an **Azure Managed Application** with **Transact** billing:

- Customer deploys to their subscription
- You maintain access to the managed resource group
- Microsoft handles billing and payouts
- Monthly or usage-based pricing

---

## Prerequisites

### Business Requirements

- [ ] Legal business entity (LLC, Corp, etc.)
- [ ] Tax identification (EIN/VAT)
- [ ] Bank account for payouts
- [ ] Support email and phone number
- [ ] Privacy policy URL
- [ ] Terms of use URL

### Technical Requirements

- [ ] Microsoft Partner Network (MPN) ID
- [ ] Partner Center account
- [ ] Azure subscription for testing
- [ ] Completed solution (Bicep templates, Functions, UI)

### Content Requirements

- [ ] Solution logo (216x216 PNG, 48x48 PNG)
- [ ] Screenshots (1280x720 PNG, minimum 3)
- [ ] Marketing description (short and long)
- [ ] Support documentation
- [ ] Video demo (optional but recommended)

---

## Phase 1: Partner Center Setup

### Step 1.1: Join Microsoft Partner Network

1. Go to https://partner.microsoft.com
2. Click **Become a Partner**
3. Complete registration with business details
4. Note your **MPN ID** (you'll need this later)

### Step 1.2: Create Partner Center Account

1. Go to https://partner.microsoft.com/dashboard
2. Sign in with your work account
3. Navigate to **Marketplace offers** > **Overview**
4. Complete publisher profile:
   - Legal business name
   - Address
   - Tax information
   - Banking details for payouts

### Step 1.3: Enroll in Commercial Marketplace

1. In Partner Center, go to **Account settings** > **Programs**
2. Click **Commercial Marketplace**
3. Complete enrollment requirements:
   - Verify business identity
   - Accept marketplace agreements
   - Set up payout account

### Step 1.4: Verify Publisher Account

Microsoft will verify your business (takes 1-5 business days):
- Business registration verification
- Tax ID verification
- Bank account verification

---

## Phase 2: Prepare the Managed Application

### Step 2.1: Update createUiDefinition.json

Ensure the UI definition is marketplace-ready:

```json
{
  "$schema": "https://schema.management.azure.com/...",
  "handler": "Microsoft.Azure.CreateUIDef",
  "version": "0.1.2-preview",
  "parameters": {
    "config": {
      "isWizard": true,
      "basics": {
        "description": "Deploy Microsoft 365 Zero Trust security configurations aligned with NSA guidelines."
      }
    }
  }
}
```

### Step 2.2: Create mainTemplate.json

Convert Bicep to ARM JSON for marketplace:

```powershell
# Build ARM template from Bicep
az bicep build --file bicep/main.bicep --outfile managed-app/mainTemplate.json
```

### Step 2.3: Create viewDefinition.json

Define the managed app portal experience:

```json
{
  "$schema": "https://schema.management.azure.com/...",
  "kind": "Overview",
  "properties": {
    "header": "Omzig M365 Zero Trust",
    "description": "Microsoft 365 Zero Trust Security Configuration",
    "commands": [
      {
        "displayName": "View Policies",
        "path": "/conditionalAccess"
      }
    ]
  }
}
```

### Step 2.4: Create the App Package

```powershell
# Create managed app package
cd managed-app

# Ensure all required files exist
$requiredFiles = @(
    "mainTemplate.json",
    "createUiDefinition.json",
    "viewDefinition.json"
)

foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        Write-Error "Missing required file: $file"
        exit 1
    }
}

# Create ZIP package
Compress-Archive -Path *.json -DestinationPath omzig-m365-zerotrust.zip -Force

Write-Host "Package created: omzig-m365-zerotrust.zip"
```

### Step 2.5: Upload Package to Storage

```powershell
# Create storage account for package
az storage account create `
  --name stomzigmarketplace `
  --resource-group rg-marketplace `
  --location eastus `
  --sku Standard_LRS

# Create container
az storage container create `
  --name packages `
  --account-name stomzigmarketplace `
  --public-access blob

# Upload package
az storage blob upload `
  --account-name stomzigmarketplace `
  --container-name packages `
  --name omzig-m365-zerotrust.zip `
  --file omzig-m365-zerotrust.zip

# Get package URL
$packageUrl = az storage blob url `
  --account-name stomzigmarketplace `
  --container-name packages `
  --name omzig-m365-zerotrust.zip `
  -o tsv

Write-Host "Package URL: $packageUrl"
```

---

## Phase 3: Create the Marketplace Offer

### Step 3.1: Create New Offer

1. Go to Partner Center > **Marketplace offers**
2. Click **+ New offer** > **Azure Application**
3. Enter offer details:
   - **Offer ID**: `omzig-m365-zero-trust` (cannot change later)
   - **Offer alias**: `Omzig M365 Zero Trust`

### Step 3.2: Configure Offer Setup

**Offer Setup Tab:**

| Field | Value |
|-------|-------|
| Alias | Omzig M365 Zero Trust |
| Selling through Microsoft | Yes (for Transact) |
| Test Drive | Optional |

### Step 3.3: Configure Properties

**Properties Tab:**

| Field | Value |
|-------|-------|
| Categories | Security, Identity |
| Industries | All |
| Legal | Link to terms of use |
| App Version | 1.0.0 |

**Applicable Products:**
- Azure Active Directory
- Microsoft 365
- Microsoft Intune
- Microsoft Defender

### Step 3.4: Configure Offer Listing

**Offer Listing Tab:**

| Field | Content |
|-------|---------|
| Name | Omzig M365 Zero Trust |
| Search results summary | Deploy NSA-aligned Zero Trust security for Microsoft 365 in minutes |
| Short description | Automated deployment of Conditional Access policies, device compliance, and data protection aligned with NSA Zero Trust guidelines and HIPAA compliance. |

**Long Description (Markdown):**

```markdown
## Omzig M365 Zero Trust

Automate your Microsoft 365 Zero Trust security deployment with NSA-aligned configurations.

### Key Features

- **7 Conditional Access Policies** - Block legacy auth, enforce MFA, risk-based access
- **Device Compliance** - Windows, iOS, Android, macOS policies
- **Data Protection** - DLP policies, sensitivity labels
- **HIPAA Ready** - Toggle HIPAA compliance mode for healthcare

### Security Baselines

Choose your security level:
- **Standard** - Basic security for all organizations
- **Enhanced** - Recommended for most enterprises
- **Maximum** - High-security environments

### What's Included

| Component | Description |
|-----------|-------------|
| Conditional Access | 7 pre-configured policies |
| Named Locations | Trusted IPs, blocked countries |
| Security Groups | Emergency access, pilot groups |
| Monitoring | Log Analytics integration |

### Compliance

- NSA Zero Trust Architecture aligned
- HIPAA compliance mode
- Audit logging enabled

### Support

- Documentation included
- GitHub issue tracking
- Email support available
```

**Media:**
- Logo: Upload 216x216 and 48x48 PNG
- Screenshots: Minimum 3, showing UI wizard and policies
- Videos: Optional demo video URL

### Step 3.5: Configure Preview Audience

Add Azure subscription IDs that can access the preview:

```
<your-azure-subscription-id>
```

---

## Phase 4: Configure Pricing

### Step 4.1: Create Plan

1. Go to **Plan overview** > **+ Create new plan**
2. Enter plan details:
   - **Plan ID**: `standard`
   - **Plan name**: `Standard`

### Step 4.2: Configure Plan Setup

| Field | Value |
|-------|-------|
| Plan Type | Managed Application |
| Package URL | Your blob storage URL |
| Version | 1.0.0 |

### Step 4.3: Configure Pricing

**Pricing Model Options:**

**Option A: Flat Monthly Fee**
```
Monthly Price: $99/month
```

**Option B: Per-User Pricing**
```
Price per user: $2/user/month
Minimum: 25 users
Maximum: Unlimited
```

**Option C: Tiered Pricing**
```
Tier 1 (1-100 users): $99/month
Tier 2 (101-500 users): $299/month
Tier 3 (500+ users): $499/month
```

**Recommended Pricing Strategy:**

| Plan | Price | Target |
|------|-------|--------|
| Starter | $99/month | Small businesses (<50 users) |
| Professional | $299/month | Mid-size (50-500 users) |
| Enterprise | $999/month | Large enterprises (500+ users) |

### Step 4.4: Configure Free Trial (Optional)

```
Trial Duration: 14 days
Trial Type: Full feature access
Conversion: Automatic to paid
```

### Step 4.5: Configure Markets

Select countries where you want to sell:
- United States
- Canada
- United Kingdom
- European Union
- Australia
- (Add others as needed)

---

## Phase 5: Submit for Certification

### Step 5.1: Pre-Certification Checklist

Before submitting, verify:

- [ ] All required fields completed
- [ ] Logo and screenshots uploaded
- [ ] Pricing configured
- [ ] Preview audience added
- [ ] Package URL accessible
- [ ] Test deployment works

### Step 5.2: Validate Package

```powershell
# Test the managed app package locally
az managedapp definition create `
  --name OmzigM365ZeroTrustTest `
  --location eastus `
  --resource-group rg-marketplace `
  --lock-level ReadOnly `
  --display-name "Omzig M365 Zero Trust (Test)" `
  --package-file-uri $packageUrl `
  --authorization "YOUR_AAD_GROUP_ID:Contributor"

# Test deployment
az managedapp create `
  --name test-deployment `
  --resource-group rg-test `
  --location eastus `
  --kind marketplace `
  --managed-rg-id /subscriptions/YOUR_SUB/resourceGroups/rg-managed `
  --managedapp-definition-id /subscriptions/YOUR_SUB/.../OmzigM365ZeroTrustTest
```

### Step 5.3: Submit for Review

1. In Partner Center, go to your offer
2. Click **Review and publish**
3. Review all sections show green checkmarks
4. Click **Publish**

### Step 5.4: Certification Process

Microsoft will review (typically 3-5 business days):

| Check | Description |
|-------|-------------|
| Technical Validation | ARM template syntax, deployment test |
| Security Scan | Malware, vulnerability scan |
| Content Review | Marketing content, screenshots |
| Compliance | Marketplace policies |

### Step 5.5: Address Certification Issues

If certification fails:
1. Review feedback in Partner Center
2. Fix identified issues
3. Update package and re-upload
4. Resubmit for review

---

## Phase 6: Go Live

### Step 6.1: Preview Testing

Once certified, test in preview:

1. Use a subscription from preview audience
2. Navigate to Azure Marketplace
3. Search for your offer (preview)
4. Complete deployment
5. Verify all features work

### Step 6.2: Go Live

After successful preview testing:

1. Go to Partner Center
2. Click **Go live**
3. Confirm go-live

### Step 6.3: Marketplace Listing Goes Live

Timeline after go-live:
- **1-2 hours**: Visible in Azure Marketplace
- **24 hours**: Indexed in search
- **1 week**: Featured in relevant categories

---

## Post-Publishing

### Monitoring Sales

In Partner Center > **Analyze**:
- Orders and revenue
- Customer geography
- Deployment success rate
- Customer feedback

### Managing Support

Set up support workflow:
1. Monitor support email
2. GitHub issues for bugs
3. Documentation updates
4. FAQ maintenance

### Updating the Offer

To release updates:

```powershell
# Update version
# Edit managed-app files

# Create new package
Compress-Archive -Path *.json -DestinationPath omzig-m365-zerotrust-v1.1.0.zip

# Upload new package
az storage blob upload `
  --account-name stomzigmarketplace `
  --container-name packages `
  --name omzig-m365-zerotrust-v1.1.0.zip `
  --file omzig-m365-zerotrust-v1.1.0.zip
```

Then in Partner Center:
1. Create new plan version
2. Update package URL
3. Submit for review

### Marketing Your Offer

1. **Microsoft Co-Sell** - Apply for co-sell ready status
2. **Azure Blog** - Write about your solution
3. **Social Media** - Announce on LinkedIn, Twitter
4. **Case Studies** - Document customer success stories
5. **Webinars** - Host deployment walkthroughs

---

## Revenue and Payouts

### Microsoft Fees

| Fee Type | Percentage |
|----------|------------|
| Marketplace Service Fee | 3% |
| Payment Processing | ~2-3% |
| **Your Revenue** | ~94-95% |

### Payout Schedule

- **Monthly**: First week of following month
- **Minimum**: $50 threshold
- **Methods**: Bank transfer, PayPal

### Tax Considerations

- Microsoft provides 1099/tax forms
- You're responsible for tax compliance
- Consider consulting a tax professional

---

## Appendix: Required Files Checklist

```
managed-app/
├── mainTemplate.json          # ARM template (from Bicep)
├── createUiDefinition.json    # UI wizard definition
├── viewDefinition.json        # Management portal view
└── nestedtemplates/           # Optional nested templates
    ├── identity.json
    ├── security.json
    └── ...
```

### mainTemplate.json Requirements

- Valid ARM template syntax
- All parameters defined
- Outputs for important values
- Compatible with Azure Government (optional)

### createUiDefinition.json Requirements

- Valid UI definition schema
- All parameters mapped
- Validation rules defined
- Good UX flow

---

## Support Resources

- **Partner Center Help**: https://docs.microsoft.com/partner-center
- **Marketplace Docs**: https://docs.microsoft.com/azure/marketplace
- **ARM Template Reference**: https://docs.microsoft.com/azure/templates
- **Certification Requirements**: https://docs.microsoft.com/azure/marketplace/certification-policies

---

## Quick Reference: Partner Center URLs

| Resource | URL |
|----------|-----|
| Partner Center | https://partner.microsoft.com/dashboard |
| MPN Enrollment | https://partner.microsoft.com/membership |
| Marketplace Docs | https://docs.microsoft.com/azure/marketplace |
| Support | https://partner.microsoft.com/support |

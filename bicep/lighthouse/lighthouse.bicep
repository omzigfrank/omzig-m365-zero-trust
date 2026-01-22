// lighthouse.bicep
// Azure Lighthouse delegation template for MSP multi-tenant management
// Part of Phase 8 - Multi-Tenant Management

@description('MSP Tenant ID - the tenant that will manage this subscription')
param mspTenantId string

@description('MSP Offer Name displayed in Azure Portal')
param mspOfferName string = 'Omzig Managed Services'

@description('Description of the managed services offer')
param mspOfferDescription string = 'Zero Trust management, monitoring, and security operations'

@description('Role assignments for MSP staff groups')
param authorizations array = [
  // Reader role for Help Desk
  {
    principalId: '00000000-0000-0000-0000-000000000001' // Replace with actual group ID
    principalIdDisplayName: 'MSP Help Desk'
    roleDefinitionId: 'acdd72a7-3385-48ef-bd42-f606fba81ae7' // Reader
  }
  // Security Admin for Security Team
  {
    principalId: '00000000-0000-0000-0000-000000000002' // Replace with actual group ID
    principalIdDisplayName: 'MSP Security Team'
    roleDefinitionId: 'fb1c8493-542b-48eb-b624-b4c8fea62acd' // Security Admin
  }
  // Contributor for MSP Administrators
  {
    principalId: '00000000-0000-0000-0000-000000000003' // Replace with actual group ID
    principalIdDisplayName: 'MSP Administrators'
    roleDefinitionId: 'b24988ac-6180-42a0-ab88-20f7382dd24c' // Contributor
  }
]

@description('Enable eligible authorizations for JIT access')
param enableEligibleAuthorizations bool = false

@description('Eligible authorizations requiring approval for JIT')
param eligibleAuthorizations array = []

// Generate unique name for the registration definition
var registrationDefinitionName = guid(mspTenantId, mspOfferName, subscription().subscriptionId)

// Registration Definition - defines the MSP's access to this subscription
resource registrationDefinition 'Microsoft.ManagedServices/registrationDefinitions@2022-10-01' = {
  name: registrationDefinitionName
  properties: {
    registrationDefinitionName: mspOfferName
    description: mspOfferDescription
    managedByTenantId: mspTenantId
    authorizations: authorizations
    eligibleAuthorizations: enableEligibleAuthorizations ? eligibleAuthorizations : []
  }
}

// Registration Assignment - activates the delegation for this subscription
resource registrationAssignment 'Microsoft.ManagedServices/registrationAssignments@2022-10-01' = {
  name: registrationDefinitionName
  properties: {
    registrationDefinitionId: registrationDefinition.id
  }
}

// Outputs for verification
output registrationDefinitionId string = registrationDefinition.id
output registrationAssignmentId string = registrationAssignment.id
output mspTenantId string = mspTenantId
output delegatedSubscriptionId string = subscription().subscriptionId

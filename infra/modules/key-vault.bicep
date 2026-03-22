@description('Name of the Key Vault')
param name string

@description('Location for the resource')
param location string

param tags object = {}

@description('Principal ID of the managed identity to grant Key Vault Secrets User')
param managedIdentityPrincipalId string

@secure()
@description('GitHub OAuth client ID to store as a secret')
param githubClientId string

@secure()
@description('Session encryption secret to store')
param sessionSecret string

@secure()
@description('VAPID public key for web push notifications (optional)')
param vapidPublicKey string = ''

@secure()
@description('VAPID private key for web push notifications (optional)')
param vapidPrivateKey string = ''

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    // RBAC authorization is the security layer — only the managed identity can read secrets.
    // Container Apps is not a KV trusted service, so public access must be enabled for
    // secret references to work without VNet/private endpoints.
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

@description('Key Vault Secrets User role definition ID')
var keyVaultSecretsUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')

resource secretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, managedIdentityPrincipalId, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    principalId: managedIdentityPrincipalId
    roleDefinitionId: keyVaultSecretsUserRoleId
    principalType: 'ServicePrincipal'
  }
}

resource githubClientIdSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'github-client-id'
  properties: {
    value: githubClientId
  }
}

resource sessionSecretResource 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'session-secret'
  properties: {
    value: sessionSecret
  }
}

resource vapidPublicKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(vapidPublicKey)) {
  parent: keyVault
  name: 'vapid-public-key'
  properties: {
    value: vapidPublicKey
  }
}

resource vapidPrivateKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(vapidPrivateKey)) {
  parent: keyVault
  name: 'vapid-private-key'
  properties: {
    value: vapidPrivateKey
  }
}

output id string = keyVault.id
output name string = keyVault.name
output uri string = keyVault.properties.vaultUri

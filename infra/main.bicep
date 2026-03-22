targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the environment (e.g., dev, prod)')
param environmentName string

@minLength(1)
@description('Primary location for all resources')
param location string

param containerAppName string = 'copilot-unleashed'

@description('Resource group name (defaults to rg-copilot-unleashed)')
param resourceGroupName string = 'rg-copilot-unleashed'

@secure()
@minLength(1)
@description('GitHub OAuth app client ID')
param githubClientId string

@secure()
@description('Session encryption secret')
param sessionSecret string = newGuid()

param containerAppImage string = ''

@description('Minimum replicas (0 = scale to zero when idle)')
param minReplicas int = 0

@description('Maximum replicas')
param maxReplicas int = 3

@description('CPU cores per replica (e.g. 0.25, 0.5, 1, 2, 4)')
param cpuCores string = '1'

@description('Memory per replica (e.g. 0.5Gi, 1Gi, 2Gi, 4Gi, 8Gi)')
param memoryGi string = '2Gi'

@description('Comma-separated IP ranges to allow access (CIDR notation, empty = allow all)')
param ipRestrictions string = ''

@description('Comma-separated GitHub usernames allowed to log in (empty = allow all)')
param allowedGithubUsers string = ''

@description('Public IP address of the deployer machine for ACR push access. Leave empty to keep ACR fully private.')
param deployerIpAddress string = ''

@secure()
@description('VAPID public key for web push notifications')
param vapidPublicKey string = ''

@secure()
@description('VAPID private key for web push notifications')
param vapidPrivateKey string = ''

@description('VAPID subject (mailto: or https: URL identifying the push sender)')
param vapidSubject string = ''

// --- Naming convention: readable names with short hash for global uniqueness ---
var appShort = 'cu' // copilot-unleashed
var uniqueSuffix = substring(uniqueString(subscription().id, environmentName, location), 0, 4)
var baseName = '${appShort}-${environmentName}'
// Globally unique resources (storage, ACR) need alphanumeric-only, max 24 chars
var envAlphanumeric = replace(environmentName, '-', '')
var envShort = substring(envAlphanumeric, 0, min(length(envAlphanumeric), 10))
var tags = { 'azd-env-name': environmentName }

resource rg 'Microsoft.Resources/resourceGroups@2022-09-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

// 1. Container Registry (Basic, globally unique, alphanumeric only)
module containerRegistry './modules/container-registry.bicep' = {
  name: 'container-registry'
  scope: rg
  params: {
    name: 'cr${appShort}${envShort}${uniqueSuffix}'
    location: location
    tags: tags
    deployerIpAddress: deployerIpAddress
  }
}

// 2. Managed Identity (AcrPull + Key Vault Secrets User)
module managedIdentity './modules/managed-identity.bicep' = {
  name: 'managed-identity'
  scope: rg
  params: {
    name: 'mi-${baseName}'
    location: location
    tags: tags
    containerRegistryId: containerRegistry.outputs.id
  }
}

// 3. Log Analytics (required by Container Apps Environment)
module monitoring './modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: rg
  params: {
    name: 'mon-${baseName}'
    location: location
    tags: tags
  }
}

// 4. Key Vault (RBAC-only, MI access, trusted services bypass)
module keyVault './modules/key-vault.bicep' = {
  name: 'key-vault'
  scope: rg
  params: {
    name: 'kv-${appShort}-${envShort}-${uniqueSuffix}'
    location: location
    tags: tags
    managedIdentityPrincipalId: managedIdentity.outputs.principalId
    githubClientId: githubClientId
    sessionSecret: sessionSecret
    vapidPublicKey: vapidPublicKey
    vapidPrivateKey: vapidPrivateKey
  }
}

// 5. Container Apps (Consumption, scale to zero, Key Vault refs, EmptyDir volume)
module containerApps './modules/container-apps.bicep' = {
  name: 'container-apps'
  scope: rg
  params: {
    name: containerAppName
    location: location
    tags: tags
    containerRegistryLoginServer: containerRegistry.outputs.loginServer
    environmentName: 'cae-${baseName}'
    image: empty(containerAppImage) ? 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest' : containerAppImage
    managedIdentityId: managedIdentity.outputs.id
    githubClientId: githubClientId
    sessionSecret: sessionSecret
    allowedGithubUsers: allowedGithubUsers
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    minReplicas: minReplicas
    maxReplicas: maxReplicas
    cpuCores: cpuCores
    memoryGi: memoryGi
    ipRestrictions: ipRestrictions
    keyVaultUri: keyVault.outputs.uri
    vapidPublicKey: vapidPublicKey
    vapidPrivateKey: vapidPrivateKey
    vapidSubject: vapidSubject
  }
}

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = containerRegistry.outputs.loginServer
output AZURE_CONTAINER_REGISTRY_NAME string = containerRegistry.outputs.name
output AZURE_CONTAINER_APP_FQDN string = containerApps.outputs.fqdn
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_MANAGED_IDENTITY_CLIENT_ID string = managedIdentity.outputs.clientId
output AZURE_KEY_VAULT_NAME string = keyVault.outputs.name
output AZURE_KEY_VAULT_URI string = keyVault.outputs.uri

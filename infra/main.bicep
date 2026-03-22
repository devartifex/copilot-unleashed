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

@description('Minimum replicas (0 for dev, 1+ for prod)')
param minReplicas int = 1

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

@description('Public IP address of the deployer machine (e.g. your local IP or CI runner IP). Required for azd deploy to push images to the private ACR. Leave empty to keep ACR fully private.')
param deployerIpAddress string = ''

@secure()
@description('VAPID public key for web push notifications')
param vapidPublicKey string = ''

@secure()
@description('VAPID private key for web push notifications')
param vapidPrivateKey string = ''

@description('VAPID subject (mailto: or https: URL identifying the push sender)')
param vapidSubject string = ''

var abbrs = loadJsonContent('./abbreviations.json')
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = { 'azd-env-name': environmentName }

resource rg 'Microsoft.Resources/resourceGroups@2022-09-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

// 1. VNet (no deps)
module vnet './modules/vnet.bicep' = {
  name: 'vnet'
  scope: rg
  params: {
    name: '${abbrs.vnet}${resourceToken}'
    location: location
    tags: tags
  }
}

// 2. Container Registry (pass VNet params)
module containerRegistry './modules/container-registry.bicep' = {
  name: 'container-registry'
  scope: rg
  params: {
    name: '${abbrs.containerRegistry}${resourceToken}'
    location: location
    tags: tags
    privateEndpointsSubnetId: vnet.outputs.privateEndpointsSubnetId
    vnetId: vnet.outputs.vnetId
    deployerIpAddress: deployerIpAddress
  }
}

// 3. Managed Identity
module managedIdentity './modules/managed-identity.bicep' = {
  name: 'managed-identity'
  scope: rg
  params: {
    name: '${abbrs.managedIdentity}${resourceToken}'
    location: location
    tags: tags
    containerRegistryId: containerRegistry.outputs.id
  }
}

// 4. Monitoring
module monitoring './modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: rg
  params: {
    name: '${abbrs.monitoring}${resourceToken}'
    location: location
    tags: tags
  }
}

// 5. Storage
module storage './modules/storage.bicep' = {
  name: 'storage'
  scope: rg
  params: {
    name: '${abbrs.storageAccount}${resourceToken}'
    location: location
    tags: tags
    storageSubnetId: vnet.outputs.storageSubnetId
    privateEndpointsSubnetId: vnet.outputs.privateEndpointsSubnetId
    vnetId: vnet.outputs.vnetId
  }
}

// 6. Key Vault (needs managed identity)
module keyVault './modules/key-vault.bicep' = {
  name: 'key-vault'
  scope: rg
  params: {
    name: '${abbrs.keyVault}${resourceToken}'
    location: location
    tags: tags
    managedIdentityPrincipalId: managedIdentity.outputs.principalId
    privateEndpointsSubnetId: vnet.outputs.privateEndpointsSubnetId
    vnetId: vnet.outputs.vnetId
    githubClientId: githubClientId
    sessionSecret: sessionSecret
    vapidPublicKey: vapidPublicKey
    vapidPrivateKey: vapidPrivateKey
  }
}

// 7. Container Apps (updated with VNet + KV + storage)
module containerApps './modules/container-apps.bicep' = {
  name: 'container-apps'
  scope: rg
  params: {
    name: containerAppName
    location: location
    tags: tags
    containerRegistryLoginServer: containerRegistry.outputs.loginServer
    environmentName: '${abbrs.containerAppsEnvironment}${resourceToken}'
    image: empty(containerAppImage) ? 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest' : containerAppImage
    managedIdentityId: managedIdentity.outputs.id
    githubClientId: githubClientId
    sessionSecret: sessionSecret
    allowedGithubUsers: allowedGithubUsers
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    minReplicas: minReplicas
    maxReplicas: maxReplicas
    cpuCores: cpuCores
    memoryGi: memoryGi
    ipRestrictions: ipRestrictions
    containerAppsSubnetId: vnet.outputs.containerAppsSubnetId
    keyVaultUri: keyVault.outputs.uri
    keyVaultName: keyVault.outputs.name
    storageAccountName: storage.outputs.storageAccountName
    storageShareName: storage.outputs.fileShareName
    storageAccountKey: storage.outputs.storageAccountKey
    vapidPublicKey: vapidPublicKey
    vapidPrivateKey: vapidPrivateKey
    vapidSubject: vapidSubject
  }
}

// 8. Diagnostics (needs all resource IDs)
module diagnostics './modules/diagnostics.bicep' = {
  name: 'diagnostics'
  scope: rg
  params: {
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    containerRegistryId: containerRegistry.outputs.id
    storageAccountId: storage.outputs.storageAccountId
    keyVaultId: keyVault.outputs.id
  }
}

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = containerRegistry.outputs.loginServer
output AZURE_CONTAINER_REGISTRY_NAME string = containerRegistry.outputs.name
output AZURE_CONTAINER_APP_FQDN string = containerApps.outputs.fqdn
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_MANAGED_IDENTITY_CLIENT_ID string = managedIdentity.outputs.clientId
output AZURE_KEY_VAULT_NAME string = keyVault.outputs.name
output AZURE_KEY_VAULT_URI string = keyVault.outputs.uri

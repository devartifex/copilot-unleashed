@description('Name prefix for the storage account')
param name string

@description('Location for the resource')
param location string

param tags object = {}

@description('Name of the file share for persistent data')
param shareName string = 'copilot-data'

@description('Subnet ID with Microsoft.Storage service endpoint (empty = no VNet rules)')
param storageSubnetId string = ''

@description('Subnet ID for private endpoint (empty = no private endpoint)')
param privateEndpointsSubnetId string = ''

@description('VNet ID for private DNS zone link (empty = no DNS zone link)')
param vnetId string = ''

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: name
  location: location
  tags: tags
  kind: 'FileStorage'
  sku: {
    name: 'Premium_LRS'
  }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: false // NFS 4.1 uses TCP port 2049
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false // NFS uses network-level auth, no key needed
    networkAcls: !empty(storageSubnetId) ? {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
      virtualNetworkRules: [
        {
          id: storageSubnetId
          action: 'Allow'
        }
      ]
    } : null
  }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource fileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  parent: fileService
  name: shareName
  properties: {
    enabledProtocols: 'NFS'
    rootSquash: 'RootSquash'
    shareQuota: 100 // Minimum 100 GiB for Premium NFS shares
  }
}

// --- Private Endpoint + DNS (conditional) ---

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = if (!empty(privateEndpointsSubnetId)) {
  name: '${name}-pe-file'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointsSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${name}-psc-file'
        properties: {
          privateLinkServiceId: storageAccount.id
          groupIds: [
            'file'
          ]
        }
      }
    ]
  }
}

resource privateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = if (!empty(privateEndpointsSubnetId)) {
  name: 'privatelink.file.core.windows.net'
  location: 'global'
  tags: tags
}

resource dnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = if (!empty(privateEndpointsSubnetId) && !empty(vnetId)) {
  parent: privateDnsZone
  name: '${name}-dnslink'
  location: 'global'
  tags: tags
  properties: {
    virtualNetwork: {
      id: vnetId
    }
    registrationEnabled: false
  }
}

resource dnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = if (!empty(privateEndpointsSubnetId)) {
  parent: privateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'privatelink-file'
        properties: {
          privateDnsZoneId: privateDnsZone.id
        }
      }
    ]
  }
}

output storageAccountId string = storageAccount.id
output storageAccountName string = storageAccount.name
output fileShareName string = fileShare.name
output storageAccountKey string = storageAccount.listKeys().keys[0].value

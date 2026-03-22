@description('Name of the Container Registry')
param name string

@description('Location for the resource')
param location string

param tags object = {}

@description('Resource ID of the private endpoints subnet. Leave empty to skip private endpoint creation.')
param privateEndpointsSubnetId string = ''

@description('Resource ID of the VNet to link the private DNS zone. Leave empty to skip DNS zone creation.')
param vnetId string = ''

@description('Deployer public IP address to allow for azd deploy push access (e.g. your local machine or CI runner IP). Leave empty to keep ACR fully private.')
param deployerIpAddress string = ''

var hasDeployerIp = !empty(deployerIpAddress)

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Premium'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: hasDeployerIp ? 'Enabled' : 'Disabled'
    networkRuleSet: {
      defaultAction: 'Deny'
      ipRules: hasDeployerIp ? [
        {
          action: 'Allow'
          value: deployerIpAddress
        }
      ] : []
    }
  }
}

// --- Private Endpoint (conditional) ---

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = if (!empty(privateEndpointsSubnetId)) {
  name: '${name}-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointsSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${name}-plsc'
        properties: {
          privateLinkServiceId: containerRegistry.id
          groupIds: [
            'registry'
          ]
        }
      }
    ]
  }
}

// --- Private DNS Zone for ACR (conditional) ---

resource privateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = if (!empty(privateEndpointsSubnetId)) {
  name: 'privatelink.azurecr.io'
  location: 'global'
  tags: tags
}

resource privateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = if (!empty(privateEndpointsSubnetId) && !empty(vnetId)) {
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

resource privateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = if (!empty(privateEndpointsSubnetId)) {
  parent: privateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'privatelink-azurecr-io'
        properties: {
          privateDnsZoneId: privateDnsZone.id
        }
      }
    ]
  }
}

output id string = containerRegistry.id
output name string = containerRegistry.name
output loginServer string = containerRegistry.properties.loginServer

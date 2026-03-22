@description('Name of the Container Registry')
param name string

@description('Location for the resource')
param location string

param tags object = {}

@description('Deployer public IP address for azd deploy push access. Leave empty to keep ACR fully private.')
param deployerIpAddress string = ''

var hasDeployerIp = !empty(deployerIpAddress)

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: hasDeployerIp ? 'Enabled' : 'Disabled'
  }
}

output id string = containerRegistry.id
output name string = containerRegistry.name
output loginServer string = containerRegistry.properties.loginServer

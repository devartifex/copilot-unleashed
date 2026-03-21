@description('Log Analytics workspace resource ID')
param logAnalyticsWorkspaceId string

@description('Container Registry resource ID (empty = skip)')
param containerRegistryId string = ''

@description('Storage Account resource ID (empty = skip)')
param storageAccountId string = ''

@description('Key Vault resource ID (empty = skip)')
param keyVaultId string = ''

// Existing resource references for diagnostic setting scoping

resource existingAcr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = if (!empty(containerRegistryId)) {
  name: last(split(containerRegistryId, '/'))
}

resource existingStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = if (!empty(storageAccountId)) {
  name: last(split(storageAccountId, '/'))
}

resource existingKeyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = if (!empty(keyVaultId)) {
  name: last(split(keyVaultId, '/'))
}

// Diagnostic settings — retention is handled by Log Analytics workspace, not here

resource acrDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (!empty(containerRegistryId)) {
  name: 'acr-diagnostics'
  scope: existingAcr
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
        retentionPolicy: { enabled: false, days: 0 }
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
        retentionPolicy: { enabled: false, days: 0 }
      }
    ]
  }
}

resource storageDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (!empty(storageAccountId)) {
  name: 'storage-diagnostics'
  scope: existingStorage
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
        retentionPolicy: { enabled: false, days: 0 }
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
        retentionPolicy: { enabled: false, days: 0 }
      }
    ]
  }
}

resource keyVaultDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (!empty(keyVaultId)) {
  name: 'keyvault-diagnostics'
  scope: existingKeyVault
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        categoryGroup: 'audit'
        enabled: true
        retentionPolicy: { enabled: false, days: 0 }
      }
      {
        categoryGroup: 'allLogs'
        enabled: true
        retentionPolicy: { enabled: false, days: 0 }
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
        retentionPolicy: { enabled: false, days: 0 }
      }
    ]
  }
}

@description('Name of the Container App')
param name string

@description('Location for the resource')
param location string

param tags object = {}
param containerRegistryLoginServer string
param environmentName string
param image string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
param managedIdentityId string

@secure()
@description('GitHub OAuth client ID')
param githubClientId string

@secure()
@description('Session encryption secret')
param sessionSecret string

@description('Comma-separated GitHub usernames allowed to log in (empty = allow all)')
param allowedGithubUsers string = ''

@description('Log Analytics workspace ID for the environment')
param logAnalyticsWorkspaceId string

@description('Minimum number of replicas (1 = always-on, prevents scale-to-zero which wipes EmptyDir and drops all WebSocket connections)')
param minReplicas int = 1

@description('Maximum number of replicas (1 = single instance, required because all session state is in-memory per-process)')
param maxReplicas int = 1

@description('Comma-separated allowed origins for CORS (empty = allow app domain only)')
param allowedOrigins string = ''

@description('Comma-separated IP ranges to allow (CIDR notation, empty = allow all)')
param ipRestrictions string = ''

@description('CPU cores per container replica (e.g. 0.25, 0.5, 1, 2, 4)')
param cpuCores string = '1'

@description('Memory per container replica (e.g. 0.5Gi, 1Gi, 2Gi, 4Gi, 8Gi)')
param memoryGi string = '2Gi'

@description('Key Vault URI (e.g., https://myvault.vault.azure.net/)')
param keyVaultUri string = ''

@secure()
@description('VAPID public key for web push notifications')
param vapidPublicKey string = ''

@secure()
@description('VAPID private key for web push notifications')
param vapidPrivateKey string = ''

@description('VAPID subject (mailto: or https: URL identifying the push sender)')
param vapidSubject string = ''

var hasAllowedUsers = !empty(allowedGithubUsers)
var hasVapidKeys = !empty(vapidPublicKey) && !empty(vapidPrivateKey)
var useKeyVault = !empty(keyVaultUri)

var parsedIpRestrictions = empty(ipRestrictions) ? [] : split(ipRestrictions, ',')

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: reference(logAnalyticsWorkspaceId, '2023-09-01').customerId
        sharedKey: listKeys(logAnalyticsWorkspaceId, '2023-09-01').primarySharedKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
  properties: {
    environmentId: containerAppsEnvironment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
        stickySessions: {
          affinity: 'sticky'
        }
        corsPolicy: {
          allowedOrigins: empty(allowedOrigins) ? [
            'https://${name}.${containerAppsEnvironment.properties.defaultDomain}'
          ] : union([
            'https://${name}.${containerAppsEnvironment.properties.defaultDomain}'
          ], split(allowedOrigins, ','))
          allowedMethods: ['GET', 'POST']
          allowedHeaders: ['Content-Type', 'Authorization']
          maxAge: 3600
        }
        ipSecurityRestrictions: [for (cidr, i) in parsedIpRestrictions: {
          name: 'allow-${i}'
          ipAddressRange: trim(cidr)
          action: 'Allow'
        }]
      }
      registries: [
        {
          server: containerRegistryLoginServer
          identity: managedIdentityId
        }
      ]
      secrets: concat(
        useKeyVault ? [
          {
            name: 'github-client-id'
            keyVaultUrl: '${keyVaultUri}secrets/github-client-id'
            identity: managedIdentityId
          }
          {
            name: 'session-secret'
            keyVaultUrl: '${keyVaultUri}secrets/session-secret'
            identity: managedIdentityId
          }
        ] : [
          {
            name: 'github-client-id'
            value: githubClientId
          }
          {
            name: 'session-secret'
            value: sessionSecret
          }
        ],
        hasAllowedUsers ? [
          {
            name: 'allowed-github-users'
            value: allowedGithubUsers
          }
        ] : [],
        hasVapidKeys && useKeyVault ? [
          {
            name: 'vapid-public-key'
            keyVaultUrl: '${keyVaultUri}secrets/vapid-public-key'
            identity: managedIdentityId
          }
          {
            name: 'vapid-private-key'
            keyVaultUrl: '${keyVaultUri}secrets/vapid-private-key'
            identity: managedIdentityId
          }
        ] : hasVapidKeys ? [
          {
            name: 'vapid-public-key'
            value: vapidPublicKey
          }
          {
            name: 'vapid-private-key'
            value: vapidPrivateKey
          }
        ] : []
      )
    }
    template: {
      // EmptyDir: ephemeral storage scoped to the replica lifetime.
      // Data survives container restarts but not replica replacement/scaling events.
      volumes: [
        {
          name: 'copilot-data'
          storageType: 'EmptyDir'
        }
      ]
      containers: [
        {
          name: 'copilot-unleashed'
          image: image
          env: concat([
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3000' }
            { name: 'BASE_URL', value: 'https://${name}.${containerAppsEnvironment.properties.defaultDomain}' }
            { name: 'GITHUB_CLIENT_ID', secretRef: 'github-client-id' }
            { name: 'SESSION_SECRET', secretRef: 'session-secret' }
            { name: 'COPILOT_CONFIG_DIR', value: '/data/copilot-home' }
            { name: 'CHAT_STATE_PATH', value: '/data/chat-state' }
            { name: 'PUSH_STORE_PATH', value: '/data/push-subscriptions' }
            { name: 'BODY_SIZE_LIMIT', value: '52428800' }
          ], hasAllowedUsers ? [
            { name: 'ALLOWED_GITHUB_USERS', secretRef: 'allowed-github-users' }
          ] : [], hasVapidKeys ? [
            { name: 'VAPID_PUBLIC_KEY', secretRef: 'vapid-public-key' }
            { name: 'VAPID_PRIVATE_KEY', secretRef: 'vapid-private-key' }
            { name: 'VAPID_SUBJECT', value: !empty(vapidSubject) ? vapidSubject : 'mailto:admin@example.com' }
          ] : [])
          resources: {
            cpu: json(cpuCores)
            memory: memoryGi
          }
          volumeMounts: [
            {
              volumeName: 'copilot-data'
              mountPath: '/data'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3000
              }
              initialDelaySeconds: 10
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 3000
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-rule'
            http: {
              metadata: {
                concurrentRequests: '10'
              }
            }
          }
        ]
      }
    }
  }
}

output fqdn string = containerApp.properties.configuration.ingress.fqdn

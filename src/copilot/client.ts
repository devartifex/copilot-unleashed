import { CopilotClient } from '@github/copilot-sdk';

const clients = new Map<string, CopilotClient>();

export async function getCopilotClient(
  sessionId: string,
  githubToken: string
): Promise<CopilotClient> {
  let client = clients.get(sessionId);
  if (client) {
    if (process.env.DEBUG_COPILOT) console.log(`[Copilot] Reusing existing client for session ${sessionId}`);
    return client;
  }

  if (process.env.DEBUG_COPILOT) console.log(`[Copilot] Creating new CopilotClient for session ${sessionId}`);
  
  const clientConfig: any = {
    githubToken,
    useLoggedInUser: false,
    // Disable VSCode integration to use SDK standalone
    useVscodeIntegration: false,
  };
  
  // Try to disable VSCode integration
  if (process.env.DISABLE_VSCODE_INTEGRATION !== 'false') {
    clientConfig.vscodeIntegration = false;
  }
  
  if (process.env.DEBUG_COPILOT) console.log(`[Copilot] Client config:`, { useLoggedInUser: clientConfig.useLoggedInUser, vscodeIntegration: clientConfig.vscodeIntegration });
  
  try {
    client = new CopilotClient(clientConfig);
    if (process.env.DEBUG_COPILOT) console.log(`[Copilot] CopilotClient created successfully`);
  } catch (err) {
    console.error(`[Copilot] Failed to create CopilotClient:`, err);
    throw err;
  }

  clients.set(sessionId, client);
  return client;
}

export async function destroyCopilotClient(
  sessionId: string
): Promise<void> {
  const client = clients.get(sessionId);
  if (client) {
    try {
      await client.stop();
    } catch {
      // ignore cleanup errors
    }
    clients.delete(sessionId);
  }
}

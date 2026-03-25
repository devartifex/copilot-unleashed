import { poolSend } from '../session-pool.js';
import type { MessageContext } from '../types.js';
import { scanCustomizations } from '../../customizations/scanner.js';
import { config } from '../../config.js';

export async function handleListTools(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  try {
    const model = typeof msg.model === 'string' ? msg.model : undefined;
    const result = await connectionEntry.client.rpc.tools.list({ model });
    poolSend(connectionEntry, { type: 'tools', tools: result?.tools || [] });
  } catch (err: any) {
    console.error('List tools error:', err.message);
    poolSend(connectionEntry, { type: 'tools', tools: [] });
  }
}

export async function handleListAgents(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  if (!connectionEntry.session) {
    poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
    return;
  }
  try {
    const agents = await connectionEntry.session.rpc.agent.list();
    let current = null;
    try {
      current = await connectionEntry.session.rpc.agent.getCurrent();
    } catch { /* no current agent */ }

    // Merge with scanner data for source metadata
    let scannedAgents: { name: string; source: string }[] = [];
    try {
      const customizations = await scanCustomizations(config.copilotConfigDir, config.copilotCwd);
      scannedAgents = customizations.agents.map(a => ({ name: a.name, source: a.source }));
    } catch { /* scanner failure is non-fatal */ }

    const currentName = current?.agent?.name ?? current?.agent ?? null;
    const scannedMap = new Map(scannedAgents.map(a => [a.name.toLowerCase(), a.source]));

    const sourcedAgents = (agents?.agents || []).map((a: any) => {
      const name = typeof a === 'string' ? a : a.name;
      const displayName = typeof a === 'string' ? undefined : a.displayName;
      const description = typeof a === 'string' ? undefined : a.description;
      const scanSource = scannedMap.get(name.toLowerCase());
      const source = scanSource === 'user' ? 'user' : scanSource === 'repo' ? 'repo' : 'builtin';
      return {
        name,
        ...(displayName && { displayName }),
        ...(description && { description }),
        source,
        isSelected: name === currentName,
      };
    });

    poolSend(connectionEntry, { type: 'agents', agents: sourcedAgents, current: currentName });
  } catch (err: any) {
    console.error('List agents error:', err.message);
    poolSend(connectionEntry, { type: 'agents', agents: [], current: null });
  }
}

export async function handleSelectAgent(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  if (!connectionEntry.session) {
    poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
    return;
  }
  const agentName = typeof msg.name === 'string' ? msg.name.trim() : '';
  if (!agentName) {
    poolSend(connectionEntry, { type: 'error', message: 'Agent name is required' });
    return;
  }
  try {
    await connectionEntry.session.rpc.agent.select({ name: agentName });
    poolSend(connectionEntry, { type: 'agent_changed', agent: agentName });
  } catch (err: any) {
    console.error('Select agent error:', err.message);
    poolSend(connectionEntry, { type: 'error', message: `Failed to select agent: ${err.message}` });
  }
}

export async function handleDeselectAgent(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  if (!connectionEntry.session) {
    poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
    return;
  }
  try {
    await connectionEntry.session.rpc.agent.deselect();
    poolSend(connectionEntry, { type: 'agent_changed', agent: null });
  } catch (err: any) {
    console.error('Deselect agent error:', err.message);
    poolSend(connectionEntry, { type: 'error', message: `Failed to deselect agent: ${err.message}` });
  }
}

import type { CustomizationSource, SourcedMcpServerInfo } from '$lib/types/index.js';

export function groupBySource<T extends { source: CustomizationSource }>(items: T[]): Map<CustomizationSource, T[]> {
  const groups = new Map<CustomizationSource, T[]>();
  const order: CustomizationSource[] = ['builtin', 'repo', 'user'];
  for (const src of order) {
    const filtered = items.filter(i => i.source === src);
    if (filtered.length > 0) groups.set(src, filtered);
  }
  return groups;
}

/** Normalize SDK source strings to standard labels */
export function normalizeCustomizationSource(raw: string | undefined): CustomizationSource {
  const src = (raw ?? '').toLowerCase();
  return (src === 'personal' || src === 'user')
    ? 'user'
    : (src === 'project' || src === 'workspace' || src === 'repo')
      ? 'repo'
      : 'builtin';
}

/** Merge incoming MCP server list with existing, deduplicating by name.
 *  Only overwrites fields when the incoming value is defined, and prefers
 *  live status (connected/failed) over static status (not_configured). */
export function mergeMcpServers(
  current: SourcedMcpServerInfo[],
  incoming: Array<{
    name: string;
    source?: string;
    status: string;
    type?: string;
    url?: string;
    command?: string;
    error?: string;
  }>,
): SourcedMcpServerInfo[] {
  const merged = new Map(current.map((server) => [server.name.toLowerCase(), server]));

  for (const server of incoming) {
    const key = server.name.toLowerCase();
    const existing = merged.get(key);

    // Pick the more informative status: live status wins over static
    const existingIsLive = existing?.status === 'connected' || existing?.status === 'failed' || existing?.status === 'auth_required';
    const incomingIsLive = server.status === 'connected' || server.status === 'failed';
    const status = incomingIsLive ? server.status
      : existingIsLive ? existing!.status
      : server.status || existing?.status || 'not_configured';

    merged.set(key, {
      name: server.name,
      source: normalizeCustomizationSource(server.source ?? existing?.source),
      status,
      type: server.type ?? existing?.type,
      url: server.url ?? existing?.url,
      command: server.command ?? existing?.command,
      error: incomingIsLive ? server.error : (server.error ?? existing?.error),
    });
  }

  return [...merged.values()];
}

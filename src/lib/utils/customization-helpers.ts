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

/** Merge incoming MCP server list with existing, deduplicating by name */
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
    merged.set(key, {
      ...existing,
      ...server,
      source: normalizeCustomizationSource(server.source ?? existing?.source),
    });
  }

  return [...merged.values()];
}

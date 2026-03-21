/** Parse and validate MCP server entries from a WebSocket message, filtering out disabled servers. */
export function parseMcpServers(raw: unknown): Array<{ name: string; url: string; type: 'http' | 'sse'; headers: Record<string, string>; tools: string[]; timeout?: number }> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const servers = raw
    .filter((s: unknown) => {
      if (!s || typeof s !== 'object') return false;
      const obj = s as Record<string, unknown>;
      if (obj.enabled === false) return false;
      return (
        typeof obj.name === 'string' &&
        typeof obj.url === 'string' &&
        (obj.type === 'http' || obj.type === 'sse') &&
        typeof obj.headers === 'object' && obj.headers !== null &&
        Array.isArray(obj.tools)
      );
    })
    .slice(0, 10)
    .map((s: unknown) => {
      const obj = s as Record<string, unknown>;
      return {
        name: obj.name as string,
        url: obj.url as string,
        type: obj.type as 'http' | 'sse',
        headers: obj.headers as Record<string, string>,
        tools: (obj.tools as unknown[]).filter((t): t is string => typeof t === 'string'),
        ...(typeof obj.timeout === 'number' && obj.timeout > 0 && obj.timeout <= 300000
          ? { timeout: Math.round(obj.timeout) }
          : {}),
      };
    });
  return servers.length > 0 ? servers : undefined;
}
